import React from 'react';
import {T} from './theme';
import {cameraAt} from './camera';
import {portraitSafeBottom} from './layout';
import {ElementView} from './elements2';
import {MediaView} from './Media';
import {Kicker} from './elements1';
import {prog} from './anim';
import type {Program, Shot} from './types';
import {visible, worldCamera, worldElements} from './world';

// Text-free texture, lit like a studio: drifting colour glows (parallax), a fine line grid
// with brighter dots at the crossings, film grain and a vignette. All of it moves with the camera.
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0"/></filter><rect width="240" height="240" filter="url(#n)"/></svg>')}")`;

export const Backdrop: React.FC<{W: number; H: number; cam?: {x: number; y: number; w: number}}> = ({W, H, cam}) => {
  const k = cam ? W / cam.w : 1;
  const ox = cam ? -cam.x * k : 0, oy = cam ? -cam.y * k : 0;
  const cell = 160 * k;
  // Glows move at 35% of the camera so they read as distant light, not as content.
  const gx = ox * 0.35, gy = oy * 0.35;
  return (
    <div style={{position: 'absolute', inset: 0, background: `linear-gradient(160deg, #111621 0%, ${T.bg} 55%, #0f0d14 100%)`, overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: '-40%', transform: `translate(${gx}px, ${gy}px)`,
        background: [
          'radial-gradient(38% 34% at 28% 30%, rgba(10,132,255,0.30), transparent 70%)',
          'radial-gradient(32% 30% at 74% 38%, rgba(125,95,255,0.22), transparent 70%)',
          'radial-gradient(36% 30% at 58% 78%, rgba(255,149,0,0.13), transparent 70%)',
          'radial-gradient(28% 26% at 18% 82%, rgba(48,209,88,0.09), transparent 70%)',
        ].join(', ')}} />
      <div style={{position: 'absolute', inset: 0,
        backgroundImage: [
          `radial-gradient(circle, rgba(255,255,255,0.30) ${Math.max(1.2, 2.4 * k)}px, transparent ${Math.max(1.8, 3 * k)}px)`,
          `linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)`,
          `linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)`,
        ].join(', '),
        backgroundSize: `${cell}px ${cell}px`,
        backgroundPosition: `${ox - cell / 2}px ${oy - cell / 2}px, ${ox}px ${oy}px, ${ox}px ${oy}px`}} />
      <div style={{position: 'absolute', inset: 0, backgroundImage: GRAIN, opacity: 0.07, mixBlendMode: 'overlay'}} />
      <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,0.55) 100%)'}} />
    </div>
  );
};

export const CanvasShot: React.FC<{p: Program; shot: Extract<Shot, {type: 'canvas'}>; ms: number; W: number; H: number}> = ({p, shot, ms, W, H}) => {
  const local = ms - shot.startMs;
  const cam = worldCamera(p, shot, local, W, H);
  const k = W / cam.w;
  // Earlier stations of the same map stay in place; only what is near the frame is drawn.
  const placed = worldElements(p, shot).filter(({el}) => visible(el, cam));
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      <Backdrop W={W} H={H} cam={cam} />
      <div style={{position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `scale(${k}) translate(${-cam.x}px, ${-cam.y}px)`}}>
        {placed.map(({el, owner}) => <ElementView key={`${owner.id}:${el.id}`} el={el} ms={ms - owner.startMs} abs={ms} />)}
      </div>
      {H > W ? (
        // Portrait frames content in the upper part (SAFE_PORT ends at 0.6H). Below it the map runs on behind the
        // avatar and captions; let it sink into the backdrop so stray stations never compete with the captions.
        <div style={{position: 'absolute', left: 0, right: 0, top: H * portraitSafeBottom(p), bottom: 0, pointerEvents: 'none',
          background: `linear-gradient(180deg, rgba(8,9,13,0) 0%, rgba(8,9,13,0.78) 30%, rgba(8,9,13,0.9) 100%)`}} />
      ) : null}
    </div>
  );
};

export const SourceShot: React.FC<{shot: Extract<Shot, {type: 'source'}>; ms: number; W: number; H: number}> = ({shot, ms, W, H}) => {
  const local = ms - shot.startMs;
  const aspect = shot.media.aspect ?? 16 / 9;
  const outPortrait = H > W;
  // Same orientation as the output: fill the frame. Otherwise: a framed card on the canvas.
  const fill = (aspect < 1) === outPortrait;
  const m = Math.min(W, H);
  const cardH = outPortrait ? Math.min(H * 0.5, (W * 0.9) / aspect) : H * 0.88;
  const cardW = cardH * aspect;
  const qp = prog(local, 400, 500);
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', background: T.bg}}>
      {fill ? <MediaView media={shot.media} fromMs={shot.startMs} /> : (
        <>
          <Backdrop W={W} H={H} />
          <div style={{position: 'absolute', top: outPortrait ? H * 0.3 : H * 0.06, height: cardH, width: cardW, left: W * 0.5 - cardW / 2,
            borderRadius: 26, overflow: 'hidden', boxShadow: '0 40px 120px rgba(0,0,0,0.7)', border: '1.5px solid rgba(255,255,255,0.22)'}}>
            <MediaView media={shot.media} fromMs={shot.startMs} />
          </div>
        </>
      )}
      {shot.label ? <div style={{position: 'absolute', left: W * (outPortrait ? 0.05 : 0.035), top: H * (outPortrait ? 0.13 : 0.17), opacity: qp}}>
        <Kicker text={shot.label} size={m * 0.0153} color={T.accent} /></div> : null}
      {shot.quote ? (
        <div style={{position: 'absolute', left: W * (outPortrait ? 0.05 : 0.035), top: H * (outPortrait ? 0.16 : 0.21), maxWidth: W * (outPortrait ? 0.9 : 0.3),
          padding: `${m * 0.015}px ${m * 0.021}px`, borderRadius: 14, background: 'rgba(15,16,18,0.84)', backdropFilter: 'blur(20px)',
          borderLeft: `${m * 0.0056}px solid ${T.accent}`, color: T.text, fontFamily: T.font, fontWeight: 800, fontSize: m * 0.036, lineHeight: 1.3,
          opacity: qp, transform: `translateX(${(1 - qp) * -30}px)`}}>{shot.quote}</div>
      ) : null}
    </div>
  );
};
