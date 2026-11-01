"""Shared helpers for per-video programme scripts.

Times in programme scripts are authored as absolute source milliseconds;
`finalize()` converts canvas element/camera times to scene-relative ones.
"""
import json

W, H = 2560, 1440
PORTRAIT = False


def configure(portrait=False):
    """Call before building shots. Portrait switches every layout preset to its vertical arrangement."""
    global PORTRAIT
    PORTRAIT = portrait


def subprocess_duration(path):
    import subprocess
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    return int(float(out.decode().strip()) * 1000)


def probe_size(path):
    import subprocess
    out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)])
    w, h = out.decode().strip().split(",")[:2]
    return int(w), int(h)


def el(id, kind, x, y, w, h, at, **props):
    return {"id": id, "kind": kind, "x": x, "y": y, "w": w, "h": h, "atMs": at, "props": props}


def video(src, trim=0, aspect=None):
    m = {"src": f"media/{src}", "kind": "video", "trimMs": trim, "muted": True}
    if aspect:
        m["aspect"] = aspect
    return m


def image(src):
    return {"src": f"media/{src}", "kind": "image", "fit": "contain"}


def sub_rect(base, src_w, px, py, pw, ph):
    """Pixel rect inside a source image -> world rect, for an image element placed at base=(x,y,w,h)."""
    k = base[2] / src_w
    return base[0] + px * k, base[1] + py * k, pw * k, ph * k


def presenter(id, start, end, chapter=None, hud=None, zoom=None, big=None, beside=None, behind=None, sticker=None):
    """A talking-head shot. `beside`: groups of cards shown next to the person while he talks
    (see card/tag/stat/name below). A group stays until the next group starts; positions are
    worked out in finalize() from the face track, in the free space beside (landscape) or below
    (portrait) the person."""
    s = {"type": "presenter", "id": id, "startMs": start, "endMs": end}
    if beside: s["_beside"] = beside
    if chapter: s["chapter"] = chapter
    if hud: s["hud"] = hud
    if zoom: s["zoom"] = [z if isinstance(z, dict) else {"atMs": z[0], "scale": z[1], "moveMs": z[2]} for z in zoom]
    if big: s["bigWord"] = [{"text": t, "sub": sub, "atMs": a, "endMs": e} for t, sub, a, e in big]
    if behind: s["behind"] = list(behind)
    if sticker: s["sticker"] = list(sticker)
    return s


# ---- Compositing into the real shot (the camera is fixed, so only the person has to be cut out:
# scripts/make_matte.py). Kept for the signature moments - the hook, the reveal - not as decoration.
def behind_word(text, at, end, matte=None, matte_start=None, sub=None):  # sub: a small line above; leave it out when the frame is tight
    """The key word stands in the room behind the speaker: drawn between the footage and the cut-out person,
    so the head and shoulders cover part of it (editing-logic.md A2e). The cut-out (public/media/matte_<at>.webm)
    is made by finalize the first time, ~0.6 s per frame on the GPU, and reused after that.
    matte / matte_start: an existing clip (make_matte.py --clip) and the absolute ms where it begins."""
    if matte is None:
        matte, matte_start = f"matte_{at}.webm", max(0, at - 400)
        auto = (matte_start, end + 200)
    else:
        auto = None
    b = {"text": text, "atMs": at, "endMs": end, "matte": {"src": f"media/{matte}", "startMs": matte_start}}
    if auto: b["_make"] = auto
    if sub: b["sub"] = sub
    return b


def freeze_sticker(at, end, sticker, bg=None, label=None):
    """The frame freezes on a beat: the speaker becomes a white-outlined sticker (make_matte.py --still) in front of
    what he is talking about (bg: video(...)/image(...)); a flash and a click, then the edit runs on."""
    st = {"atMs": at, "endMs": end, "src": f"media/{sticker}"}
    if bg: st["bg"] = bg
    if label: st["label"] = label
    return st


# ---- Framing on the talking head (presenter(zoom=[...])), all anchored on the face.
# A framing change is punctuation: keep it for the moments that earn it (the strongest beat of a passage,
# a real turn in the argument), hold the new framing until the next natural turn, and prefer few over many.
def punch(at, scale=1.22):
    """An instant cut to a closer framing (settles with a tiny overshoot) - the strongest beat."""
    return {"atMs": at, "scale": scale, "type": "cut"}


def snap(at, scale=1.28, ms=160):
    """A fast zoom with a touch of motion blur - a reveal."""
    return {"atMs": at, "scale": scale, "type": "snap", "moveMs": ms}


def back(at, scale=1.0):
    """Cut back out, at the next turn (a new part starts)."""
    return {"atMs": at, "scale": scale, "type": "cut"}


def push(at, scale=1.08, ms=1500):
    """A slow push - feeling builds over several seconds."""
    return {"atMs": at, "scale": scale, "type": "push", "moveMs": ms}


# Items for presenter(beside=[[...], [...]]). `at` is absolute ms (use word_at).
def card(icon, title, sub, at, tone="accent"):
    return {"kind": "entity", "h": 180, "at": at, "props": {"icon": icon, "title": title, "sub": sub, "tone": tone}}


def tag(text, tone, at, icon=None):
    props = {"text": text, "tone": tone}
    if icon: props["icon"] = icon
    return {"kind": "tag", "h": 110, "at": at, "props": props}


def stat(value, suffix, label, at, icon=None, tone="accent"):
    return {"kind": "stat", "h": 240, "at": at, "props": {"value": value, "suffix": suffix, "label": label, "icon": icon, "tone": tone}}


# Motion that carries meaning (usable beside the person and, via el(kind=...), on the canvas).
def _text_w(text, h, k=0.46, pad=1.4):
    return round(h * pad + len(text) * h * k)


def stamp(text, tone, at, icon=None, tilt=-6):
    """A verdict: slams down like a rubber stamp."""
    return {"kind": "stamp", "h": 120, "w": _text_w(text, 120, 0.44, 1.6 if icon else 1.0), "at": at,
            "props": {"text": text, "tone": tone, "icon": icon, "tilt": tilt}}


def rise(text, at, sub=None, tone="green"):
    """Getting better / growing: a line climbs, the words rise with it."""
    # a strip like the cards beside it: as wide as the column (beside() caps it to the column width)
    return {"kind": "rise", "h": 180, "w": max(_text_w(text, 170, 0.32, 2.3), 900), "at": at, "props": {"text": text, "sub": sub, "tone": tone}}


def multiply(count, label, at, icon="Clapperboard", tone="accent"):
    """Many at once: one tile clones into a grid, then the count lands."""
    return {"kind": "multiply", "h": 420, "w": 460, "at": at, "props": {"count": count, "label": label, "icon": icon, "tone": tone}}


def erode(text, fade, at, tone="red"):
    """Something wearing away: `fade` (a part of text) blurs and fades out."""
    return {"kind": "erode", "h": 110, "w": _text_w(text, 110, 0.42, 1.6), "at": at, "props": {"text": text, "fade": fade, "tone": tone}}


def strike(text, at, replacement=None):
    """Not this: struck through, a cross lands; optionally the truth flips in below."""
    h = 200 if replacement else 120
    return {"kind": "strike", "h": h, "w": _text_w(text if not replacement else max(text, replacement, key=len), 120, 0.5, 1.2), "at": at,
            "props": {"text": text, "replacement": replacement}}


def marker(text, at, tone="accent"):
    """A key word: a highlighter sweeps under it."""
    return {"kind": "marker", "h": 130, "w": _text_w(text, 130, 0.66, 0.6), "at": at, "props": {"text": text, "tone": tone}}


# ---- Spatial glass panel (glass.tsx): the default way to carry a spoken passage on a talking-head shot.
# One panel floats beside the speaker; the passage advances as states inside it (content blurs out /
# in, the panel stays), rows and chips arrive on their words. Text sits on the glass, never bare.
def row(icon, text, at, sub=None):
    """A line inside a glass state: round glass icon + text ("{word}" = warm accent)."""
    return {"icon": icon, "text": text, "at": at, **({"sub": sub} if sub else {})}


def chip(text, at, strike_at=None):
    """A small capsule at the bottom of a state; strike_at crosses it out (a doubt dismissed)."""
    return {"text": text, "at": at, **({"strikeAt": strike_at} if strike_at is not None else {})}


def state(at, kicker=None, title=None, sub=None, hero=None, hero_sub=None, rows=(), chips=(), visual=None):
    """One moment of the passage. title may contain "\n" and "{accent}"; hero is a reveal word set huge.
    visual: one small picture under the title (vis_swap / vis_phone / vis_flow / vis_bars / vis_frame / vis_poll /
    vis_stamp) when the shape of the line says more as a picture than as words - see editing-logic.md A2d."""
    st = {"at": at}
    for k, v in (("kicker", kicker), ("title", title), ("sub", sub), ("hero", hero), ("heroSub", hero_sub)):
        if v: st[k] = v
    if rows: st["rows"] = list(rows)
    if chips: st["chips"] = list(chips)
    if visual: st["visual"] = visual
    return st


# Heights of the pictures inside a glass state (glassvis.tsx VIS_H); a visual may override with h=.
VIS_H = {"swap": 190, "phone": 290, "flow": 250, "bars": 230, "frame": 230, "poll": 200, "stamp": 210}


def _glass_height(st):
    h = 92  # padding top + bottom (was 128: left a strip of empty glass under the content)
    if st.get("kicker"): h += 48
    if st.get("title"): h += 22 + 91 * (st["title"].count("\n") + 1)
    if st.get("sub"): h += 66
    if st.get("hero"): h += 250 + (66 if st.get("heroSub") else 0)
    if st.get("rows"): h += 34 + sum(120 + (38 if r.get("sub") else 0) for r in st["rows"])
    if st.get("chips"): h += 104
    if st.get("visual"): h += 30 + st["visual"].get("h", VIS_H[st["visual"]["type"]])
    return h


# ---- Small pictures inside a glass state (glassvis.tsx). Pick by the shape of the line, not its topic; one per
# state; a plain point stays a title. Every time is absolute ms (word_at). In portrait the zone under the chin is
# ~620px: with a picture keep the title to one line (finalize warns when the panel does not fit).
def vis_swap(old, new, swap_at, old_at=None, stamp="淘汰"):
    """A replacement: `old` (icon, text[, sub]) is stamped and steps back at swap_at, `new` slides in. "旧版被淘汰" """
    o = {"icon": old[0], "text": old[1], **({"sub": old[2]} if len(old) > 2 else {}), **({"at": old_at} if old_at is not None else {})}
    n = {"icon": new[0], "text": new[1], **({"sub": new[2]} if len(new) > 2 else {})}
    return {"type": "swap", "from": o, "to": n, "swapAt": swap_at, "stamp": stamp}


def vis_phone(beats, labels=()):
    """A tiny schematic of the frame itself. beats: [(mode, at)] with mode person / card / zoom / canvas (the talking
    head, a card under the chin, a push-in, the morph into the avatar on the canvas); labels: [(text, at, side)],
    side left/right of the phone - the latest one lights up. For lines about how the video itself is shot or cut."""
    return {"type": "phone", "beats": [{"mode": m, "at": a} for m, a in beats],
            "labels": [{"text": t, "at": a, "side": sd} for t, a, sd in labels]}


def flow_node(text, at, icon=None, accent=False):
    n = {"text": text, "at": at}
    if icon: n["icon"] = icon
    if accent: n["accent"] = True
    return n


def flow_row(nodes, strike_at=None):
    r = {"nodes": list(nodes)}
    if strike_at is not None: r["strikeAt"] = strike_at
    return r


def vis_flow(*rows):
    """Steps in a row (flow_row([flow_node(...)])); a row can be struck out (strike_at) and the next row is the new
    way. "不再先 A 再 B，而是 C" - repeat the struck row (times in the past) in the next state so it stays visible."""
    return {"type": "flow", "rows": list(rows)}


def bar(label, value, at, tone=None, ghost=None, ghost_at=None, ghost_label=None):
    """One bar of vis_bars: value 0-1 grows at `at`; ghost: a dashed outline to the level it should reach."""
    b = {"label": label, "value": value, "at": at}
    if tone: b["tone"] = tone  # "warm" = the accent gradient
    if ghost is not None: b.update({"ghost": ghost, "ghostAt": ghost_at, **({"ghostLabel": ghost_label} if ghost_label else {})})
    return b


def vis_bars(bars, note=None):
    """How much: results side by side ("效果差不多"), optionally the level one should reach (ghost).
    note: (text, at) - a small verdict pill. Lengths only show what he says (equal, more, short of); never invent numbers."""
    v = {"type": "bars", "bars": list(bars)}
    if note: v["note"] = {"text": note[0], "at": note[1]}
    return v


def vis_frame(at, fill_at, label, fill_label=None, slots=3, icons=None):
    """Only the outline is given (label at `at`); the rest is filled in by someone else from fill_at.
    "只给框架，其余让它自己发挥" """
    v = {"type": "frame", "at": at, "fillAt": fill_at, "label": label, "slots": slots}
    if fill_label: v["fillLabel"] = fill_label
    if icons: v["icons"] = list(icons)
    return v


def vis_poll(options, hint_at=None):
    """The viewer's choice as answers to pick: options [(key, text, at[, sub])], e.g. ("A", "一键直接出片", t).
    hint_at starts a soft pulse (when he says "评论区告诉我"). No vote counts - there are none."""
    v = {"type": "poll", "options": [{"key": o[0], "text": o[1], "at": o[2], **({"sub": o[3]} if len(o) > 3 else {})} for o in options]}
    if hint_at is not None: v["hintAt"] = hint_at
    return v


def vis_stamp(text, at, tone="warm", sub=None):
    """A verdict slammed onto the glass ("太强了"). tone warm / red / green."""
    v = {"type": "stamp", "text": text, "at": at, "tone": tone}
    if sub: v["sub"] = sub
    return v


def glass(*states, material="crystal"):
    """A passage as one glass panel. material: crystal (default, clear - the user's choice) / glass (more frosted) / smoke (dense)."""
    return {"kind": "glass", "scene": "panel", "at": states[0]["at"], "h": max(_glass_height(x) for x in states),
            "props": {"states": list(states), "material": material}}


# ---- Overlay scenes: one per spoken passage, growing beat by beat (story.tsx).
def beat(text, at, size="main", strike_at=None):
    """One line of a keynote-style phrase stack. "{word}" is set in the accent gradient.
    size: lead (small set-up) / main / hero (the reveal)."""
    b = {"text": text, "at": at, "size": size}
    if strike_at is not None:
        b["strikeAt"] = strike_at
    return b


def phrases(*beats):
    """The thread of an argument: each new line arrives large, earlier ones shrink and move up."""
    return {"kind": "phrases", "scene": "fill", "at": beats[0]["at"], "props": {"beats": list(beats)}}


def loop(nodes, center=None):
    """A cycle: nodes = [(icon, text, at, tone?)], center = (text, at, sub?)."""
    props = {"nodes": [{"icon": n[0], "text": n[1], "at": n[2], "tone": n[3] if len(n) > 3 else "accent"} for n in nodes]}
    if center:
        props["center"] = {"text": center[0], "at": center[1], **({"sub": center[2]} if len(center) > 2 else {})}
    return {"kind": "loop", "scene": "square", "at": nodes[0][2], "props": props}


def dialog(q, q_at, a, a_at, a_sub=None):
    """The viewer's question and the answer, as a message exchange."""
    return {"kind": "dialog", "scene": "fill", "at": q_at,
            "props": {"q": {"text": q, "at": q_at}, "a": {"text": a, "at": a_at, **({"sub": a_sub} if a_sub else {})}}}


def notify(app, title, body, at, icon="Bell", tone="accent", when="现在"):
    """An iOS notification banner for concrete information (next episode, a link, who I am)."""
    return {"kind": "notify", "scene": "top", "at": at, "props": {"app": app, "title": title, "body": body, "icon": icon, "tone": tone, "when": when}}


def name(title, sub, at, icon="Sparkles"):
    """Lower-third style sign-off / self introduction."""
    return {"kind": "entity", "h": 190, "at": at, "name": True, "props": {"icon": icon, "title": title, "sub": sub, "tone": "accent"}}


# Captions (runtime layout.ts captionGeo mirrors this): portrait captions sit higher than the platform's own UI at
# the bottom (description, comments scrolling up), on a rounded translucent black band. The edit desk can move them
# (<work>/overrides.json captionStyle); finalize reads that, so panels are always laid out clear of the captions.
CAPTION_BOTTOM = {"portrait": 0.20, "landscape": 0.065}
_CAP = {"top": 0.795}


def caption_style(work):
    ov = os.path.join(work, "overrides.json")
    st = (json.load(open(ov, encoding="utf-8")).get("captionStyle") or {}) if os.path.exists(ov) else {}
    return {"bottom": st.get("bottom", CAPTION_BOTTOM["portrait" if PORTRAIT else "landscape"]), "bg": st.get("bg", True),
            "bgOpacity": st.get("bgOpacity", 0.45), "radius": st.get("radius", 0.5)}


def _caption_top(st):
    """Top of the caption band, as a fraction of the height."""
    W, H = (1440, 2560) if PORTRAIT else (2560, 1440)
    font = min(W, H) * (0.05 if PORTRAIT else 0.0418)
    box = font * 1.3 + (2 * font * 0.3 if st["bg"] else 0)
    return 1 - st["bottom"] - box / H


STRIP_H = 150  # a tag beside the person (a line read left to right) - larger than a tag on the canvas
CARD_H = 210   # an icon card beside the person, sized to its words


def _layout_beside(shot, face, portrait):
    DW, DH = (1440, 2560) if portrait else (2560, 1440)
    cx, cy, fw, fh = face["cx"], face["cy"], face.get("w", 0.14), face["h"]
    if portrait:
        x0, x1 = 0.06 * DW, 0.94 * DW
        # From just under the chin down to the caption band.
        below = ((cy + fh * 0.5 + 0.012) * DH, (_CAP["top"] - 0.012) * DH)
        above = (0.10 * DH, (cy - fh * 0.62) * DH)  # under the chapter badge, down to the top of the head
        y0, y1 = below
        if y1 - y0 < 420 and above[1] - above[0] > y1 - y0:  # more room above the head than under the chin: use that
            y0, y1 = above
    else:
        if cx >= 0.5:
            x0, x1 = 0.045 * DW, (cx - fw * 0.85) * DW
        else:
            x0, x1 = (cx + fw * 0.85) * DW, 0.955 * DW
        y0, y1 = 0.19 * DH, 0.8 * DH
    width = min(900 if not portrait else x1 - x0, x1 - x0)  # same column as the glass panels
    groups = shot.pop("_beside")
    out = []
    for gi, group in enumerate(groups):
        nxt = groups[gi + 1][0]["at"] if gi + 1 < len(groups) else shot["endMs"]
        out_ms = min(nxt - 80, shot["endMs"] - 150)
        # Big words take the same free space: the group steps aside before one lands.
        later_big = [bw["atMs"] for bw in shot.get("bigWord", []) + shot.get("behind", []) if bw["atMs"] > group[0]["at"]]
        if later_big:
            out_ms = min(out_ms, min(later_big) - 80)
        for it in group:
            if it["kind"] == "tag" and not it.get("scene"):
                it["h"] = STRIP_H
            elif it["kind"] == "entity" and not it.get("name") and not it.get("scene"):
                it["h"] = CARD_H
        heights = [it.get("h", 0) for it in group]
        total = sum(heights) + 28 * (len(group) - 1)
        # Portrait: cards go on the wall above the head whenever they fit there, set against its top edge so they stay clear
        # of the head; panels and the sign-off keep their zone.
        up = portrait and not group[0].get("scene") and not any(it.get("name") for it in group) and above[1] - above[0] >= total
        gy0, gy1 = above if up else (y0, y1)
        in_above = portrait and gy0 == above[0]
        y = gy1 - total if any(it.get("name") for it in group) else gy0 if in_above else (gy0 + gy1) / 2 - total / 2
        if group[0].get("scene"):  # a scene owns the whole free zone
            it = group[0]
            zw, zh = x1 - x0, y1 - y0
            fit = 1.0
            if it["scene"] == "panel":
                bw = zw if portrait else min(zw, 900)
                if it["h"] > zh + 1:  # too tall for the free zone: the whole panel scales down to fit, to 70% at most
                    fit = max(0.7, zh / it["h"])
                    if zh / it["h"] < 0.7:
                        print(f"WARN {shot['id']} group {gi}: glass panel needs {it['h']}px but the free zone is {round(zh)}px "
                              f"(even at 70% it is cut) - make the states more compact")
                bh = min(it["h"] * fit, zh)
                bx, by = x0, (y0 + (zh - bh) * (0 if in_above else 0.15 if portrait else 0.38))  # above the head: against the top
            elif it["scene"] == "square":
                side_len = min(zw, zh)
                bx, by, bw, bh = x0 + (zw - side_len) / 2, y0 + (zh - side_len) / 2, side_len, side_len
            elif it["scene"] == "top":
                bw = min(zw, 1040)
                bx, by, bh = x0 + (zw - bw) / 2 if portrait else x0, y0 + 40, 250
            else:
                bx, by, bw, bh = x0, y0, zw, zh
            props = {**it["props"], "frame": [DW, DH], "side": "left" if x0 < DW / 2 else "right", **({"scale": round(fit, 3)} if fit < 1 else {})}
            out.append({"id": f"{shot['id']}-s{gi}", "kind": it["kind"], "x": round(bx), "y": round(by), "w": round(bw), "h": round(bh),
                        "atMs": it["at"], "outMs": out_ms, "props": props})
            continue
        for k, it in enumerate(group):
            strip = it["kind"] == "tag"
            if strip:  # a line beside the person: left-aligned plain white text, as long as its words (Tag `strip`)
                units = sum(0.55 if ord(ch) < 128 else 1 for ch in it["props"]["text"] if ch not in "{}")
                w = min(width, round(STRIP_H * (0.14 + 0.72 + 0.16 + 0.4) + units * STRIP_H * 0.4))  # Tag strip: pad, icon round, gap, pad
            elif it["kind"] == "entity" and not it.get("name"):  # as wide as its longest line (Entity: title 0.24h, sub 0.155h)
                u = lambda s: sum(0.55 if ord(ch) < 128 else 1 for ch in s or "" if ch not in "{}")
                text_w = max(u(it["props"].get("title")) * 0.24, u(it["props"].get("sub")) * 0.155) * it["h"]
                w = min(width, round(it["h"] * (0.2 * 2 + 0.54 + 0.17 + 0.12) + text_w))
            else:
                w = min(width, it["w"]) if "w" in it else width
            bx = x0
            out.append({"id": f"{shot['id']}-b{gi}-{k}", "kind": it["kind"], "x": round(bx), "y": round(y), "w": round(w), "h": it["h"],
                        "atMs": it["at"], "outMs": out_ms,
                        "props": {**{k2: v for k2, v in it["props"].items() if v is not None}, "onVideo": True, **({"strip": True} if strip else {}),
                                  # cards slide in from the edge they sit against
                                  **({"enter": "slideL" if x0 < DW / 2 else "slideR"} if it["kind"] == "entity" and "enter" not in it["props"] else {})}})
            y += it["h"] + 28
    shot["overlays"] = out


def source(id, start, end, media, chapter=None, label=None, quote=None):
    s = {"type": "source", "id": id, "startMs": start, "endMs": end, "media": media}
    for k, v in (("chapter", chapter), ("label", label), ("quote", quote)):
        if v: s[k] = v
    return s


# ---------------------------------------------------------------- the memory map
# Canvas shots placed in the same `world` form one continuous map. Each new scene is
# laid down next to the previous one (right in landscape, below in portrait); what was
# explained stays there, so later the camera can fly back to it (see look_back/relight).
_WORLD = {"cursor": None, "elements": {}}
GAP = 520
# Portrait frames content in the upper part of the screen (SAFE_PORT); the world below it still shows behind
# the avatar and captions, so stations stacked downward need a gap taller than that band.
GAP_PORT = 1150


def _shift(scene, sid, dx, dy):
    for e in scene["elements"]:
        e["x"] += dx
        e["y"] += dy
        for k in ("from", "to"):
            if k in e["props"]:
                e["props"][k] = [e["props"][k][0] + dx, e["props"][k][1] + dy]
        for n in e["props"].get("nodes", []):
            n["x"] += dx
        e["id"] = f"{sid}/{e['id']}"
        _WORLD["elements"][e["id"]] = e
    for c in scene["camera"]:
        if c.get("focus"):
            c["focus"] = [f if "/" in f else f"{sid}/{f}" for f in c["focus"]]
        if c.get("rect"):
            c["rect"] = {**c["rect"], "x": c["rect"]["x"] + dx, "y": c["rect"]["y"] + dy}


def canvas(id, start, end, chapter, scene, world="main"):
    """`scene` is a layout preset result {"layout", "elements", "camera"}. With a world (default),
    the scene is placed on the shared map and its ids become "<shot id>/<element id>"."""
    if world and scene["elements"]:
        x0 = min(e["x"] for e in scene["elements"])
        y0 = min(e["y"] for e in scene["elements"])
        x1 = max(e["x"] + e["w"] for e in scene["elements"])
        y1 = max(e["y"] + e["h"] for e in scene["elements"])
        cur = _WORLD["cursor"]
        if cur is None:
            dx, dy = -x0, -y0
        elif PORTRAIT:
            dx, dy = -x0, cur + GAP_PORT - y0
        else:
            dx, dy = cur + GAP - x0, -y0
        _shift(scene, id, dx, dy)
        _WORLD["cursor"] = (y1 + dy) if PORTRAIT else (x1 + dx)
    elif world:
        _shift(scene, id, 0, 0)
    s = {"type": "canvas", "id": id, "startMs": start, "endMs": end, "chapter": chapter, **scene}
    if world:
        s["world"] = world
    return s


def restyle(scene, id, kind, w=None, h=None, **props):
    """Presets lay things out; the *form* of one element can still follow its meaning.
    e.g. restyle(scene, "warn", "erode", fade="信息差") or restyle(scene, "t2", "stamp")."""
    e = next(x for x in scene["elements"] if x["id"] == id)
    e["kind"] = kind
    if w: e["w"] = w
    if h: e["h"] = h
    e["props"].update(props)
    return scene


def relight(ref, at):
    """The speaker refers back to an element shown earlier: it pulses and glows at `at` (absolute ms)."""
    e = _WORLD["elements"][ref]
    e["props"].setdefault("relight", []).append(at)


def retire(scene, ids, at):
    """Pointers that served their moment (a highlight's frame and label, a "click here" tag) leave at `at`
    (absolute ms). Use it when the camera will come back to this station to point at something new:
    the new pointer should stand alone, not among the old ones. The content itself (clips, cards) stays."""
    for e in scene["elements"]:
        if e["id"] in ids or e["id"].split("/")[-1] in ids:
            e["outMs"] = at
    return scene


def look_back(at, refs, pad=0.08, move=1300, frame=()):
    """A camera stop that flies back to earlier elements (ids "<shot>/<element>") and relights them.
    `frame`: extra ids kept in the shot for context (e.g. that station's heading) without relighting."""
    for r in refs:
        relight(r, at + move - 150)  # glow as the camera arrives, not during the flight
    return {"atMs": at, "focus": list(refs) + list(frame), "pad": pad, "moveMs": move}


def recall(id, start, end, chapter, refs, extra=None, frame=()):
    """A canvas shot with nothing new on it: the camera returns to earlier stations of the map."""
    cam = [look_back(start, refs, frame=frame)] + (extra or [])
    return {"type": "canvas", "id": id, "startMs": start, "endMs": end, "chapter": chapter, "world": "main",
            "layout": "recall", "elements": [], "camera": cam}


def captions(transcript_path):
    d = json.load(open(transcript_path, encoding="utf-8"))
    if "cues" in d:  # schema 2, from scripts/make_transcript.py
        return [{"startMs": c["startMs"], "endMs": c["endMs"], "text": c["text"]} for c in d["cues"] if c["text"]]
    words, wi, cues = d["words"], 0, []
    for seg in d["segments"]:
        for asr, disp in zip(seg["asrText"].split(), seg["displayText"].split()):
            need, got, start, end = len(asr), 0, None, None
            while wi < len(words) and got < need:
                w = words[wi]
                start = w["startMs"] if start is None else start
                end = w["endMs"]
                got += len(w["text"])
                wi += 1
            if start is not None:
                cues.append({"startMs": start, "endMs": end, "text": disp})
    for a, b in zip(cues, cues[1:]):
        if 0 < b["startMs"] - a["endMs"] < 300:
            a["endMs"] = b["startMs"]
        a["endMs"] = min(a["endMs"], b["startMs"])
    return [{**c, "endMs": max(c["endMs"], c["startMs"] + 200)} for c in cues]


def word_at(transcript_path, phrase, after_ms=0, lead=150):
    """When `phrase` is spoken (first time at/after `after_ms`), minus `lead` ms.
    Pictures that land a beat before the word feel cut *to* the speech rather than late."""
    words = json.load(open(transcript_path, encoding="utf-8"))["words"]
    for i, w in enumerate(words):
        if w["startMs"] < after_ms:
            continue
        acc = ""
        for x in words[i:i + 12]:
            acc += x["text"].strip()
            if acc.startswith(phrase):
                return max(0, w["startMs"] - lead)
            if not phrase.startswith(acc):
                break
    raise ValueError(f"'{phrase}' not spoken after {after_ms}ms")


def _smooth_track(samples, window=5):
    """Rolling median of the face per second: follows a presenter who moves, ignores single bad detections."""
    out = []
    for i, x in enumerate(samples):
        win = samples[max(0, i - window // 2): i + window // 2 + 1]
        out.append({"ms": x["ms"], **{k: round(sorted(w[k] for w in win)[len(win) // 2], 4) for k in ("cx", "cy", "h")}})
    return out


def _shift_at(obj, s):
    """Explainer props carry nested "at" times (absolute); make them scene-relative."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "at" and isinstance(v, (int, float)):
                obj[k] = v - s
            elif k != "relight":
                _shift_at(v, s)
    elif isinstance(obj, list):
        for v in obj:
            _shift_at(v, s)


def _localize(shot):
    if shot["type"] != "canvas":
        return shot
    s = shot["startMs"]
    for e in shot["elements"]:
        e["atMs"] -= s
        if isinstance(e.get("outMs"), (int, float)):
            e["outMs"] -= s
        for k in ("on", "captionAtMs", "outMs"):  # "relight" stays absolute on purpose
            if isinstance(e["props"].get(k), (int, float)):
                e["props"][k] -= s
        for n in e["props"].get("nodes", []) + e["props"].get("items", []):
            if "atMs" in n:
                n["atMs"] -= s
            if "doneAtMs" in n:
                n["doneAtMs"] -= s
        _shift_at(e["props"], s)
    for c in shot["camera"]:
        c["atMs"] -= s
    return shot


def _sfx(shots):
    cues = []
    for sh in shots:
        if sh["type"] != "presenter":
            cues.append((sh["startMs"], "whoosh-air", 0.22))
        for e in sh.get("elements", []):
            at = sh["startMs"] + e["atMs"]
            if e["kind"] in ("tag", "highlight", "circle", "marker", "strike", "rise", "multiply", "erode"):
                cues.append((at, "pop-bubble", 0.2))
            elif e["kind"] == "stamp":
                cues.append((at + 250, "thud-soft", 0.24))  # the moment it hits
            elif e["kind"] == "scan":
                cues.append((at, "whoosh-air", 0.2))
            elif e["kind"] == "stat":
                cues.append((at + e["props"].get("countMs", 900), "thud-soft", 0.2))
            elif e["kind"] == "heading":
                cues.append((at, "blip-digital", 0.14))
        for b in sh.get("bigWord", []):
            cues.append((b["atMs"], "thud-soft", 0.22))
        for b in sh.get("behind", []):
            cues.append((b["atMs"], "whoosh-air", 0.24))
        for b in sh.get("sticker", []):
            cues.append((b["atMs"], "thud-soft", 0.3))
        for e in sh.get("overlays", []):
            cues.append((e["atMs"] + (250 if e["kind"] == "stamp" else 0), "thud-soft" if e["kind"] == "stamp" else "pop-bubble", 0.16))
    out, last = [], -1e9
    for at, k, v in sorted(cues):
        if at - last >= 300:
            out.append({"atMs": at, "src": f"sfx/{k}.mp3", "volume": v})
            last = at
    return out


import os


def _place_behind(shot, b, work):
    """Where the word behind the speaker goes: measured from the matte, so the head covers only its lower part,
    and sized so a punch-in during it never pushes it off the frame."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("make_matte", os.path.join(os.path.dirname(os.path.dirname(__file__)), "make_matte.py"))
    mm = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mm)
    path = os.path.join(work, "public", b["matte"]["src"])
    make = b.pop("_make", None)
    if not os.path.exists(path):
        if not make:
            raise FileNotFoundError(f"{shot['id']}: 身后大字的抠像 {path} 不存在")
        print(f"抠像 {b['text']}：{make[0] / 1000:.2f}–{make[1] / 1000:.2f}s（第一次要跑，约每秒画面 18 秒）")
        mm.clip(os.path.join(work, "public/media/presenter.mp4"), make[0] / 1000, make[1] / 1000, path)
    side = mm.sidecar(path)
    covered = b["matte"]["startMs"] + len(side["headTop"]) / side["fps"] * 1000
    if b["matte"]["startMs"] > b["atMs"] or covered < b["endMs"]:
        print(f"WARN {shot['id']}: 抠像只覆盖 {b['matte']['startMs'] / 1000:.2f}–{covered / 1000:.2f}s，身后大字是 "
              f"{b['atMs'] / 1000:.2f}–{b['endMs'] / 1000:.2f}s：没覆盖的部分人会被字挡住，删掉旧抠像让它重做")
    f0 = max(0, int((b["atMs"] - b["matte"]["startMs"]) / 1000 * side["fps"]))
    f1 = max(f0 + 1, int((b["endMs"] - b["matte"]["startMs"]) / 1000 * side["fps"]))
    b["headTop"] = min(side["headTop"][f0:f1] or side["headTop"])
    b["zoomMax"] = max([1.0] + [z["scale"] for z in shot.get("zoom", []) if z["atMs"] < b["endMs"]])
    H = 2560 if PORTRAIT else 1440
    if (b["headTop"] - 0.06 * H) / 0.7 < 0.06 * H:
        print(f"WARN {shot['id']}: 头顶上方只有 {b['headTop']}px，放不下身后大字（字会很小）：换个时刻，或改用别的形式")


def finalize(out_path, *, brief, title, brand, shots, transcript, face_track, agenda=None, duration_ms=None, canvas_style="glass",
             music=None):
    """agenda is optional: [{title, en, icon, atMs}] — only when the speech gives viewers a structure worth showing.
    music: canvaslib.music(...) - background music and cutting to it (editing-logic.md G). The same programme without
    music (nothing moved onto the beat) is written next to it as <out>.nomusic.json; CANVAS_NO_MUSIC=1 skips the music."""
    if shots[-1]["endMs"] is None:  # last shot runs to the end of the presenter file
        shots[-1]["endMs"] = subprocess_duration(os.path.join(os.path.dirname(out_path), "public/media/presenter.mp4"))
    for a, b in zip(shots, shots[1:]):
        assert a["endMs"] == b["startMs"], f"gap/overlap between {a['id']} and {b['id']}"
    score = None
    if music and not os.environ.get("CANVAS_NO_MUSIC"):
        import copy
        from . import bgm as _music
        finalize(os.path.splitext(out_path)[0] + ".nomusic.json", brief=brief, title=title, brand=brand, shots=copy.deepcopy(shots),
                 transcript=transcript, face_track=face_track, agenda=agenda, duration_ms=duration_ms, canvas_style=canvas_style)
        dur0 = duration_ms or subprocess_duration(os.path.join(os.path.dirname(out_path), "public/media/presenter.mp4"))
        score = _music.score(music, shots, transcript, os.path.dirname(out_path), dur0)
    cap = caption_style(os.path.dirname(out_path))
    _CAP["top"] = _caption_top(cap)
    face = json.load(open(face_track))["samples"]
    med = lambda k: sorted(x[k] for x in face)[len(face) // 2]
    face_med = {k: med(k) for k in ("cx", "cy", "h", "w")}
    for s in shots:
        if s.get("_beside"):
            _layout_beside(s, face_med, PORTRAIT)
        for b in s.get("behind", []):
            _place_behind(s, b, os.path.dirname(out_path))
    shots = [_localize(s) for s in shots]
    vw, vh = probe_size(os.path.join(os.path.dirname(out_path), "public/media/presenter.mp4"))
    assert (vh > vw) == PORTRAIT, "presenter orientation does not match configure(portrait=...)"
    if duration_ms is None:  # follows the presenter file, so a clean base shortens the programme automatically
        dur = subprocess_duration(os.path.join(os.path.dirname(out_path), "public/media/presenter.mp4"))
        duration_ms = dur
    program = {
        "width": vw, "height": vh, "fps": 30, "durationMs": duration_ms,
        "presenter": {"src": "media/presenter.mp4", "face": {"cx": med("cx"), "cy": med("cy"), "h": med("h")}, "track": _smooth_track(face)},
        "brief": brief, "title": title, "brand": brand, "agenda": agenda or [], "canvasStyle": canvas_style,
        "shots": shots, "captions": captions(transcript), "sfx": _sfx(shots), "captionStyle": cap,
    }
    if score:
        program["music"] = score
    json.dump(program, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return program
