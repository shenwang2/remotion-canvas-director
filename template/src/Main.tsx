import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Program} from './types';
import {CanvasShot, SourceShot} from './CanvasScene';
import {PresenterLayer} from './Presenter';
import {BigWords, BrandMark, Captions, Hud} from './Hud';
import {ElementView} from './elements2';
import {STYLE} from './theme';
import {setPortraitBottom} from './camera';
import {portraitSafeBottom} from './layout';

export const Main: React.FC<Program> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const shot = p.shots.find((s) => ms >= s.startMs && ms < s.endMs) ?? p.shots[p.shots.length - 1];
  const {width: W, height: H} = p;
  STYLE.canvas = p.canvasStyle ?? 'glass';
  setPortraitBottom(portraitSafeBottom(p));
  // On the beat: every change of shot lands on a beat of the music, and the picture takes the hit - a quick push in
  // and a touch of light that settle within a third of a second (canvaslib/bgm.py makes the accents).
  const hit = Math.max(0, ...(p.music?.accents ?? []).map((a) => {
    const d = ms - a.atMs;
    return d < -40 || d > 380 ? 0 : a.k * (d < 0 ? 1 + d / 40 : (1 - d / 380) ** 2);
  }));
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <AbsoluteFill style={hit > 0.001 ? {transform: `scale(${1 + 0.024 * hit})`, filter: `brightness(${1 + 0.1 * hit})`} : undefined}>
      {shot.type === 'canvas' ? <CanvasShot p={p} shot={shot} ms={ms} W={W} H={H} /> : null}
      {shot.type === 'source' ? <SourceShot shot={shot} ms={ms} W={W} H={H} /> : null}
      <PresenterLayer p={p} ms={ms} />
      {shot.type === 'presenter' && shot.overlays?.length ? (
        // Overlays live in a fixed design space scaled to the output, so they keep their size at any resolution.
        <div style={{position: 'absolute', left: 0, top: 0, width: W / (Math.min(W, H) / 1440), height: H / (Math.min(W, H) / 1440),
          transformOrigin: '0 0', transform: `scale(${Math.min(W, H) / 1440})`}}>
          {shot.overlays.map((el) => <ElementView key={el.id} el={el} ms={ms} abs={ms} />)}
        </div>
      ) : null}
      <BigWords p={p} shot={shot} ms={ms} />
      </AbsoluteFill>
      <Hud p={p} shot={shot} ms={ms} />
      <BrandMark p={p} />
      <Captions p={p} ms={ms} />
      {p.music ? <Music m={p.music} fps={fps} /> : null}
      {p.sfx.map((s, i) => (
        <Sequence key={i} from={Math.round((s.atMs / 1000) * fps)} durationInFrames={Math.round(fps * 2)}>
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// The music runs under the whole programme; its level follows the gain curve worked out in canvaslib/bgm.py
// (under the voice, up in the pauses, out just before the reveal). Loops cross over in 200 ms.
const Music: React.FC<{m: NonNullable<Program['music']>; fps: number}> = ({m, fps}) => {
  const at = (ms: number) => {
    const k = ms / m.gain.stepMs, i = Math.floor(k), v = m.gain.v;
    if (i >= v.length - 1) return v[v.length - 1] ?? 0;
    return v[i] + (v[i + 1] - v[i]) * (k - i);
  };
  const X = 200;
  return (
    <>
      {m.segments.map(([v0, v1, t0], i) => {
        const from = Math.round((v0 / 1000) * fps);
        const len = Math.max(1, Math.round(((v1 - v0 + (i < m.segments.length - 1 ? X : 0)) / 1000) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={len}>
            <Audio src={staticFile(m.src)} trimBefore={Math.round((t0 / 1000) * fps)} volume={(f) => {
              const ms = v0 + (f / fps) * 1000;
              const xin = i > 0 ? Math.min(1, (ms - v0) / X) : 1;
              const xout = i < m.segments.length - 1 ? Math.min(1, Math.max(0, (v1 + X - ms) / X)) : 1;
              return Math.min(1, at(ms)) * xin * xout;
            }} />
          </Sequence>
        );
      })}
    </>
  );
};
