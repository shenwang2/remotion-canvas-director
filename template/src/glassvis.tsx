import React from 'react';
import {Icon} from './Icon';
import {springAt} from './apple';

// A small picture inside a glass state, chosen by the shape of what is being said
// (a swap, a mini schematic, a flow overturned, a comparison, a frame filled, a choice, a verdict).
// Same material language as the panel: white on clear glass, one warm accent, spring motion.

const WARM = '#ffc979';
const RED = '#ff6b5e';
const GREEN = '#5fd38a';
const W90 = 'rgba(255,255,255,0.94)';
const W60 = 'rgba(255,255,255,0.62)';
const W40 = 'rgba(255,255,255,0.42)';
const pane: React.CSSProperties = {background: 'rgba(255,255,255,0.14)', boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.32), inset 0 0 0 1.5px rgba(255,255,255,0.14)'};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fadeIn = (p: number, dy = 16): React.CSSProperties => ({opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * dy}px)`,
  filter: p < 0.97 ? `blur(${(1 - p) * 8}px)` : undefined});

export const VIS_H: Record<string, number> = {swap: 190, phone: 290, flow: 250, bars: 230, frame: 230, poll: 200, stamp: 210};

type V = Record<string, any>;

// ---- swap: the old thing is stamped and steps back, the new one takes its place
const Swap: React.FC<{v: V; ms: number}> = ({v, ms}) => {
  const fromP = springAt(ms, v.from.at ?? v.at ?? 0, 18, 130);
  const st = springAt(ms, v.swapAt, 12, 220);
  const toP = springAt(ms, v.swapAt + 250, 16, 120);
  const Card: React.FC<{c: V; dim: number; glow: number}> = ({c, dim, glow}) => (
    <div style={{...pane, width: 470, height: 150, borderRadius: 38, display: 'flex', alignItems: 'center', gap: 24, padding: '0 30px', boxSizing: 'border-box',
      opacity: 1 - 0.55 * dim, boxShadow: `${pane.boxShadow}${glow ? `, 0 0 ${40 * glow}px rgba(255,201,121,${0.45 * glow}), inset 0 0 0 2.5px rgba(255,201,121,${0.85 * glow})` : ''}`}}>
      <div style={{width: 84, height: 84, borderRadius: 42, background: glow ? 'linear-gradient(140deg,#ffe1a8,#ff9a6b)' : 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
        <Icon name={c.icon} size={42} color={glow ? '#3a2410' : W90} stroke={2} />
      </div>
      <div>
        <div style={{fontSize: 44, fontWeight: 700, color: W90, whiteSpace: 'nowrap'}}>{c.text}</div>
        {c.sub ? <div style={{fontSize: 28, fontWeight: 500, color: W60, marginTop: 2, whiteSpace: 'nowrap'}}>{c.sub}</div> : null}
      </div>
    </div>
  );
  return (
    <div style={{position: 'relative', height: '100%', display: 'flex', alignItems: 'center', gap: 34}}>
      <div style={{position: 'relative', ...fadeIn(fromP), transform: `${fadeIn(fromP).transform} scale(${1 - 0.06 * st})`}}>
        <Card c={v.from} dim={st} glow={0} />
        {st > 0 ? (
          <div style={{position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) rotate(-9deg) scale(${lerp(1.7, 1, st)})`, opacity: Math.min(1, st * 1.6),
            padding: '10px 34px', borderRadius: 18, border: `5px solid ${RED}`, color: RED, fontSize: 56, fontWeight: 900, letterSpacing: 6, whiteSpace: 'nowrap',
            background: 'rgba(40,10,10,0.35)'}}>{v.stamp ?? '淘汰'}</div>
        ) : null}
      </div>
      <div style={{opacity: Math.min(1, toP * 1.5), transform: `translateX(${(1 - toP) * -30}px)`}}><Icon name="ArrowRight" size={58} color={WARM} stroke={2.6} /></div>
      <div style={{opacity: Math.min(1, toP * 1.3), transform: `translateX(${(1 - toP) * 60}px) scale(${0.92 + 0.08 * toP})`}}>
        <Card c={v.to} dim={0} glow={toP} />
      </div>
    </div>
  );
};

// ---- phone: a tiny schematic of the frame itself - talking head, a card, a push-in, the morph to the canvas
const Phone: React.FC<{v: V; ms: number}> = ({v, ms}) => {
  const beat = (mode: string) => (v.beats as V[]).find((b) => b.mode === mode);
  const pAt = (mode: string, d = 16, s = 120) => { const b = beat(mode); return b ? springAt(ms, b.at, d, s) : 0; };
  const canvasP = pAt('canvas', 18, 110), cardP = pAt('card'), zoomP = pAt('zoom', 14, 170);
  const PW = 176, PH = 312, k = 270 / PH;   // drawn at 176x312, shown at 270 tall
  const zoom = 1 + 0.32 * zoomP * (1 - canvasP);
  // the person: full frame -> a round avatar in the lower right
  const headR = lerp(36, 15, canvasP), cx = lerp(PW / 2, PW - 34, canvasP), cy = lerp(118, PH - 70, canvasP);
  const bodyW = lerp(132, 0, canvasP), bodyH = lerp(120, 0, canvasP);
  const labels = (v.labels as V[]) ?? [];
  const active = labels.filter((l) => ms >= l.at).slice(-1)[0];
  const Pill: React.FC<{l: V}> = ({l}) => {
    const p = springAt(ms, l.at, 18, 130);
    const on = active === l;
    return (
      <div style={{...pane, ...fadeIn(p), padding: '18px 30px', borderRadius: 999, fontSize: 40, fontWeight: 700, whiteSpace: 'nowrap',
        color: on ? '#3a2410' : W90, background: on ? 'linear-gradient(120deg,#ffe1a8,#ffb36b)' : (pane.background as string)}}>{l.text}</div>
    );
  };
  return (
    <div style={{height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 46}}>
      <div style={{display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-end', width: 380}}>{labels.filter((l) => l.side !== 'right').map((l, i) => <Pill key={i} l={l} />)}</div>
      <div style={{width: PW * k, height: PH * k, flexShrink: 0}}>
      <div style={{position: 'relative', width: PW, height: PH, borderRadius: 30, overflow: 'hidden', transform: `scale(${k})`, transformOrigin: '0 0',
        boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.7), 0 18px 40px rgba(0,0,0,0.25)'}}>
        {/* the room behind the speaker, fading into the dark dotted canvas */}
        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(170deg,#6b5a4f,#3b3431)', opacity: 1 - canvasP}} />
        <div style={{position: 'absolute', inset: 0, background: '#14161d', opacity: canvasP,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.22) 1.2px, transparent 1.3px)', backgroundSize: '16px 16px'}} />
        {[0, 1].map((i) => (
          <div key={i} style={{position: 'absolute', left: 16, top: 24 + i * 62, width: PW - 32, height: 48, borderRadius: 10,
            background: i ? 'rgba(255,255,255,0.16)' : 'rgba(255,201,121,0.5)', opacity: canvasP, transform: `translateY(${(1 - canvasP) * 20}px)`}} />
        ))}
        <div style={{position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: `${PW / 2}px 118px`}}>
          <div style={{position: 'absolute', left: cx - bodyW / 2, top: cy + headR + 6, width: bodyW, height: bodyH, borderRadius: '60px 60px 0 0', background: 'rgba(255,255,255,0.78)'}} />
          <div style={{position: 'absolute', left: cx - headR, top: cy - headR, width: headR * 2, height: headR * 2, borderRadius: '50%', background: 'rgba(255,255,255,0.92)',
            boxShadow: canvasP > 0.5 ? '0 0 0 3px rgba(255,255,255,0.6)' : undefined}} />
          {/* a glass card under the chin */}
          <div style={{position: 'absolute', left: 22, top: 222, width: PW - 44, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.42)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)', opacity: cardP * (1 - canvasP), transform: `translateY(${(1 - cardP) * 14}px)`}} />
        </div>
      </div>
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start', width: 380}}>{labels.filter((l) => l.side === 'right').map((l, i) => <Pill key={i} l={l} />)}</div>
    </div>
  );
};

// ---- flow: a way of doing things laid out as steps; a row can be struck out and replaced by the next
const Flow: React.FC<{v: V; ms: number}> = ({v, ms}) => (
  <div style={{height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 34}}>
    {(v.rows as V[]).map((r, ri) => {
      const st = r.strikeAt != null ? springAt(ms, r.strikeAt, 20, 150) : 0;
      return (
        <div key={ri} style={{position: 'relative', display: 'flex', alignItems: 'center', gap: 16, opacity: 1 - 0.5 * st}}>
          {(r.nodes as V[]).map((n, i) => {
            const p = springAt(ms, n.at, 18, 130);
            return (
              <React.Fragment key={i}>
                {i ? <div style={{opacity: Math.min(1, p * 1.5)}}><Icon name="ChevronRight" size={40} color={W60} stroke={2.6} /></div> : null}
                <div style={{...pane, ...fadeIn(p), padding: '20px 30px', borderRadius: 26, fontSize: 40, fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 14,
                  color: n.accent ? '#3a2410' : W90, background: n.accent ? 'linear-gradient(120deg,#ffe1a8,#ffb36b)' : (pane.background as string)}}>
                  {n.icon ? <Icon name={n.icon} size={38} color={n.accent ? '#3a2410' : W90} stroke={2.2} /> : null}{n.text}
                </div>
              </React.Fragment>
            );
          })}
          {st > 0 ? <div style={{position: 'absolute', left: -10, top: '50%', height: 6, borderRadius: 3, width: `calc(${st} * (100% + 20px))`, background: RED, boxShadow: `0 0 12px ${RED}`}} /> : null}
        </div>
      );
    })}
  </div>
);

// ---- bars: how much - two results side by side, and the level one of them should have reached
const Bars: React.FC<{v: V; ms: number}> = ({v, ms}) => {
  const TRACK = 640;
  const note = v.note as V | undefined;
  const np = note ? springAt(ms, note.at, 14, 160) : 0;
  return (
    <div style={{position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 30}}>
      {(v.bars as V[]).map((b, i) => {
        const p = springAt(ms, b.at, 20, 90);
        const gp = b.ghostAt != null ? springAt(ms, b.ghostAt, 18, 100) : 0;
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 26, ...fadeIn(Math.min(1, p * 2))}}>
            <div style={{width: 300, fontSize: 38, fontWeight: 700, color: W90, whiteSpace: 'nowrap', textAlign: 'right'}}>{b.label}</div>
            <div style={{position: 'relative', width: TRACK, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.12)'}}>
              {gp > 0 ? (
                <div style={{position: 'absolute', left: 0, top: -6, height: 56, borderRadius: 28, width: TRACK * lerp(b.value, b.ghost, gp),
                  border: `3px dashed ${WARM}`, boxSizing: 'border-box', opacity: Math.min(1, gp * 1.4)}} />
              ) : null}
              <div style={{position: 'absolute', left: 0, top: 0, height: 44, borderRadius: 22, width: TRACK * b.value * p,
                background: b.tone === 'warm' ? 'linear-gradient(90deg,#ffe1a8,#ff9a6b)' : 'rgba(255,255,255,0.72)'}} />
              {gp > 0.3 && b.ghostLabel ? (
                <div style={{position: 'absolute', left: TRACK * b.ghost + 18, top: 2, fontSize: 32, fontWeight: 700, color: WARM, whiteSpace: 'nowrap', opacity: (gp - 0.3) / 0.7}}>{b.ghostLabel}</div>
              ) : null}
            </div>
          </div>
        );
      })}
      {note && np > 0 ? (
        <div style={{position: 'absolute', right: 0, top: 0, transform: `scale(${lerp(1.4, 1, np)}) rotate(-4deg)`, opacity: Math.min(1, np * 1.6),
          ...pane, padding: '14px 28px', borderRadius: 999, fontSize: 40, fontWeight: 800, color: W90, whiteSpace: 'nowrap'}}>≈ {note.text}</div>
      ) : null}
    </div>
  );
};

// ---- frame: only the outline is given; the rest is filled in by someone else
const Frame: React.FC<{v: V; ms: number}> = ({v, ms}) => {
  const p = springAt(ms, v.at, 18, 120);
  const n = v.slots ?? 3;
  const lp = v.fillLabel ? springAt(ms, v.fillAt + 200 * n, 16, 140) : 0;
  return (
    <div style={{position: 'relative', height: '100%', ...fadeIn(p)}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 46, bottom: 0, borderRadius: 34, border: `3px dashed ${W60}`, display: 'flex', gap: 22, padding: 24, boxSizing: 'border-box'}}>
        {Array.from({length: n}).map((_, i) => {
          const f = springAt(ms, v.fillAt + i * 200, 16, 130);
          return (
            <div key={i} style={{flex: 1, borderRadius: 22, border: `2.5px dashed ${W40}`, position: 'relative', overflow: 'hidden'}}>
              <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#ffe1a8,#ff9a6b)', opacity: f * 0.95, transform: `scale(${0.6 + 0.4 * f})`, borderRadius: 20}} />
              {f > 0.2 ? <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: f}}><Icon name={(v.icons ?? ['Sparkles', 'WandSparkles', 'Lightbulb'])[i % 3]} size={52} color="#3a2410" stroke={2.2} /></div> : null}
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', left: 0, top: 0, ...pane, padding: '8px 22px', borderRadius: 999, fontSize: 30, fontWeight: 700, color: W90}}>{v.label}</div>
      {lp > 0 ? <div style={{position: 'absolute', right: 0, top: 0, padding: '8px 22px', borderRadius: 999, fontSize: 30, fontWeight: 800, color: '#3a2410',
        background: 'linear-gradient(120deg,#ffe1a8,#ffb36b)', ...fadeIn(lp)}}>{v.fillLabel}</div> : null}
    </div>
  );
};

// ---- poll: the viewer's choice, as two answers to pick from (no made-up numbers)
const Poll: React.FC<{v: V; ms: number}> = ({v, ms}) => {
  const pulse = v.hintAt != null && ms > v.hintAt ? 0.5 + 0.5 * Math.sin(((ms - v.hintAt) / 1000) * Math.PI * 2 * 0.9) : 0;
  return (
    <div style={{height: '100%', display: 'flex', alignItems: 'center', gap: 26}}>
      {(v.options as V[]).map((o, i) => {
        const p = springAt(ms, o.at, 16, 130);
        return (
          <div key={i} style={{flex: 1, height: 170, borderRadius: 36, ...pane, ...fadeIn(p), display: 'flex', alignItems: 'center', gap: 22, padding: '0 28px', boxSizing: 'border-box',
            boxShadow: `${pane.boxShadow}, inset 0 0 0 ${2 + 2 * pulse}px rgba(255,201,121,${0.25 + 0.5 * pulse})`}}>
            <div style={{width: 92, height: 92, borderRadius: 46, background: 'linear-gradient(140deg,#ffe1a8,#ff9a6b)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 52, fontWeight: 900, color: '#3a2410', flexShrink: 0}}>{o.key}</div>
            <div>
              <div style={{fontSize: 40, fontWeight: 800, color: W90, whiteSpace: 'nowrap'}}>{o.text}</div>
              {o.sub ? <div style={{fontSize: 28, fontWeight: 500, color: W60, marginTop: 4, whiteSpace: 'nowrap'}}>{o.sub}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---- stamp: a verdict slammed onto the glass
const Stamp: React.FC<{v: V; ms: number}> = ({v, ms}) => {
  const p = springAt(ms, v.at, 11, 230);
  if (p <= 0) return null;
  const c = v.tone === 'green' ? GREEN : v.tone === 'red' ? RED : WARM;
  return (
    <div style={{height: '100%', display: 'flex', alignItems: 'center', gap: 34}}>
      <div style={{transform: `rotate(-7deg) scale(${lerp(1.8, 1, p)})`, opacity: Math.min(1, p * 1.7), padding: '18px 50px', borderRadius: 26, border: `7px solid ${c}`,
        color: c, fontSize: 104, fontWeight: 900, letterSpacing: 8, whiteSpace: 'nowrap', boxShadow: `0 0 40px ${c}55, inset 0 0 30px ${c}33`}}>{v.text}</div>
      {v.sub ? <div style={{fontSize: 40, fontWeight: 600, color: W60, ...fadeIn(springAt(ms, v.at + 300, 18, 130))}}>{v.sub}</div> : null}
    </div>
  );
};

const KINDS: Record<string, React.FC<{v: V; ms: number}>> = {swap: Swap, phone: Phone, flow: Flow, bars: Bars, frame: Frame, poll: Poll, stamp: Stamp};

export const GlassVisual: React.FC<{v: V; ms: number}> = ({v, ms}) => {
  const K = KINDS[v.type];
  if (!K) return null;
  return <div style={{position: 'relative', height: v.h ?? VIS_H[v.type] ?? 240, marginTop: 30}}><K v={v} ms={ms} /></div>;
};
