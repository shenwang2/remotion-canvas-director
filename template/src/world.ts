import type {CameraStop, CanvasElement, Program, Rect, Shot} from './types';
import {cameraAt} from './camera';

type Canvas = Extract<Shot, {type: 'canvas'}>;
export type Placed = {el: CanvasElement; owner: Canvas};

// All canvas shots that share a world form one continuous map: what was explained
// stays where it was, and later shots can fly back to it.
export function worldShots(p: Program, shot: Canvas): Canvas[] {
  if (!shot.world) return [shot];
  return p.shots.filter((s): s is Canvas => s.type === 'canvas' && s.world === shot.world && s.startMs <= shot.startMs);
}

export function worldElements(p: Program, shot: Canvas): Placed[] {
  return worldShots(p, shot).flatMap((owner) => owner.elements.map((el) => ({el, owner})));
}

// Camera of `shot`, starting from wherever the previous shot of the same world left off,
// so returning to the map is a flight, not a cut.
export function worldCamera(p: Program, shot: Canvas, local: number, W: number, H: number): Rect {
  const placed = worldElements(p, shot);
  const els = placed.map((x) => x.el);
  const prev = worldShots(p, shot).filter((s) => s !== shot).pop();
  let stops: CameraStop[] = shot.camera;
  if (prev) {
    const prevEls = worldElements(p, prev).map((x) => x.el);
    const from = cameraAt(prev.endMs - prev.startMs, prev.camera, prevEls, W, H);
    const sorted = [...shot.camera].sort((a, b) => a.atMs - b.atMs);
    stops = [{atMs: 0, rect: from, pad: 0, raw: true} as CameraStop, {...sorted[0], atMs: 0, moveMs: sorted[0].moveMs ?? 1200}, ...sorted.slice(1)];
  }
  return cameraAt(local, stops, els, W, H);
}

export function visible(el: CanvasElement, cam: Rect, margin = 0.15): boolean {
  const mx = cam.w * margin, my = cam.h * margin;
  return el.x < cam.x + cam.w + mx && el.x + el.w > cam.x - mx && el.y < cam.y + cam.h + my && el.y + el.h > cam.y - my;
}
