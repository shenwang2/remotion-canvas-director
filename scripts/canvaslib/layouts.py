"""Layout presets: content in, world coordinates + camera route out.

These are a starter toolbox, not a cage. Pick by the *content relation* of the
segment (see references/editing-logic.md). If nothing fits, compose a new layout
from the same element kinds and give it a new `layout` name.

Item tuples use absolute ms. Camera stops lead each reveal by LEAD ms.
"""
from .common import el

LEAD = 300


def _scene(layout, elements, camera):
    return {"layout": layout, "elements": elements, "camera": camera}


def _stop(at, focus=None, rect=None, pad=0.04, move=1000):
    s = {"atMs": max(0, at), "pad": pad, "moveMs": move}
    if focus: s["focus"] = focus
    if rect: s["rect"] = rect
    return s


def demo_steps(start, media, steps, kicker="DEMO", kicker_icon="MonitorPlay", tag=None):
    """Screen recording on top, one step card per spoken step below; each lights up when said.
    steps: [(icon, title, sub, atMs)]; tag: (text, tone, atMs)."""
    n = len(steps)
    gap = 16
    cw = (1600 - gap * (n - 1)) / n
    els = [el("demo", "clip", 0, 0, 1600, 900, start, media=media, kicker=kicker, kickerIcon=kicker_icon)]
    for i, (ic, t, s, at) in enumerate(steps):
        els.append(el(f"step{i + 1}", "entity", i * (cw + gap), 950, cw, 150, at, icon=ic, title=t, sub=s, on=at))  # each step arrives when it is spoken
    if tag:
        els.append(el("tag", "tag", 1180, 820, 380, 90, tag[2], text=tag[0], tone=tag[1], tilt=-3))
    ids = [e["id"] for e in els if e["kind"] != "tag"]
    cam = [_stop(start, ["demo"], pad=0.02), _stop(start + 1300, ids, pad=0.02, move=1200)]
    return _scene("demoSteps", els, cam)


def example_stat_kinds(start, clip, heading, stat, kinds):
    """Portrait example on the left, headline + number in the middle, category cards arriving on the right.
    clip: dict(media, kicker, kickerIcon, caption, captionAtMs); heading: (icon, title, en, at);
    stat: dict(value, suffix, label, icon, at); kinds: [(icon, title, sub, at, tone)]."""
    els = [el("ex", "clip", 200, 160, 508, 1100, start, **clip),
           el("head", "heading", 860, 200, 1300, 150, heading[3], icon=heading[0], title=heading[1], en=heading[2])]
    st = dict(stat)
    els.append(el("stat", "stat", 860, 420, 700, 300, st.pop("at"), **st))
    for i, (ic, t, s, at, tone) in enumerate(kinds):
        els.append(el(f"kind{i + 1}", "entity", 1720, 200 + i * 190, 640, 150, at, icon=ic, title=t, sub=s, tone=tone, enter="flip"))
    cam = [_stop(start, ["ex", "head", "stat"], pad=0.08)]
    if kinds:
        cam.append(_stop(kinds[0][3] - LEAD, [e["id"] for e in els], pad=0.06, move=1100))
    return _scene("exampleStatKinds", els, cam)


def feature_cards(start, heading, features, tag=None):
    """Parallel things of equal weight: a headline over a row of cards. features: [(icon, title, sub, at, tone)]."""
    els = [el("head", "heading", 0, -300, 1600, 160, heading[3] if len(heading) > 3 else start, icon=heading[0], title=heading[1], en=heading[2])]
    for i, (ic, t, s, at, tone) in enumerate(features):
        els.append(el(f"f{i + 1}", "entity", i * 800, 0, 720, 230, at, icon=ic, title=t, sub=s, tone=tone))
    if tag:
        els.append(el("tag", "tag", 0, 330, 560, 100, tag[2], text=tag[0], tone=tag[1]))
    return _scene("featureCards", els, [_stop(start, [e["id"] for e in els], pad=0.1)])


def cause_chain(start, heading, nodes):
    """A leads to B leads to C, without a recording: cards in a row joined by drawn arrows.
    nodes: [(icon, title, sub, at, tone)]."""
    els = [el("head", "heading", 0, -280, 1500, 150, start, icon=heading[0], title=heading[1], en=heading[2])]
    cw, gap = 620, 200
    for i, (ic, t, s, at, tone) in enumerate(nodes):
        x = i * (cw + gap)
        els.append(el(f"n{i + 1}", "entity", x, 0, cw, 200, at, icon=ic, title=t, sub=s, tone=tone))
        if i:
            px = x - gap
            els.append(el(f"a{i}", "arrow", px, 60, gap, 80, at - 250, **{"from": [px + 20, 100], "to": [x - 20, 100]}))
    cam = [_stop(start, ["head", "n1"], pad=0.15)]
    cam += [_stop(at - LEAD, ["head"] + [f"n{j + 1}" for j in range(i + 1)], pad=0.08) for i, (_, _, _, at, _) in enumerate(nodes) if i]
    return _scene("causeChain", els, cam)


def compare(start, left, right, verdict=None):
    """Two sides weighed against each other. left/right: dict(icon, title, tone, at, items=[(text, at)]);
    verdict: (text, tone, at) lands under the winning side's column centre."""
    def side(key, x, s):
        items = [{"text": t, "atMs": a, "doneAtMs": a, "tone": s["tone"]} for t, a in s["items"]]
        return [el(f"{key}h", "heading", x, 0, 900, 130, s["at"], icon=s["icon"], title=s["title"], en=s.get("en", ""), tone=s["tone"]),
                el(f"{key}l", "list", x, 180, 900, 120 + 96 * len(items), s["at"] + 200, items=items)]
    els = side("L", 0, left) + side("R", 1100, right)
    els.append(el("vs", "note", 960, 260, 120, 120, start, text="VS", size=64, tone="white", align="center"))
    if verdict:
        els.append(el("verdict", "tag", 650, 260 + 96 * max(len(left["items"]), len(right["items"])) + 120, 700, 110, verdict[2], text=verdict[0], tone=verdict[1]))
    cam = [_stop(start, ["Lh", "Ll"], pad=0.1), _stop(right["at"] - LEAD, [e["id"] for e in els], pad=0.05, move=1100)]
    return _scene("compare", els, cam)


def before_after(start, before, after, notes=()):
    """Show what a change looks like instead of describing it: the plain version, then the improved
    one beside it, with the improvements landing as they are named.
    before/after: dict(media, title, icon, at, tone?, notes?); notes: [(text, tone, at, icon?)]"""
    els = [el("bh", "heading", 0, 0, 760, 140, before["at"], icon=before["icon"], title=before["title"], en=before.get("en", "BEFORE"), tone=before.get("tone", "cyan")),
           el("bc", "clip", 0, 190, 500, 889, before["at"], media=before["media"]),
           el("ah", "heading", 900, 0, 900, 140, after["at"], icon=after["icon"], title=after["title"], en=after.get("en", "AFTER"), tone=after.get("tone", "accent")),
           el("ac", "clip", 900, 190, 500, 889, after["at"], media=after["media"], glow=True),
           el("arr", "arrow", 520, 560, 360, 100, after["at"] - 200, **{"from": [540, 614], "to": [870, 614]})]
    # A verdict about the plain version sits on it like a sticker (e.g. "already good enough").
    for i, n in enumerate(before.get("notes", ())):
        props = {"text": n[0], "tone": n[1], "tilt": -3, "onVideo": True}  # sits on footage: dark glass to stay legible
        if len(n) > 3: props["icon"] = n[3]
        els.append(el(f"bn{i + 1}", "stamp", -40, 930 - i * 124, 580, 104, n[2], **props))
    for i, n in enumerate(notes):
        props = {"text": n[0], "tone": n[1]}
        if len(n) > 3: props["icon"] = n[3]
        els.append(el(f"n{i + 1}", "tag", 1460, 300 + i * 150, 560, 104, n[2], **props))
    cam = [_stop(start, ["bh", "bc"], pad=0.1), _stop(after["at"] - LEAD, [e["id"] for e in els], pad=0.04, move=1100)]
    return _scene("beforeAfter", els, cam)
