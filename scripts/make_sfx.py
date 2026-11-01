"""Synthesise the skill's sound effects (assets/sfx/*.mp3) and their index (assets/sfx/sfx.json).

    python scripts/make_sfx.py            # writes the files that are missing
    python scripts/make_sfx.py --all      # rewrites every synthesised one

Each effect has a role - what in the picture it goes with - so finalize and the edit desk know which ones can stand
in for each other: transition (a change of shot), pop (something appears), hit (something lands / is stamped),
build (a heading builds), tick (a count, typing), reveal (the build-up to and the moment of a reveal), notify.
All are made here from noise and tones, so there is no licence to worry about. The four original recorded-style
effects listed in sfx.json are kept as they are.
"""
import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 48000
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "sfx")
rng = np.random.default_rng(7)


def t(d):
    return np.arange(int(d * SR)) / SR


def env(n, a=0.005, r=None, curve=3.0):
    """Attack then a decay to silence."""
    x = np.ones(n)
    na = max(1, int(a * SR))
    x[:na] = np.linspace(0, 1, na)
    nr = n - na if r is None else int(r * SR)
    x[n - nr:] *= np.linspace(1, 0, nr) ** curve
    return x


def noise(d):
    return rng.standard_normal(int(d * SR))


def bandsweep(x, f0, f1, q=3.0):
    """Noise through a band-pass whose centre sweeps f0 -> f1 (a simple state-variable filter)."""
    n = len(x)
    fc = np.geomspace(f0, f1, n)
    y = np.zeros(n)
    low = band = 0.0
    for i in range(n):
        f = 2 * np.sin(np.pi * fc[i] / SR)
        high = x[i] - low - band / q
        band += f * high
        low += f * band
        y[i] = band
    return y


def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def tone(freqs, d, wave_="sine"):
    """A tone gliding through freqs (list, geometric glide between them)."""
    n = int(d * SR)
    f = np.geomspace(freqs[0], freqs[-1], n) if len(freqs) > 1 else np.full(n, freqs[0])
    ph = 2 * np.pi * np.cumsum(f) / SR
    if wave_ == "square":
        return np.sign(np.sin(ph)) * 0.6
    if wave_ == "tri":
        return 2 / np.pi * np.arcsin(np.sin(ph))
    return np.sin(ph)


def bell(f, d, partials=((1, 1.0), (2.76, 0.5), (5.4, 0.25), (8.93, 0.12))):
    x = sum(a * np.sin(2 * np.pi * f * k * t(d)) * np.exp(-t(d) * (3 + 3 * k)) for k, a in partials)
    return x * env(len(x), 0.002, None, 1.0)


def mix(*parts):
    n = max(int(at * SR) + len(p) for p, at in parts)
    y = np.zeros(n)
    for p, at in parts:
        i = int(at * SR)
        y[i:i + len(p)] += p[: n - i]
    return y


def reverb(x, amt=0.25, d=0.35):
    """A small room: a few decaying echoes, blurred."""
    y = np.concatenate([x, np.zeros(int(d * SR))])
    for k, ms in enumerate((23, 41, 67, 97, 131)):
        i = int(ms / 1000 * SR)
        y[i:i + len(x)] += x * amt * (0.7 ** k)
    return lowpass(y, 6000)


# ---- the effects: name -> (role, 中文名, what it is for, function)
def whoosh_air():
    x = bandsweep(noise(0.5), 350, 3200, 2.5)
    return x * np.hanning(len(x)) ** 1.5


def whoosh_fast():
    x = bandsweep(noise(0.26), 800, 5000, 2.0)
    return x * np.hanning(len(x)) ** 2


def swoosh_deep():
    x = bandsweep(noise(0.65), 120, 900, 3.0)
    return x * np.hanning(len(x)) ** 1.2 + 0.25 * tone([70, 45], 0.65) * np.hanning(int(0.65 * SR))


def swipe_up():
    x = bandsweep(noise(0.32), 600, 7000, 4.0)
    e = np.linspace(0, 1, len(x)) ** 2 * env(len(x), 0.001, 0.05, 1.0)
    return x * e


def riser():
    d = 0.9
    x = bandsweep(noise(d), 300, 6000, 5.0) * 0.8 + 0.25 * tone([220, 880], d, "tri")
    return x * np.linspace(0, 1, len(x)) ** 2.5 * env(len(x), 0.001, 0.02, 1.0)


def pop_bubble():
    return tone([780, 260], 0.09) * env(int(0.09 * SR), 0.002, None, 2.0)


def pop_click():
    x = lowpass(noise(0.018), 5000) * env(int(0.018 * SR), 0.0005, None, 4.0)
    return x + 0.4 * tone([2200, 1500], 0.018) * env(int(0.018 * SR), 0.0005, None, 3)


def pop_bright():
    return reverb(tone([1100, 1650], 0.07, "tri") * env(int(0.07 * SR), 0.002, None, 2.5), 0.2)


def tick_ui():
    return tone([3200], 0.025) * env(int(0.025 * SR), 0.001, None, 3.0)


def blip_digital():
    a = tone([1200], 0.06, "square") * env(int(0.06 * SR), 0.002, 0.02, 1.0)
    b = tone([1800], 0.07, "square") * env(int(0.07 * SR), 0.002, 0.05, 2.0)
    return lowpass(mix((a, 0), (b, 0.065)), 7000)


def typing():
    keys = []
    for i, at in enumerate((0, 0.085, 0.16, 0.255, 0.33)):
        k = lowpass(noise(0.03), 3500 + 600 * (i % 2)) * env(int(0.03 * SR), 0.0005, None, 5.0)
        keys.append((k * (0.8 + 0.2 * (i % 3)), at))
    return mix(*keys)


def ding():
    return reverb(bell(1320, 0.9), 0.3, 0.5)


def notify_two():
    return reverb(mix((bell(988, 0.5), 0), (bell(1319, 0.7), 0.12)), 0.25, 0.4)


def sparkle():
    notes = [1568, 1976, 2349, 2637, 3136]
    return reverb(mix(*[(bell(f, 0.45) * 0.6, i * 0.045) for i, f in enumerate(notes)]), 0.35, 0.5)


def impact_low():
    d = 0.9
    body = tone([90, 38], d) * np.exp(-t(d) * 5)
    crack = lowpass(noise(0.08), 2500) * env(int(0.08 * SR), 0.001, None, 3.0)
    return mix((body, 0), (crack * 0.6, 0))


def thud_soft():
    d = 0.35
    return tone([120, 60], d) * np.exp(-t(d) * 14) + 0.2 * lowpass(noise(d), 600) * np.exp(-t(d) * 25)


def stamp():
    return mix((thud_soft(), 0), (pop_click() * 0.8, 0.0), (lowpass(noise(0.05), 1800) * env(int(0.05 * SR), 0.001, None, 3) * 0.5, 0.01))


def shutter():
    c = lambda: lowpass(noise(0.025), 6000) * env(int(0.025 * SR), 0.0005, None, 4.0)
    return mix((c(), 0), (c() * 0.8, 0.07))


def glitch():
    parts = []
    for i in range(6):
        d = 0.02 + 0.03 * rng.random()
        x = np.round(noise(d) * 3) / 3 * env(int(d * SR), 0.001, 0.005, 1.0)
        parts.append((x * (0.5 + 0.5 * rng.random()), i * 0.05))
    return lowpass(mix(*parts), 8000)


def reveal_hit():
    """The moment of a reveal: a low hit with a bright shimmer on top."""
    return mix((impact_low() * 0.9, 0), (sparkle() * 0.5, 0.01))


EFFECTS = {
    "whoosh-air": ("transition", "空气嗖", "柔和的转场，人物和画布之间", whoosh_air),
    "whoosh-fast": ("transition", "快速嗖", "节奏快的转场、镜头飞到下一站", whoosh_fast),
    "swoosh-deep": ("transition", "低沉扫过", "分量重的转场、章节切换", swoosh_deep),
    "swipe-up": ("transition", "上扫", "向上滑走、翻到下一部分", swipe_up),
    "riser": ("reveal", "蓄力上升", "揭晓前的蓄力，结束在揭晓那一刻", riser),
    "reveal-hit": ("reveal", "揭晓重击", "揭晓那一刻：低沉一击加一点闪光", reveal_hit),
    "pop-bubble": ("pop", "气泡弹出", "卡片、标签冒出来", pop_bubble),
    "pop-click": ("pop", "清脆点击", "小元素出现、选中", pop_click),
    "pop-bright": ("pop", "明亮弹出", "亮点、正向的东西出现", pop_bright),
    "tick-ui": ("tick", "界面滴答", "计数、逐项点亮", tick_ui),
    "blip-digital": ("tick", "数字哔哔", "数据、科技感的小提示", blip_digital),
    "typing": ("tick", "键盘敲击", "打字、输入文字", typing),
    "ding": ("notify", "叮", "完成、正确、提示", ding),
    "notify-two": ("notify", "双音提示", "通知、消息弹出", notify_two),
    "sparkle": ("notify", "闪光", "高光、惊喜", sparkle),
    "impact-low": ("hit", "低沉撞击", "重要结论落定、数字落定", impact_low),
    "thud-soft": ("hit", "轻闷落定", "卡片落定、轻的强调", thud_soft),
    "stamp": ("hit", "盖章", "盖章、划掉、定论", stamp),
    "shutter": ("hit", "快门", "截图、定格", shutter),
    "glitch": ("hit", "故障闪烁", "出错、旧方法的问题", glitch),
}
RECORDED = {
}


def write_mp3(x, path):
    x = x / (np.abs(x).max() + 1e-9) * 0.7
    fade = min(len(x), int(0.004 * SR))
    x[-fade:] *= np.linspace(1, 0, fade)
    tmp = os.path.join(tempfile.mkdtemp(), "x.wav")
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-ac", "2", "-b:a", "192k", path])


def main(force):
    os.makedirs(OUT, exist_ok=True)
    index = {}
    for k, (role, zh, use) in RECORDED.items():
        index[k] = {"role": role, "name": zh, "use": use}
    for k, (role, zh, use, fn) in EFFECTS.items():
        p = os.path.join(OUT, k + ".mp3")
        if force or not os.path.exists(p):
            write_mp3(fn(), p)
            print("合成", k)
        index[k] = {"role": role, "name": zh, "use": use}
    json.dump(index, open(os.path.join(OUT, "sfx.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("音效", len(index), "个 →", OUT)


if __name__ == "__main__":
    main("--all" in sys.argv)
