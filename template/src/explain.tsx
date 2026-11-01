import React from 'react';
import {interpolate} from 'remotion';
import {Icon} from './Icon';
import {A, springAt} from './apple';
import {TONE, surface, tint} from './theme';
import {Label} from './craft';
import {clamp} from './anim';
import {MediaView} from './Media';
import type {CanvasElement} from './types';

// Explainer scenes: show how an abstract process works when there is no footage of it.
// Built from glass surfaces, icons and motion only, in the same finish as the rest of the canvas.
// Landscape lays the parts side by side; portrait (`geo` from canvaslib/explainers.py) stacks them top to
// bottom with larger type, and the camera frames one part at a time.
// Like the roundtrip, they animate the thing itself (editing-logic.md B0b): the words that are picked out travel
// into the search, the line that is processed travels into the engine and comes out as the clip that lands on the
// timeline - each step does something visible to it, and the result shows.
type P = {el: CanvasElement; ms: number};
const box = (el: CanvasElement): React.CSSProperties => ({position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h});
const W90 = 'rgba(255,255,255,0.92)';
const W60 = 'rgba(255,255,255,0.6)';
const WARM = '#ffc979';
const glassBox = (r = 30): React.CSSProperties => ({...surface(false), borderRadius: r, boxSizing: 'border-box'});
const fadeUp = (s: number, dy = 20): React.CSSProperties => ({opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * dy}px)`, filter: s < 0.97 ? `blur(${(1 - s) * 8}px)` : undefined});
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// a landing: a quick give that settles (0 outside 0..dur)
const thud = (t: number, dur = 420, amt = 0.12) => (t < 0 || t > dur ? 0 : Math.sin((Math.PI * t) / dur) * (1 - t / dur) * amt);
// rough text width: CJK a full em, latin about 0.58 em
const textW = (s: string, fs: number) => [...s].reduce((w, ch) => w + (/[⺀-￿]/.test(ch) ? fs : fs * 0.58), 0);
// a point along a gentle arc from a to b (lifts by `lift` px at the middle)
const arc = (a: number[], b: number[], k: number, lift: number) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - Math.sin(Math.PI * k) * lift];

// ---------------------------------------------------------------- retrieval
// A script -> its keywords -> a search over a clip library -> the matching clips light up.
// Changing a keyword re-runs the search and a different set lights up.
type Tile = {icon: string; label: string; tone?: string; media?: any};  // media: a real frame/clip from the user's material
type Query = {at: number; chips: string[]; hits: number[]; changed?: number};
type RetrieveGeo = {u: number; sh: number; barY: number; barH: number; libY: number; tileH: number; cols: number; outY: number};
export const Retrieve: React.FC<P> = ({el, ms}) => {
  const {script, keywords = [], library, queries, outcome, geo} = el.props as {
    script: {at: number; title: string; lines: string[]}; keywords: {at: number; word: string}[];
    library: {at: number; tiles: Tile[]; cols?: number}; queries: Query[]; outcome?: {at: number; text: string}; geo?: RetrieveGeo};
  const v = !!geo;
  const u = geo?.u ?? 1;
  const sIn = springAt(ms, script.at);
  const lIn = springAt(ms, library.at);
  const cols = geo?.cols ?? library.cols ?? 4;
  const rows = Math.ceil(library.tiles.length / cols);
  const gap = 26;
  // where each part sits
  const S = v ? {x: 0, y: 0, w: el.w, h: geo!.sh} : {x: 0, y: 120, w: 760, h: undefined as number | undefined};
  const B = v ? {x: 0, y: geo!.barY, w: el.w, h: geo!.barH} : {x: 900, y: 0, w: el.w - 900, h: 110};
  const LX = v ? 0 : 900, LY = v ? geo!.libY : 170, LW = v ? el.w : el.w - 900;
  const tw = (LW - gap * (cols - 1)) / cols;
  const th = v ? geo!.tileH : Math.min(230, (el.h - LY - gap * (rows - 1)) / rows);
  const arrow = v ? `M${el.w / 2},${S.y + geo!.sh + 6} L${el.w / 2},${B.y - 8}` : `M760,${330} C820,${330} 840,55 ${LX - 10},55`;
  let qi = -1;
  queries.forEach((q, i) => { if (ms >= q.at) qi = i; });
  const q = qi >= 0 ? queries[qi] : null;
  const scanStart = q ? q.at + 700 : Infinity;
  const scanP = q ? interpolate(ms, [scanStart, scanStart + 1300], [0, 1], clamp) : 0;
  // the scan reaches each row in turn; a row reacts the moment it is passed
  const passAt = (r: number) => scanStart + (1300 * (r + 0.5)) / rows;
  const kwOn = (w: string) => keywords.find((k) => k.word === w && ms >= k.at);

  // where each keyword sits in the script (lines wrap at the card's width), so it can fly out from there
  const fs = 32 * u, lh = fs * 1.7;
  const textLeft = S.x + 44 * u, textTop = S.y + 40 * u + 24 * u * 1.25 + 10 + 40 * u * 1.3 + 22 * u;
  const perLine = Math.max(4, Math.floor((S.w - 88 * u) / fs));
  const kwPos: Record<string, number[]> = {};
  let rowBase = 0;
  script.lines.forEach((ln) => {
    let c = 0;
    for (const part of ln.split(/(\[[^\]]+\])/).filter(Boolean)) {
      const word = part.startsWith('[') ? part.slice(1, -1) : part;
      if (part.startsWith('[') && !kwPos[word]) {
        const mid = c + word.length / 2;
        kwPos[word] = [textLeft + (mid % perLine) * fs, textTop + (rowBase + Math.floor(c / perLine)) * lh + lh / 2];
      }
      c += word.length;
    }
    rowBase += Math.max(1, Math.ceil(c / perLine));
  });

  // the chips sit at known places in the bar, so the words can land on them
  const chipFs = 30 * u, chipH = chipFs * 1.3 + 24 * u;
  const chipX0 = B.x + 30 * u + 44 * u + 16 * u, chipY = B.y + B.h / 2;
  const chipsAt = (chips: string[], typed?: {i: number; n: number}) => {
    let x = chipX0;
    return chips.map((c, i) => {
      const text = typed && typed.i === i ? c.slice(0, typed.n) : c;
      const w = textW(text, chipFs) + 48 * u + (typed && typed.i === i ? 14 * u : 0);
      const r = {x, w, text};
      x += textW(c, chipFs) + 48 * u + 16 * u;
      return r;
    });
  };
  const q0 = queries[0];

  return (
    <div style={box(el)}>
      {/* the script, keywords marked as they are picked out */}
      <div style={{position: 'absolute', left: S.x, top: S.y, width: S.w, height: S.h, ...glassBox(), padding: `${40 * u}px ${44 * u}px`, ...fadeUp(sIn)}}>
        <div style={{fontFamily: A.font, fontSize: 24 * u, fontWeight: 600, letterSpacing: 4, color: W60, lineHeight: 1.25}}>SCRIPT · 文案</div>
        <div style={{fontFamily: A.font, fontSize: 40 * u, fontWeight: 700, color: W90, marginTop: 10, lineHeight: 1.3}}>{script.title}</div>
        <div style={{marginTop: 22 * u, fontFamily: A.font, fontSize: fs, lineHeight: 1.7, color: 'rgba(255,255,255,0.78)'}}>
          {script.lines.map((ln, i) => (
            <div key={i}>{ln.split(/(\[[^\]]+\])/).filter(Boolean).map((t, k) => {
              if (!t.startsWith('[')) return <span key={k}>{t}</span>;
              const w = t.slice(1, -1);
              const on = kwOn(w);
              const sp = on ? springAt(ms, on.at, 20, 160) : 0;
              return <span key={k} style={{position: 'relative', color: sp > 0.5 ? '#1a1206' : undefined, fontWeight: sp > 0.5 ? 700 : undefined}}>
                <span style={{position: 'absolute', left: -4, right: -4, top: '8%', bottom: '4%', borderRadius: 8, background: WARM, transform: `scaleX(${sp})`, transformOrigin: 'left', zIndex: -1}} />
                <span style={{position: 'relative'}}>{w}</span></span>;
            })}</div>
          ))}
        </div>
      </div>
      {/* the search bar: the keywords become the query */}
      <div style={{position: 'absolute', left: B.x, top: B.y, width: B.w, height: B.h, ...glassBox(B.h / 2), overflow: 'hidden', ...fadeUp(lIn)}}>
        <div style={{position: 'absolute', left: 30 * u, top: (B.h - 44 * u) / 2, display: 'flex'}}><Icon name="Search" size={44 * u} color={W60} stroke={2.2} /></div>
      </div>
      {q ? (() => {
        // a changed keyword: the old chip is knocked out, the new one is typed in
        const typing = q.changed != null && qi > 0;
        const n = typing ? Math.max(0, Math.floor((ms - q.at) / 70)) : 0;
        const pos = chipsAt(q.chips, typing ? {i: q.changed!, n} : undefined);
        const old = qi > 0 ? chipsAt(queries[qi - 1].chips) : null;
        return <>
          {q.chips.map((c, i) => {
            const isNew = typing && q.changed === i;
            const landAt = qi === 0 ? q.at + i * 140 : q.at;
            const s = qi === 0 ? springAt(ms, landAt, 14, 170) : 1;
            if (s <= 0) return null;
            const land = qi === 0 ? thud(ms - landAt, 380, 0.14) : 0;
            const caret = isNew && pos[i].text.length < c.length + 1 && Math.floor(ms / 400) % 2 === 0;
            return <div key={`${qi}-${i}`} style={{position: 'absolute', left: pos[i].x, top: chipY - chipH / 2, width: pos[i].w, height: chipH, borderRadius: 999,
              background: isNew ? tint(WARM, 0.32) : 'rgba(255,255,255,0.14)', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.3)${isNew ? `, 0 0 0 2px ${tint(WARM, 0.8)}` : ''}`, fontFamily: A.font, fontSize: chipFs, fontWeight: 600, color: W90,
              whiteSpace: 'nowrap', opacity: Math.min(1, s * 1.6), transform: `scale(${(0.7 + 0.3 * s) * (1 + land)}, ${(0.7 + 0.3 * s) * (1 - land)})`}}>
              {pos[i].text}{isNew && pos[i].text.length < c.length ? <span style={{opacity: caret ? 1 : 0, marginLeft: 2}}>|</span> : null}
            </div>;
          })}
          {/* the chip that was replaced drops out of the bar */}
          {typing && old ? (() => {
            const t = (ms - (q.at - 380)) / 600;
            if (t < 0 || t > 1) return null;
            const o = old[q.changed!];
            return <div style={{position: 'absolute', left: o.x, top: chipY - chipH / 2, width: o.w, height: chipH, borderRadius: 999, background: 'rgba(255,255,255,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: A.font, fontSize: chipFs, fontWeight: 600, color: W90, whiteSpace: 'nowrap',
              opacity: 1 - t, transform: `translate(${-40 * t}px, ${-60 * Math.sin(Math.PI * Math.min(t, 0.5)) + 260 * t * t}px) rotate(${-24 * t}deg)`}}>{queries[qi - 1].chips[q.changed!]}</div>;
          })() : null}
        </>;
      })() : null}
      {/* the picked-out words fly from the script into the search bar, where they become the query */}
      {q0 ? keywords.slice(0, q0.chips.length).map((k, i) => {
        const land = q0.at + i * 140, start = land - 650;
        if (ms < start || ms >= land + 60 || !kwPos[k.word]) return null;
        const pos = chipsAt(q0.chips)[i];
        const kk = easeInOut(Math.min(1, (ms - start) / 650));
        const [x, y] = arc(kwPos[k.word], [pos.x + pos.w / 2, chipY], kk, 120 * u);
        const w = textW(k.word, fs) + 24 * u;
        return <div key={`kw${i}`} style={{position: 'absolute', left: x - w / 2, top: y - fs * 0.75, width: w, height: fs * 1.5, borderRadius: 10, background: WARM,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: A.font, fontSize: fs, fontWeight: 700, color: '#1a1206',
          boxShadow: `0 12px 30px rgba(0,0,0,0.45), 0 0 24px ${tint(WARM, 0.5)}`, transform: `rotate(${Math.sin(Math.PI * kk) * -6}deg) scale(${1 + 0.12 * Math.sin(Math.PI * kk)})`,
          opacity: ms > land ? 1 - (ms - land) / 60 : 1}}>{k.word}</div>;
      }) : null}
      {/* arrow from script to search */}
      <svg style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}} width={el.w} height={el.h}>
        {q ? <path d={arrow} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={3} strokeDasharray="8 12" opacity={springAt(ms, q.at - 300)} /> : null}
      </svg>
      {/* the clip library: each row reacts as the scan passes it - a match pops, rings and is ticked, the rest go dim */}
      {library.tiles.map((t, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const x = LX + c * (tw + gap), y = LY + r * (th + gap);
        const s = springAt(ms, library.at + i * 45, 18, 140);
        const passed = q != null && ms >= passAt(r);
        const hit = passed && q!.hits.includes(i);
        const hp = hit ? springAt(ms, passAt(r), 12, 170) : 0;
        const pop = hit ? thud(ms - passAt(r), 360, 0.14) : 0;
        const dim = q && !hit ? interpolate(ms, [passAt(r), passAt(r) + 250], [1, 0.38], clamp) : 1;
        const ring = hit ? (ms - passAt(r)) / 500 : 2;
        const tone = TONE[t.tone ?? 'cyan'];
        return (
          <div key={i} style={{position: 'absolute', left: x, top: y, width: tw, height: th, opacity: Math.min(1, s * 1.4) * dim,
            transform: `scale(${(0.9 + 0.1 * s) * (1 + 0.06 * hp + pop)}) translateY(${-14 * hp}px)`}}>
            {ring >= 0 && ring < 1 ? <div style={{position: 'absolute', inset: -18 * ring, borderRadius: 24 + 18 * ring, border: `3px solid ${tint(WARM, 0.9 * (1 - ring))}`}} /> : null}
            <div style={{position: 'absolute', inset: 0, borderRadius: 24, overflow: 'hidden',
              background: `linear-gradient(150deg, ${tint(tone, 0.42)}, ${tint(tone, 0.12)})`,
              boxShadow: hit ? `0 0 0 3px ${WARM}, 0 18px 40px rgba(0,0,0,0.45), 0 0 34px ${tint(WARM, 0.45)}` : 'inset 0 1.5px 0 rgba(255,255,255,0.3), inset 0 0 0 1px rgba(255,255,255,0.14)'}}>
              {t.media ? <div style={{position: 'absolute', inset: 0}}><MediaView media={t.media} /><div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)'}} /></div>
                : <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}><Icon name={t.icon} size={th * 0.38} color="rgba(255,255,255,0.88)" stroke={1.6} /></div>}
              <div style={{position: 'absolute', left: 16, bottom: 12, fontFamily: A.font, fontSize: 24 * u, fontWeight: 600, color: W90}}>{t.label}</div>
              <div style={{position: 'absolute', right: 12, top: 12, padding: '3px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.35)', fontFamily: A.font, fontSize: 20 * u, color: W90}}>0:0{3 + (i % 5)}</div>
            </div>
            {/* picked */}
            {hp > 0 ? <div style={{position: 'absolute', left: 12, top: 12, width: 40 * u, height: 40 * u, borderRadius: 20 * u, background: WARM, display: 'flex',
              alignItems: 'center', justifyContent: 'center', transform: `scale(${springAt(ms, passAt(r) + 120, 12, 200)})`, boxShadow: '0 4px 12px rgba(0,0,0,0.35)'}}>
              <Icon name="Check" size={26 * u} color="#1a1206" stroke={3.2} /></div> : null}
          </div>
        );
      })}
      {/* scanning beam over the library: across in landscape, down the column in portrait */}
      {scanP > 0 && scanP < 1 ? (v
        ? <div style={{position: 'absolute', left: LX - 10, top: LY + scanP * rows * (th + gap) - 60, width: LW + 20, height: 120,
            background: `linear-gradient(180deg, transparent, ${tint(TONE.cyan, 0.45)}, transparent)`, filter: 'blur(6px)'}} />
        : <div style={{position: 'absolute', left: LX + scanP * LW - 60, top: LY - 10, width: 120, height: rows * (th + gap),
            background: `linear-gradient(90deg, transparent, ${tint(TONE.cyan, 0.45)}, transparent)`, filter: 'blur(6px)'}} />
      ) : null}
      {outcome ? (() => {
        const s = springAt(ms, outcome.at);
        return s > 0 ? <div style={{position: 'absolute', left: 0, top: v ? geo!.outY : 820, width: v ? el.w : undefined, display: 'flex', justifyContent: v ? 'center' : undefined,
          ...fadeUp(s)}}><Label text={outcome.text} color={WARM} icon="Compass" size={38 * u} /></div> : null;
      })() : null}
    </div>
  );
};

// ---------------------------------------------------------------- pipeline
// Each line leaves the script, goes into the engine, and comes out as the clip that lands on the timeline in its
// slot; when all are placed a playhead runs over the timeline - they play in step with the lines.
type Item = {at: number; line: string; clip: {icon: string; label: string; tone?: string; media?: any}};
type PipelineGeo = {u: number; ih: number; er: number; ecy: number; outY: number; outcomeY: number};
const IN_T = 650, CHEW = 200, OUT_T = 520;  // into the engine, in it, out to the timeline (ms)
export const Pipeline: React.FC<P> = ({el, ms}) => {
  const {input, engine, output, items, outcome, geo} = el.props as {
    input: {at: number; title: string}; engine: {at: number; title: string; icon: string}; output: {at: number; title: string};
    items: Item[]; outcome?: {at: number; text: string}; geo?: PipelineGeo};
  const v = !!geo;
  const u = geo?.u ?? 1;
  const sIn = springAt(ms, input.at), eIn = springAt(ms, engine.at), oIn = springAt(ms, output.at);
  const ER = geo?.er ?? 150;
  // where each part sits: side by side in landscape, stacked in portrait
  const IN = v ? {x: 0, y: 0, w: el.w} : {x: 0, y: 120, w: 660};
  const ecx = v ? el.w / 2 : 860 + ER, ecy = v ? geo!.ecy : el.h / 2 - 40;
  const OUT = v ? {x: 0, y: geo!.outY, w: el.w} : {x: 1200, y: 150, w: el.w - 1200};
  const inEnd = v ? [el.w / 2, geo!.ih] : [IN.w, ecy];
  const enIn = v ? [ecx, ecy - ER] : [ecx - ER, ecy];
  const enOut = v ? [ecx, ecy + ER] : [ecx + ER, ecy];
  const outStart = v ? [el.w / 2, OUT.y] : [OUT.x, ecy];
  const busy = items.some((it) => ms >= it.at + IN_T - 100 && ms < it.at + IN_T + CHEW + 300);
  const spin = (ms / 1000) * (busy ? 260 : 40);
  const chew = Math.max(0, ...items.map((it) => thud(ms - (it.at + IN_T), 380, 0.1)));
  // track width minus padding, the 130px track label, the gap after it, the inner padding and the gaps between slots
  const slotW = (OUT.w - 80 * u - 130 * u - 16 - 24 - 24 * (items.length - 1)) / items.length;
  const slotH = 170 * u - 24;
  // the rows of the script and the slots on the timeline, so things can travel between them
  const rowH = 42 * u + 32 * u, rowGap = 22 * u;
  const rowC = (i: number) => [IN.x + IN.w / 2, IN.y + 36 * u + 24 * u * 1.25 + rowGap + i * (rowH + rowGap) + rowH / 2];
  const trackX = OUT.x + 40 * u + 130 * u + 16 + 12;
  const slotTop = OUT.y + 34 * u + 24 * u * 1.25 + 26 * u + 70 * u + 20 * u + 12;
  const slotC = (i: number) => [trackX + i * (slotW + 24) + slotW / 2, slotTop + slotH / 2];
  const last = items.length ? Math.max(...items.map((it) => it.at)) + IN_T + CHEW + OUT_T : 0;
  const ph = interpolate(ms, [last + 700, last + 2300], [0, 1], clamp);  // the playhead once everything is placed
  const lineTokenW = (s: string) => Math.min(IN.w - 80 * u, textW(s, 30 * u) + 70 * u);
  return (
    <div style={box(el)}>
      {/* input: the script, one line per item */}
      <div style={{position: 'absolute', left: IN.x, top: IN.y, width: IN.w, height: v ? geo!.ih : undefined, ...glassBox(), padding: `${36 * u}px ${40 * u}px`, ...fadeUp(sIn)}}>
        <div style={{fontFamily: A.font, fontSize: 24 * u, fontWeight: 600, letterSpacing: 4, color: W60, lineHeight: 1.25}}>{input.title}</div>
        {items.map((it, i) => {
          const gone = ms >= it.at;            // the line has left for the engine
          const done = ms >= it.at + IN_T;     // and has been taken in
          return <div key={i} style={{display: 'flex', alignItems: 'center', gap: 18 * u, marginTop: rowGap, padding: `${16 * u}px ${20 * u}px`, borderRadius: 18,
            height: rowH, boxSizing: 'border-box', background: gone && !done ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
            boxShadow: gone && !done ? `inset 0 0 0 2px ${tint(WARM, 0.35)}` : 'none',
            fontFamily: A.font, fontSize: 32 * u, fontWeight: 600, color: done ? W60 : W90}}>
            <div style={{width: 42 * u, height: 42 * u, borderRadius: 21 * u, background: done ? tint(WARM, 0.3) : 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 24 * u, color: W90, flexShrink: 0, transform: `scale(${1 + thud(ms - it.at - IN_T, 360, 0.25)})`}}>
              {done ? <Icon name="Check" size={24 * u} color={WARM} stroke={3} /> : i + 1}</div>
            <span style={{opacity: gone && !done ? 0.25 : 1}}>{it.line}</span>
          </div>;
        })}
      </div>
      {/* engine: it takes each line in with a bite */}
      <div style={{position: 'absolute', left: ecx - ER, top: ecy - ER, width: ER * 2, height: ER * 2, ...fadeUp(eIn)}}>
        <div style={{position: 'absolute', inset: 0, transform: `scale(${1 + chew}, ${1 - chew * 0.6})`}}>
          <svg width={ER * 2} height={ER * 2} style={{position: 'absolute', overflow: 'visible'}}>
            <circle cx={ER} cy={ER} r={ER - 6} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={4} />
            <circle cx={ER} cy={ER} r={ER - 6} fill="none" stroke={WARM} strokeWidth={busy ? 6 : 4} strokeLinecap="round" strokeDasharray={`${ER * 1.6} ${ER * 10}`}
              transform={`rotate(${spin} ${ER} ${ER})`} style={{filter: busy ? `drop-shadow(0 0 10px ${WARM})` : undefined}} />
          </svg>
          <div style={{position: 'absolute', inset: 22, borderRadius: 999, ...surface(false), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: busy ? `0 0 0 2px ${tint(WARM, 0.5)}, 0 0 40px ${tint(WARM, 0.35)}` : undefined}}>
            <Icon name={engine.icon} size={78 * u} color={W90} stroke={1.7} />
            <div style={{fontFamily: A.font, fontSize: 30 * u, fontWeight: 700, color: W90, whiteSpace: 'nowrap'}}>{engine.title}</div>
          </div>
        </div>
      </div>
      {/* connectors */}
      <svg style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}} width={el.w} height={el.h}>
        <path d={`M${inEnd[0]},${inEnd[1]} L${enIn[0]},${enIn[1]}`} stroke="rgba(255,255,255,0.3)" strokeWidth={3} strokeDasharray="8 12" opacity={eIn} />
        <path d={`M${enOut[0]},${enOut[1]} L${outStart[0]},${outStart[1]}`} stroke="rgba(255,255,255,0.3)" strokeWidth={3} strokeDasharray="8 12" opacity={oIn} />
      </svg>
      {/* output: the edit timeline - a voice track and a picture-in-picture track */}
      <div style={{position: 'absolute', left: OUT.x, top: OUT.y, width: OUT.w, ...glassBox(), padding: `${34 * u}px ${40 * u}px ${40 * u}px`, ...fadeUp(oIn)}}>
        <div style={{fontFamily: A.font, fontSize: 24 * u, fontWeight: 600, letterSpacing: 4, color: W60, lineHeight: 1.25}}>{output.title}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 16, marginTop: 26 * u}}>
          <div style={{width: 130 * u, fontFamily: A.font, fontSize: 28 * u, color: W60, whiteSpace: 'nowrap'}}>口播</div>
          <div style={{flex: 1, height: 70 * u, borderRadius: 14, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', overflow: 'hidden'}}>
            {Array.from({length: 54}).map((_, k) => <div key={k} style={{width: 7, flexShrink: 0, borderRadius: 4,
              background: ph > 0 && k / 54 < ph ? WARM : 'rgba(255,255,255,0.45)', height: (14 + 40 * Math.abs(Math.sin(k * 1.7) * Math.cos(k * 0.6))) * u}} />)}
          </div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 16, marginTop: 20 * u}}>
          <div style={{width: 130 * u, fontFamily: A.font, fontSize: 28 * u, color: W60, whiteSpace: 'nowrap'}}>画中画</div>
          <div style={{flex: 1, height: 170 * u, borderRadius: 14, background: 'rgba(255,255,255,0.05)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.1)', display: 'flex', gap: 24, padding: 12,
            position: 'relative'}}>
            {items.map((it, i) => {
              const landAt = it.at + IN_T + CHEW + OUT_T;
              const on = ms >= landAt;
              const tone = TONE[it.clip.tone ?? 'cyan'];
              const land = thud(ms - landAt, 380, 0.12);
              const lit = ph > 0 && ph >= (i + 0.5) / items.length;
              return <div key={i} style={{width: slotW, borderRadius: 12, position: 'relative', overflow: 'hidden', border: on ? 'none' : '2px dashed rgba(255,255,255,0.18)',
                background: on ? `linear-gradient(150deg, ${tint(tone, 0.5)}, ${tint(tone, 0.18)})` : 'transparent',
                transform: on ? `scale(${1 + land}, ${1 - land})` : undefined, transformOrigin: '50% 100%',
                boxShadow: on ? `inset 0 1.5px 0 rgba(255,255,255,0.35)${lit ? `, 0 0 0 3px ${WARM}, 0 0 26px ${tint(WARM, 0.45)}` : ''}` : 'none'}}>
                {on ? <>
                  {it.clip.media ? <div style={{position: 'absolute', inset: 0}}><MediaView media={it.clip.media} /></div>
                    : <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}><Icon name={it.clip.icon} size={58 * u} color={W90} stroke={1.6} /></div>}
                  <div style={{position: 'absolute', left: 12, bottom: 8, fontFamily: A.font, fontSize: 22 * u, fontWeight: 600, color: W90}}>{it.clip.label}</div>
                </> : null}
              </div>;
            })}
            {/* the playhead runs over both tracks once everything is in place */}
            {ph > 0 && ph < 1 ? <div style={{position: 'absolute', left: 12 + ph * (slotW * items.length + 24 * (items.length - 1)), top: -(70 * u + 20 * u + 8), bottom: -8, width: 4,
              borderRadius: 2, background: WARM, boxShadow: `0 0 14px ${WARM}`}} /> : null}
          </div>
        </div>
      </div>
      {/* the travelling things: the line on its way into the engine, then the clip on its way to its slot */}
      {items.map((it, i) => {
        const t = ms - it.at;
        if (t < 0 || t > IN_T + CHEW + OUT_T) return null;
        if (t < IN_T) {
          const k = easeInOut(t / IN_T);
          const from = rowC(i);
          // out of its row and down the connector, shrinking as it goes in
          const [x, y] = k < 0.45 ? arc(from, inEnd, k / 0.45, 0) : arc(inEnd, enIn, (k - 0.45) / 0.55, 0);
          const s = 1 - 0.65 * k;
          const w = lineTokenW(it.line);
          return <div key={`l${i}`} style={{position: 'absolute', left: x - w / 2, top: y - rowH / 2, width: w, height: rowH, borderRadius: 18, background: tint(WARM, 0.9),
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: A.font, fontSize: 30 * u, fontWeight: 700, color: '#1a1206', whiteSpace: 'nowrap', overflow: 'hidden',
            boxShadow: `0 14px 30px rgba(0,0,0,0.45), 0 0 24px ${tint(WARM, 0.45)}`, transform: `scale(${s})`, opacity: k > 0.92 ? (1 - k) / 0.08 : 1}}>{it.line}</div>;
        }
        if (t < IN_T + CHEW) return null;  // being worked on inside
        const k = easeInOut((t - IN_T - CHEW) / OUT_T);
        const [x, y] = k < 0.4 ? arc(enOut, outStart, k / 0.4, 0) : arc(outStart, slotC(i), (k - 0.4) / 0.6, 60 * u);
        const s = 0.35 + 0.65 * k;
        const tone = TONE[it.clip.tone ?? 'cyan'];
        return <div key={`c${i}`} style={{position: 'absolute', left: x - slotW / 2, top: y - slotH / 2, width: slotW, height: slotH, borderRadius: 12, overflow: 'hidden',
          background: `linear-gradient(150deg, ${tint(tone, 0.6)}, ${tint(tone, 0.25)})`, boxShadow: '0 18px 36px rgba(0,0,0,0.5), inset 0 1.5px 0 rgba(255,255,255,0.35)',
          transform: `scale(${s}) rotate(${(1 - k) * 8}deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <Icon name={it.clip.icon} size={58 * u} color={W90} stroke={1.6} /></div>;
      })}
      {outcome ? (() => {
        const s = springAt(ms, outcome.at);
        return s > 0 ? <div style={{position: 'absolute', left: v ? 0 : OUT.x, top: v ? geo!.outcomeY : 720, width: v ? el.w : undefined, display: 'flex',
          justifyContent: v ? 'center' : undefined, ...fadeUp(s)}}><Label text={outcome.text} color={TONE.green} icon="CircleCheck" size={38 * u} /></div> : null;
      })() : null}
    </div>
  );
};
