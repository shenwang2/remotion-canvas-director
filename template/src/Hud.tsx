import {captionGeo} from './layout';
import React from 'react';
import {interpolate} from 'remotion';
import {GLYPH, T, iconTile, tint} from './theme';
import {Icon} from './Icon';
import {clamp, prog} from './anim';
import {Kicker} from './elements1';
import type {Program, Shot} from './types';

const pad2 = (n: number) => String(n).padStart(2, '0');
const CN = '一二三四五六';

// Where am I: agenda panel on presenter shots, compact chip elsewhere.
export const Hud: React.FC<{p: Program; shot: Shot; ms: number}> = ({p, shot, ms}) => {
  const {width: W, height: H} = p;
  const u = Math.min(W, H) / 1440;
  const top = H > W ? H * 0.06 : H * 0.045;
  const local = ms - shot.startMs;
  const fade = prog(local, 150, 450);
  const ch = shot.chapter;
  const mode = shot.type === 'presenter' ? shot.hud ?? (ch ? 'chapter' : 'none') : ch ? 'chapter' : 'none';
  if (mode === 'none' || p.agenda.length === 0) return null;
  if (mode === 'chapter' && ch && p.agenda[ch - 1]) {
    const a = p.agenda[ch - 1];
    return (
      <div style={{position: 'absolute', left: W * 0.03, top, display: 'flex', alignItems: 'center', gap: 18 * u, opacity: fade,
        padding: `${12 * u}px ${28 * u}px ${12 * u}px ${12 * u}px`, borderRadius: 44 * u, background: 'linear-gradient(180deg, rgba(40,44,54,0.55), rgba(20,22,28,0.45))', backdropFilter: 'blur(26px) saturate(170%)', border: '1.5px solid rgba(255,255,255,0.16)', boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.2), 0 20px 50px rgba(0,0,0,0.35)'}}>
        <div style={iconTile(T.accent, 56 * u)}>{a.icon ? <Icon name={a.icon} size={30 * u} color={GLYPH} /> : null}</div>
        <div style={{color: T.accent, fontFamily: T.font, fontWeight: 900, fontSize: 30 * u}}>{pad2(ch)}</div>
        <div>
          <Kicker text={a.en} size={15 * u} color={T.accent} />
          <div style={{color: T.text, fontFamily: T.font, fontWeight: 800, fontSize: 32 * u}}>{a.title}</div>
        </div>
      </div>
    );
  }
  const recap = mode === 'recap';
  const s = recap ? 1.45 : 1;
  const dur = shot.endMs - shot.startMs;
  return (
    <div style={{position: 'absolute', left: W * 0.03, top, opacity: fade, padding: `${24 * u * s}px ${32 * u * s}px`, borderRadius: 22 * u,
      background: 'linear-gradient(180deg, rgba(40,44,54,0.55), rgba(20,22,28,0.45))', backdropFilter: 'blur(26px) saturate(170%)', border: '1.5px solid rgba(255,255,255,0.16)', boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.2), 0 20px 50px rgba(0,0,0,0.35)', minWidth: 420 * u * s}}>
      <Kicker text={recap ? 'RECAP · 今天聊了' : `${p.agenda.length} THINGS · 今天聊${CN[p.agenda.length - 1]}件事`} size={17 * u * s} color={T.accent} />
      <div style={{color: T.text, fontFamily: T.font, fontWeight: 900, fontSize: 34 * u * s, margin: `${8 * u * s}px 0 ${14 * u * s}px`}}>{p.title}</div>
      {p.agenda.map((a, i) => {
        const appear = recap ? 1 : a.atMs != null ? prog(ms, a.atMs, 380) : prog(local, 300 + i * 260, 380);
        const done = recap ? local > 500 + (i * (dur - 1500)) / p.agenda.length : ch != null && i + 1 < ch;
        const active = !recap && ch === i + 1;
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 16 * u * s, height: 56 * u * s, opacity: appear}}>
            <div style={{...iconTile(done ? T.green : T.accent, 40 * u * s), ...(done || active ? {} : {background: 'rgba(255,255,255,0.08)', boxShadow: 'none'})}}>
              <Icon name={done ? 'Check' : a.icon ?? 'Circle'} size={22 * u * s} color={done || active ? GLYPH : T.faint} stroke={2.6} />
            </div>
            <div style={{color: active ? T.accent : done ? T.text : T.sub, fontFamily: T.font, fontWeight: 800, fontSize: 28 * u * s}}>{a.title}</div>
          </div>
        );
      })}
    </div>
  );
};

export const BigWords: React.FC<{p: Program; shot: Shot; ms: number}> = ({p, shot, ms}) => {
  if (shot.type !== 'presenter' || !shot.bigWord) return null;
  const {width: W, height: H} = p;
  const m = Math.min(W, H);
  const portrait = H > W;
  return (
    <>
      {shot.bigWord.map((b, i) => [b, i] as const).filter(([b]) => ms >= b.atMs && ms < b.endMs).map(([b, i]) => {
        const pin = interpolate(ms, [b.atMs, b.atMs + 380], [0, 1], clamp);
        const out = interpolate(ms, [b.endMs - 300, b.endMs], [1, 0], clamp);
        return (
          <div key={i} data-el={`${shot.id}#big${i}`} style={{position: 'absolute', left: W * (portrait ? 0.06 : 0.045), top: H * (portrait ? 0.5 : 0.38), width: W * (portrait ? 0.88 : 0.38), opacity: pin * out,
            transform: `scale(${1.25 - 0.25 * pin})`, transformOrigin: 'left center'}}>
            {b.sub ? (
              // The line under a big word often carries the practical answer (how, where), so it gets a dark pill to stay readable on footage.
              <div style={{display: 'inline-block', padding: `${m * 0.008}px ${m * 0.016}px`, borderRadius: m * 0.03, background: 'rgba(14,16,22,0.72)',
                backdropFilter: 'blur(16px)', color: T.accent, fontFamily: T.font, fontWeight: 800, fontSize: m * 0.026, letterSpacing: m * 0.002,
                marginBottom: m * 0.012}}>{b.sub}</div>
            ) : null}
            <div style={{color: '#fff', fontFamily: T.font, fontWeight: 900, fontSize: m * 0.117, lineHeight: 1.1, letterSpacing: -2,
              textShadow: '0 10px 50px rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.5)'}}>{b.text}</div>
          </div>
        );
      })}
    </>
  );
};

export const Captions: React.FC<{p: Program; ms: number}> = ({p, ms}) => {
  const c = p.captions.find((x) => ms >= x.startMs && ms < x.endMs);
  if (!c) return null;
  const {width: W, height: H} = p;
  const g = captionGeo(p);
  // one line, centred, on a rounded translucent black band (captionStyle; the edit desk changes it)
  return (
    <div data-cap={p.captions.indexOf(c)} style={{position: 'absolute', left: W * (H > W ? 0.04 : 0.15), width: W * (H > W ? 0.92 : 0.7), bottom: g.bottom, display: 'flex', justifyContent: 'center',
      pointerEvents: 'none'}}>
      <div style={{pointerEvents: 'auto', padding: `${g.padY}px ${g.padX}px`, borderRadius: (g.boxH / 2) * g.radius, background: g.bg ? `rgba(0,0,0,${g.opacity})` : undefined,
        color: '#fff', fontFamily: T.font, fontWeight: 800, fontSize: g.font, lineHeight: 1.3, textAlign: 'center',
        WebkitTextStroke: g.bg ? undefined : `${Math.min(W, H) * 0.0021}px rgba(0,0,0,0.85)`, paintOrder: 'stroke fill',
        textShadow: g.bg ? '0 2px 6px rgba(0,0,0,0.35)' : '0 3px 12px rgba(0,0,0,0.7)'}}>{c.text}</div>
    </div>
  );
};

// Channel mark, top-right on every shot: plain grey text, no panel, no icon.
export const BrandMark: React.FC<{p: Program}> = ({p}) => {
  if (!p.brand) return null;
  const {width: W, height: H} = p;
  const u = Math.min(W, H) / 1440;
  const text: React.CSSProperties = {color: T.sub, fontFamily: T.mono, fontWeight: 600, fontSize: 20 * u, letterSpacing: 2.4 * u,
    textShadow: '0 1px 6px rgba(0,0,0,0.55)', whiteSpace: 'nowrap'};
  return (
    <div style={{position: 'absolute', right: W * 0.03, top: H > W ? H * 0.035 : H * 0.055, display: 'flex', alignItems: 'center', gap: 14 * u}}>
      <div style={{...text, fontWeight: 800}}>{p.brand.name}</div>
      {(p.brand.meta ?? []).map((m, i) => (
        <React.Fragment key={i}>
          <div style={{width: 5 * u, height: 5 * u, borderRadius: 3 * u, background: T.sub}} />
          <div style={{...text, textTransform: 'uppercase'}}>{m}</div>
        </React.Fragment>
      ))}
    </div>
  );
};
