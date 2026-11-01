"""Cut the speaker out of the presenter recording, for compositing effects on the talking head.

    # a clip of the person with alpha (WebM VP9), for "big word behind the person"
    python make_matte.py <work>/public/media/presenter.mp4 --clip 25.5 30.3 --out <work>/public/media/matte_25500.webm
    # one frozen frame: the person as a sticker (white outline baked in) + the clean frame behind, for the freeze-frame sticker
    python make_matte.py <work>/public/media/presenter.mp4 --still 0.4 --out <work>/public/media/sticker_400.png

The camera is fixed, so only the person needs separating; nothing is tracked. Uses transparent-background
(InSPyReNet, cached at ~/.transparent-background) on the GPU. Frames are taken at exactly 30 fps from the clip
start, so the matte lines up frame for frame with the render (Remotion renders at 30 fps).
"""
import argparse
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageFilter


def remover():
    from transparent_background import Remover
    return Remover(fast=False, device="cuda:0")


def frames(src, start, end, fps=30):
    tmp = tempfile.mkdtemp(prefix="matte_")
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}", "-i", src, "-t", f"{end - start:.3f}",
                           "-vf", f"fps={fps}", os.path.join(tmp, "f_%05d.png")])
    return tmp, sorted(f for f in os.listdir(tmp) if f.startswith("f_"))


def alpha_of(rm, img):
    a = rm.process(img, type="map")  # greyscale map, person = white
    a = np.array(a.convert("L") if isinstance(a, Image.Image) else Image.fromarray(a).convert("L"))
    return a


def head_tops(alpha_frames):
    """Per frame: the highest row the person reaches (px), so a word behind him can be placed to be covered
    only a little. Written next to the clip as <clip>.json."""
    tops = []
    for a in alpha_frames:
        rows = np.where((a > 128).sum(axis=1) > a.shape[1] * 0.02)[0]
        tops.append(int(rows[0]) if len(rows) else a.shape[0])
    return tops


def sidecar(webm):
    """Head tops for an existing clip (decodes its alpha); cached in <clip>.json."""
    import json
    js = os.path.splitext(webm)[0] + ".json"
    if os.path.exists(js):
        return json.load(open(js))
    tmp = tempfile.mkdtemp(prefix="alpha_")
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-c:v", "libvpx-vp9", "-i", webm, "-vf", "alphaextract,scale=iw/4:ih/4",
                           os.path.join(tmp, "a_%05d.png")])
    al = [np.array(Image.open(os.path.join(tmp, n)).convert("L")) for n in sorted(os.listdir(tmp))]
    d = {"fps": 30, "headTop": [t * 4 for t in head_tops(al)]}
    json.dump(d, open(js, "w"))
    return d


def size_of(src):
    w, h = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                    "-of", "csv=p=0", src]).decode().strip().split(",")[:2]
    return int(w), int(h)


def clip(src, start, end, out, fps=30):
    """Frames stream straight from the decoder, through the model, into the encoder: no image files in between,
    and the encoder works on one frame while the GPU does the next. The matte itself is the same as frame-by-frame
    (full-resolution model input, fp32 - half precision breaks this model)."""
    import json
    import threading
    rm = remover()
    w, h = size_of(src)
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-i", src, "-t", f"{end - start:.3f}", "-vf", f"fps={fps}",
                            "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}", "-framerate", str(fps), "-i", "-",
                            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "8M", "-auto-alt-ref", "0", out], stdin=subprocess.PIPE)
    tops, n, pending = [], 0, None
    while True:
        buf = dec.stdout.read(w * h * 3)
        if len(buf) < w * h * 3:
            break
        rgb = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        a = alpha_of(rm, Image.fromarray(rgb))
        tops += head_tops([a])
        if pending: pending.join()
        frame = np.dstack([rgb, a]).tobytes()
        pending = threading.Thread(target=enc.stdin.write, args=(frame,))
        pending.start()
        n += 1
    if pending: pending.join()
    enc.stdin.close()
    enc.wait()
    dec.wait()
    json.dump({"fps": fps, "headTop": tops}, open(os.path.splitext(out)[0] + ".json", "w"))
    print("matte clip", out, n, "frames")


def still(src, t, out, outline=18):
    rm = remover()
    tmp, names = frames(src, t, t + 1 / 30.0)
    img = Image.open(os.path.join(tmp, names[0])).convert("RGB")
    a = alpha_of(rm, img)
    person = Image.fromarray(np.dstack([np.array(img), a]), "RGBA")
    # sticker look: a solid white outline around the cut-out
    hard = Image.fromarray(np.where(a > 110, 255, 0).astype(np.uint8))
    ring = hard.filter(ImageFilter.MaxFilter(outline * 2 + 1)).filter(ImageFilter.GaussianBlur(1.2))
    sticker = Image.new("RGBA", img.size, (255, 255, 255, 0))
    sticker.putalpha(ring)
    sticker.alpha_composite(person)
    sticker.save(out)
    img.save(out.replace(".png", "_frame.jpg"), quality=92)
    print("sticker", out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--clip", nargs=2, type=float, metavar=("START", "END"))
    ap.add_argument("--still", type=float)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    if a.clip:
        clip(a.src, a.clip[0], a.clip[1], a.out)
    else:
        still(a.src, a.still, a.out)
