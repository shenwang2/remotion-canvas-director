"""Optional preprocessing: cut long pauses, retakes and fillers out of the talking-head
recording, at original resolution, and move the transcript onto the new timeline.

    python make_cleanbase.py <口播原片> <work>/analysis/transcript.words.json <work> [--dry-run]

Writes
  <work>/public/media/presenter.mp4          the clean base (replaces the staged raw link)
  <work>/analysis/cut-map.json               kept source ranges and every cut with its reason
  <work>/analysis/transcript.words.json      remapped (the raw-timeline copy is kept as transcript.source.words.json)

What is cut
  pause    a gap between words longer than 500ms that is really silent; 150ms is kept on each side
  retake   words not in the script whose text is repeated right after (the speaker restarted);
           without a script: an immediately repeated phrase of >= 3 characters
  filler   isolated 嗯/呃/额 that are not in the script
Cut points are snapped to frame boundaries so audio and video stay in sync over many joins.
Run --dry-run first and read the proposed cuts.
"""
import argparse
import difflib
import json
import re
import shutil
import subprocess
from pathlib import Path

MAX_PAUSE, KEEP_PAD = 500, 150
FILLERS = {"嗯", "呃", "额", "嗯嗯", "呃呃"}


def probe(path):
    d = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate:format=duration",
                                            "-of", "json", str(path)]))
    num, den = d["streams"][0]["r_frame_rate"].split("/")
    return float(num) / float(den), float(d["format"]["duration"]) * 1000


def silences(path, db=-35, min_s=0.25):
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", f"silencedetect=noise={db}dB:d={min_s}", "-vn", "-f", "null", "-"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    starts = [float(x) * 1000 for x in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(x) * 1000 for x in re.findall(r"silence_end: ([\d.]+)", log)]
    return list(zip(starts, ends))


def silent_share(a, b, sil):
    cover = sum(max(0, min(b, e) - max(a, s)) for s, e in sil)
    return cover / max(1, b - a)


def propose(words, sil, scripted):
    cuts = []
    # Pauses
    for p, n in zip(words, words[1:]):
        a, b = p["endMs"] + KEEP_PAD, n["startMs"] - KEEP_PAD
        if n["startMs"] - p["endMs"] > MAX_PAUSE and b - a > 150 and silent_share(p["endMs"], n["startMs"], sil) > 0.8:
            cuts.append({"startMs": a, "endMs": b, "reason": "pause"})
    # Retakes
    i = 0
    while i < len(words):
        if scripted and not words[i].get("inScript", True):
            j = i
            while j < len(words) and not words[j].get("inScript", True):
                j += 1
            span = "".join(w.get("asr", w["text"]) for w in words[i:j])
            after = "".join(w.get("asr", w["text"]) for w in words[j:j + 12])[:len(span) + 2]
            if len(span) >= 2 and j < len(words) and difflib.SequenceMatcher(None, span, after[:len(span)]).ratio() >= 0.6:
                cuts.append({"startMs": words[i]["startMs"] - 40, "endMs": words[j]["startMs"] - 60, "reason": f"retake「{span}」"})
            i = j
            continue
        if not scripted:
            for k in range(6, 1, -1):
                a = "".join(w["text"] for w in words[i:i + k])
                b = "".join(w["text"] for w in words[i + k:i + 2 * k])
                if len(a) >= 3 and a == b:
                    cuts.append({"startMs": words[i]["startMs"] - 40, "endMs": words[i + k]["startMs"] - 60, "reason": f"retake「{a}」"})
                    i += k - 1
                    break
        i += 1
    # Fillers
    for k, w in enumerate(words):
        if w["text"] in FILLERS and not w.get("inScript", False):
            prev_end = words[k - 1]["endMs"] if k else 0
            next_start = words[k + 1]["startMs"] if k + 1 < len(words) else w["endMs"] + 1000
            if w["startMs"] - prev_end >= 120 and next_start - w["endMs"] >= 120:
                cuts.append({"startMs": w["startMs"] - 30, "endMs": w["endMs"] + 30, "reason": f"filler「{w['text']}」"})
    # Merge overlapping cuts
    cuts.sort(key=lambda c: c["startMs"])
    merged = []
    for c in cuts:
        if merged and c["startMs"] <= merged[-1]["endMs"]:
            merged[-1]["endMs"] = max(merged[-1]["endMs"], c["endMs"])
            merged[-1]["reason"] += " + " + c["reason"]
        else:
            merged.append(dict(c))
    return merged


def keep_ranges(cuts, dur, fps):
    frame = 1000 / fps
    snap = lambda t: round(round(t / frame) * frame, 3)
    keep, t = [], 0.0
    for c in cuts:
        a, b = snap(max(0, c["startMs"])), snap(min(dur, c["endMs"]))
        if a - t >= frame:
            keep.append([t, a])
        t = max(t, b)
    if dur - t >= frame:
        keep.append([t, snap(dur)])
    return keep


def remap_fn(keep):
    """Source ms -> clean ms; times inside a cut collapse onto the cut point."""
    offs, acc = [], 0.0
    for s, e in keep:
        offs.append((s, e, acc))
        acc += e - s

    def f(t):
        for s, e, o in offs:
            if t < s:
                return o
            if t <= e:
                return o + t - s
        return acc
    return f


def render(src, keep, out):
    parts, labels = [], []
    for i, (s, e) in enumerate(keep):
        d = (e - s) / 1000
        f = min(0.008, d / 4)
        parts.append(f"[0:v]trim=start={s / 1000:.6f}:end={e / 1000:.6f},setpts=PTS-STARTPTS[v{i}];"
                     f"[0:a]atrim=start={s / 1000:.6f}:end={e / 1000:.6f},asetpts=PTS-STARTPTS,afade=t=in:d={f:.4f},afade=t=out:st={d - f:.4f}:d={f:.4f}[a{i}];")
        labels.append(f"[v{i}][a{i}]")
    graph = "".join(parts) + "".join(labels) + f"concat=n={len(keep)}:v=1:a=1[v][a]"
    script = Path(out).with_suffix(".filter.txt")
    script.write_text(graph, encoding="utf-8")
    subprocess.run(["ffmpeg", "-hide_banner", "-y", "-i", str(src), "-filter_complex_script", str(script), "-map", "[v]", "-map", "[a]",
                    "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", str(out)], check=True)
    script.unlink()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("transcript")
    ap.add_argument("work")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    work = Path(a.work)
    tr_path = Path(a.transcript)
    src_copy = tr_path.with_name("transcript.source.words.json")
    current = json.load(open(tr_path, encoding="utf-8"))
    if current.get("timeline") != "clean-base":
        tr = current  # fresh raw-timeline transcript; it becomes the source copy when we write
    else:
        tr = json.load(open(src_copy, encoding="utf-8"))
    fps, dur = probe(a.source)
    cuts = propose(tr["words"], silences(a.source), tr.get("scriptAligned", False))
    keep = keep_ranges(cuts, dur, fps)
    clean_dur = sum(e - s for s, e in keep)
    for c in cuts:
        print(f"{c['startMs'] / 1000:8.2f}-{c['endMs'] / 1000:8.2f}  {(c['endMs'] - c['startMs']) / 1000:5.2f}s  {c['reason']}")
    print(f"{len(cuts)} cuts, {dur / 1000:.1f}s -> {clean_dur / 1000:.1f}s")
    if a.dry_run:
        return
    if current.get("timeline") != "clean-base":
        shutil.copy2(tr_path, src_copy)
    out = work / "public/media/presenter.mp4"
    tmp = work / "public/media/presenter.clean.tmp.mp4"
    render(a.source, keep, tmp)
    if out.exists():
        out.unlink()  # this is the staged link to the raw recording; the raw file itself is untouched
    tmp.rename(out)
    f = remap_fn(keep)
    words = []
    for w in tr["words"]:
        s, e = f(w["startMs"]), f(w["endMs"])
        if e - s >= 20:
            words.append({**w, "startMs": round(s), "endMs": round(e)})
    cues = []
    for c in tr["cues"]:
        s, e = f(c["startMs"]), f(c["endMs"])
        if e - s >= 150:
            cues.append({**c, "startMs": round(s), "endMs": round(e)})
    json.dump({**tr, "timeline": "clean-base", "durationMs": round(clean_dur), "words": words, "cues": cues},
              open(tr_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump({"source": str(a.source), "fps": fps, "sourceMs": dur, "cleanMs": clean_dur, "keep": keep, "cuts": cuts},
              open(work / "analysis/cut-map.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("clean base:", out, f"{clean_dur / 1000:.1f}s")


if __name__ == "__main__":
    main()
