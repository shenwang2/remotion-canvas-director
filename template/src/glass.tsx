import React from 'react';
import {Icon} from './Icon';
import {A, springAt} from './apple';
import type {CanvasElement} from './types';
import {GlassVisual} from './glassvis';

// visionOS-style spatial glass: one calm panel floating in the speaker's room.
// The panel blurs the busy background behind it, so type sits on a quiet surface.
// A passage is a sequence of states inside the same panel; content cross-fades
// state to state while the panel stays, so the thread of the passage is continuous.

const WARM = '#ffc979';
const warmGrad = 'linear-gradient(100deg, #ffe1a8 0%, #ffc072 45%, #ff9a6b 100%)';
const W90 = 'rgba(255,255,255,0.94)';
const W60 = 'rgba(255,255,255,0.62)';
const W40 = 'rgba(255,255,255,0.42)';

type Row = {at: number; icon: string; text: string; sub?: string};
type Chip = {at: number; text: string; strikeAt?: number};
type State = {at: number; kicker?: string; title?: string; sub?: string; hero?: string; heroSub?: string; rows?: Row[]; chips?: Chip[]; visual?: Record<string, any>};

const Accent: React.FC<{text: string}> = ({text}) => (
  <>{text.split(/(\{[^}]+\})/).filter(Boolean).map((t, i) => t.startsWith('{')
    ? <span key={i} style={{color: WARM}}>{t.slice(1, -1)}</span>
    : <span key={i}>{t}</span>)}</>
);

const StateView: React.FC<{s: State; ms: number}> = ({s, ms}) => {
  const rowIn = (at: number) => springAt(ms, at, 18, 130);
  return (
    <div style={{position: 'absolute', inset: 0, padding: '64px 70px', display: 'flex', flexDirection: 'column', fontFamily: A.font, textShadow: '0 2px 14px rgba(0,0,0,0.38)'}}>
      {s.kicker ? <div style={{fontSize: 26, fontWeight: 600, letterSpacing: 5, color: W60, textTransform: 'uppercase'}}>{s.kicker}</div> : null}
      {s.title ? <div style={{fontSize: 78, fontWeight: 700, lineHeight: 1.16, letterSpacing: -1.5, color: W90, marginTop: 22, whiteSpace: 'pre-line'}}><Accent text={s.title} /></div> : null}
      {s.sub ? <div style={{fontSize: 34, fontWeight: 500, lineHeight: 1.4, color: W60, marginTop: 18}}>{s.sub}</div> : null}
      {s.visual ? <GlassVisual v={s.visual} ms={ms} /> : null}
      {s.hero ? (
        <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: 10}}>
          <div style={{fontSize: 230, fontWeight: 900, lineHeight: 1, letterSpacing: -6, background: warmGrad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            textShadow: 'none', filter: 'drop-shadow(0 6px 22px rgba(0,0,0,0.35))'}}>{s.hero}</div>
          {s.heroSub ? <div style={{fontSize: 40, fontWeight: 600, letterSpacing: 2, color: W60, marginTop: 18}}>{s.heroSub}</div> : null}
        </div>
      ) : null}
      {s.rows?.length ? (
        <div style={{marginTop: 34}}>
          {s.rows.map((r, i) => {
            const p = rowIn(r.at);
            return (
              <div key={i} style={{display: 'flex', alignItems: 'center', gap: 28, padding: '22px 0', borderTop: i ? '1px solid rgba(255,255,255,0.12)' : 'none',
                opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * 18}px)`, filter: p < 0.97 ? `blur(${(1 - p) * 8}px)` : undefined}}>
                <div style={{width: 76, height: 76, borderRadius: 38, background: 'rgba(255,255,255,0.16)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                  <Icon name={r.icon} size={38} color={W90} stroke={1.9} />
                </div>
                <div>
                  <div style={{fontSize: 46, fontWeight: 600, color: W90, letterSpacing: -0.5}}><Accent text={r.text} /></div>
                  {r.sub ? <div style={{fontSize: 30, fontWeight: 500, color: W60, marginTop: 4}}>{r.sub}</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {s.chips?.length ? (
        <div style={{display: 'flex', gap: 18, marginTop: 30}}>
          {s.chips.map((c, i) => {
            const p = rowIn(c.at);
            const st = c.strikeAt != null ? springAt(ms, c.strikeAt, 22, 160) : 0;
            return (
              <div key={i} style={{position: 'relative', padding: '16px 30px', borderRadius: 999, background: 'rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
                fontSize: 36, fontWeight: 600, color: st > 0.5 ? W40 : W90, opacity: Math.min(1, p * 1.4), transform: `scale(${0.9 + 0.1 * p})`}}>
                {c.text}
                {st > 0 ? <div style={{position: 'absolute', left: 22, top: '50%', height: 4, borderRadius: 2, width: `calc(${st} * (100% - 44px))`, background: '#ff6b5e'}} /> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

// smoke: dark, dense (most legible); glass: clear frosted glass; crystal: barely frosted, the room shows through.
const MATERIAL: Record<string, React.CSSProperties> = {
  smoke: {background: 'linear-gradient(160deg, rgba(58,58,62,0.46) 0%, rgba(24,24,28,0.56) 100%)',
    backdropFilter: 'blur(70px) saturate(115%) brightness(0.72)', WebkitBackdropFilter: 'blur(70px) saturate(115%) brightness(0.72)',
    boxShadow: '0 40px 100px rgba(0,0,0,0.28), inset 0 1.5px 0 rgba(255,255,255,0.32), inset 0 0 0 1px rgba(255,255,255,0.10)'},
  glass: {background: 'linear-gradient(155deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.05) 48%, rgba(255,255,255,0.10) 100%)',
    backdropFilter: 'blur(34px) saturate(165%) brightness(0.86)', WebkitBackdropFilter: 'blur(34px) saturate(165%) brightness(0.86)',
    boxShadow: '0 30px 70px rgba(0,0,0,0.18), inset 0 2px 0 rgba(255,255,255,0.55), inset 0 0 0 1.5px rgba(255,255,255,0.30), inset 0 -2px 0 rgba(255,255,255,0.12)'},
  crystal: {background: 'linear-gradient(155deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.07) 100%)',
    backdropFilter: 'blur(16px) saturate(180%) brightness(0.9)', WebkitBackdropFilter: 'blur(16px) saturate(180%) brightness(0.9)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.14), inset 0 2px 0 rgba(255,255,255,0.7), inset 0 0 0 2px rgba(255,255,255,0.38), inset 0 -2px 0 rgba(255,255,255,0.18)'},
};

export const Glass: React.FC<{el: CanvasElement; ms: number}> = ({el, ms}) => {
  const states = el.props.states as State[];
  const mat = (el.props.material as string) ?? 'crystal';
  const inP = springAt(ms, el.atMs, 20, 110);
  if (inP <= 0) return null;
  let cur = 0;
  states.forEach((s, i) => { if (ms >= s.at) cur = i; });
  const t = cur > 0 ? springAt(ms, states[cur].at, 22, 140) : 1;
  const k = (el.props.scale as number) ?? 1;  // scaled down as a whole when the free zone is short (canvaslib _layout_beside)
  return (
    <div style={{position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h,
      opacity: Math.min(1, inP * 1.3), transform: `translateX(${(1 - inP) * -40}px) scale(${0.95 + 0.05 * inP})`, transformOrigin: 'left center'}}>
     <div style={{position: 'absolute', left: 0, top: 0, width: el.w / k, height: el.h / k, transform: k !== 1 ? `scale(${k})` : undefined, transformOrigin: '0 0'}}>
      {/* glass: a blurred view of the room, a bright specular rim, a diagonal sheen and a soft shadow */}
      <div style={{position: 'absolute', inset: 0, borderRadius: 56, overflow: 'hidden', ...MATERIAL[mat]}}>
        <div style={{position: 'absolute', inset: 0, background: `radial-gradient(120% 75% at 0% 0%, rgba(255,255,255,${mat === 'smoke' ? 0.14 : 0.26}) 0%, rgba(255,255,255,0) 55%)`}} />
        {mat !== 'smoke' ? <div style={{position: 'absolute', top: '-40%', left: '-10%', width: '45%', height: '180%', transform: 'rotate(24deg)',
          background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0) 100%)'}} /> : null}
      </div>
      {cur > 0 && t < 1 ? (
        <div style={{position: 'absolute', inset: 0, opacity: 1 - t, filter: `blur(${t * 12}px)`, transform: `translateY(${-t * 16}px)`}}>
          <StateView s={states[cur - 1]} ms={ms} />
        </div>
      ) : null}
      <div style={{position: 'absolute', inset: 0, opacity: t, filter: t < 0.97 ? `blur(${(1 - t) * 12}px)` : undefined, transform: `translateY(${(1 - t) * 20}px)`}}>
        <StateView s={states[cur]} ms={ms} />
      </div>
     </div>
    </div>
  );
};
