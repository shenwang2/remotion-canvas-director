"""Screenshot-driven layout presets. A screenshot is only worth showing if the
viewer is told where to look: every preset here frames a region and pushes in."""
from .common import el, sub_rect
from .layouts import LEAD, _scene, _stop


def _shot(id, media, src_w, src_h, x, width, at, kicker, kicker_icon):
    base = (x, 0, width, round(width * src_h / src_w))
    return base, el(id, "clip", *base, at, media=media, kicker=kicker, kickerIcon=kicker_icon)


def _hl(id, base, src_w, h):
    """h: dict(px=(x, y, w, h) in source pixels, at, label, icon, tone, style="box"|"circle")."""
    x, y, w, hh = sub_rect(base, src_w, *h["px"])
    props = {k: h[k] for k in ("label", "icon", "tone") if k in h}
    if h.get("style") == "circle":  # a focus ring hugging the target, without the spotlight
        g = 10
        return el(id, "circle", x - g, y - g, w + 2 * g, hh + 2 * g, h["at"], **props), {"x": x, "y": y, "w": w, "h": hh}
    return el(id, "highlight", x, y, w, hh, h["at"], **props), {"x": x, "y": y, "w": w, "h": hh}


def shot_focus(start, shot, highlight, heading, effects, push_pad=0.5):
    """Screenshot of a setting -> framed and zoomed -> what it lets you do (cards joined by arrows).
    shot: dict(media, src=(w, h), kicker, kickerIcon); highlight: see _hl; heading: (icon, title, en, at);
    effects: [(icon, title, sub, at, tone)] stacked to the right."""
    base, img = _shot("shot", shot["media"], *shot["src"], 0, 900, start, shot.get("kicker"), shot.get("kickerIcon"))
    hl, hr = _hl("hl", base, shot["src"][0], highlight)
    els = [img, el("head", "heading", 1150, 140, 1150, 140, heading[3], icon=heading[0], title=heading[1], en=heading[2]), hl]
    for i, (ic, t, s, at, tone) in enumerate(effects):
        y = 460 + i * 400
        els.append(el(f"e{i + 1}", "entity", 1150, y, 720, 170, at, icon=ic, title=t, sub=s, tone=tone))
        if i:
            els.append(el(f"a{i}", "arrow", 1450, y - 230, 100, 230, at - 500, **{"from": [1510, y - 215], "to": [1510, y - 15]}))
    cam = [_stop(start, ["shot", "head"], pad=0.06), _stop(highlight["at"] - 200, rect=hr, pad=push_pad)]
    if effects:
        cam.append(_stop(effects[0][3] - LEAD, ["shot", "head"] + [f"e{i + 1}" for i in range(len(effects))], pad=0.05))
    return _scene("shotFocus", els, cam)


def shot_then_timeline(start, shot, highlight, heading, nodes, warn=None, push_pad=0.45):
    """Screenshot setting -> zoom -> pan right to what you do next, as a timeline.
    nodes: [dict(icon, label, sub, at, tone?)]; warn: (text, tone, at)."""
    base, img = _shot("shot", shot["media"], *shot["src"], 0, 820, start, shot.get("kicker"), shot.get("kickerIcon"))
    hl, hr = _hl("hl", base, shot["src"][0], highlight)
    x0, span = 1400, 1700
    step = span / max(1, len(nodes))
    tl_nodes = [{"x": x0 + step * (i + 0.5), "icon": n["icon"], "label": n["label"], "sub": n.get("sub"), "atMs": n["at"], "tone": n.get("tone", "accent")}
                for i, n in enumerate(nodes)]
    els = [img, hl, el("head", "heading", x0, 200, 1500, 140, heading[3], icon=heading[0], title=heading[1], en=heading[2]),
           el("tl", "timeline", x0, 520, span, 200, heading[3] + 100, nodes=tl_nodes)]
    cam = [_stop(start, ["shot"], pad=0.05), _stop(highlight["at"], rect=hr, pad=push_pad), _stop(heading[3] - 100, ["head", "tl"], pad=0.1, move=1100)]
    if warn:
        els.append(el("warn", "tag", x0 + span / 2 - 350, 900, 700, 110, warn[2], text=warn[0], tone=warn[1], tilt=-3))
        cam.append(_stop(warn[2] - LEAD, ["head", "tl", "warn"], pad=0.08))
    return _scene("shotThenTimeline", els, cam)


def evidence_wall(start, shot, highlights, stat, tags, second=None, final_tag=None):
    """Proof that something is solid: screenshot with framed facts, a number, verdict tags,
    then optionally a second piece of evidence and a closing verdict.
    stat: dict(value, suffix, label, icon, at); tags: [(text, tone, at)];
    second: dict(media, src, kicker, kickerIcon, at)."""
    base, img = _shot("shot", shot["media"], *shot["src"], 0, 1150, start, shot.get("kicker"), shot.get("kickerIcon"))
    els, rects = [img], []
    for i, h in enumerate(highlights):
        hl, hr = _hl(f"hl{i + 1}", base, shot["src"][0], h)
        els.append(hl)
        rects.append(hr)
    st = dict(stat)
    els.append(el("stat", "stat", 1250, 60, 620, 280, st.pop("at"), **st))
    for i, (t, tone, at) in enumerate(tags):
        els.append(el(f"t{i + 1}", "tag", 1250, 420 + i * 130, 600, 96, at, text=t, tone=tone))
    right = 1870
    cam = [_stop(start, ["shot"], pad=0.05)]
    # Each framed fact gets the camera: a band across the shot and the stat column at that height.
    for h, r in zip(highlights, rects):
        top = max(0, r["y"] - 60)
        cam.append(_stop(h["at"] - LEAD, rect={"x": 0, "y": top, "w": right, "h": max(310, r["y"] + r["h"] - top + 300)}))
    if second:
        sw = 620
        sb = (2000, 0, sw, round(sw * second["src"][1] / second["src"][0]))
        els.append(el("shot2", "clip", *sb, second["at"], media=second["media"], kicker=second.get("kicker"), kickerIcon=second.get("kickerIcon")))
        cam.append(_stop(second["at"] - 200, [f"t{len(tags)}", "shot2"], pad=0.06, move=1100))
        if final_tag:
            els.append(el("final", "tag", 2000, sb[3] + 60, sw, 100, final_tag[2], text=final_tag[0], tone=final_tag[1]))
            cam.append(_stop(final_tag[2] - 200, ["shot", "stat", "shot2", "final"], pad=0.04, move=1100))
    return _scene("evidenceWall", els, cam)
