import React from 'react';
import {Img, OffthreadVideo, Sequence, interpolate, staticFile, useVideoConfig} from 'remotion';
import {T} from './theme';
import {springAt} from './apple';
import {clamp} from './anim';
import {MediaView} from './Media';
import type {Program} from './types';

// Compositing into the real shot. The camera is fixed, so only the speaker is cut out (scripts/make_matte.py);
// everything else stays where it is in the room. Used for the signature moments - the hook, the reveal.

export type Behind = {text: string; sub?: string; atMs: number; endMs: number; matte: {src: string; startMs: number}; headTop?: number; zoomMax?: number};
export type Sticker = {atMs: number; endMs: number; src: string; bg?: any; label?: string};

// The key word stands in the room behind the speaker: footage -> word -> the cut-out person on top.
// Rendered inside the presenter's transform, so a punch-in moves the word with the room.
export const BehindWords: React.FC<{p: Program; items: Behind[]; ms: number; shotId?: string}> = ({p, items, ms, shotId}) => {
  const {fps} = useVideoConfig();
  const {width: W, height: H} = p;
  const face = p.presenter.face;
  const live = items.filter((b) => ms >= b.atMs - 60 && ms < b.endMs + 60);
  if (!live.length) return null;
  return (
    <>
      {live.map((b, i) => {
        const s = springAt(ms, b.atMs, 15, 110);
        const out = interpolate(ms, [b.endMs - 280, b.endMs], [1, 0], clamp);
        // The word stands just above the head (measured from the matte), so the head covers only its lower ~30%;
        // it keeps clear of the channel mark and still fits the width if the shot punches in while it is up.
        const head = b.headTop ?? (face.cy - face.h * 0.75) * H;
        const topM = H * 0.06, overlap = 0.3;
        const size = Math.min((W * 0.86) / (Math.max(2, b.text.length) * (b.zoomMax ?? 1)), (head - topM) / (1 - overlap), H * 0.14);
        const top = head + overlap * size - size - (b.sub ? size * 0.22 : 0);
        return (
          <div key={i} data-el={`${shotId}#behind${items.indexOf(b)}`} style={{position: 'absolute', left: 0, top, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center',
            opacity: Math.min(1, s * 1.5) * out, transform: `translateY(${(1 - s) * size * 0.45}px) scale(${0.92 + 0.08 * s})`,
            filter: s < 0.97 ? `blur(${(1 - s) * 14}px)` : undefined}}>
            {b.sub ? <div style={{fontFamily: T.font, fontWeight: 700, fontSize: size * 0.16, letterSpacing: size * 0.04, color: 'rgba(255,255,255,0.75)',
              marginBottom: size * 0.04, textShadow: '0 2px 12px rgba(0,0,0,0.35)'}}>{b.sub}</div> : null}
            <div style={{fontFamily: T.font, fontWeight: 900, fontSize: size, lineHeight: 1, letterSpacing: size * 0.02, whiteSpace: 'nowrap',
              background: 'linear-gradient(180deg, #ffffff 0%, #fff3df 55%, #ffc979 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              filter: `drop-shadow(0 ${size * 0.04}px ${size * 0.12}px rgba(0,0,0,0.45)) drop-shadow(0 0 ${size * 0.25}px rgba(255,201,121,0.35))`}}>{b.text}</div>
          </div>
        );
      })}
      {/* the speaker, cut out, in front of the word */}
      {live.map((b, i) => (
        <Sequence key={`m${i}`} from={Math.round((b.matte.startMs / 1000) * fps)} layout="none">
          <OffthreadVideo src={staticFile(b.matte.src)} transparent muted style={{position: 'absolute', left: 0, top: 0, width: W, height: H, pointerEvents: 'none'}} />
        </Sequence>
      ))}
    </>
  );
};

// The frame freezes on a beat: the speaker becomes a white-outlined sticker in front of what he is talking about.
export const StickerFreeze: React.FC<{p: Program; items: Sticker[]; ms: number}> = ({p, items, ms}) => {
  const {width: W, height: H} = p;
  const st = items.find((x) => ms >= x.atMs && ms < x.endMs);
  if (!st) return null;
  const t = ms - st.atMs;
  const flash = interpolate(t, [0, 140], [0.85, 0], clamp);
  const pop = springAt(ms, st.atMs, 11, 190);
  const out = interpolate(ms, [st.endMs - 160, st.endMs], [1, 0], clamp);
  const face = p.presenter.face;
  const ox = face.cx * W, oy = (face.cy + face.h * 0.6) * H;
  const cardW = W * 0.9, cardH = cardW * 9 / 16;
  return (
    <div style={{position: 'absolute', inset: 0, opacity: out}}>
      {/* behind the sticker: what he is talking about, on a dark, slightly blurred bed of itself */}
      <div style={{position: 'absolute', inset: 0, background: '#0b0d12'}} />
      {st.bg ? <>
        <div style={{position: 'absolute', inset: -60, filter: 'blur(40px) brightness(0.45) saturate(1.2)'}}><MediaView media={st.bg} fromMs={st.atMs} /></div>
        <div style={{position: 'absolute', left: (W - cardW) / 2, top: H * 0.07, width: cardW, height: cardH, borderRadius: 36, overflow: 'hidden',
          transform: `rotate(${-3 + 1.5 * (1 - pop)}deg) scale(${0.9 + 0.1 * pop})`, boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 0 3px rgba(255,255,255,0.9)'}}>
          <MediaView media={st.bg} fromMs={st.atMs} />
        </div>
      </> : null}
      {/* the frozen speaker as a sticker */}
      <div style={{position: 'absolute', inset: 0, transformOrigin: `${ox}px ${oy}px`,
        transform: `scale(${1 + 0.07 * pop}) rotate(${2.5 * pop}deg) translateY(${(1 - pop) * 30}px)`,
        filter: 'drop-shadow(0 24px 40px rgba(0,0,0,0.55))'}}>
        <Img src={staticFile(st.src)} style={{width: W, height: H}} />
      </div>
      {st.label ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: H * 0.07 + cardH + H * 0.015, display: 'flex', justifyContent: 'center',
          opacity: Math.min(1, pop * 1.4), transform: `scale(${0.8 + 0.2 * pop}) rotate(-2deg)`}}>
          <div style={{padding: `${W * 0.012}px ${W * 0.03}px`, borderRadius: 999, background: '#ffc979', color: '#1a1206',
            fontFamily: T.font, fontWeight: 900, fontSize: W * 0.045, boxShadow: '0 12px 30px rgba(0,0,0,0.4)'}}>{st.label}</div>
        </div>
      ) : null}
      <div style={{position: 'absolute', inset: 0, background: '#fff', opacity: flash}} />
    </div>
  );
};
