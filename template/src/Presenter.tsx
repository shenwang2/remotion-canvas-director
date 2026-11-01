import React from 'react';
import {Easing, interpolate, staticFile} from 'remotion';
import {Video} from '@remotion/media';
import {Html5Video} from 'remotion';
import {PREVIEW} from './preview';
import {avatarGeo} from './layout';
import type {Program, Shot} from './types';
import {T} from './theme';
import {BehindWords, StickerFreeze} from './composite';

const ease = Easing.bezier(0.65, 0, 0.25, 1);
const MORPH = 560;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Geo = {x: number; y: number; w: number; h: number; r: number; s: number; tx: number; ty: number; ring: number};

// Framing changes on the talking head, all anchored on the face:
//  push - a slow, eased push in/out (build-up);
//  cut  - an instant change of framing, settling with a tiny overshoot (punch-in / back out, or a
//         "second camera" framing at a sentence boundary);
//  snap - a fast zoom (~160ms) with a touch of motion blur, for the strongest beats.
function zoomState(shot: Shot | undefined, ms: number) {
  if (!shot || shot.type !== 'presenter' || !shot.zoom?.length) return {z: 1, blur: 0};
  let z = 1, blur = 0;
  for (const k of [...shot.zoom].sort((a, b) => a.atMs - b.atMs)) {
    if (ms < k.atMs) break;
    const dt = ms - k.atMs;
    const type = k.type ?? 'push';
    if (type === 'cut') {
      const settle = Math.max(0, 1 - dt / 260);
      z = k.scale * (1 + 0.022 * settle * settle);
      blur = 0;
    } else if (type === 'snap') {
      const d = k.moveMs ?? 160;
      const p = Math.min(1, dt / d);
      z = lerp(z, k.scale, ease(p));
      blur = p < 1 ? Math.sin(p * Math.PI) * 6 : 0;
    } else {
      z = lerp(z, k.scale, ease(Math.min(1, dt / (k.moveMs ?? 700))));
      blur = 0;
    }
  }
  return {z, blur};
}
const zoomAt = (shot: Shot | undefined, ms: number) => zoomState(shot, ms).z;
export const zoomBlur = (p: Program, ms: number) => zoomState(p.shots.find((s) => ms >= s.startMs && ms < s.endMs), ms).blur;

// Face position at `ms`, interpolated along the smoothed per-second track (falls back to the median face).
function faceAt(p: Program, ms: number) {
  const t = p.presenter.track;
  if (!t || t.length === 0) return p.presenter.face;
  if (ms <= t[0].ms) return t[0];
  for (let i = 1; i < t.length; i++) {
    if (ms <= t[i].ms) {
      const k = (ms - t[i - 1].ms) / (t[i].ms - t[i - 1].ms);
      return {cx: lerp(t[i - 1].cx, t[i].cx, k), cy: lerp(t[i - 1].cy, t[i].cy, k), h: lerp(t[i - 1].h, t[i].h, k)};
    }
  }
  return t[t.length - 1];
}

export function presenterGeo(p: Program, shots: Shot[], ms: number): Geo {
  const {width: W, height: H} = p;
  const face = faceAt(p, ms);
  const fx = face.cx * W, fy = face.cy * H;
  const full = (shot?: Shot): Geo => {
    const z = zoomAt(shot, ms);
    return {x: 0, y: 0, w: W, h: H, r: 0, s: z, tx: fx * (1 - z), ty: fy * (1 - z), ring: 0};
  };
  // Avatar: bottom-right in landscape; in portrait it sits above the caption band and the app's bottom UI.
  const portrait = H > W;
  const {D, x: ax, y: ay} = avatarGeo(p);  // portrait: just above the captions
  const s = (0.5 * D) / (face.h * H);
  const avatar: Geo = {x: ax, y: ay, w: D, h: D, r: D / 2, s, tx: D / 2 - fx * s, ty: D * 0.56 - fy * s, ring: 1};
  const geoOf = (shot?: Shot) => (!shot || shot.type === 'presenter' ? full(shot) : avatar);
  const i = shots.findIndex((x) => ms >= x.startMs && ms < x.endMs);
  const cur = shots[i];
  const prev = i > 0 ? shots[i - 1] : undefined;
  const target = geoOf(cur);
  if (!prev || (prev.type === 'presenter') === (cur?.type === 'presenter')) return target;
  const t = ease(Math.min(1, (ms - cur.startMs) / MORPH));
  if (t >= 1) return target;
  const from = prev.type === 'presenter' ? {...full(prev), s: zoomAt(prev, cur.startMs)} : avatar;
  const mix = Object.fromEntries(Object.keys(target).map((k) => [k, lerp((from as any)[k], (target as any)[k], t)])) as Geo;
  return mix;
}

export const PresenterLayer: React.FC<{p: Program; ms: number}> = ({p, ms}) => {
  const g = presenterGeo(p, p.shots, ms);
  const {width: W, height: H} = p;
  const blurPx = g.ring < 0.01 ? zoomBlur(p, ms) : 0;
  // As an avatar the speaker sits in a glass bezel: a frosted ring with a bright rim, floating on the canvas.
  const B = 14 * g.ring * (Math.min(W, H) / 1440);
  const shot = p.shots.find((s) => ms >= s.startMs && ms < s.endMs);
  const pres = shot && shot.type === 'presenter' ? shot : undefined;
  return (
    <>
      {g.ring > 0.01 ? (
        <div style={{position: 'absolute', left: g.x - B, top: g.y - B, width: g.w + 2 * B, height: g.h + 2 * B, borderRadius: g.r + B, opacity: g.ring,
          background: 'linear-gradient(155deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.06) 55%, rgba(255,255,255,0.14) 100%)',
          backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          boxShadow: '0 26px 60px rgba(0,0,0,0.45), inset 0 2px 0 rgba(255,255,255,0.6), inset 0 0 0 1.5px rgba(255,255,255,0.3)'}} />
      ) : null}
      <div style={{position: 'absolute', left: g.x, top: g.y, width: g.w, height: g.h, borderRadius: g.r, overflow: 'hidden',
        boxShadow: g.ring > 0.01 ? `0 0 0 1.5px rgba(255,255,255,${0.55 * g.ring})` : 'none', background: '#000'}}>
        <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: `translate(${g.tx}px, ${g.ty}px) scale(${g.s})`,
          filter: blurPx > 0.2 ? `blur(${blurPx}px)` : undefined}}>
          {PREVIEW.html5 ? <Html5Video src={staticFile(p.presenter.src)} style={{width: W, height: H}} /> : <Video src={staticFile(p.presenter.src)} style={{width: W, height: H}} />}
          {pres?.behind?.length && g.ring < 0.01 ? <BehindWords p={p} items={pres.behind} ms={ms} shotId={pres.id} /> : null}
        </div>
      </div>
      {pres?.sticker?.length && g.ring < 0.01 ? <StickerFreeze p={p} items={pres.sticker} ms={ms} /> : null}
    </>
  );
};
