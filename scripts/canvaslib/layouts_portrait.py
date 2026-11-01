"""Portrait (9:16) arrangements of the same presets, same signatures.

The portrait safe area is nearly square, so each camera stop frames a block about
1000 world units wide; groups are stacked vertically and the camera travels down
the page instead of across it.
"""
from .common import el, sub_rect
from .layouts import LEAD, _scene, _stop

CW = 1000  # column width in world units


def demo_steps(start, media, steps, kicker="DEMO", kicker_icon="MonitorPlay", tag=None):
    els = [el("demo", "clip", 0, 0, CW, 562, start, media=media, kicker=kicker, kickerIcon=kicker_icon)]
    cw, gap = (CW - 20) / 2, 20
    for i, (ic, t, s, at) in enumerate(steps):
        r, c = divmod(i, 2)
        els.append(el(f"step{i + 1}", "entity", c * (cw + gap), 600 + r * 170, cw, 150, at, icon=ic, title=t, sub=s, on=at))  # each step arrives when it is spoken
    rows = (len(steps) + 1) // 2
    if tag:
        els.append(el("tag", "tag", CW - 380, 480, 380, 90, tag[2], text=tag[0], tone=tag[1], tilt=-3))
    ids = [e["id"] for e in els if e["kind"] != "tag"]
    cam = [_stop(start, ["demo"], pad=0.03), _stop(start + 1300, ids, pad=0.03, move=1200)]
    if rows > 2:  # more than four steps: follow the lit step down the grid
        cam += [_stop(at - LEAD, ["demo", f"step{i + 1}"], pad=0.03) for i, (_, _, _, at) in enumerate(steps) if i >= 4]
    return _scene("demoSteps", els, cam)


def example_stat_kinds(start, clip, heading, stat, kinds):
    els = [el("ex", "clip", 0, 0, 420, 910, start, **clip),
           el("head", "heading", 460, 0, 560, 120, heading[3], icon=heading[0], title=heading[1], en=heading[2])]
    st = dict(stat)
    els.append(el("stat", "stat", 460, 160, 560, 260, st.pop("at"), **st))
    for i, (ic, t, s, at, tone) in enumerate(kinds):
        els.append(el(f"kind{i + 1}", "entity", 460, 460 + i * 150, 560, 130, at, icon=ic, title=t, sub=s, tone=tone, enter="flip"))
    cam = [_stop(start, ["ex", "head", "stat"], pad=0.04)]
    if kinds:
        cam.append(_stop(kinds[0][3] - LEAD, [e["id"] for e in els], pad=0.04, move=1100))
    return _scene("exampleStatKinds", els, cam)


def feature_cards(start, heading, features, tag=None):
    els = [el("head", "heading", 0, 0, CW, 150, heading[3] if len(heading) > 3 else start, icon=heading[0], title=heading[1], en=heading[2])]
    for i, (ic, t, s, at, tone) in enumerate(features):
        els.append(el(f"f{i + 1}", "entity", 0, 200 + i * 230, CW, 200, at, icon=ic, title=t, sub=s, tone=tone))
    if tag:
        els.append(el("tag", "tag", 0, 200 + len(features) * 230 + 20, 560, 100, tag[2], text=tag[0], tone=tag[1]))
    return _scene("featureCards", els, [_stop(start, [e["id"] for e in els], pad=0.05)])


def cause_chain(start, heading, nodes):
    els = [el("head", "heading", 0, 0, CW, 150, start, icon=heading[0], title=heading[1], en=heading[2])]
    y = 200
    for i, (ic, t, s, at, tone) in enumerate(nodes):
        if i:
            els.append(el(f"a{i}", "arrow", 460, y, 80, 100, at - 250, **{"from": [500, y + 10], "to": [500, y + 90]}))
            y += 100
        els.append(el(f"n{i + 1}", "entity", 0, y, CW, 180, at, icon=ic, title=t, sub=s, tone=tone))
        y += 180
    cam = [_stop(start, ["head", "n1"], pad=0.12)]
    for i, (_, _, _, at, _) in enumerate(nodes):
        if i:
            first = max(0, i - 2)  # keep at most three links in view so text stays large
            cam.append(_stop(at - LEAD, [f"n{j + 1}" for j in range(first, i + 1)] + (["head"] if first == 0 else []), pad=0.06))
    return _scene("causeChain", els, cam)


def compare(start, left, right, verdict=None):
    half = (CW - 40) / 2

    def side(key, x, s):
        items = [{"text": t, "atMs": a, "doneAtMs": a, "tone": s["tone"]} for t, a in s["items"]]
        return [el(f"{key}h", "heading", x, 0, half, 110, s["at"], icon=s["icon"], title=s["title"], en=s.get("en", ""), tone=s["tone"]),
                el(f"{key}l", "list", x, 150, half, 100 + 84 * len(items), s["at"] + 200, items=items, row=84)]
    els = side("L", 0, left) + side("R", half + 40, right)
    if verdict:
        els.append(el("verdict", "tag", CW / 2 - 330, 150 + 100 + 84 * max(len(left["items"]), len(right["items"])) + 50, 660, 100, verdict[2], text=verdict[0], tone=verdict[1]))
    cam = [_stop(start, ["Lh", "Ll"], pad=0.06), _stop(right["at"] - LEAD, [e["id"] for e in els], pad=0.04, move=1100)]
    return _scene("compare", els, cam)


def _shot(id, media, src_w, src_h, at, kicker, kicker_icon, width=CW):
    base = (0, 0, width, round(width * src_h / src_w))
    return base, el(id, "clip", *base, at, media=media, kicker=kicker, kickerIcon=kicker_icon)


def _hl(id, base, src_w, h):
    x, y, w, hh = sub_rect(base, src_w, *h["px"])
    props = {k: h[k] for k in ("label", "icon", "tone") if k in h}
    if h.get("style") == "circle":  # a focus ring hugging the target, without the spotlight
        g = 10
        return el(id, "circle", x - g, y - g, w + 2 * g, hh + 2 * g, h["at"], **props), {"x": x, "y": y, "w": w, "h": hh}
    return el(id, "highlight", x, y, w, hh, h["at"], **props), {"x": x, "y": y, "w": w, "h": hh}


def shot_focus(start, shot, highlight, heading, effects, push_pad=0.3):
    base, img = _shot("shot", shot["media"], *shot["src"], start, shot.get("kicker"), shot.get("kickerIcon"))
    hl, hr = _hl("hl", base, shot["src"][0], highlight)
    y = base[3] + 80
    els = [img, hl, el("head", "heading", 0, y, CW, 140, heading[3], icon=heading[0], title=heading[1], en=heading[2])]
    y += 190
    for i, (ic, t, s, at, tone) in enumerate(effects):
        if i:
            els.append(el(f"a{i}", "arrow", 460, y, 80, 90, at - 500, **{"from": [500, y + 10], "to": [500, y + 80]}))
            y += 90
        els.append(el(f"e{i + 1}", "entity", 0, y, CW, 180, at, icon=ic, title=t, sub=s, tone=tone))
        y += 180
    cam = [_stop(start, ["shot"], pad=0.03), _stop(highlight["at"] - 200, rect=hr, pad=push_pad)]
    if effects:
        cam.append(_stop(min(heading[3], effects[0][3]) - LEAD, ["head"] + [f"e{i + 1}" for i in range(len(effects))], pad=0.06, move=1200))
    return _scene("shotFocus", els, cam)


def shot_then_timeline(start, shot, highlight, heading, nodes, warn=None, push_pad=0.3):
    base, img = _shot("shot", shot["media"], *shot["src"], start, shot.get("kicker"), shot.get("kickerIcon"))
    hl, hr = _hl("hl", base, shot["src"][0], highlight)
    y = base[3] + 100
    step = CW / max(1, len(nodes))
    tl_nodes = [{"x": step * (i + 0.5), "icon": n["icon"], "label": n["label"], "sub": n.get("sub"), "atMs": n["at"], "tone": n.get("tone", "accent")}
                for i, n in enumerate(nodes)]
    els = [img, hl, el("head", "heading", 0, y, CW, 140, heading[3], icon=heading[0], title=heading[1], en=heading[2]),
           el("tl", "timeline", 0, y + 330, CW, 200, heading[3] + 100, nodes=tl_nodes)]
    cam = [_stop(start, ["shot"], pad=0.03), _stop(highlight["at"], rect=hr, pad=push_pad), _stop(heading[3] - 100, ["head", "tl"], pad=0.06, move=1200)]
    if warn:
        els.append(el("warn", "tag", CW / 2 - 330, y + 680, 660, 110, warn[2], text=warn[0], tone=warn[1], tilt=-3))
        cam.append(_stop(warn[2] - LEAD, ["head", "tl", "warn"], pad=0.05))
    return _scene("shotThenTimeline", els, cam)


def evidence_wall(start, shot, highlights, stat, tags, second=None, final_tag=None):
    base, img = _shot("shot", shot["media"], *shot["src"], start, shot.get("kicker"), shot.get("kickerIcon"))
    els = [img]
    cam = [_stop(start, ["shot"], pad=0.03)]
    for i, h in enumerate(highlights):
        hl, hr = _hl(f"hl{i + 1}", base, shot["src"][0], h)
        els.append(hl)
        cam.append(_stop(h["at"] - LEAD, rect=hr, pad=0.35))
    y = base[3] + 80
    st = dict(stat)
    stat_at = st.pop("at")
    els.append(el("stat", "stat", 0, y, CW, 260, stat_at, **st))
    for i, (t, tone, at) in enumerate(tags):
        els.append(el(f"t{i + 1}", "tag", 0, y + 300 + i * 120, 640, 96, at, text=t, tone=tone))
    # After the framed facts, travel down to the number and verdicts.
    cam.append(_stop(max(stat_at + 300, highlights[-1]["at"] + 1500 if highlights else stat_at), ["stat"] + [f"t{i + 1}" for i in range(len(tags))], pad=0.08))
    if second:
        y2 = y + 300 + len(tags) * 120 + 80
        sb = (0, y2, CW, round(CW * second["src"][1] / second["src"][0]))
        els.append(el("shot2", "clip", *sb, second["at"], media=second["media"], kicker=second.get("kicker"), kickerIcon=second.get("kickerIcon")))
        cam.append(_stop(second["at"] - 200, ["shot2"], pad=0.03, move=1200))
        if final_tag:
            els.append(el("final", "tag", CW / 2 - 330, sb[1] + sb[3] + 60, 660, 100, final_tag[2], text=final_tag[0], tone=final_tag[1]))
            cam.append(_stop(final_tag[2] - 200, rect={"x": 0, "y": sb[1] + sb[3] - 420, "w": CW, "h": 420 + 60 + 100}, pad=0.06, move=1000))
    return _scene("evidenceWall", els, cam)


def before_after(start, before, after, notes=()):
    half = (CW - 60) / 2
    els = [el("bh", "heading", 0, 0, half, 110, before["at"], icon=before["icon"], title=before["title"], en=before.get("en", "BEFORE"), tone=before.get("tone", "cyan")),
           el("bc", "clip", 0, 150, half, half * 16 / 9, before["at"], media=before["media"]),
           el("ah", "heading", half + 60, 0, half, 110, after["at"], icon=after["icon"], title=after["title"], en=after.get("en", "AFTER"), tone=after.get("tone", "accent")),
           el("ac", "clip", half + 60, 150, half, half * 16 / 9, after["at"], media=after["media"], glow=True)]
    # A verdict about the plain version sits on it like a sticker (e.g. "already good enough").
    for i, n in enumerate(before.get("notes", ())):
        props = {"text": n[0], "tone": n[1], "tilt": -3, "onVideo": True}  # sits on footage: dark glass to stay legible
        if len(n) > 3: props["icon"] = n[3]
        els.append(el(f"bn{i + 1}", "stamp", -20, 150 + half * 16 / 9 - 140 - i * 124, half + 40, 104, n[2], **props))
    y = 150 + half * 16 / 9 + 50
    for i, n in enumerate(notes):
        props = {"text": n[0], "tone": n[1]}
        if len(n) > 3: props["icon"] = n[3]
        els.append(el(f"n{i + 1}", "tag", CW / 2 - 330, y + i * 130, 660, 104, n[2], **props))
    cam = [_stop(start, ["bh", "bc"], pad=0.06), _stop(after["at"] - LEAD, ["bh", "bc", "ah", "ac"], pad=0.04, move=1100)]
    if notes:
        cam.append(_stop(notes[0][2] - LEAD, ["ac"] + [f"n{i + 1}" for i in range(len(notes))], pad=0.05))
    return _scene("beforeAfter", els, cam)
