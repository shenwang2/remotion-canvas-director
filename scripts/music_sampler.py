"""Try every track of the music library under the same stretch of the video, one after another, so the user can
hear which one fits (a track alone says little; under the talking head it is obvious).

    python scripts/music_sampler.py <work> --from 20 --to 35 [--mood 科技感] [--tracks a.mp3 b.mp3]

Renders that stretch once from program.nomusic.json (voice + sound effects), then lays each track under it the way
the real scoring would (canvaslib/bgm.py: the lift on the reveal, under the voice, up in the pauses, the drop before
the reveal), labels each pass with its number and name, and joins them into <work>/preview/选曲试配_<from>-<to>s.mp4.
The picture is not cut to each track's beat here - only the music changes between passes.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from canvaslib import bgm  # noqa: E402

RUNTIME = os.environ.get("CANVAS_RUNTIME", os.path.expanduser("~/canvas-director-runtime"))
SR = 48000
FONT = "C\\:/Windows/Fonts/msyhbd.ttc"


def pcm(path, start, dur):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-ss", f"{max(0, start):.3f}", "-t", f"{dur:.3f}", "-i", path,
                                   "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"])
    a = np.frombuffer(raw, np.float32).reshape(-1, 2)
    n = int(dur * SR)
    return np.pad(a, ((0, max(0, n - len(a))), (0, 0)))[:n]


def music_stem(a, path, prog, t0, t1, work):
    """The track as the real scoring would play it from t0 to t1 (video ms)."""
    dur_ms = prog["durationMs"]
    hit_at = bgm._signature(prog["shots"])
    o, hit = bgm._place(a, hit_at, dur_ms)
    segs = bgm._segments(a, o, dur_ms)
    voice = bgm._lufs(os.path.join(work, "public/media/presenter.mp4"), os.path.join(work, "analysis", "voice_lufs.json"))
    import copy
    beats, downs = bgm._grid(a, segs)
    shots = copy.deepcopy(prog["shots"])
    _, accents = bgm._cut_to_beat(shots, beats, downs, hit_at)
    gain = bgm._gain({}, a, voice, bgm._speech(os.path.join(work, "analysis/transcript.words.json")), shots, segs, hit_at, dur_ms, accents)
    n = int((t1 - t0) / 1000 * SR)
    out = np.zeros((n, 2), np.float32)
    for v0, v1, s0 in segs:
        lo, hi = max(v0, t0), min(v1, t1)
        if hi <= lo:
            continue
        chunk = pcm(path, (s0 + lo - v0) / 1000, (hi - lo) / 1000)
        i = int((lo - t0) / 1000 * SR)
        out[i: i + len(chunk)] += chunk[: n - i]
    t = t0 + np.arange(n) / SR * 1000
    g = np.interp(t, np.arange(len(gain["v"])) * gain["stepMs"], gain["v"])
    out *= g[:, None]
    fade = min(n, int(0.3 * SR))  # each pass fades in and out so the joins are clean
    out[:fade] *= np.linspace(0, 1, fade)[:, None]
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out, hit


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("work")
    ap.add_argument("--from", dest="t0", type=float, required=True)
    ap.add_argument("--to", dest="t1", type=float, required=True)
    ap.add_argument("--mood")
    ap.add_argument("--tracks", nargs="*")
    ap.add_argument("--root", default=bgm.MUSIC_ROOT)
    a = ap.parse_args()
    work = os.path.abspath(a.work)
    prog_path = os.path.join(work, "program.nomusic.json")
    if not os.path.exists(prog_path):
        prog_path = os.path.join(work, "program.json")
    prog = json.load(open(prog_path, encoding="utf-8"))
    cat = json.load(open(os.path.join(a.root, "catalog.json"), encoding="utf-8"))["tracks"]
    names = a.tracks or [k for k, v in cat.items() if not a.mood or v.get("mood") == a.mood]
    t0, t1 = a.t0 * 1000, a.t1 * 1000
    tmp = tempfile.mkdtemp(prefix="sampler_")
    base = os.path.join(tmp, "base.mp4")
    f0, f1 = round(a.t0 * prog["fps"]), round(a.t1 * prog["fps"]) - 1
    prog.pop("music", None)
    json.dump(prog, open(os.path.join(tmp, "p.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("渲染画面", a.t0, "–", a.t1, "s", flush=True)
    subprocess.check_call(f'npx remotion render src/index.ts Main "{base}" --props="{os.path.join(tmp, "p.json")}" '
                          f'--public-dir="{os.path.join(work, "public")}" --codec=h264 --crf=20 --frames={f0}-{f1} --log=error',
                          cwd=RUNTIME, shell=True)
    voice = pcm(base, 0, (t1 - t0) / 1000)
    parts = []
    for i, k in enumerate(names):
        stem, hit = music_stem(cat[k], os.path.join(a.root, k), prog, t0, t1, work)
        wav = os.path.join(tmp, f"a{i}.f32")
        (voice + stem).astype(np.float32).tofile(wav)
        label = f"{i + 1}/{len(names)}  {k}".replace(":", "\\:").replace("'", "")
        part = os.path.join(tmp, f"p{i}.mp4")
        subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", base, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", wav,
                               "-map", "0:v", "-map", "1:a", "-vf",
                               f"drawtext=fontfile='{FONT}':text='{label}':fontsize=h/34:fontcolor=white:x=w*0.04:y=h*0.035:"
                               f"box=1:boxcolor=black@0.6:boxborderw=18",
                               "-c:v", "libx264", "-crf", "20", "-c:a", "aac", "-b:a", "192k", part])
        parts.append(part)
        print(f"{i + 1}. {k}" + (f"（{hit['t']:.1f}s 的起势对在揭晓上）" if hit else "（没有起势对上揭晓）"), flush=True)
    lst = os.path.join(tmp, "list.txt")
    open(lst, "w", encoding="utf-8").write("".join(f"file '{p}'\n" for p in parts))
    out = os.path.join(work, "preview", f"选曲试配_{a.t0:g}-{a.t1:g}s.mp4")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out])
    print("→", out)


if __name__ == "__main__":
    main()
