"""Check a program.json against the fixed rules (ERROR) and the anti-sameness rules (WARN).

    python check_program.py <work>/program.json

Exit code 1 when any ERROR is found. WARN items are judgement calls: fix them or
write down in the brief why this video is the exception.
"""
import difflib
import json
import os
import statistics
import sys

SAFE_LAND = (0.04, 0.12, 0.92, 0.81)  # keep in sync with template/src/camera.ts
SAFE_PORT = (0.05, 0.13, 0.95, 0.6)
MIN_PX = {"entity": 110, "tag": 64, "heading": 100, "stat": 200, "list": 300}


def frame_rect(t, W, H, pad):
    SAFE = SAFE_PORT if H > W else SAFE_LAND
    sw, sh = (SAFE[2] - SAFE[0]) * W, (SAFE[3] - SAFE[1]) * H
    k = min(sw / (t["w"] * (1 + 2 * pad)), sh / (t["h"] * (1 + 2 * pad)), 2 * min(W, H) / 1440)
    return {"w": W / k, "k": k}


def union(es):
    x0, y0 = min(e["x"] for e in es), min(e["y"] for e in es)
    return {"x": x0, "y": y0, "w": max(e["x"] + e["w"] for e in es) - x0, "h": max(e["y"] + e["h"] for e in es) - y0}


def screen_texts(p, ms):
    """Every piece of text the viewer can read on screen at `ms` (absolute)."""
    out = []
    for s in p["shots"]:
        if s["type"] == "canvas" and s["startMs"] <= ms:
            same_world = s.get("world") and any(x["type"] == "canvas" and x.get("world") == s["world"] and x["startMs"] <= ms < x["endMs"] for x in p["shots"])
            if not (s["startMs"] <= ms < s["endMs"] or same_world):
                continue
            for e in s["elements"]:
                if s["startMs"] + e["atMs"] <= ms:
                    out += [str(e["props"].get(k, "")) for k in ("title", "sub", "text", "label", "caption", "kicker", "en")]
                    out += [str(e["props"].get("value", "")) + str(e["props"].get("suffix", ""))]
                    out += [n.get("label", "") for n in e["props"].get("nodes", [])] + [n.get("text", "") for n in e["props"].get("items", [])]
        if s["startMs"] <= ms < s["endMs"]:
            out += [b["text"] + " " + b.get("sub", "") for b in s.get("bigWord", []) if b["atMs"] <= ms + 3000]
            for e in s.get("overlays", []):
                if e["atMs"] <= ms + 2000:
                    pr = e["props"]
                    out += [str(pr.get(k, "")) for k in ("title", "sub", "text", "label", "body", "app")]
                    out += [b2["text"].replace("{", "").replace("}", "") for b2 in pr.get("beats", []) if b2["at"] <= ms + 2000]
                    out += [n["text"] for n in pr.get("nodes", [])] + [pr.get("center", {}).get("text", "")]
                    out += [pr[k]["text"] + " " + pr[k].get("sub", "") for k in ("q", "a") if k in pr]
                    for st in pr.get("states", []):  # glass panel states up to now
                        if st["at"] <= ms + 2000:
                            out += [str(st.get(k, "")).replace("{", "").replace("}", "") for k in ("kicker", "title", "sub", "hero", "heroSub")]
                            out += [r2["text"] + " " + r2.get("sub", "") for r2 in st.get("rows", [])] + [c2["text"] for c2 in st.get("chips", [])]
                            out += list(_vis_texts(st.get("visual")))  # the words inside the small picture are on screen too
            out += [s.get("quote", ""), s.get("label", "")]
    return " ".join(out).lower()


def bigrams(t):
    t = "".join(ch for ch in t if not ch.isspace())
    return {t[i:i + 2] for i in range(len(t) - 1)}


def shot_at(p, ms):
    return next((s for s in p["shots"] if s["startMs"] <= ms < s["endMs"]), p["shots"][-1])


def _vis_texts(v):
    """Every piece of text shown inside a glass-panel picture (labels, node and option texts, stamps)."""
    if isinstance(v, dict):
        for k, x in v.items():
            if k in ("text", "label", "sub", "ghostLabel", "fillLabel", "stamp") and isinstance(x, str):
                yield x
            else:
                yield from _vis_texts(x)
    elif isinstance(v, list):
        for x in v:
            yield from _vis_texts(x)


def _beats(v):
    """Every moment something happens inside a glass-panel picture (at / swapAt / strikeAt / ghostAt / fillAt ...)."""
    if isinstance(v, dict):
        for k, x in v.items():
            if isinstance(x, (int, float)) and not isinstance(x, bool) and (k == "at" or k.endswith("At")) and k != "hintAt":
                yield x
            else:
                yield from _beats(x)
    elif isinstance(v, list):
        for x in v:
            yield from _beats(x)


def main(path):
    p = json.load(open(path, encoding="utf-8"))
    W, H, dur = p["width"], p["height"], p["durationMs"]
    shots = p["shots"]
    err, warn = [], []

    brief = p.get("brief") or {}
    for k in ("core", "remember", "signature"):
        if not brief.get(k):
            err.append(f"brief.{k} 缺失：先写创意简报再排画面")

    # Structure cues are optional; when used they must follow the speech.
    agenda = p.get("agenda") or []
    if agenda and not 2 <= len(agenda) <= 8:
        warn.append(f"结构提示 {len(agenda)} 条，太少或太多都不帮助理解")
    if any(s.get("hud") in ("agenda", "recap") for s in shots) and not agenda:
        err.append("用了 hud=agenda/recap 但 program 里没有 agenda")
    for a in agenda:
        if "atMs" not in a:
            warn.append(f"结构提示「{a['title']}」没有 atMs：应在口播说到它时出现（用 word_at 取时间）")

    pres = sum(s["endMs"] - s["startMs"] for s in shots if s["type"] == "presenter") / dur
    if not 0.3 <= pres <= 0.6 and "presenterShare" not in (brief.get("exceptions") or {}):
        warn.append(f"人物镜头占比 {pres:.0%}，建议 30%–60%")
    bigs = sum(len(s.get("bigWord", [])) for s in shots)
    if bigs > 5:
        err.append(f"大字 {bigs} 个，上限 5")
    for s in shots:
        if s["endMs"] - s["startMs"] < 1500:
            err.append(f"{s['id']} 只有 {s['endMs'] - s['startMs']}ms，镜头至少 1.5s")

    # Beside the person: every card / panel state must stay long enough to be read (a reveal that lands
    # just before the cut to the canvas is gone before anyone sees it).
    for s in shots:
        for o in s.get("overlays", []):
            end = o.get("outMs", s["endMs"] - s["startMs"])
            if o["kind"] == "glass":
                sts = sorted(o["props"].get("states", []), key=lambda x: x["at"])
                for i, st in enumerate(sts):
                    d = (sts[i + 1]["at"] if i + 1 < len(sts) else end) - st["at"]
                    short = not st.get("rows") and len((st.get("hero") or st.get("title") or "").replace("\n", "")) <= 12
                    what = st.get("hero") or st.get("title") or st.get("kicker") or ""
                    # a short title reads in a moment; a picture inside the panel needs longer
                    if d < (1800 if st.get("visual") else 1200 if short else 1500):
                        warn.append(f"{s['id']} 面板状态「{what}」只停留 {d}ms，来不及看（推迟切走，或提前这一状态）")
                    elif st.get("visual"):
                        # the picture's last beat (a stamp, a ghost level, the answer row) must stay a moment before the state moves on
                        last = max(_beats(st["visual"]), default=st["at"])
                        if st["at"] + d - last < 1200:
                            warn.append(f"{s['id']} 面板「{what}」里的小画面最后一下只停留 {st['at'] + d - last}ms 就切走了（推迟下一状态，或把这一下并进前一状态）")
            elif end - o["atMs"] < 1500:
                warn.append(f"{s['id']}/{o['id']} 只停留 {end - o['atMs']}ms，来不及读")

    canv = [s for s in shots if s["type"] == "canvas"]
    for s in canv:
        if not s.get("layout"):
            err.append(f"{s['id']} 没有 layout 名称")
    seq = [s.get("layout") for s in canv]
    for a, b, s in zip(seq, seq[1:], canv[1:]):
        if a and a == b:
            err.append(f"{s['id']} 与上一个画布镜头同为 {a}：相邻画布必须换排法")
    need = min(4, len(canv))
    if len(set(seq)) < need:
        warn.append(f"只用了 {len(set(seq))} 种排法，建议至少 {need} 种")

    moves = set()
    for s in canv:
        # Focus ids may point at earlier stations of the same map (look_back / recall).
        els = {e["id"]: e for x in canv if x.get("world") and x.get("world") == s.get("world") for e in x["elements"]}
        els.update({e["id"]: e for e in s["elements"]})
        prev = None
        for c in sorted(s["camera"], key=lambda c: c["atMs"]):
            tgt = c.get("rect") or union([els[i] for i in c.get("focus") or [e["id"] for e in s["elements"]]])
            r = frame_rect(tgt, W, H, c.get("pad", 0.12 if not c.get("rect") else 0))
            if prev:
                ratio = r["w"] / prev["w"]
                moves.add("push" if ratio < 0.85 else "pull" if ratio > 1.15 else "pan")
            prev = r
            # Readability: every text element visible at this stop must be big enough on screen.
            for e in s["elements"]:
                lim = MIN_PX.get(e["kind"])
                if lim and e["atMs"] <= c["atMs"] + 1200 and c.get("focus") and e["id"] in c["focus"] and e["h"] * r["k"] < lim:
                    warn.append(f"{s['id']}/{e['id']} 屏幕高度约 {e['h'] * r['k']:.0f}px，低于 {lim}px，可能看不清")
        nxt = next((x for x in shots if x["startMs"] == s["endMs"]), None)
        # On a shared map the camera flies on from here, so the last cards stay in view a little longer.
        carry = 1200 if nxt and nxt["type"] == "canvas" and nxt.get("world") and nxt.get("world") == s.get("world") else 0
        for e in s["elements"]:
            dwell = (s["endMs"] - s["startMs"]) - e["atMs"] + carry
            t = s["startMs"] + e["atMs"]
            if t >= s["endMs"] and s.get("world"):
                # Added to this station for a later return (look_back / recall): it is read in that later shot.
                later = next((x for x in shots if x["type"] == "canvas" and x.get("world") == s["world"] and x["startMs"] <= t < x["endMs"]), None)
                dwell = later["endMs"] - t if later else -1
            if e["kind"] in MIN_PX and dwell < 1500:
                warn.append(f"{s['id']}/{e['id']} 出现后只停留 {dwell}ms，来不及读")
    if len(moves) < 2:
        warn.append(f"镜头运动只有 {moves or '无'}，推近/拉远/平移至少用两种")

    durs = [s["endMs"] - s["startMs"] for s in shots]
    if len(durs) > 3 and statistics.pstdev(durs) / statistics.mean(durs) < 0.3:
        warn.append("镜头时长过于均匀，节奏会显得机械")

    caps = p.get("captions", [])
    # ---- Does the foreground follow the speech? (both directions)
    caps = p.get("captions", [])
    for s in canv:
        for e in s["elements"]:
            txt = "".join(str(e["props"].get(k, "")) for k in ("title", "text", "label", "caption"))
            if len(txt) < 2:
                continue
            # A title that arrives together with a clip says what that footage is; it need not be spoken.
            if e["kind"] == "heading" and any(x["kind"] == "clip" and abs(x["atMs"] - e["atMs"]) < 400 for x in s["elements"]):
                continue
            at = s["startMs"] + e["atMs"]
            near = "".join(c["text"] for c in caps if at - 4000 <= c["startMs"] <= at + 6000)
            if not bigrams(txt.lower()) & bigrams(near.lower()) and not any(ch.isdigit() for ch in txt):
                warn.append(f"{s['id']}/{e['id']}「{txt}」和这一刻的口播对不上：是在辅助理解，还是装饰？")
    needs_path = os.path.join(os.path.dirname(path), "analysis", "needs.json")
    if os.path.exists(needs_path):
        for c in json.load(open(needs_path, encoding="utf-8"))["cues"]:
            mid = (c["startMs"] + c["endMs"]) / 2
            sh = shot_at(p, mid)
            for t in c.get("terms", []):
                if len(t) <= 2 and t.isascii() and not t.isdigit():
                    continue  # "AI", "OK" are everyday words, not things to remember
                if t.lower().replace(" ", "") not in screen_texts(p, mid + 1500).replace(" ", ""):
                    warn.append(f"[漏] {c['startMs'] / 1000:.1f}s「{c['text']}」里的「{t}」只在口播里出现，观众可能记不住")
            if "point" in c["needs"] and sh["type"] == "presenter":
                warn.append(f"[漏] {c['startMs'] / 1000:.1f}s「{c['text']}」在让观众看东西，画面却是人物镜头")
            if "callback" in c["needs"]:
                relit = any(abs(r - mid) < 4000 for s in canv for e in s["elements"] for r in e["props"].get("relight", []))
                if not relit:
                    warn.append(f"[漏] {c['startMs'] / 1000:.1f}s「{c['text']}」在回指前面的内容，可以飞回地图上那一站（look_back）")
        # A process described only in words while the person talks: the viewer has to imagine it.
        exc = (brief.get("exceptions") or {})
        for ps in json.load(open(needs_path, encoding="utf-8")).get("passages", []):
            span = ps["endMs"] - ps["startMs"]
            on_person = sum(max(0, min(ps["endMs"], s["endMs"]) - max(ps["startMs"], s["startMs"])) for s in shots if s["type"] == "presenter")
            if span >= 2500 and on_person > 0.6 * span and f"process@{int(ps['startMs'] / 1000)}" not in exc:
                warn.append(f"[漏] {ps['startMs'] / 1000:.1f}–{ps['endMs'] / 1000:.1f}s 在描述一个过程「{ps['text'][:30]}…」，画面是人物+文字："
                            f"有素材就上素材，没有就做解释动画（库里没有就现做）；确实不需要就写进 brief.exceptions['process@{int(ps['startMs'] / 1000)}']")

    # ---- Framing changes on the talking head: punctuation, so a nudge when they crowd.
    cuts = sorted(z["atMs"] for x in shots if x["type"] == "presenter" for z in x.get("zoom", []) if z.get("type") in ("cut", "snap"))
    for a1, a2 in zip(cuts, cuts[1:]):
        if a2 - a1 < 3000:
            warn.append(f"{a1 / 1000:.1f}s 和 {a2 / 1000:.1f}s 两次景别变化挨得太近：观众还没看清就又切了，留一次就够吗？")
    for i in range(len(cuts)):
        win = [c for c in cuts if cuts[i] <= c < cuts[i] + 30000]
        if len(win) > 4:
            warn.append(f"{cuts[i] / 1000:.1f}s 起 30 秒内景别变了 {len(win)} 次：重点太多就没有重点了")
            break

    # ---- The word behind the speaker: a signature moment, so rare, and the frame holds still under it.
    behind = [(x, b) for x in shots if x["type"] == "presenter" for b in x.get("behind", [])]
    if len(behind) > 2:
        warn.append(f"身后大字用了 {len(behind)} 次：它是揭晓核心概念的招牌镜头，一条视频一两次才有分量")
    for x, b in behind:
        for z in x.get("zoom", []):
            if b["atMs"] - 300 <= z["atMs"] < b["endMs"]:
                warn.append(f"{z['atMs'] / 1000:.1f}s 景别变化落在身后大字（{b['text']}）上：推近会把头顶上方的字推出画面，"
                            f"字立着的时候画面别动，景别变化放到它之前或之后")

    # ---- Variety of form: not a rule, a nudge to look again.
    forms = []
    for s in shots:
        forms += [(s["startMs"] + (0 if s["type"] == "presenter" else 0) + e["atMs"] if s["type"] == "canvas" else e["atMs"], e["kind"] + "/" + str(e["props"].get("enter", "")))
                  for e in s.get("elements", []) + s.get("overlays", []) if e["kind"] not in ("clip", "arrow", "heading", "timeline", "list")]
    forms.sort()
    kinds = sorted({k for _, k in forms})
    run = 1
    for (_, a1), (t2, a2) in zip(forms, forms[1:]):
        run = run + 1 if a1 == a2 else 1
        if run == 6:
            warn.append(f"{t2 / 1000:.1f}s 前连续 6 处都是 {a2}：这些要点的意思真的都一样吗？")
    if len(forms) >= 12 and len(kinds) <= 3:
        warn.append(f"全片强调只用了 {kinds}：形式是否跟着意思在变？")

    # ---- Background music: the lift lands on the reveal, the music never covers the voice.
    mu = p.get("music")
    if mu:
        if mu.get("hitAt") is not None:
            if mu.get("trackHit") is None and not mu.get("byUser"):
                warn.append(f"音乐没有起势点对在揭晓（{mu['hitAt'] / 1000:.1f}s）上：这首曲子没有明显的起势，或者都放不下，换一首起势更明显的？")
            elif mu.get("trackHit") is not None:
                seg = next((s for s in mu["segments"] if s[0] <= mu["hitAt"] < s[1]), None)
                if seg is None or abs(seg[2] + mu["hitAt"] - seg[0] - mu["trackHit"] * 1000) > 40:
                    warn.append(f"音乐的起势没有落在 {mu['hitAt'] / 1000:.1f}s 的揭晓上（循环接缝挡住了）：换 hit 或换曲子")
        v = mu["gain"]["v"]
        if max(v) >= 1:
            warn.append("配乐有地方被推到满音量：曲子比人声还轻很多，检查 gainDb 或换一首响度正常的")
        info_music = f"；配乐 {mu['track']}（{mu['bpm']:.0f} BPM，卡点切换 {mu.get('movedCuts', 0)} 处）"
    else:
        info_music = ""

    for m in err:
        print("ERROR", m)
    for m in warn:
        print("WARN ", m)
    print(f"检查完成：{len(err)} 个错误，{len(warn)} 个提醒；排法 {sorted(set(seq))}；镜头运动 {sorted(moves)}；人物占比 {pres:.0%}{info_music}")
    return 1 if err else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
