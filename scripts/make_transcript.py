"""Raw word-level ASR -> the transcript this skill uses (timed words + caption cues).

    python make_transcript.py <work>/analysis/transcript.raw.words.json <work>/analysis/transcript.words.json
        [--script 逐字稿.docx|.txt] [--corrections <work>/analysis/corrections.json]

Text comes from the presenter's own script when given; timing always comes from ASR.
* The ASR character stream is aligned to the script (difflib). Matched / similar-length
  replaced spans take the script's wording, so misheard terms are fixed automatically.
  Speech that is not in the script (ad-libs) keeps the ASR text; script lines that were
  not spoken are dropped.
* Captions break at script punctuation, at pauses >= 350ms, and never exceed 16
  characters (an over-long phrase splits at its biggest pause / punctuation).
* Whisper end-of-audio hallucinations ("字幕志愿者…" etc.) are removed.
* corrections.json is the manual fallback, applied last:
  {"replace": {"错词": "正确"}, "cues": {"12": "整条改写后的字幕"}}
"""
import argparse
import difflib
import json
import re
import zipfile
from pathlib import Path

PAUSE_MS = 350
MAX_CHARS = 16
MIN_CHARS = 4
PARTICLES = set("了的呢吧啊吗嘛哈呀啦")
# Words that close the clause before them ("不顺眼的话", "调整完之后"); a caption never starts with one.
TAIL_WORDS = ("的话", "之后", "以后", "的时候", "时候", "而已")
# Characters that bind to the word before them; a long line is never split right before one.
BOUND = set("的了地得着过们") | PARTICLES
PUNCT = set("，。！？、；：,.!?;:\"'“”‘’（）()《》【】…—-")
HALLUCINATION = re.compile(r"字幕(志愿者|由)|请不吝点赞|订阅|明镜|Amara|谢谢观看")


def docx_text(path):
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    paras = re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S)
    return "\n".join("".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p)) for p in paras).strip()


def chars_from_words(words):
    """Explode words into characters with interpolated times; spaces between Latin words survive as ' '."""
    out = []
    for w in words:
        t = w["text"].strip()
        t = "".join(ch for ch in t if ch not in PUNCT)
        if not t:
            continue
        # No spaces are invented between Latin tokens: whisper splits words into sub-tokens
        # ("Money", "Pr", "inter"); spacing comes from the script when one is given.
        n = len(t)
        for k, ch in enumerate(t):
            out.append({"c": ch, "s": w["startMs"] + (w["endMs"] - w["startMs"]) * k / n,
                        "e": w["startMs"] + (w["endMs"] - w["startMs"]) * (k + 1) / n, "wb": k == n - 1, "wl": n})
    return out


# Pairs that sound alike in Mandarin (aspirated / unaspirated, retroflex / flat, n / l ...).
_NEAR_INITIALS = [{"b", "p"}, {"d", "t"}, {"g", "k"}, {"j", "q", "x"}, {"zh", "ch", "sh", "z", "c", "s"}, {"n", "l"}, {"f", "h"}, {"r", "l"}]
_PRONOUNS = set("他它她")


def _split(py):
    for ini in ("zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"):
        if py.startswith(ini):
            return ini, py[len(ini):]
    return "", py


def _syllable_sim(a, b):
    if a == b:
        return 1.0
    (ia, fa), (ib, fb) = _split(a), _split(b)
    same_i = ia == ib or any(ia in g and ib in g for g in _NEAR_INITIALS)
    same_f = fa == fb or fa.rstrip("g") == fb.rstrip("g") or fa.lstrip("iu") == fb.lstrip("iu")
    return 0.5 * same_i + 0.5 * same_f


def _py(text):
    from pypinyin import lazy_pinyin
    return [lazy_pinyin(ch)[0].lower() if ch.strip() else "" for ch in text]


def align_sounds(heard, written):
    """Align two spans syllable by syllable (DP); returns [(i|None, j|None, similarity)]."""
    pa, pb = _py(heard), _py(written)
    n, m = len(pa), len(pb)
    S = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            S[i][j] = max(S[i + 1][j], S[i][j + 1], S[i + 1][j + 1] + _syllable_sim(pa[i], pb[j]))
    out, i, j = [], 0, 0
    while i < n or j < m:
        if i < n and j < m and abs(S[i][j] - (S[i + 1][j + 1] + _syllable_sim(pa[i], pb[j]))) < 1e-9:
            out.append((i, j, _syllable_sim(pa[i], pb[j])))
            i, j = i + 1, j + 1
        elif i < n and (j >= m or S[i][j] == S[i + 1][j]):
            out.append((i, None, 0.0))
            i += 1
        else:
            out.append((None, j, 0.0))
            j += 1
    return out


def align_to_script(chars, script, log=None):
    """Captions follow what was *said*: the ASR text is the base. The script is only a reference for
    fixing mis-hearings - a differing span is replaced by the script's wording only when the two sound
    alike (硬钞机 -> 印钞机, 化妆化 -> 画中画). Where the speaker said something else (相当 vs 很),
    his words stay. Also marks clause ends from the script's punctuation, for caption breaks."""
    sc, breaks = [], set()
    for ch in script:
        if ch in PUNCT or ch in "\r\n":
            if sc:
                breaks.add(len(sc) - 1)
        elif not ch.isspace() or (sc and sc[-1].isascii()):
            sc.append(ch)
    asr = "".join(c["c"] for c in chars).lower()
    ref = "".join(sc).lower()
    for c in chars:
        c["t"], c["brk"] = c["c"], False
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, asr, ref, autojunk=False).get_opcodes():
        heard = "".join(c["c"] for c in chars[i1:i2])
        written = "".join(sc[j1:j2])
        if tag == "equal":
            for k in range(i2 - i1):
                chars[i1 + k]["brk"] = (j1 + k) in breaks
                chars[i1 + k]["m"] = True  # spoken text that the script also has
            continue
        if any(j in breaks for j in range(j1, j2)) and (i2 > i1 or i1 > 0):
            # The script's clause end sits on words that were not said as written ("修改。" said as "修"):
            # the break moves to the last character actually spoken there.
            for j in (j for j in range(j1, j2) if j in breaks):
                chars[max(0, i1 + (j - j1 + 1) * (i2 - i1) // (j2 - j1) - 1)]["brk"] = True
        if tag != "replace":
            continue
        ph, pw = _py(heard), _py(written)
        pronouns = set(heard) <= _PRONOUNS and set(written) <= _PRONOUNS
        mean = lambda xs, ys: sum(_syllable_sim(x, y) for x, y in zip(xs, ys)) / max(1, len(ys))
        lo = hi = None  # the part of what was heard that is a mis-hearing of the script's words
        if not pronouns and len(heard) == len(written):
            if mean(ph, pw) >= 0.5:
                lo, hi = 0, len(heard)
        elif not pronouns and len(heard) > len(written):
            best = max(range(len(heard) - len(written) + 1), key=lambda k: mean(ph[k:k + len(pw)], pw))
            if mean(ph[best:best + len(pw)], pw) >= 0.65:
                lo, hi = best, best + len(written)  # one part of what was heard is the misheard script
            elif sum(x[2] for x in align_sounds(heard, written)) / len(heard) >= 0.6:
                lo, hi = 0, len(heard)  # the whole span is the misheard script, with an extra syllable
        elif not pronouns and len(heard) >= len(written) - 1:  # one syllable swallowed
            got = sum(x[2] for x in align_sounds(heard, written)) / len(written)
            if got >= 0.65:
                lo, hi = 0, len(heard)
        whole = lo is not None
        changed = False
        if whole:
            span = list(range(i1 + lo, i1 + hi))
            for k, ci in enumerate(span):  # spread the script's words over the misheard characters
                a2, b2 = k * len(written) // len(span), (k + 1) * len(written) // len(span)
                chars[ci]["t"], chars[ci]["m"] = written[a2:b2], True
                chars[ci]["brk"] = any((j1 + x) in breaks for x in range(a2, b2))
            changed = True
        if log is not None:
            log.append(("改" if whole else "字" if changed else "留", heard, "".join(c["t"] for c in chars[i1:i2]) if changed else written))
        elif tag == "insert" and i1 > 0 and all(x == " " for x in sc[j1:j2]):
            chars[i1 - 1]["t"] += " "  # keep the script's spacing between Latin words
    return chars


def apply_corrections(chars, replace):
    """corrections.json "replace" works on the character stream before captions are cut, so a fix also
    holds when the misheard term straddles two captions, and word_at() finds the corrected word."""
    for wrong, right in replace.items():
        start = 0
        while True:
            text = "".join(c["t"] for c in chars)
            at = text.find(wrong, start)
            if at < 0:
                break
            pos, span, before = 0, [], 0
            for i, c in enumerate(chars):
                if pos + len(c["t"]) > at and pos < at + len(wrong) and c["t"]:
                    if not span:
                        before = pos
                    span.append(i)
                pos += len(c["t"])
            end = before + sum(len(chars[i]["t"]) for i in span)
            new = text[before:at] + right + text[at + len(wrong):end]
            for k, ci in enumerate(span):
                a2, b2 = k * len(new) // len(span), (k + 1) * len(new) // len(span)
                chars[ci]["t"], chars[ci]["m"] = new[a2:b2], True
            start = at + len(right)
    return chars


def mark_word_edges(chars):
    """Mark chars that end a real Chinese word (jieba over the final text), so captions never split inside a word.
    The script's punctuation is always an edge (jieba would otherwise glue "编辑台。先" into "台先")."""
    import jieba
    jieba.setLogLevel(60)
    edges, pos, piece = set(), 0, ""
    for n, c in enumerate(chars):
        piece += c["t"]
        if c.get("brk") or n == len(chars) - 1:
            for w in jieba.cut(piece):
                pos += len(w)
                edges.add(pos)
            piece = ""
    pos = 0
    for c in chars:
        pos += len(c["t"])
        c["we"] = pos in edges and bool(c["t"])
    return chars


def mid_de(cs, k):
    """cs[k] is an attributive 的 inside a clause ("出现的 / 时间", "右上角的 / 导出") - the line must not end there."""
    return cs[k]["t"].endswith("的") and not cs[k].get("brk")


def _starts_tail(cs, k):
    rest = "".join(c["t"] for c in cs[k:k + 4])
    return any(rest.startswith(w) for w in TAIL_WORDS)


def segment(chars):
    cues, cur = [], []

    def length(cs):
        return len("".join(c["t"] for c in cs).replace(" ", ""))

    def clause_fits(i):
        """A hesitation inside one script clause ("全自动剪辑的 … 时候") is not a caption break when the
        whole clause still fits on one line."""
        if not all(x.get("m") for x in cur):
            return False
        n = length(cur)
        for c in chars[i:]:
            if not c.get("m"):
                return False
            n += len(c["t"].replace(" ", ""))
            if n > MAX_CHARS:
                return False
            if c.get("brk"):
                return True
        return False

    def tail_len(i):
        """How many chars a clause-closing word ("的话", "之后") starting at chars[i] spans, else 0."""
        rest = "".join(c["t"] for c in chars[i:i + 4])
        w = next((w for w in TAIL_WORDS if rest.startswith(w)), None)
        if not w:
            return 0
        n, got = 0, ""
        while len(got) < len(w):
            got += chars[i + n]["t"]
            n += 1
        return n if chars[i + n - 1]["we"] else 0

    i = 0
    while i < len(chars):
        c = chars[i]
        if cur and c["s"] - cur[-1]["e"] >= PAUSE_MS and length(cur) >= 2 and cur[-1]["we"] and not tail_len(i) \
                and c["t"] not in BOUND and not mid_de(cur, len(cur) - 1) and not clause_fits(i):
            cues.append(cur)
            cur = []
        cur.append(c)
        i += 1
        if length(cur) > MAX_CHARS:
            # Split at the best point: at a word edge, never right before a bound particle ("出现 / 的时间"),
            # script punctuation first, else a pause, near 60% of the line.
            best = max(range(MIN_CHARS - 1, len(cur) - 2),
                       key=lambda k: (cur[k]["we"], cur[k + 1]["t"][:1] not in BOUND and not _starts_tail(cur, k + 1),
                                      not mid_de(cur, k),
                                      cur[k].get("brk", False), cur[k + 1]["s"] - cur[k]["e"] >= 120,
                                      -abs(k + 1 - len(cur) * 0.6)), default=len(cur) // 2)
            cues.append(cur[:best + 1])
            cur = cur[best + 1:]
        if c.get("brk") and c["we"] and length(cur) >= MIN_CHARS:
            k = tail_len(i)  # "不顺眼[，]的话" - an ad-libbed tail stays with its clause
            if k and chars[i]["s"] - c["e"] < PAUSE_MS:
                cur += chars[i:i + k]
                i += k
            cues.append(cur)
            cur = []
    if cur:
        cues.append(cur)
    # A pause before a clause-final particle ("成熟 / 了，无限画布") must not push the particle into the next caption.
    for prev, cs in zip(cues, cues[1:]):
        # The particle is either the clause end itself, or an ad-lib tail right after one ("成熟[，]了").
        while len(cs) > 1 and cs[0]["t"] in PARTICLES and cs[0].get("we") and (cs[0].get("brk") or prev[-1].get("brk")):
            prev.append(cs.pop(0))
    out = []
    for cs in cues:
        text = re.sub(r"\s+", " ", "".join(c["t"] for c in cs)).strip()
        if text:
            out.append({"startMs": round(cs[0]["s"]), "endMs": round(cs[-1]["e"]), "text": text})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("raw")
    ap.add_argument("out")
    ap.add_argument("--script")
    ap.add_argument("--corrections")
    a = ap.parse_args()
    raw = json.load(open(a.raw, encoding="utf-8"))
    words = [w for w in raw["words"]]
    chars = chars_from_words(words)
    script = None
    if a.script:
        s = Path(a.script)
        script = docx_text(s) if s.suffix.lower() == ".docx" else s.read_text(encoding="utf-8")
        (Path(a.out).parent / "script.txt").write_text(script, encoding="utf-8")
        log = []
        chars = align_to_script(chars, script, log)
    else:
        for c in chars:
            c["t"] = c["c"]
    fix = json.load(open(a.corrections, encoding="utf-8")) if a.corrections and Path(a.corrections).exists() else {}
    chars = apply_corrections(chars, fix.get("replace", {}))
    cues = [c for c in segment(mark_word_edges(chars)) if not HALLUCINATION.search(c["text"])]
    for i, t in fix.get("cues", {}).items():
        cues[int(i)]["text"] = t
    # Words keep their timing; their text follows the aligned script (and corrections) so word_at() finds them.
    if script or fix.get("replace"):
        k = 0
        for w in words:
            n = len("".join(ch for ch in w["text"].strip() if ch not in PUNCT))
            if n:
                w["text"] = "".join(c["t"] for c in chars[k:k + n]).strip()
                w["inScript"] = bool(script) and any(c.get("m") for c in chars[k:k + n])
                w["asr"] = "".join(c["c"] for c in chars[k:k + n])
                k += n
    doc = {"schemaVersion": 2, "source": raw.get("source"), "model": raw.get("model"), "durationMs": raw.get("durationMs"),
           "scriptAligned": bool(script), "words": words, "cues": cues}
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    json.dump(doc, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({"out": a.out, "words": len(words), "cues": len(cues), "scriptAligned": bool(script)}, ensure_ascii=False))
    if script:
        # What the script reference changed (misheard -> fixed) and where the speech was kept on purpose.
        for kind, heard, written in log:
            note = {"改": "读音相近，按稿子改成", "字": "只改同音错字为", "留": "说法不同，保留实际说的（稿子是"}[kind]
            print(f"  听到「{heard}」 {note}「{written}」" + ("）" if kind == "留" else ""))
    for i, c in enumerate(cues):
        print(f"{i:3d} {c['startMs'] / 1000:7.2f} {c['text']}")


if __name__ == "__main__":
    main()
