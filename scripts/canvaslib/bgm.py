"""Background music and cutting to it (editing-logic.md G).

The speech stays the timeline; the music is a second clock laid under it. Scoring happens in finalize(music=...):
  1. place:  the track starts so its strongest lift lands on the reveal of this video (the word behind the speaker,
             or the first bigWord, or an explicit hit_at), and runs to the end without being cut off;
  2. level:  the music sits well under the voice and comes up in the pauses, swells on the hook, chapter turns and the
             ending, and drops out for a moment just before the reveal so the reveal lands on the lift;
  3. cut:    shot changes and entrances move onto the beat when one is close - hook, chapters and the ending onto the
             downbeat (hard), the rest only within a small window (soft); captions and the speech never move.
Without music the programme is exactly what it was: finalize also writes program.nomusic.json.
Track analysis comes from scripts/analyze_music.py (<library>/catalog.json).
"""
import bisect
import json
import math
import os
import re
import shutil
import subprocess

MUSIC_ROOT = os.environ.get("CANVAS_MUSIC_ROOT", os.path.expanduser("~/canvas-director-music"))

UNDER_VOICE_DB = -14    # music under speech, relative to the voice (the library's 偏好.json overrides these two)
IN_PAUSE_DB = -7        # in a pause of 0.6 s or more
CANVAS_DB = -2          # a little lower while things are being explained on the canvas
HOOK_DB = 5             # the hook, before the first change, plays the music out
LAND_DB = 7             # the music swells on every change of shot that lands on the beat, and settles over 1.5 s
ENDING_DB = 4           # the closing words
HARD = (300, 180)       # hard changes: landing on a downbeat within 300 ms, else a beat within 180 ms
SOFT_CUT = 200          # other changes: landing on a beat within 200 ms
SOFT_EARLY, SOFT_LATE = 150, 80   # entrances: up to 150 ms earlier or 80 ms later
MORPH = 560             # the presenter <-> avatar morph (Presenter.tsx): the change lands when it ends
POP = 180               # an entrance pops hardest about this long after it starts
DROP_MS = 650           # silence before the reveal


def music(track=None, mood=None, hit_at=None, hit=None, gain_db=0.0):
    """track: path inside the music library, e.g. "燃/<曲名>.mp3". Leave it out to use the user's own choice,
    the "default" in <library>/偏好.json (picked by ear with scripts/music_sampler.py); only with `mood` given and no
    default does the library choose (the most rhythmic track of that folder whose lift fits the reveal).
    hit_at: the moment (absolute ms) the music's lift should land on; default: the first word behind the speaker,
    else the first bigWord. hit: a specific lift in the track (seconds) instead of the strongest that fits."""
    return {"track": track, "mood": mood, "hitAt": hit_at, "hit": hit, "gainDb": gain_db}


def _lufs(path, cache):
    if os.path.exists(cache):
        return json.load(open(cache))["lufs"]
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vn", "-af", "ebur128", "-f", "null", "-"],
                         capture_output=True, text=True, encoding="utf-8", errors="ignore").stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", out)
    v = float(m[-1]) if m else -16.0
    json.dump({"lufs": v}, open(cache, "w"))
    return v


def _signature(shots):
    for s in shots:
        for b in s.get("behind", []):
            return b["atMs"]
    for s in shots:
        for b in s.get("bigWord", []):
            return b["atMs"]
    return None


def _place(a, hit_at, dur_ms, hit=None, with_score=False):
    """Track time (s) at video 0, and which lift lands on hit_at."""
    L = a["duration"]
    if hit_at is None:
        return (0.0, None, 0.0) if with_score else (0.0, None)
    hits = [h for h in a["hits"] if hit is None or abs(h["t"] - hit) < 0.5] or a["hits"]
    best = None
    for h in hits:
        o = h["t"] - hit_at / 1000
        score = h["strength"]
        if o < 0:
            score -= 6 + 2 * -o            # the music would have to come in late
        if L - o < dur_ms / 1000:
            score -= 3                     # it would have to loop
        if best is None or score > best[0]:
            best = (score, o, h)
    if best is None:
        return (0.0, None, -10.0) if with_score else (0.0, None)
    return (best[1], best[2], best[0]) if with_score else (best[1], best[2])


def _played_energy(a, o, dur_ms):
    """Mean energy (dB under the loudest part) of the stretch of the track that plays under the video."""
    st, db = a["energy"]["step"], a["energy"]["db"]
    i0, i1 = int(max(0, o) / st), int(min(a["duration"], o + dur_ms / 1000) / st)
    part = db[i0:i1] or db
    return sum(part) / len(part)


def _choose(cat, cfg, hit_at, dur_ms):
    """Most rhythmic first: rhythm (0..1, ranked within the library) outweighs how well the lift fits."""
    pool = {k: a for k, a in cat.items() if not cfg.get("mood") or a.get("mood") == cfg["mood"]} or cat
    ranked = []
    for k, a in pool.items():
        o, h, fit = _place(a, hit_at, dur_ms, with_score=True)
        score = 12 * a.get("rhythm", 0.5) + fit + 0.4 * _played_energy(a, o, dur_ms)
        ranked.append((score, k))
    ranked.sort(reverse=True)
    print("选曲（节奏感优先）：" + "，".join(f"{k} {s:.1f}" for s, k in ranked[:4]))
    return ranked[0][1]


def _segments(a, o, dur_ms):
    """Playback as [video from, video to, track from] (ms), looping on downbeats when the track runs out."""
    L, D = a["duration"] * 1000, dur_ms
    if o * 1000 + D <= L - 300:
        return [[max(0, -o * 1000), D, max(0, o * 1000)]]
    db = [x * 1000 for x in a["downbeats"]]
    jump = max([x for x in db if x <= L - 1500] or [L - 1500])
    secs = [s["start"] * 1000 for s in a["sections"]]
    target = min([x for x in db if x >= (secs[1] if len(secs) > 1 else 0)] or [0])
    segs, v, t = [], max(0, -o * 1000), max(0, o * 1000)
    while v < D:
        if jump - t < 1000:
            t = target
        seg_len = min(jump - t, D - v)
        segs.append([v, v + seg_len, t])
        v += seg_len
        t = target
    return segs


def _grid(a, segs):
    """Beats and downbeats of the music as it plays, in video ms."""
    beats, downs = [], []
    for v0, v1, t0 in segs:
        for src, dst in ((a["beats"], beats), (a["downbeats"], downs)):
            for b in src:
                v = v0 + b * 1000 - t0
                if v0 <= v < v1:
                    dst.append(round(v))
    return sorted(beats), sorted(downs)


def _nearest(grid, t, lo, hi):
    """The grid point closest to t within [t - lo, t + hi], or None."""
    i = bisect.bisect_left(grid, t)
    best = None
    for g in grid[max(0, i - 2): i + 2]:
        if -lo <= g - t <= hi and (best is None or abs(g - t) < abs(best - t)):
            best = g
    return best


def _landing(a, b):
    """How long after a change of shot it visibly lands: the end of the morph between person and avatar,
    or the camera arriving at its first stop on the canvas."""
    if (a["type"] == "presenter") != (b["type"] == "presenter"):
        return MORPH
    cam = b.get("camera") or []
    return int(cam[0].get("moveMs", 900)) if cam and b["type"] == "canvas" else 0


def _cut_to_beat(shots, beats, downs, hit_at):
    """Put the landing of every change of shot on the beat (hard ones on the downbeat) and make it an accent:
    the picture gives a small hit and the music swells. Entrances pop on the beat. Returns (moved, accents)."""
    moved, accents = [], []
    last = len(shots) - 1
    for i in range(1, len(shots)):
        a, b = shots[i - 1], shots[i]
        old = b["startMs"]
        land = _landing(a, b)
        hard = i == 1 or bool(b.get("chapter")) or i == last
        if hit_at is not None and abs(old - hit_at) < 1:
            continue
        t = old + land
        # the closest beat that keeps both shots at least 1.5 s long (downbeats first for the hard ones)
        pools = [(downs, HARD[0]), (beats, HARD[0])] if hard else [(beats, SOFT_CUT)]
        hit = None
        for grid, win in pools:
            ok = [g for g in grid if (abs(g - t) <= win or (hard and 0 < g - t <= win + 200)) and g - land - a["startMs"] >= 1500 and b["endMs"] - (g - land) >= 1500]
            if ok:
                hit = min(ok, key=lambda g: abs(g - t))
                break
        if hit is None:
            continue
        new = hit - land
        if new != old:
            a["endMs"] = b["startMs"] = new
            moved.append(("cut", old, new))
            for e in b.get("elements", []):  # what started with the shot starts with it still
                if abs(e["atMs"] - old) < 1:
                    e["atMs"] = new
            for c in b.get("camera", []):
                if abs(c["atMs"] - old) < 1:
                    c["atMs"] = new
        accents.append({"atMs": hit, "k": 1.0 if hard else 0.6})
    if hit_at is not None:
        accents.append({"atMs": hit_at, "k": 1.0})

    def soft(t, lead=0):
        if hit_at is not None and abs(t - hit_at) < 1:
            return t
        n = _nearest(beats, t + lead, SOFT_EARLY, SOFT_LATE)
        return t if n is None else n - lead

    beat = (beats[-1] - beats[0]) / max(1, len(beats) - 1) if len(beats) > 1 else 500
    for s in shots:
        for e in s.get("elements", []) + s.get("overlays", []):
            if e["atMs"] > s["startMs"]:
                n = max(s["startMs"], soft(e["atMs"], POP))
                if n != e["atMs"]:
                    moved.append(("in", e["atMs"], n))
                    e["atMs"] = n
        for c in s.get("camera", []):
            m = c.get("moveMs")
            if m:  # a move lasts a whole number of half-beats when that is close
                q = round(m / (beat / 2)) * (beat / 2)
                if q > 0 and abs(q - m) <= 0.2 * m:
                    c["moveMs"] = m = int(q)
            if c["atMs"] > s["startMs"]:  # and arrives on the beat
                c["atMs"] = max(s["startMs"], soft(c["atMs"], m or 0))
        for z in s.get("zoom", []):
            n = soft(z["atMs"])
            if n != z["atMs"]:
                moved.append(("zoom", z["atMs"], n))
                z["atMs"] = n
            accents.append({"atMs": z["atMs"], "k": 0.5})
        for b in s.get("bigWord", []):
            b["atMs"] = soft(b["atMs"], POP)
    accents.sort(key=lambda x: x["atMs"])
    return moved, accents


def _speech(transcript_path, gap=600):
    d = json.load(open(transcript_path, encoding="utf-8"))
    spans = []
    for w in d["words"]:
        if spans and w["startMs"] - spans[-1][1] < gap:
            spans[-1][1] = max(spans[-1][1], w["endMs"])
        else:
            spans.append([w["startMs"], w["endMs"]])
    return spans


def _gain(cfg, a, voice_lufs, spans, shots, segs, hit_at, dur_ms, accents, step=50):
    """Linear gain every `step` ms. The music has a shape, not one level: it plays out over the hook, sits under the
    voice (a little lower on the canvas, up in real pauses), swells on every change that lands on the beat and
    settles, stops dead just before the reveal and comes back in hard with it, and rises for the closing words."""
    base = voice_lufs - a["lufs"] + cfg.get("gainDb", 0)
    n = int(dur_ms / step) + 1
    v = []
    first = shots[1]["startMs"] + _landing(shots[0], shots[1]) if len(shots) > 1 else dur_ms
    v0 = segs[0][0]
    for i in range(n):
        t = i * step
        d_in = min([max(0, s0 - t) if t < s0 else 0 if t <= s1 else t - s1 for s0, s1 in spans] or [1e9])
        k = max(0.0, min(1.0, (d_in - 150) / 250))
        lvl = UNDER_VOICE_DB + (IN_PAUSE_DB - UNDER_VOICE_DB) * k
        sh = next((x for x in shots if x["startMs"] <= t < x["endMs"]), shots[-1])
        if sh["type"] == "canvas":
            lvl += CANVAS_DB
        if t < first:
            lvl += HOOK_DB
        if sh is shots[-1]:
            lvl += ENDING_DB * min(1.0, (t - sh["startMs"]) / 1500)
        swell = 0.0
        for ac in accents:  # rises over 120 ms into the landing, settles over 1.5 s
            d = t - ac["atMs"]
            if -120 <= d < 0:
                swell = max(swell, LAND_DB * ac["k"] * (1 + d / 120))
            elif 0 <= d < 1500:
                swell = max(swell, LAND_DB * ac["k"] * (1 - d / 1500) ** 2)
        g = 10 ** ((base + lvl + swell) / 20)
        if hit_at is not None and hit_at - DROP_MS <= t < hit_at:   # dead stop just before the reveal
            g *= max(0.0, min(1.0, (hit_at - DROP_MS + 80 - t) / 80))
        g *= min(1.0, max(0.0, (t - v0) / 300))                     # fade in
        g *= min(1.0, max(0.0, (dur_ms - t) / 2500))                # fade out
        v.append(round(min(1.0, g), 4))
    return {"stepMs": step, "v": v}


def prefs(lib=MUSIC_ROOT):
    """The user's settings for the music, chosen by ear: {"default": track, "underVoiceDb": .., "inPauseDb": ..}."""
    path = os.path.join(lib, "偏好.json")
    return json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}


def score(cfg, shots, transcript_path, work, dur_ms):
    global UNDER_VOICE_DB, IN_PAUSE_DB
    lib = cfg.get("root", MUSIC_ROOT)
    if not os.path.exists(os.path.join(lib, "catalog.json")):  # no music library yet: the programme goes out without music
        print(f"配乐：曲库 {lib} 里还没有 catalog.json（放进曲子后跑 scripts/analyze_music.py），这次不配乐")
        return None
    cat = json.load(open(os.path.join(lib, "catalog.json"), encoding="utf-8"))["tracks"]
    pf = prefs(lib)
    UNDER_VOICE_DB = pf.get("underVoiceDb", UNDER_VOICE_DB)
    IN_PAUSE_DB = pf.get("inPauseDb", IN_PAUSE_DB)
    ovp = os.path.join(work, "overrides.json")   # a track chosen in the edit desk wins
    desk_track = (json.load(open(ovp, encoding="utf-8")).get("music") or {}).get("track") if os.path.exists(ovp) else None
    if desk_track:
        cfg = {**cfg, "track": desk_track}
    by_user = bool(cfg.get("track"))
    if not cfg.get("track") and not cfg.get("mood") and pf.get("default"):
        cfg = {**cfg, "track": pf["default"]}
        by_user = True
    hit_at = cfg.get("hitAt") or _signature(shots)
    if not cfg.get("track"):
        cfg = {**cfg, "track": _choose(cat, cfg, hit_at, dur_ms)}
    if cfg["track"] not in cat:
        raise KeyError(f"曲库里没有 {cfg['track']}：先跑 scripts/analyze_music.py \"{lib}\"")
    a = cat[cfg["track"]]
    src = os.path.join(lib, cfg["track"])
    ext = os.path.splitext(src)[1]
    os.makedirs(os.path.join(work, "public", "music"), exist_ok=True)
    shutil.copyfile(src, os.path.join(work, "public", "music", "bgm" + ext))
    voice = _lufs(os.path.join(work, "public/media/presenter.mp4"), os.path.join(work, "analysis", "voice_lufs.json"))
    o, hit = _place(a, hit_at, dur_ms, cfg.get("hit"))
    segs = _segments(a, o, dur_ms)
    beats, downs = _grid(a, segs)
    moved, accents = _cut_to_beat(shots, beats, downs, hit_at)
    gain = _gain(cfg, a, voice, _speech(transcript_path), shots, segs, hit_at, dur_ms, accents)
    cuts = sum(1 for m in moved if m[0] == "cut")
    print(f"配乐 {cfg['track']}：{a['bpm']:.0f} BPM，从曲子 {o:.2f}s 处开始"
          + (f"，{hit['t']:.2f}s 的起势落在 {hit_at / 1000:.2f}s" if hit else "，没有对齐起势")
          + (f"，循环 {len(segs) - 1} 次" if len(segs) > 1 else "")
          + f"；卡点：{len(accents)} 个重音（转场落地在拍子上），挪动切换 {cuts} 处、入场/景别 {len(moved) - cuts} 处")
    return {"src": "music/bgm" + ext, "track": cfg["track"], "bpm": a["bpm"], "offsetS": round(o, 3),
            "segments": [[round(x) for x in s] for s in segs], "gain": gain,
            "hitAt": hit_at, "trackHit": hit["t"] if hit else None, "beats": beats, "downbeats": downs,
            "moved": len(moved), "movedCuts": cuts, "accents": accents, "byUser": by_user}
