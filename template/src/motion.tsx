import React from 'react';
import {Easing, interpolate} from 'remotion';
import {GLYPH, T, TONE, iconTile, ink, surface as surf, tint, toneOn} from './theme';
import {clamp, prog} from './anim';
import {Icon} from './Icon';
import {FocusRing, Label} from './craft';
import {springAt} from './apple';
import type {CanvasElement} from './types';

// Motion that carries meaning: each element enters the way its content behaves.
type P = {el: CanvasElement; ms: number};
const box = (el: CanvasElement): React.CSSProperties => ({position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h});
const ease = Easing.bezier(0.2, 0.9, 0.2, 1);
const dark = 'rgba(28,28,30,0.94)';


// A verdict: slams down like a rubber stamp, a ring bursts out, a short shake.
export const Stamp: React.FC<P> = ({el, ms}) => {
  const {text, tone = 'green', icon, onVideo} = el.props;
  const c = toneOn(TONE[tone], onVideo);
  const t = ms - el.atMs;
  const drop = interpolate(t, [0, 260], [2.4, 1], {...clamp, easing: Easing.in(Easing.cubic)});
  const settle = t > 260 ? 1 - 0.06 * Math.sin(Math.min(1, (t - 260) / 220) * Math.PI) : drop;
  const shake = t > 260 && t < 460 ? Math.sin(t / 12) * 6 * (1 - (t - 260) / 200) : 0;
  const ring = interpolate(t, [260, 700], [0, 1], clamp);
  return (
    <div style={{...box(el), opacity: interpolate(t, [0, 120], [0, 1], clamp), transform: `translateX(${shake}px) rotate(${el.props.tilt ?? -6}deg) scale(${settle})`}}>
      {ring > 0 && ring < 1 ? <div style={{position: 'absolute', inset: -30 * ring, borderRadius: 24 + 30 * ring, border: `3px solid ${tint(c, 0.6 * (1 - ring))}`}} /> : null}
      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: el.h * 0.16, borderRadius: 18,
        border: `2.5px solid ${tint(c, 0.85)}`, ...surf(onVideo, `0 0 26px ${tint(c, 0.22)}`), color: c, fontFamily: T.font, fontWeight: 800, fontSize: el.h * 0.42,
        letterSpacing: el.h * 0.01, whiteSpace: 'nowrap', boxSizing: 'border-box'}}>
        {icon ? <Icon name={icon} size={el.h * 0.46} color={c} stroke={2.6} /> : null}
        {text}
      </div>
    </div>
  );
};

// Getting better / growing: a line climbs and an arrow lifts, the words rise with it.
export const Rise: React.FC<P> = ({el, ms}) => {
  const {text, sub, tone = 'green'} = el.props;
  const c = toneOn(TONE[tone], el.props.onVideo);
  const p = prog(ms, el.atMs, 1000);
  const tp = prog(ms, el.atMs + 250, 600);
  const cw = el.h * 1.6, ch = el.h * 0.8;
  const pts = [[0, 0.9], [0.22, 0.72], [0.4, 0.78], [0.62, 0.45], [0.8, 0.38], [1, 0.05]].map(([x, y]) => [x * cw, y * ch]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const len = cw * 1.6;
  return (
    <div style={{...box(el), display: 'flex', alignItems: 'center', gap: el.h * 0.2, padding: `0 ${el.h * 0.2}px`, borderRadius: T.radius, ...surf(el.props.onVideo), boxSizing: 'border-box', opacity: prog(ms, el.atMs, 250)}}>
      <svg width={cw} height={ch} style={{overflow: 'visible', flexShrink: 0}}>
        <path d={`${d} L${cw},${ch} L0,${ch} Z`} fill={tint(c, 0.18 * p)} />
        <path d={d} fill="none" stroke={c} strokeWidth={el.h * 0.05} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
        <g transform={`translate(${cw},${ch * 0.05}) rotate(-50)`} opacity={p > 0.9 ? 1 : 0}><path d={`M0,0 L${-el.h * 0.14},${-el.h * 0.08} L${-el.h * 0.14},${el.h * 0.08} Z`} fill={c} /></g>
      </svg>
      <div style={{opacity: tp, transform: `translateY(${(1 - tp) * el.h * 0.3}px)`}}>
        <div style={{color: ink(el.props.onVideo).label, fontFamily: T.font, fontWeight: 700, fontSize: el.h * 0.3, whiteSpace: 'nowrap'}}>{text}</div>
        {sub ? <div style={{color: ink(el.props.onVideo).sub, fontFamily: T.font, fontSize: el.h * 0.17, marginTop: 4, whiteSpace: 'nowrap'}}>{sub}</div> : null}
      </div>
    </div>
  );
};

// Many at once: one tile clones itself into a grid, then the count lands.
export const Multiply: React.FC<P> = ({el, ms}) => {
  const {count = 9, label, icon = 'Clapperboard', tone = 'accent'} = el.props;
  const c = TONE[tone];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const gridH = el.h * 0.74;
  const tile = Math.min((el.w - (cols - 1) * 14) / cols, (gridH - (rows - 1) * 14) / rows);
  const gw = cols * tile + (cols - 1) * 14;
  const ox = (el.w - gw) / 2;
  const t = ms - el.atMs;
  const cp = prog(ms, el.atMs + 300 + count * 70, 400);
  return (
    <div style={{...box(el), opacity: prog(ms, el.atMs, 200)}}>
      {Array.from({length: count}).map((_, i) => {
        const r = Math.floor(i / cols), k = i % cols;
        const tx = ox + k * (tile + 14), ty = r * (tile + 14);
        const f = interpolate(t, [250 + i * 70, 650 + i * 70], [0, 1], {...clamp, easing: ease});
        const sx = ox + ((cols - 1) / 2) * (tile + 14), sy = ((rows - 1) / 2) * (tile + 14);
        return (
          <div key={i} style={{position: 'absolute', left: sx + (tx - sx) * f, top: sy + (ty - sy) * f, width: tile, height: tile,
            opacity: i === 0 ? 1 : f, ...iconTile(c, tile), boxShadow: '0 10px 30px rgba(0,0,0,0.45)'}}>
            <Icon name={icon} size={tile * 0.46} color={GLYPH} />
          </div>
        );
      })}
      {label ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: gridH + 18, textAlign: 'center', opacity: cp, transform: `scale(${1.3 - 0.3 * cp})`,
          color: c, fontFamily: T.font, fontWeight: 900, fontSize: el.h * 0.13, whiteSpace: 'nowrap'}}>{label}</div>
      ) : null}
    </div>
  );
};

// Searching / matching: a light beam sweeps across the target; hits light up as it passes them.
export const Scan: React.FC<P> = ({el, ms}) => {
  const {hits = [], label, tone = 'cyan', passes = 2, passMs = 1300} = el.props as {hits?: [number, number, number, number][]; label?: string; tone?: string; passes?: number; passMs?: number};
  const c = TONE[tone];
  const t = ms - el.atMs;
  if (t < 0) return null;
  const pass = t / passMs;
  const x = pass < passes ? (pass % 1) : -1;
  return (
    <div style={{...box(el), overflow: 'hidden', borderRadius: T.radius, pointerEvents: 'none'}}>
      {x >= 0 ? (
        <div style={{position: 'absolute', top: 0, bottom: 0, left: `${x * 120 - 20}%`, width: '18%',
          background: `linear-gradient(90deg, transparent, ${tint(c, 0.35)}, ${tint(c, 0.75)}, transparent)`, boxShadow: `0 0 60px ${tint(c, 0.6)}`}} />
      ) : null}
      {hits.map(([hx, hy, hw, hh], i) => {
        const reached = pass >= 1 || (x >= 0 && x * 1.2 - 0.2 > hx);
        const hp = reached ? 1 : 0;
        return <div key={i} style={{position: 'absolute', left: `${hx * 100}%`, top: `${hy * 100}%`, width: `${hw * 100}%`, height: `${hh * 100}%`,
          border: `2.5px solid ${tint(c, hp)}`, borderRadius: 14, boxShadow: hp ? `0 0 18px ${tint(c, 0.55)}` : 'none'}} />;
      })}
      {label ? <div style={{position: 'absolute', left: 24, top: 24, opacity: prog(ms, el.atMs, 300)}}><Label text={label} color={c} icon="ScanSearch" /></div> : null}
    </div>
  );
};

// Something wearing away: a red pulse, then the key words fade and blur out letter by letter.
export const Erode: React.FC<P> = ({el, ms}) => {
  const {text, fade = '', tone = 'red', icon = 'TriangleAlert'} = el.props;
  const c = TONE[tone];
  const p = prog(ms, el.atMs, 400);
  const e = prog(ms, el.atMs + 700, 1600);
  const pulse = 0.5 + 0.5 * Math.sin((ms - el.atMs) / 160);
  const i0 = fade ? text.indexOf(fade) : -1;
  return (
    <div style={{...box(el), opacity: p, display: 'flex', alignItems: 'center', gap: el.h * 0.18, padding: `0 ${el.h * 0.3}px`, borderRadius: el.h / 2, ...surf(false, `0 0 0 ${1.5 + 1 * pulse}px ${tint(c, 0.3 + 0.25 * pulse)}`), boxSizing: 'border-box', whiteSpace: 'nowrap'}}>
      <Icon name={icon} size={el.h * 0.44} color={c} stroke={2.4} />
      <div style={{color: T.text, fontFamily: T.font, fontWeight: 700, fontSize: el.h * 0.4}}>
        {[...text].map((ch, i) => {
          const inFade = i0 >= 0 && i >= i0 && i < i0 + fade.length;
          const k = inFade ? Math.min(1, Math.max(0, e * 1.6 - (i - i0) * 0.18)) : 0;
          return <span key={i} style={{color: inFade ? c : T.text, opacity: 1 - 0.5 * k, filter: `blur(${k * 2.2}px)`, display: 'inline-block', transform: `translateY(${-k * 6}px)`}}>{ch}</span>; // worn, still readable
        })}
      </div>
    </div>
  );
};

// Not this: the claim appears, a red line strikes through it, a cross lands; optionally the truth replaces it.
export const Strike: React.FC<P> = ({el, ms}) => {
  const {text, replacement, tone = 'red'} = el.props;
  const c = TONE[tone];
  const p = prog(ms, el.atMs, 350);
  const s = prog(ms, el.atMs + 450, 380);
  const x = prog(ms, el.atMs + 800, 300);
  const r = replacement ? prog(ms, el.atMs + 1100, 450) : 0;
  return (
    <div style={{...box(el), opacity: p}}>
      <div style={{position: 'relative', display: 'inline-flex', alignItems: 'center', height: el.h * (replacement ? 0.5 : 1), padding: `0 ${el.h * 0.15}px`,
        borderRadius: 14, background: dark, color: T.sub, fontFamily: T.font, fontWeight: 900, fontSize: el.h * (replacement ? 0.3 : 0.48), whiteSpace: 'nowrap'}}>
        {text}
        <div style={{position: 'absolute', left: '4%', top: '52%', height: Math.max(5, el.h * 0.05), width: `${92 * s}%`, background: c, borderRadius: 4, transform: 'rotate(-4deg)'}} />
        <div style={{position: 'absolute', right: -el.h * 0.22, top: -el.h * 0.12, width: el.h * 0.36, height: el.h * 0.36, borderRadius: el.h, background: c,
          display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${x})`}}><Icon name="X" size={el.h * 0.24} color="#fff" stroke={3} /></div>
      </div>
      {replacement ? (
        <div style={{marginTop: el.h * 0.08, opacity: r, transform: `rotateX(${(1 - r) * 80}deg)`, transformOrigin: 'top', color: TONE.green, fontFamily: T.font,
          fontWeight: 900, fontSize: el.h * 0.3, whiteSpace: 'nowrap'}}>{replacement}</div>
      ) : null}
    </div>
  );
};

// A key word or phrase: a highlighter pen sweeps under it.
export const Marker: React.FC<P> = ({el, ms}) => {
  const {text, tone = 'accent', size} = el.props;
  const c = TONE[tone];
  const p = prog(ms, el.atMs, 300);
  const sweep = interpolate(ms, [el.atMs + 150, el.atMs + 650], [0, 1], {...clamp, easing: ease});
  const fs = size ?? el.h * 0.62;
  return (
    <div style={{...box(el), opacity: p, display: 'flex', alignItems: 'center'}}>
      <div style={{position: 'relative', display: 'inline-block', padding: `0 ${fs * 0.15}px`}}>
        <div style={{position: 'absolute', left: 0, bottom: fs * 0.08, height: fs * 0.45, width: `${sweep * 100}%`, background: tint(c, 0.85), borderRadius: fs * 0.08,
          transform: 'skewX(-12deg)'}} />
        <span style={{position: 'relative', color: '#fff', fontFamily: T.font, fontWeight: 900, fontSize: fs, textShadow: '0 4px 20px rgba(0,0,0,0.6)', whiteSpace: 'nowrap'}}>{text}</span>
      </div>
    </div>
  );
};

// Marks one spot on a screenshot or recording: a clean focus ring drawn on, with a glass label.
export const Circle: React.FC<P> = ({el, ms}) => {
  const {tone = 'accent', label, icon} = el.props;
  const c = TONE[tone];
  const p = interpolate(ms, [el.atMs, el.atMs + 600], [0, 1], {...clamp, easing: ease});
  const lp = springAt(ms, el.atMs + 350, 18, 140);
  return (
    <div style={box(el)}>
      <FocusRing w={el.w} h={el.h} color={c} p={p} />
      {label ? <div style={{position: 'absolute', left: 0, top: -70, opacity: Math.min(1, lp * 1.4), transform: `translateY(${(1 - lp) * 10}px)`}}>
        <Label text={label} color={c} icon={icon} /></div> : null}
    </div>
  );
};
