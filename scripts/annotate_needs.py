"""First pass of reading the speech as a viewer: for every caption cue, what might the viewer need
in order to follow it? Writes <work>/analysis/needs.json and prints a table to review.

    python annotate_needs.py <work>/analysis/transcript.words.json [--out <work>/analysis/needs.json]

The tags are *proposals* from surface cues. Read the table with the script in mind, then decide
what the foreground does (references/editing-logic.md B1). check_program.py later uses this file
to find moments where a clear need got no visual answer.

  remember  numbers, product names, Latin terms - heard once, easily lost
  point     "这里/看一下/就是这个" - the viewer needs to see the thing being pointed at
  orient    topic turns, enumeration, "接下来/第一个/最后" - where are we
  relate    steps, cause, contrast, comparison - how things connect
  callback  "刚才/前面/之前/将其" - refers to something shown earlier
  attitude  strong judgement or emotion - the person matters more than a card
  wrap      "以上/总之/所以说" - a summary moment
  imagine   the speech *describes a process* - actions in sequence, something being redone, waited for, used up,
            turned into something else. Without a picture the viewer has to imagine it.

Consecutive `imagine` cues are grouped into *process passages* (needs.json "passages"). These are the places to
ask, one by one: is there material that shows this process? If not, should an explainer show it? (editing-logic.md
B0). A pain point is often one of them - "how tedious the old way is" is a process, not only a feeling.
"""
import argparse
import json
import re
from pathlib import Path

CN_NUM = "零一二两三四五六七八九十百千万亿"
PATTERNS = {
    "point": r"这里|看一下|看看|你看|如图|就是这个|这个界面|下面这个|这样子",
    "orient": r"第[一二三四五六七八九十]|首先|其次|接下来|然后呢|最后|另外|还有就是|那下面|再来|先看|我们来",
    "relate": r"因为|所以|如果|但是|而是|不是.{0,6}而|比起|相比|对比|越.{1,6}越|导致|从而|然后|再|并且|同时",
    "callback": r"刚才|刚刚|前面|之前说|上面|将其|这个能力|这个功能|还记得",
    "attitude": r"最骚|我靠|绝对|千万|一定要|赶紧|太.{1,3}了|真的|说实话|讲实话|不得不说",
    "wrap": r"以上|总之|总的来说|总结一下|所以说|说到底",
    "imagine": r"回到|重新|再.{0,3}(?:改|做|跑|渲染|生成|剪|来)|一遍|每次|每改|白白|等了|等它|等着|消耗|额度|自动.{0,4}(?:生成|打开|匹配|识别|剪)"
               r"|会生成|生成之后|流程|原理|背后|怎么做到|变成|转成|编排|拼装|拆成|流进|传给|先.{1,10}(?:再|然后)",
}
PASSAGE_GAP = 1500  # imagine cues closer than this belong to one passage
TERM = re.compile(r"[A-Za-z][A-Za-z0-9.+\-]*(?: [A-Za-z][A-Za-z0-9.+\-]*)*|\d+(?:\.\d+)?\s*[%kKwW万千亿个条倍秒分钟小时天]*|[" + CN_NUM + r"]+[万千亿倍]")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("transcript")
    ap.add_argument("--out")
    a = ap.parse_args()
    tr = json.load(open(a.transcript, encoding="utf-8"))
    out = []
    for i, c in enumerate(tr["cues"]):
        text = c["text"]
        hits = {k: re.findall(p, text) for k, p in PATTERNS.items()}
        hits = {k: v for k, v in hits.items() if v}
        terms = [t.strip() for t in TERM.findall(text) if len(t.strip()) >= 2 or t.strip().isdigit()]
        if terms:
            hits["remember"] = terms
        out.append({"i": i, "startMs": c["startMs"], "endMs": c["endMs"], "text": text, "needs": sorted(hits), "hits": hits, "terms": terms})
    # Process passages: runs of cues that describe a process. One stray word is not a passage - it takes two
    # cues, or one cue with two separate cues of a process in it.
    # One cue without a cue word between two that have one is still the same process ("回到Codex / 里面叫它帮我修改一下 / 既消耗…").
    flag = ["imagine" in c["needs"] for c in out]
    inside = [f or (0 < i < len(out) - 1 and flag[i - 1] and flag[i + 1]) for i, f in enumerate(flag)]
    passages, cur = [], []
    for c, f in zip(out, inside):
        if f and (not cur or c["startMs"] - cur[-1]["endMs"] < PASSAGE_GAP):
            cur.append(c)
            continue
        if cur:
            passages.append(cur)
        cur = [c] if f else []
    if cur:
        passages.append(cur)
    passages = [{"startMs": p[0]["startMs"], "endMs": p[-1]["endMs"], "text": "".join(c["text"] for c in p),
                 "cues": [c["i"] for c in p], "words": sorted({w for c in p for w in c["hits"].get("imagine", [])})}
                for p in passages if len(p) >= 2 or len(p[0]["hits"].get("imagine", [])) >= 2]
    path = Path(a.out) if a.out else Path(a.transcript).with_name("needs.json")
    json.dump({"schemaVersion": 1, "cues": out, "passages": passages}, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    counts = {}
    for c in out:
        for n in c["needs"]:
            counts[n] = counts.get(n, 0) + 1
    print(json.dumps({"out": str(path), "cues": len(out), "needs": counts}, ensure_ascii=False))
    for c in out:
        tags = " ".join(f"{k}:{'/'.join(v)}" for k, v in c["hits"].items())
        print(f"{c['i']:3d} {c['startMs'] / 1000:7.2f} {c['text']:<24} {tags}")
    if passages:
        print("\n在描述过程的段落（逐段决定：有素材展示吗？没有的话要不要解释动画？不需要就写明为什么）：")
        for p in passages:
            print(f"  {p['startMs'] / 1000:6.1f}–{p['endMs'] / 1000:.1f}s  {p['text']}")


if __name__ == "__main__":
    main()
