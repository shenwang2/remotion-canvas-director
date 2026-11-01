import React from 'react';
import {GLYPH, TONE, iconTile} from './theme';
import {A, accentParts, appear, materialLight, springAt} from './apple';
import {Icon} from './Icon';
import type {CanvasElement} from './types';

// Overlay *scenes*: one per spoken passage. Each grows beat by beat as the passage unfolds
// and settles on a state that sums it up, instead of one card per sentence.
type P = {el: CanvasElement; ms: number};
const box = (el: CanvasElement): React.CSSProperties => ({position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h});

// A soft shade on the speaker's free side: the stage that overlay type sits on (like keynote type over a dimmed slide).
const Scrim: React.FC<{el: CanvasElement; o: number}> = ({el, o}) => {
  const [FW, FH] = (el.props.frame ?? [2560, 1440]) as [number, number];
  const fromLeft = (el.props.side ?? 'left') === 'left';
  return <div style={{position: 'absolute', top: -el.y, height: FH, left: -el.x, width: FW, opacity: o, pointerEvents: 'none',
    background: `linear-gradient(${fromLeft ? 90 : 270}deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.5) 32%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0) 62%)`}} />;
};

const Phrase: React.FC<{text: string; size: number; dim: boolean; bare: boolean}> = ({text, dim, bare}) => (
  <>
    {accentParts(text).map((p, i) => (
      <span key={i} style={bare
        ? (p.accent || true ? {background: A.accentGradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent'} : {})
        : {color: dim ? 'rgba(60,60,67,0.45)' : p.accent ? A.orange : A.label}}>{p.t}</span>
    ))}
  </>
);

// Keynote-style stack: the newest line arrives large; earlier lines shrink, dim and move up,
// so the thread of the argument stays visible. A beat can be struck out ("标题党？" -> no).
type Beat = {at: number; text: string; size?: 'lead' | 'main' | 'hero'; strikeAt?: number};
const SIZES = {lead: 52, main: 96, hero: 168};

export const Phrases: React.FC<P> = ({el, ms}) => {
  const {beats, side = 'left'} = el.props as {beats: Beat[]; side?: string};
  const vis = beats.filter((b) => ms >= b.at);
  if (!vis.length) return null;
  const e = vis.map((b) => springAt(ms, b.at, 18, 110));
  const scaleOf = (age: number) => (age <= 1 ? 1 - 0.42 * age : 0.58 * Math.pow(0.86, age - 1));
  const alphaOf = (age: number) => (age <= 1 ? 1 - 0.35 * age : age <= 2 ? 0.65 - 0.3 * (age - 1) : Math.max(0, 0.35 - 0.35 * (age - 2)));
  const ages = vis.map((_, i) => e.slice(i + 1).reduce((a, b) => a + b, 0));
  // A carded line is taller than its text (iOS padding); the hero word stands bare.
  const heights = vis.map((b, i) => SIZES[b.size ?? 'main'] * (b.size === 'hero' ? 1.25 : 1.62) * scaleOf(ages[i]));
  const baseY = el.h * 0.62;
  const fromLeft = side === 'left';
  return (
    <div style={box(el)}>
      <Scrim el={el} o={0.55 * Math.min(1, e[0] * 1.5)} />
      {vis.map((b, i) => {
        const age = ages[i];
        const above = heights.slice(i + 1).reduce((a, h, k) => a + (h + 18) * e[i + 1 + k], 0);
        const bottom = baseY - above;
        const size = SIZES[b.size ?? 'main'] * scaleOf(age);
        const st = b.strikeAt != null ? springAt(ms, b.strikeAt, 22, 160) : 0;
        const enterStyle = appear(e[i], 30);
        return (
          <div key={i} style={{position: 'absolute', left: fromLeft ? 0 : undefined, right: fromLeft ? undefined : 0, top: bottom - heights[i], height: heights[i],
            display: 'flex', alignItems: 'flex-end', opacity: alphaOf(age) * (enterStyle.opacity as number), transform: enterStyle.transform, filter: enterStyle.filter,
            transformOrigin: fromLeft ? 'left bottom' : 'right bottom'}}>
            <div style={{position: 'relative', fontFamily: A.font, fontWeight: b.size === 'hero' ? 900 : b.size === 'lead' ? 600 : 700, fontSize: size, lineHeight: 1.12,
              letterSpacing: -size * 0.02, whiteSpace: 'nowrap',
              ...(b.size === 'hero' ? {filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.45))'} : {...materialLight, borderRadius: size * 0.34, padding: `${size * 0.24}px ${size * 0.4}px`})}}>
              <Phrase text={b.text} size={size} dim={st > 0.5} bare={b.size === 'hero'} />
              {st > 0 ? <div style={{position: 'absolute', left: size * 0.32, top: '52%', height: Math.max(4, size * 0.07), width: `calc(${st} * (100% - ${size * 0.64}px))`,
                background: '#ff453a', borderRadius: 99, transform: 'rotate(-3deg)'}} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// A loop: each step arrives on its word, an arrow carries the thread to the next,
// and the loop closes on the payoff in the middle.
type Node = {at: number; text: string; icon: string; tone?: string};
export const Loop: React.FC<P> = ({el, ms}) => {
  const {nodes, center} = el.props as {nodes: Node[]; center?: {at: number; text: string; sub?: string}};
  const n = nodes.length;
  const cx = el.w / 2, cy = el.h / 2, R = Math.min(el.w, el.h) * 0.36;
  const ang = (i: number) => (-90 + (i * 360) / n) * (Math.PI / 180);
  const pos = (i: number) => [cx + R * Math.cos(ang(i)), cy + R * Math.sin(ang(i))];
  const arc = (i: number, p: number) => {
    const a0 = ang(i) + 0.42, a1 = ang(i + 1) - 0.42;
    const a = a0 + (a1 - a0) * p;
    const [x0, y0] = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)];
    const [x1, y1] = [cx + R * Math.cos(a), cy + R * Math.sin(a)];
    return {d: `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}`, end: [x1, y1, a]};
  };
  const closeAt = center?.at ?? Infinity;
  return (
    <div style={box(el)}>
      <Scrim el={el} o={Math.min(1, springAt(ms, nodes[0].at) * 1.5)} />
      <svg width={el.w} height={el.h} style={{position: 'absolute', overflow: 'visible'}}>
        {nodes.map((_, i) => {
          const next = i + 1 < n ? nodes[i + 1].at : closeAt;
          const p = springAt(ms, next - 200, 22, 90);
          if (p <= 0.01) return null;
          const {d, end} = arc(i, Math.min(1, p));
          const [x, y, a] = end as number[];
          const deg = (a * 180) / Math.PI + 90;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={6} strokeLinecap="round" />
              <g transform={`translate(${x},${y}) rotate(${deg})`}><path d="M0,0 L-14,-22 L14,-22 Z" transform="rotate(180)" fill="rgba(255,255,255,0.9)" /></g>
            </g>
          );
        })}
      </svg>
      {nodes.map((nd, i) => {
        const s = springAt(ms, nd.at);
        if (s <= 0) return null;
        const [x, y] = pos(i);
        const c = TONE[nd.tone ?? 'accent'];
        return (
          <div key={i} style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) ${appear(s).transform}`, opacity: appear(s).opacity, filter: appear(s).filter,
            ...materialLight, borderRadius: 999, display: 'flex', alignItems: 'center', gap: 18, padding: '16px 34px 16px 16px', whiteSpace: 'nowrap'}}>
            <div style={{...iconTile(c, 76, true), borderRadius: 999}}><Icon name={nd.icon} size={40} color={GLYPH} /></div>
            <div style={{fontFamily: A.font, fontWeight: 700, fontSize: 50, color: A.label}}>{nd.text}</div>
          </div>
        );
      })}
      {center ? (() => {
        const s = springAt(ms, center.at, 14, 120);
        return s > 0 ? (
          <div style={{position: 'absolute', left: cx, top: cy, transform: `translate(-50%, -50%) scale(${0.8 + 0.2 * s})`, opacity: Math.min(1, s * 1.4), textAlign: 'center',
            filter: s < 0.98 ? `blur(${(1 - s) * 10}px)` : undefined}}>
            <div style={{fontFamily: A.font, fontWeight: 900, fontSize: 112, letterSpacing: -2, background: A.accentGradient, WebkitBackgroundClip: 'text',
              backgroundClip: 'text', color: 'transparent', whiteSpace: 'nowrap', textShadow: 'none'}}>{center.text}</div>
            {center.sub ? <div style={{display: 'inline-block', ...materialLight, borderRadius: 999, padding: '10px 26px', fontFamily: A.font, fontWeight: 600, fontSize: 36, color: 'rgba(60,60,67,0.85)', marginTop: 12, whiteSpace: 'nowrap'}}>{center.sub}</div> : null}
          </div>
        ) : null;
      })() : null}
    </div>
  );
};

// A question the viewer has, and the answer - as a message exchange.
export const Dialog: React.FC<P> = ({el, ms}) => {
  const {q, a} = el.props as {q: {at: number; text: string}; a: {at: number; text: string; sub?: string}};
  const sq = springAt(ms, q.at, 15, 140);
  const sa = springAt(ms, a.at, 15, 140);
  const typing = false;
  const bubble: React.CSSProperties = {display: 'inline-block', maxWidth: el.w * 0.86, padding: '24px 36px', borderRadius: 44, fontFamily: A.font};
  return (
    <div style={box(el)}>
      {sq > 0 ? (
        <div style={{position: 'absolute', left: 0, top: el.h * 0.18, transformOrigin: 'left bottom', ...appear(sq)}}>
          <div style={{...bubble, background: 'rgba(233,233,235,0.96)', boxShadow: '0 8px 24px rgba(0,0,0,0.14)', borderBottomLeftRadius: 12, color: '#000', fontWeight: 500, fontSize: 50}}>{q.text}</div>
        </div>
      ) : null}
      {typing ? (
        <div style={{position: 'absolute', right: 0, top: el.h * 0.5, ...bubble, padding: '22px 30px', background: 'rgba(10,132,255,0.85)', display: 'flex', gap: 12}}>
          {[0, 1, 2].map((k) => <div key={k} style={{width: 16, height: 16, borderRadius: 8, background: '#fff', opacity: 0.4 + 0.6 * Math.abs(Math.sin((ms / 180) - k * 0.6))}} />)}
        </div>
      ) : null}
      {sa > 0 ? (
        <div style={{position: 'absolute', right: 0, top: el.h * 0.5, transformOrigin: 'right bottom', textAlign: 'right', ...appear(sa)}}>
          <div style={{...bubble, borderBottomRightRadius: 12, background: '#007aff', color: '#fff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.16)', textAlign: 'left'}}>
            <div style={{fontWeight: 700, fontSize: 58, lineHeight: 1.15}}>{a.text}</div>
            {a.sub ? <div style={{fontWeight: 500, fontSize: 36, opacity: 0.9, marginTop: 8}}>{a.sub}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

// An iOS notification: concrete information that arrives from the top and stays readable.
export const Notify: React.FC<P> = ({el, ms}) => {
  const {app, icon = 'Bell', tone = 'accent', title, body, when = '现在'} = el.props;
  const s = springAt(ms, el.atMs, 15, 130);
  if (s <= 0) return null;
  return (
    <div style={{...box(el), height: undefined, opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * -70}px) scale(${0.96 + 0.04 * s})`,
      filter: s < 0.98 ? `blur(${(1 - s) * 12}px)` : undefined, ...materialLight, padding: '30px 36px', display: 'flex', gap: 28, alignItems: 'flex-start', boxSizing: 'border-box'}}>
      <div style={{...iconTile(TONE[tone], 96, true)}}><Icon name={icon} size={52} color={GLYPH} /></div>
      <div style={{flex: 1, minWidth: 0, fontFamily: A.font}}>
        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 28, fontWeight: 600, color: A.label2, letterSpacing: 0.5}}>
          <span>{app}</span><span style={{fontWeight: 500}}>{when}</span>
        </div>
        <div style={{fontSize: 46, fontWeight: 700, color: A.label, marginTop: 8, whiteSpace: 'nowrap'}}>{title}</div>
        {body ? <div style={{fontSize: 36, fontWeight: 500, color: A.label2, marginTop: 6}}>{body}</div> : null}
      </div>
    </div>
  );
};
