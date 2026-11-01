"""Explainer scenes: show how an abstract process works when there is no footage of it
(or the footage cannot show it - what happens inside a tool is invisible in a screen recording).

Use them after real material, not instead of it (see references/editing-logic.md, B0).
Every time below is absolute ms (word_at); canvas() + finalize() make them scene-relative.
Tiles and clips may carry `media=image(...)` / `video(...)` to show real frames from the
user's material instead of an icon - an explainer built from real pictures keeps their credibility.
Every explainer lays itself out for the orientation (canvaslib.configure): side by side in landscape, stacked
top to bottom with larger type in portrait, where the camera frames one part at a time.
"""
from . import common
import math

from .common import el
from .layouts import _scene, _stop

PW = 1000  # portrait column width (world units), as in layouts_portrait


def tile(icon, label, tone="cyan", media=None):
    t = {"icon": icon, "label": label, "tone": tone}
    if media: t["media"] = media
    return t


def retrieve(start, script_title, script_lines, keywords, tiles, queries, outcome=None, cols=4):
    """Text -> keywords -> a search over a clip library -> matching clips light up.
    script_lines: lines with [word] marking the keywords; keywords: [(word, at)];
    tiles: [tile(...)] (12 reads well); queries: [dict(at, chips=[...], hits=[tile indices], changed=index?)]
    - a second query that swaps one chip shows "change the keyword, the picture changes";
    outcome: (text, at)."""
    props = {"script": {"at": start + 300, "title": script_title, "lines": script_lines},
             "keywords": [{"word": w, "at": a} for w, a in keywords],
             "library": {"at": start + 900, "tiles": tiles, "cols": cols},
             "queries": [dict(q) for q in queries]}
    if outcome:
        props["outcome"] = {"text": outcome[0], "at": outcome[1]}
    first_kw = min(a for _, a in keywords) if keywords else queries[0]["at"]
    if common.PORTRAIT:
        # script on top, search bar under it, the library in three columns below; type set 1.2x
        u, cols, tile_h, gap = 1.2, 3, 210, 26
        chars_per_line = 23  # at 38px across the 1000-wide column
        n_lines = sum(max(1, math.ceil(len(ln.replace("[", "").replace("]", "")) / chars_per_line)) for ln in script_lines)
        sh = round(96 + 35 + 68 + 26 + n_lines * 32 * u * 1.7 + 14)
        bar_y, bar_h = sh + 90, round(110 * u)
        lib_y = bar_y + bar_h + 60
        rows = math.ceil(len(tiles) / cols)
        lib_b = lib_y + rows * tile_h + (rows - 1) * gap
        out_y = lib_b + 50
        props["geo"] = {"u": u, "sh": sh, "barY": bar_y, "barH": bar_h, "libY": lib_y, "tileH": tile_h, "cols": cols, "outY": out_y}
        els = [el("retrieve", "retrieve", 0, 0, PW, out_y + 100, start, **props)]
        cam = [_stop(start, rect={"x": 0, "y": -20, "w": PW, "h": sh + 40}, pad=0.04, move=1200),                       # read the script
               _stop(first_kw - 200, rect={"x": 0, "y": -20, "w": PW, "h": bar_y + bar_h + 40}, pad=0.03, move=1100),   # keywords -> search
               _stop(queries[0]["at"] + 400, rect={"x": 0, "y": bar_y - 30, "w": PW, "h": lib_b - bar_y + 60}, pad=0.02, move=1100)]  # the search runs
        if outcome:
            cam.append(_stop(outcome[1] - 300, rect={"x": 0, "y": lib_y - 30, "w": PW, "h": out_y + 100 - lib_y + 30}, pad=0.03, move=1000))
        return _scene("retrieve", els, cam)
    els = [el("retrieve", "retrieve", 0, 0, 2200, 1100, start, **props)]
    cam = [_stop(start, rect={"x": -40, "y": 80, "w": 860, "h": 600}, pad=0.04, move=1200),        # read the script
           _stop(first_kw - 200, rect={"x": -40, "y": -20, "w": 1500, "h": 760}, pad=0.03, move=1100),  # keywords -> search
           _stop(queries[0]["at"] + 400, rect={"x": 860, "y": -20, "w": 1380, "h": 1000}, pad=0.03, move=1100)]  # the search runs
    if outcome:
        cam.append(_stop(outcome[1] - 300, rect={"x": -40, "y": -20, "w": 2280, "h": 1000}, pad=0.03, move=1200))  # the whole story
    return _scene("retrieve", els, cam)


def clip(icon, label, tone="cyan", media=None):
    c = {"icon": icon, "label": label, "tone": tone}
    if media: c["media"] = media
    return c


def pipeline(start, input_title, engine, output_title, items, engine_at, output_at, outcome=None):
    """Lines go into an engine and come out as clips placed on a timeline, each aligned to its line.
    engine: (title, icon); items: [(line, clip(...), at)] - each item flows at its time;
    outcome: (text, at)."""
    props = {"input": {"at": start + 300, "title": input_title},
             "engine": {"at": engine_at, "title": engine[0], "icon": engine[1]},
             "output": {"at": output_at, "title": output_title},
             "items": [{"line": ln, "clip": c, "at": a} for ln, c, a in items]}
    if outcome:
        props["outcome"] = {"text": outcome[0], "at": outcome[1]}
    if common.PORTRAIT:
        # input on top, the engine under it, the timeline below; the dots travel downwards; type set 1.15x
        # kept compact: while the lines flow the camera frames the whole way, script rows to timeline slots
        u, er = 1.15, 115
        ih = round(83 + 33 + len(items) * 110 + 14)
        ecy = ih + 70 + er
        out_y = ecy + er + 70
        out_h = 450
        outcome_y = out_y + out_h + 50
        props["geo"] = {"u": u, "ih": ih, "er": er, "ecy": ecy, "outY": out_y, "outcomeY": outcome_y}
        els = [el("pipeline", "pipeline", 0, 0, PW, outcome_y + 100, start, **props)]
        cam = [_stop(start, rect={"x": 0, "y": -20, "w": PW, "h": ih + 40}, pad=0.04, move=1300),                                   # the input
               _stop(engine_at - 300, rect={"x": 0, "y": -20, "w": PW, "h": ecy + er + 40}, pad=0.03, move=1100),                  # into the engine
               # while the lines flow: the whole way, from the script rows to the timeline slots, so each line is
               # seen leaving its row and its clip landing in its slot
               _stop(min([output_at] + [a for _, _, a in items]) - 300, rect={"x": 0, "y": -20, "w": PW, "h": out_y + out_h + 40}, pad=0.02, move=1200)]
        if outcome:
            cam.append(_stop(outcome[1] - 300, rect={"x": 0, "y": out_y - 40, "w": PW, "h": outcome_y + 100 - out_y + 40}, pad=0.04, move=1000))
        return _scene("pipeline", els, cam)
    els = [el("pipeline", "pipeline", 0, 0, 2300, 900, start, **props)]
    cam = [_stop(start, rect={"x": -40, "y": 80, "w": 760, "h": 560}, pad=0.05, move=1300),           # the input
           _stop(engine_at - 300, rect={"x": -40, "y": 60, "w": 1240, "h": 640}, pad=0.04, move=1100),  # into the engine
           _stop(output_at - 300, rect={"x": -40, "y": 100, "w": 2380, "h": 700}, pad=0.02, move=1200)]  # out to the result
    return _scene("pipeline", els, cam)


def step(icon, label, at, progress=False, act=None):
    """One station of a roundtrip loop; progress=True draws a slow bar under it (a render, an upload).
    act: what the station does to the small thing riding the loop - "edit" (scribbled on), "render" (greys out and
    is redrawn top to bottom; the default when progress=True), "wait" (dims under a spinner)."""
    st = {"icon": icon, "label": label, "at": at}
    if progress: st["progress"] = True
    if act: st["act"] = act
    return st


def meter(icon, label, at, kind="drain", note=None):
    """A cost of one pass, in the middle of the loop: kind "drain" (a bar running down - credits, quota)
    or "count" (a clock counting up - waiting time)."""
    m = {"icon": icon, "label": label, "at": at, "kind": kind}
    if note: m["note"] = note
    return m


_RING_V = {"x": -50, "y": 370, "w": 1100, "h": 830}   # the loop inside a portrait roundtrip (see roundtrip.tsx)
_RING_H = {"x": 860, "y": -20, "w": 1000, "h": 1040}


def ring_of(scene):
    """World rect of the loop of a roundtrip placed on the map - for a camera stop that returns to it
    (look_back frames the whole explainer; this frames just the loop, large)."""
    e = next(x for x in scene["elements"] if x["kind"] == "roundtrip")
    r = _RING_V if e["props"].get("vertical") else _RING_H
    return {"x": e["x"] + r["x"], "y": e["y"] + r["y"], "w": r["w"], "h": r["h"]}


def roundtrip(start, trigger, steps, meters=(), outcome=None, shortcut=None):
    """The cost of a long cycle for a small change: one small thing has to travel the whole loop again
    (back to the tool -> change -> re-render -> wait) while meters show what each pass costs.
    trigger: dict(title, at?, kicker?, sub?, media?) - the small thing, best as a real frame of it;
    steps: [step(...)] around the ring, each lit when spoken; meters: [meter(...)];
    outcome: (text, at) - the point, in the speaker's words; shortcut: (icon, label, at, sub?) - the new way
    cuts straight across and the loop dims. Portrait stacks the trigger above the loop."""
    v = common.PORTRAIT
    props = {"trigger": {"at": trigger.get("at", start + 200), **{k: x for k, x in trigger.items() if k != "at"}},
             "steps": list(steps), "meters": list(meters), "vertical": v}
    if outcome:
        props["outcome"] = {"text": outcome[0], "at": outcome[1]}
    if shortcut:
        props["shortcut"] = {"icon": shortcut[0], "label": shortcut[1], "at": shortcut[2], **({"sub": shortcut[3]} if len(shortcut) > 3 else {})}
    w, h = (1000, 1300) if v else (1820, 1000)
    els = [el("roundtrip", "roundtrip", 0, 0, w, h, start, **props)]
    first = steps[0]["at"]
    if v:
        cam = [_stop(start, rect={"x": 0, "y": -20, "w": w, "h": 640}, pad=0.04, move=1200),  # the small thing
               _stop(first - 300, rect=_RING_V, pad=0.02, move=1100)]                            # ... and the loop it starts (set large)
    else:
        cam = [_stop(start, rect={"x": -40, "y": 300, "w": 840, "h": 400}, pad=0.06, move=1200),
               _stop(first - 300, rect={"x": -40, "y": -20, "w": w + 80, "h": h + 40}, pad=0.02, move=1100)]
    return _scene("roundtrip", els, cam)
