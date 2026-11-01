import {Easing} from 'remotion';
import type {CameraStop, CanvasElement, Rect} from './types';

const ease = Easing.bezier(0.65, 0, 0.25, 1);

export function union(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w)), y1 = Math.max(...rects.map((r) => r.y + r.h));
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
}

// Screen area content may occupy: clear of the chapter chip (top-left),
// the presenter avatar (bottom-right) and the caption band (bottom).
const SAFE_LAND = {x0: 0.04, y0: 0.12, x1: 0.92, y1: 0.81};
// Portrait: below the chapter chip, above the avatar / captions / app UI. Nearly square.
const SAFE_PORT = {x0: 0.05, y0: 0.13, x1: 0.95, y1: 0.6};
// Main sets the bottom from where the captions and the avatar sit (layout.ts portraitSafeBottom).
export const setPortraitBottom = (y1: number) => { SAFE_PORT.y1 = y1; };

// Camera rect that places the padded target inside the safe area, centred.
export function frameRect(target: Rect, W: number, H: number, pad = 0.12): Rect {
  const SAFE = H > W ? SAFE_PORT : SAFE_LAND;
  const sw = (SAFE.x1 - SAFE.x0) * W, sh = (SAFE.y1 - SAFE.y0) * H;
  const tw = target.w * (1 + pad * 2), th = target.h * (1 + pad * 2);
  // Never push in past 2x (world units ~ pixels at a 1440 short side): tiny highlights would turn into blurry close-ups.
  const k = Math.min(sw / tw, sh / th, (2 * Math.min(W, H)) / 1440);
  const scx = ((SAFE.x0 + SAFE.x1) / 2) * W, scy = ((SAFE.y0 + SAFE.y1) / 2) * H;
  const w = W / k;
  return {x: target.x + target.w / 2 - scx / k, y: target.y + target.h / 2 - scy / k, w, h: w * (H / W)};
}

export function stopRect(stop: CameraStop, els: CanvasElement[], W: number, H: number): Rect {
  if (stop.rect && stop.raw) return stop.rect; // already a camera rect (continuity from the previous shot)
  if (stop.rect) return frameRect(stop.rect, W, H, stop.pad ?? 0);
  const picked = els.filter((e) => stop.focus?.includes(e.id));
  return frameRect(union(picked.length ? picked : els), W, H, stop.pad ?? 0.12);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Zoom is interpolated in log space so push-ins feel linear to the eye.
export function cameraAt(ms: number, stops: CameraStop[], els: CanvasElement[], W: number, H: number): Rect {
  const s = [...stops].sort((a, b) => a.atMs - b.atMs);
  let cur = stopRect(s[0], els, W, H);
  for (let i = 1; i < s.length; i++) {
    if (ms < s[i].atMs) break;
    const next = stopRect(s[i], els, W, H);
    const dur = s[i].moveMs ?? 900;
    const t = ease(Math.min(1, (ms - s[i].atMs) / dur));
    const lw = Math.exp(lerp(Math.log(cur.w), Math.log(next.w), t));
    const cx = lerp(cur.x + cur.w / 2, next.x + next.w / 2, t), cy = lerp(cur.y + cur.h / 2, next.y + next.h / 2, t);
    cur = {x: cx - lw / 2, y: cy - (lw * H / W) / 2, w: lw, h: lw * H / W};
  }
  return cur;
}
