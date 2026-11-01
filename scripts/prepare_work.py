"""Create a work folder and stage media for rendering.

    python prepare_work.py <work-dir> --presenter <口播原片.mp4> [--media name=path ...]

* public/media/presenter.mp4  <- the talking-head recording (hard link when on the same drive, else copy)
* public/media/<name>         <- each material, under a short ASCII name used by the programme script
* public/sfx/*.mp3            <- this skill's own sound effects (assets/sfx)
* analysis/                   <- transcripts, face track, corrections
"""
import argparse
import os
import shutil
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent


def stage(src, dst):
    if dst.exists():
        return "kept"
    try:
        os.link(src, dst)
        return "linked"
    except OSError:
        shutil.copy2(src, dst)
        return "copied"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("work")
    ap.add_argument("--presenter", required=True)
    ap.add_argument("--media", action="append", default=[], help="name=path, e.g. demo.mp4=E:/x/操作录屏.mp4")
    a = ap.parse_args()
    work = Path(a.work)
    for d in ("public/media", "public/sfx", "analysis"):
        (work / d).mkdir(parents=True, exist_ok=True)
    print("presenter.mp4", stage(Path(a.presenter), work / "public/media/presenter.mp4"))
    for item in a.media:
        name, path = item.split("=", 1)
        print(name, stage(Path(path), work / "public/media" / name))
    for f in list((SKILL / "assets/sfx").glob("*.mp3")) + [SKILL / "assets/sfx/sfx.json"]:
        shutil.copy2(f, work / "public/sfx" / f.name)
    print("sfx", len(list((work / "public/sfx").glob("*.mp3"))))


if __name__ == "__main__":
    main()
