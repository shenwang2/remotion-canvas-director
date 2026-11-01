#!/usr/bin/env python3
"""Word-level Chinese ASR with one stable output schema.

This is the fixed transcription entry point for the clean-base prepass and for
semantic timing. It wraps the locally installed ASR runtime instead of letting
each run improvise a different tool:

* ``faster-whisper`` (default when installed): ``large-v3`` with
  ``word_timestamps=True``.
* ``funasr``: Paraformer-zh with per-token timestamps.

Both backends write the same JSON shape::

    {
      "schemaVersion": 1,
      "source": {...fingerprint...},
      "backend": "faster-whisper",
      "model": "large-v3",
      "language": "zh",
      "durationMs": 61234,
      "words": [{"i": 0, "text": "大家", "startMs": 120, "endMs": 480, "confidence": 0.93}],
      "segments": [{"startMs": 120, "endMs": 3400, "text": "大家好..."}]
    }

Timing notes that matter for cutting:

* Whisper tends to omit fillers (嗯/呃) and may stretch a word's end into the
  following pause. ``propose-clean-cuts.py`` therefore cross-checks every gap
  with acoustic silence instead of trusting word edges alone.
* Paraformer keeps fillers more often and has tighter token edges.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable

PUNCTUATION = set("，。！？、；：,.!?;:\"'“”‘’（）()《》【】[]…—- \t\r\n")


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, text=True, encoding="utf-8", errors="replace", capture_output=True)


def fingerprint(path: Path) -> dict[str, Any]:
    stat = path.stat()
    digest = hashlib.sha1()
    with path.open("rb") as handle:
        digest.update(handle.read(4 * 1024 * 1024))
    return {
        "path": str(path.resolve()),
        "bytes": stat.st_size,
        "mtimeMs": int(stat.st_mtime * 1000),
        "headSha1": digest.hexdigest(),
    }


def probe_duration_ms(path: Path, ffprobe: str) -> int:
    result = run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)])
    return int(round(float(json.loads(result.stdout)["format"]["duration"]) * 1000))


def extract_wav(source: Path, destination: Path, ffmpeg: str) -> None:
    run([
        ffmpeg, "-hide_banner", "-y", "-i", str(source),
        "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
        str(destination),
    ])


def clean_text(text: str) -> str:
    return text.strip()


def is_punctuation_only(text: str) -> bool:
    return bool(text) and all(ch in PUNCTUATION for ch in text)


def normalize_words(raw: Iterable[dict[str, Any]], duration_ms: int) -> list[dict[str, Any]]:
    """Clamp, sort and de-overlap tokens; drop empty/punctuation-only tokens.

    Punctuation attached to a word is kept in ``text`` (it marks sentence ends
    for the cut proposer) but a token that is only punctuation is dropped.
    """
    words: list[dict[str, Any]] = []
    for item in raw:
        text = clean_text(str(item.get("text", "")))
        if not text or is_punctuation_only(text):
            if words and text and is_punctuation_only(text):
                words[-1]["text"] += text
            continue
        start = max(0, min(duration_ms, int(round(float(item["startMs"])))))
        end = max(0, min(duration_ms, int(round(float(item["endMs"])))))
        if end < start:
            start, end = end, start
        if end == start:
            end = min(duration_ms, start + 1)
        confidence = item.get("confidence")
        words.append({
            "text": text,
            "startMs": start,
            "endMs": end,
            "confidence": None if confidence is None else round(float(confidence), 4),
        })
    words.sort(key=lambda value: (value["startMs"], value["endMs"]))
    for previous, current in zip(words, words[1:]):
        if current["startMs"] < previous["endMs"]:
            # Split an overlap at its midpoint so no two tokens share time.
            middle = (current["startMs"] + previous["endMs"]) // 2
            previous["endMs"] = max(previous["startMs"] + 1, middle)
            current["startMs"] = previous["endMs"]
            current["endMs"] = max(current["endMs"], current["startMs"] + 1)
    for index, word in enumerate(words):
        word["i"] = index
    return [{"i": w["i"], "text": w["text"], "startMs": w["startMs"], "endMs": w["endMs"], "confidence": w["confidence"]} for w in words]


# ---------------------------------------------------------------- backends

def available_backends() -> list[str]:
    found = []
    for name, module in (("faster-whisper", "faster_whisper"), ("funasr", "funasr")):
        try:
            __import__(module)
            found.append(name)
        except Exception:
            continue
    return found


def transcribe_faster_whisper(wav: Path, args: argparse.Namespace) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    from faster_whisper import WhisperModel  # type: ignore

    model_name = args.model or "large-v3"
    device = args.device
    if device == "auto":
        try:
            import ctranslate2  # type: ignore

            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            device = "cpu"
    compute_type = args.compute_type or ("float16" if device == "cuda" else "int8")
    model_kwargs: dict[str, Any] = {"device": device, "compute_type": compute_type}
    if args.model_dir:
        model_kwargs["download_root"] = args.model_dir
    model = WhisperModel(model_name, **model_kwargs)
    segments_iter, _info = model.transcribe(
        str(wav),
        language=args.language,
        word_timestamps=True,
        # Keep every spoken region: VAD filtering can silently drop short
        # restarts and fillers that the cut proposer needs to see.
        vad_filter=False,
        # Previous-text conditioning makes Whisper repeat or "clean up"
        # disfluent speech, which hides retakes and duplicated phrases.
        condition_on_previous_text=False,
        beam_size=args.beam_size,
        initial_prompt=args.initial_prompt,
    )
    words: list[dict[str, Any]] = []
    segments: list[dict[str, Any]] = []
    for segment in segments_iter:
        segments.append({"startMs": int(round(segment.start * 1000)), "endMs": int(round(segment.end * 1000)), "text": segment.text.strip()})
        for word in segment.words or []:
            words.append({
                "text": word.word,
                "startMs": word.start * 1000,
                "endMs": word.end * 1000,
                "confidence": getattr(word, "probability", None),
            })
    return words, segments, f"{model_name} ({device}/{compute_type})"


def split_funasr_tokens(text: str) -> list[str]:
    """Paraformer returns space-separated tokens; Chinese chars may also be glued."""
    tokens: list[str] = []
    for chunk in text.split():
        if all(ord(ch) < 128 for ch in chunk):
            tokens.append(chunk)
        else:
            buffer = ""
            for ch in chunk:
                if ord(ch) < 128 and not ch.isspace():
                    buffer += ch
                else:
                    if buffer:
                        tokens.append(buffer)
                        buffer = ""
                    if ch not in PUNCTUATION:
                        tokens.append(ch)
            if buffer:
                tokens.append(buffer)
    return tokens


def funasr_result_to_words(results: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    words: list[dict[str, Any]] = []
    segments: list[dict[str, Any]] = []
    for result in results:
        text = str(result.get("text", ""))
        stamps = result.get("timestamp") or []
        tokens = split_funasr_tokens(text)
        if len(tokens) != len(stamps):
            raise ValueError(
                f"FunASR token/timestamp mismatch ({len(tokens)} tokens vs {len(stamps)} stamps); "
                "disable the punctuation model or use --backend faster-whisper"
            )
        for token, (start, end) in zip(tokens, stamps):
            words.append({"text": token, "startMs": start, "endMs": end, "confidence": None})
        if stamps:
            segments.append({"startMs": int(stamps[0][0]), "endMs": int(stamps[-1][1]), "text": "".join(tokens)})
    return words, segments


def transcribe_funasr(wav: Path, args: argparse.Namespace) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    from funasr import AutoModel  # type: ignore

    model_name = args.model or "paraformer-zh"
    device = args.device
    if device == "auto":
        try:
            import torch  # type: ignore

            device = "cuda:0" if torch.cuda.is_available() else "cpu"
        except Exception:
            device = "cpu"
    kwargs: dict[str, Any] = {"model": model_name, "vad_model": "fsmn-vad", "device": device, "disable_update": True}
    model = AutoModel(**kwargs)
    # No punctuation model: punctuation would desynchronize tokens and stamps.
    results = model.generate(input=str(wav), batch_size_s=300)
    words, segments = funasr_result_to_words(results)
    return words, segments, f"{model_name} ({device})"


# ---------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", type=Path, help="Video or audio file")
    parser.add_argument("--output", type=Path, help="e.g. analysis/transcript.raw.words.json")
    parser.add_argument("--backend", choices=["auto", "faster-whisper", "funasr"], default="auto")
    parser.add_argument("--model", help="faster-whisper: large-v3 (default) / large-v3-turbo; funasr: paraformer-zh")
    parser.add_argument("--model-dir", help="Local model cache folder (faster-whisper download_root)")
    parser.add_argument("--device", default="auto", help="auto, cuda, cpu")
    parser.add_argument("--compute-type", help="faster-whisper compute type; default float16 on GPU, int8 on CPU")
    parser.add_argument("--language", default="zh")
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument("--initial-prompt", help="Product names/terms from a companion script to bias recognition")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--list-backends", action="store_true")
    args = parser.parse_args()

    installed = available_backends()
    if args.list_backends:
        print(json.dumps({"installed": installed}, ensure_ascii=False))
        return 0
    if not args.input or not args.output:
        parser.error("--input and --output are required")
    if not args.input.is_file():
        parser.error(f"Input not found: {args.input}")
    backend = args.backend
    if backend == "auto":
        if not installed:
            parser.error("No ASR backend installed. Install faster-whisper (pip install faster-whisper) or funasr.")
        backend = installed[0]
    elif backend not in installed:
        parser.error(f"Backend {backend} is not importable in this Python ({sys.executable}). Installed: {installed}")

    duration_ms = probe_duration_ms(args.input, args.ffprobe)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "speech-16k.wav"
        extract_wav(args.input, wav, args.ffmpeg)
        if backend == "faster-whisper":
            raw_words, segments, model_label = transcribe_faster_whisper(wav, args)
        else:
            raw_words, segments, model_label = transcribe_funasr(wav, args)

    words = normalize_words(raw_words, duration_ms)
    document = {
        "schemaVersion": 1,
        "source": fingerprint(args.input),
        "backend": backend,
        "model": model_label,
        "language": args.language,
        "durationMs": duration_ms,
        "wordCount": len(words),
        "words": words,
        "segments": segments,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(args.output.resolve()),
        "backend": backend,
        "model": model_label,
        "wordCount": len(words),
        "durationMs": duration_ms,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
    raise SystemExit(main())
