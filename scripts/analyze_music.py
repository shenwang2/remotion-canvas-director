"""Analyse the music library once per track, for scoring (canvaslib/music.py).

    python scripts/analyze_music.py <曲库目录>      (default: $CANVAS_MUSIC_ROOT or ~/canvas-director-music)

Writes <library>/catalog.json (read by finalize) and <library>/曲库说明.md (for the user and for choosing a track).
Per track: tempo, every beat, the downbeats (first beat of each bar, assuming 4/4), sections, an energy curve,
the "hits" (downbeats where the music clearly lifts - where a reveal should land), the integrated loudness,
and the mood (the folder it sits in). Tracks already analysed and unchanged are skipped.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
import librosa

EXT = (".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg")


def lufs(path):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"],
                         capture_output=True, text=True, encoding="utf-8", errors="ignore").stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", out)
    return float(m[-1]) if m else -16.0


def analyse(path):
    y, sr = librosa.load(path, sr=22050, mono=True)
    dur = len(y) / sr
    hop = 512
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, bf = librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=hop)
    tempo = float(np.atleast_1d(tempo)[0])
    beats = librosa.frames_to_time(bf, sr=sr, hop_length=hop)
    # downbeats: the phase of four whose beats carry the most low-end attack
    S = np.abs(librosa.stft(y, hop_length=hop))
    low = S[: int(S.shape[0] * 150 / (sr / 2))].sum(axis=0)
    low = low / (low.max() + 1e-9)
    acc = [float(np.mean([onset[f] + 2 * low[f] for f in bf[p::4]])) if len(bf[p::4]) else 0 for p in range(4)]
    phase = int(np.argmax(acc))
    downbeats = beats[phase::4]
    # energy, 0.5 s steps, in dB relative to the loudest part
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    t_r = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    step = 0.5
    grid = np.arange(0, dur, step)
    en = np.array([rms[(t_r >= g) & (t_r < g + step)].mean() if ((t_r >= g) & (t_r < g + step)).any() else 0 for g in grid])
    en_db = 20 * np.log10(en / (en.max() + 1e-9) + 1e-6)
    en_db = np.convolve(en_db, np.ones(3) / 3, mode="same")
    # sections: structural boundaries on beat-synchronous timbre + harmony, snapped to downbeats
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop)
    feat = librosa.util.sync(np.vstack([librosa.util.normalize(chroma), librosa.util.normalize(mfcc)]), bf)
    k = int(max(4, min(12, round(dur / 22))))
    bnd = librosa.segment.agglomerative(feat, k)
    bt = [0.0] + [float(beats[min(b, len(beats) - 1)]) for b in bnd[1:]]
    snap = lambda t: float(downbeats[np.argmin(np.abs(downbeats - t))]) if len(downbeats) else t
    starts = sorted(set([0.0] + [snap(t) for t in bt[1:] if 3 < t < dur - 3]))
    lvl = lambda a, b: float(np.mean(en_db[(grid >= a) & (grid < b)])) if ((grid >= a) & (grid < b)).any() else -60.0
    sections = []
    for i, s in enumerate(starts):
        e = starts[i + 1] if i + 1 < len(starts) else dur
        if e - s < 2:
            continue
        sections.append({"start": round(s, 3), "end": round(e, 3), "energy": round(lvl(s, e), 1)})
    # hits: downbeats where the music clearly lifts (4 s after vs 4 s before), the strongest in each 8 s,
    # and how hard it lands there
    cand = []
    for t in downbeats:
        if t < 4 or t > dur - 4:
            continue
        lift = lvl(t, t + 4) - lvl(t - 4, t)
        if lift > 2.5:
            f = librosa.time_to_frames(t, sr=sr, hop_length=hop)
            punch = float(onset[max(0, f - 2): f + 3].max() / (np.percentile(onset, 95) + 1e-9))
            cand.append({"t": round(float(t), 3), "lift": round(lift, 1), "punch": round(punch, 2),
                         "strength": round(lift + 2 * min(punch, 2), 1)})
    hits = []
    for h in sorted(cand, key=lambda h: -h["strength"]):
        if all(abs(h["t"] - o["t"]) >= 8 for o in hits):
            hits.append(h)
    hits.sort(key=lambda h: -h["strength"])
    # how rhythmic it is: the share of percussive energy, how clearly the onsets repeat at the beat period, and how
    # much harder the beats hit than the rest (ranked against the whole library in main)
    H, P = librosa.decompose.hpss(S)
    perc = float(P.sum() / (H.sum() + P.sum() + 1e-9))
    o = onset - onset.mean()
    ac = librosa.autocorrelate(o)
    lag = int(round(60 / tempo * sr / hop)) if tempo else 20
    pulse = float(max(ac[max(1, lag - 2): lag + 3].max(), ac[max(1, 2 * lag - 3): 2 * lag + 4].max()) / (ac[0] + 1e-9))
    punchy = float(onset[bf].mean() / (onset.mean() + 1e-9)) if len(bf) else 1.0
    # the ending: does it end on its own (decays) or just stop
    tail = lvl(dur - 6, dur) - lvl(dur - 20, dur - 6)
    return {
        "duration": round(dur, 3), "bpm": round(tempo, 1), "beat": round(60 / tempo, 4) if tempo else 0.5,
        "beats": [round(float(b), 3) for b in beats], "downbeats": [round(float(b), 3) for b in downbeats],
        "sections": sections, "hits": hits, "energy": {"step": step, "db": [round(float(x), 1) for x in en_db]},
        "endsOnItsOwn": bool(tail < -6), "lufs": lufs(path),
        "rhythmRaw": {"perc": round(perc, 3), "pulse": round(pulse, 3), "beatPunch": round(punchy, 3)},
    }


def describe(rel, a):
    mm = lambda t: f"{int(t // 60)}:{int(t % 60):02d}"
    loud = lambda e: "强" if e > -6 else "中" if e > -12 else "弱"
    secs = " → ".join(f"{mm(s['start'])} {loud(s['energy'])}" for s in a["sections"])
    hits = "、".join(f"{mm(h['t'])}（{'很强' if h['strength'] > 8 else '明显' if h['strength'] > 5 else '轻'}）" for h in a["hits"][:3]) or "没有明显的起势"
    rh = "强" if a["rhythm"] >= 0.6 else "中" if a["rhythm"] >= 0.35 else "弱"
    return (f"### {rel}\n- 节奏感 {rh}（{a['rhythm']:.2f}），{a['bpm']:.0f} BPM，长 {mm(a['duration'])}，响度 {a['lufs']:.0f} LUFS，"
            f"{'结尾自然收住' if a['endsOnItsOwn'] else '结尾是突然停'}\n"
            f"- 段落：{secs}\n- 起势点（适合落在揭晓上）：{hits}\n")


def main(root):
    cat_path = os.path.join(root, "catalog.json")
    cat = json.load(open(cat_path, encoding="utf-8")) if os.path.exists(cat_path) else {"tracks": {}}
    seen = set()
    for d, _, files in os.walk(root):
        for f in sorted(files):
            if not f.lower().endswith(EXT):
                continue
            p = os.path.join(d, f)
            rel = os.path.relpath(p, root).replace("\\", "/")
            seen.add(rel)
            mt = os.path.getmtime(p)
            if rel in cat["tracks"] and cat["tracks"][rel].get("mtime") == mt and "rhythmRaw" in cat["tracks"][rel]:
                continue
            print("分析", rel, flush=True)
            a = analyse(p)
            a.update({"mtime": mt, "mood": rel.split("/")[0] if "/" in rel else ""})
            cat["tracks"][rel] = a
    cat["tracks"] = {k: v for k, v in sorted(cat["tracks"].items()) if k in seen}
    # rhythm 0..1: mean rank of the three measures within the library
    tr = list(cat["tracks"].values())
    for key in ("perc", "pulse", "beatPunch"):
        vals = sorted(t["rhythmRaw"][key] for t in tr)
        for t in tr:
            t.setdefault("_r", []).append(vals.index(t["rhythmRaw"][key]) / max(1, len(vals) - 1))
    for t in tr:
        t["rhythm"] = round(sum(t.pop("_r")) / 3, 2)
    json.dump(cat, open(cat_path, "w", encoding="utf-8"), ensure_ascii=False)
    md = ["# 曲库说明\n", "由 analyze_music.py 生成。强/中/弱 是这一段相对整首最响处的能量；起势点是音乐明显抬起来的地方，"
          "剪辑时会把最强的那个对到这条视频的揭晓时刻。\n"]
    mood = None
    for rel, a in cat["tracks"].items():
        if a["mood"] != mood:
            mood = a["mood"]
            md.append(f"\n## {mood or '未分类'}\n")
        md.append(describe(rel, a))
    open(os.path.join(root, "曲库说明.md"), "w", encoding="utf-8").write("\n".join(md))
    print("曲库", len(cat["tracks"]), "首 →", cat_path)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("CANVAS_MUSIC_ROOT", os.path.expanduser("~/canvas-director-music")))
