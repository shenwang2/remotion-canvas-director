import {TimeBase} from './Media';
import React from 'react';
import {GLYPH, T, TONE, card, iconTile, tint} from './theme';
import {Icon} from './Icon';
import {FocusRing, Label} from './craft';
import {enter, prog} from './anim';
import {Clip, Entity, Heading, Kicker, Note, Stat, Tag} from './elements1';
import {Circle, Erode, Marker, Multiply, Rise, Scan, Stamp, Strike} from './motion';
import {Dialog, Loop, Notify, Phrases} from './story';
import {Glass} from './glass';
import {Pipeline, Retrieve} from './explain';
import {Roundtrip} from './roundtrip';
import type {CanvasElement} from './types';

type P = {el: CanvasElement; ms: number; abs?: number};
const box = (el: CanvasElement): React.CSSProperties => ({position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h});

// Items arrive one by one (scene-relative atMs) and are ticked when doneAtMs passes.
export const List: React.FC<P> = ({el, ms}) => {
  const p = prog(ms, el.atMs);
  const {title, kicker, items, row = 96} = el.props as {title?: string; kicker?: string; row?: number; items: {text: string; atMs: number; doneAtMs?: number; tone?: string}[]};
  return (
    <div style={{...box(el), ...enter(p), padding: 36, ...card()}}>
      {kicker ? <Kicker text={kicker} color={T.accent} /> : null}
      {title ? <div style={{color: T.text, fontFamily: T.font, fontWeight: 900, fontSize: 48, margin: '8px 0 22px'}}>{title}</div> : null}
      {items.map((it, i) => {
        const ip = prog(ms, it.atMs, 420);
        const done = it.doneAtMs != null && ms >= it.doneAtMs;
        const c = TONE[it.tone ?? 'accent'];
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 22, height: row, opacity: ip, transform: `translateX(${(1 - ip) * -30}px)`}}>
            <div style={{width: 46, height: 46, borderRadius: 23, border: `3px solid ${c}`, background: done ? c : 'transparent', color: '#111',
              fontFamily: T.font, fontWeight: 900, fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>{done ? (it.tone === 'red' ? '✕' : '✓') : i + 1}</div>
            <div style={{color: done ? T.text : T.sub, fontFamily: T.font, fontWeight: 700, fontSize: row * 0.4, whiteSpace: 'nowrap'}}>{it.text}</div>
          </div>
        );
      })}
    </div>
  );
};

// Arrow drawn on from (x1,y1) to (x2,y2) in world units; element box is the svg bounds.
export const Arrow: React.FC<P> = ({el, ms}) => {
  const {from, to, tone = 'accent', dashed, curve = 0} = el.props as {from: [number, number]; to: [number, number]; tone?: string; dashed?: boolean; curve?: number};
  const p = prog(ms, el.atMs, 700);
  const [x1, y1] = [from[0] - el.x, from[1] - el.y], [x2, y2] = [to[0] - el.x, to[1] - el.y];
  const mx = (x1 + x2) / 2 - (y2 - y1) * curve, my = (y1 + y2) / 2 + (x2 - x1) * curve;
  const d = `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
  const len = Math.hypot(x2 - x1, y2 - y1) * 1.3;
  const ang = (Math.atan2(y2 - my, x2 - mx) * 180) / Math.PI;
  const c = TONE[tone];
  return (
    <svg style={{...box(el), overflow: 'visible'}} width={el.w} height={el.h}>
      <path d={d} fill="none" stroke={tint(c, 0.9)} strokeWidth={3} strokeLinecap="round" strokeDasharray={dashed ? '4 18' : `${len}`} strokeDashoffset={dashed ? 0 : len * (1 - p)} opacity={dashed ? p : 1} />
      <g transform={`translate(${x2},${y2}) rotate(${ang})`} opacity={p > 0.85 ? 1 : 0}><path d="M0,0 L-16,-9 L-16,9 Z" fill={tint(c, 0.95)} /></g>
    </svg>
  );
};

export const Highlight: React.FC<P> = ({el, ms}) => {
  const p = prog(ms, el.atMs, 500);
  const {tone = 'accent', label} = el.props;
  const c = TONE[tone];
  // The spotlight (dimming the rest) is a moment, not a state: it lifts after ~2.6s. The ring stays.
  const dim = 0.32 * p * (1 - prog(ms, el.atMs + 2600, 700));
  const lp = prog(ms, el.atMs + 300, 400);
  return (
    <div style={{...box(el), borderRadius: Math.min(24, el.h / 2), boxShadow: dim > 0.005 ? `0 0 0 9999px rgba(0,0,0,${dim})` : 'none'}}>
      <FocusRing w={el.w} h={el.h} color={c} p={p} />
      {label ? <div style={{position: 'absolute', left: 0, top: -70, opacity: lp, transform: `translateY(${(1 - lp) * 10}px)`}}>
        <Label text={label} color={c} icon={el.props.icon} /></div> : null}
    </div>
  );
};

export const Timeline: React.FC<P> = ({el, ms}) => {
  const p = prog(ms, el.atMs, 900);
  const {nodes} = el.props as {nodes: {x: number; label: string; sub?: string; icon?: string; atMs: number; tone?: string}[]};
  const mid = el.h / 2;
  return (
    <div style={box(el)}>
      <div style={{position: 'absolute', left: 0, top: mid - 2, height: 4, width: el.w * p, borderRadius: 2, background: `linear-gradient(90deg, ${T.lineHi}, ${tint(T.accent, 0.5)})`}} />
      {nodes.map((n, i) => {
        const np = prog(ms, n.atMs, 420);
        const c = TONE[n.tone ?? 'accent'];
        return (
          <div key={i} style={{position: 'absolute', left: n.x - el.x, top: 0, height: el.h, opacity: np}}>
            {n.icon ? <div style={{position: 'absolute', left: -48, top: mid - 140, ...iconTile(c, 96)}}><Icon name={n.icon} size={52} color={GLYPH} /></div> : null}
            <div style={{position: 'absolute', left: -14, top: mid - 14, width: 28, height: 28, borderRadius: 14, background: c, boxShadow: `0 0 24px ${c}`}} />
            <div style={{position: 'absolute', left: -200, width: 400, top: mid + 30, textAlign: 'center', color: T.text, fontFamily: T.font, fontWeight: 800, fontSize: 34}}>{n.label}</div>
            {n.sub ? <div style={{position: 'absolute', left: -200, width: 400, top: mid + 80, textAlign: 'center', color: T.sub, fontFamily: T.font, fontSize: 26}}>{n.sub}</div> : null}
          </div>
        );
      })}
    </div>
  );
};

const REG: Record<string, React.FC<P>> = {clip: Clip, entity: Entity, stat: Stat, tag: Tag, heading: Heading, note: Note, list: List, arrow: Arrow, highlight: Highlight, timeline: Timeline,
  stamp: Stamp, rise: Rise, multiply: Multiply, scan: Scan, erode: Erode, strike: Strike, marker: Marker, circle: Circle,
  phrases: Phrases, loop: Loop, dialog: Dialog, notify: Notify, glass: Glass, retrieve: Retrieve, pipeline: Pipeline, roundtrip: Roundtrip};
// `relight` (absolute ms list): the speaker refers back to this element, so it pulses and glows again.
export const ElementView: React.FC<P> = (props) => (
  // data-el: the edit desk finds what was clicked in its preview (display: contents - no box, nothing changes on screen)
  <div data-el={props.el.id} style={{display: 'contents'}}>
    <TimeBase.Provider value={(props.abs ?? props.ms) - props.ms}><ElementBody {...props} /></TimeBase.Provider>
  </div>
);

const ElementBody: React.FC<P> = ({el, ms, abs}) => {
  if (ms < el.atMs - 50 || (el.outMs != null && ms > el.outMs)) return null;
  const C = REG[el.kind];
  if (el.outMs != null && ms > el.outMs - 320) {
    const o = Math.max(0, (el.outMs - ms) / 320);
    return <div style={{position: 'absolute', left: 0, top: 0, opacity: o, transform: `translateY(${(1 - o) * -12}px)`}}><C el={el} ms={ms} /></div>;
  }
  const since = (el.props.relight as number[] | undefined)?.map((r) => (abs ?? 0) - r).filter((d) => d >= 0 && d < 2200)[0];
  if (since == null) return <C el={el} ms={ms} />;
  const t = since / 2200;
  const pulse = Math.sin(Math.min(1, t * 2.2) * Math.PI);
  const glow = 1 - t;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, transformOrigin: `${el.x + el.w / 2}px ${el.y + el.h / 2}px`,
      transform: `scale(${1 + 0.05 * pulse})`, filter: `drop-shadow(0 0 ${40 * glow}px ${tint(T.accent, 0.9 * glow)})`}}>
      <C el={el} ms={ms} />
      <div style={{position: 'absolute', left: el.x - 14, top: el.y - 14, width: el.w + 28, height: el.h + 28, borderRadius: T.radius + 10,
        border: `4px solid ${tint(T.accent, glow)}`, pointerEvents: 'none'}} />
    </div>
  );
};
