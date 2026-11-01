import React from 'react';
import {interpolate} from 'remotion';
import {Icon} from './Icon';
import {A, springAt} from './apple';
import {GLYPH, T, TONE, iconTile, surface, tint} from './theme';
import {Label} from './craft';
import {clamp} from './anim';
import {MediaView} from './Media';
import type {CanvasElement} from './types';

// Explainer: the cost of a long cycle for a small change. The small thing itself (a real frame of it) leaves
// its card and rides the whole loop: it docks at each station as that station is spoken, and the station does
// its job to it (scribbled on, re-rendered top to bottom, left waiting), while meters in the middle show what every
// pass costs (credits dropping out, waiting time counting up). An optional shortcut shows the new way: another copy
// goes straight across on a green line and the loop dims.
// The motion belongs to the thing, not to decoration: it travels with a short trail, leans into the turn, and the
// station gives a little under it when it lands.
// Portrait (`vertical`): the trigger sits above the loop; landscape: side by side.
type P = {el: CanvasElement; ms: number};
type Act = 'edit' | 'render' | 'wait';
type Step = {at: number; icon: string; label: string; progress?: boolean; act?: Act};
type Meter = {at: number; icon: string; label: string; kind: 'drain' | 'count'; note?: string};
type Pose = {x: number; y: number; w: number; h: number; trav: number; moving: boolean; dock: number};

const W90 = 'rgba(255,255,255,0.92)';
const W60 = 'rgba(255,255,255,0.6)';
const WARM = '#ffc979';
const glassBox = (r = 30): React.CSSProperties => ({...surface(false), borderRadius: r, boxSizing: 'border-box'});
const fadeUp = (s: number, dy = 20): React.CSSProperties => ({opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * dy}px)`,
  filter: s < 0.97 ? `blur(${(1 - s) * 8}px)` : undefined});
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// a landing: a quick give that settles (0 outside 0..dur)
const thud = (t: number, dur = 450, amt = 0.14) => (t < 0 || t > dur ? 0 : Math.sin((Math.PI * t) / dur) * (1 - t / dur) * amt);
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const Roundtrip: React.FC<P> = ({el, ms}) => {
  const {trigger, steps, meters = [], outcome, shortcut, vertical} = el.props as {
    trigger: {at: number; kicker?: string; title: string; sub?: string; media?: any}; steps: Step[]; meters?: Meter[];
    outcome?: {at: number; text: string}; shortcut?: {at: number; icon: string; label: string; sub?: string}; vertical?: boolean};
  const u = vertical ? 1.22 : 1;  // portrait frames the ring alone: set it larger
  const R = vertical ? 340 : 300, TH = 250;
  const TW = vertical ? el.w : 760;
  const tTop = vertical ? 0 : el.h / 2 - TH / 2;
  const cx = vertical ? el.w / 2 : TW + 140 + R + 150;
  const cy = vertical ? TH + 120 + R + 70 : el.h / 2;
  const n = steps.length;
  // An even number of stations sits on the diagonals (top-right first), so the middle of the ring stays free
  // for the cost meters; an odd number starts at the top.
  const a0 = -Math.PI / 2 + (n % 2 === 0 ? Math.PI / n : 0);
  const ang = (i: number) => a0 + (2 * Math.PI * i) / n;
  const pt = (a: number, r = R): [number, number] => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const endAt = outcome ? outcome.at : steps[n - 1].at + 1600;
  const pw = 330 * u, ph = 96 * u;
  const act = (s: Step): Act | undefined => s.act ?? (s.progress ? 'render' : undefined);

  // ---- the travelling thing: where it is at any moment
  const mH0 = TH - 24, mW0 = (mH0 * 16) / 9;                       // its frame inside the trigger card
  const home: [number, number] = [12 + mW0 / 2, tTop + 12 + mH0 / 2];
  const mw = 210 * u, mh = (mw * 9) / 16;
  // it docks on the outside of each station (above the top ones, below the bottom ones), clear of the meters
  const dock = (i: number): [number, number] => {
    const [x, y] = pt(ang(i % n));
    const below = y > cy + 1;
    const extra = below && steps[i % n].progress ? 14 * u + 18 : 0;  // the progress bar hangs under a bottom station
    return [x, y + (below ? 1 : -1) * (ph / 2 + mh / 2 - 12 * u + extra)];
  };
  // it lands on a station as that station is spoken - the first one a little later if the trigger has only just come in
  const arrive = steps.map((s, i) => (i === 0 ? Math.max(s.at, trigger.at + 900) : s.at));
  const travel = (i: number) => (i === 0 ? Math.min(800, arrive[0] - trigger.at - 250) : Math.min(750, (arrive[i] - arrive[i - 1]) * 0.6));
  const along = (i: number, k: number): [number, number] => {  // from station i to i+1 along the ring, easing out of the docks
    const [rx, ry] = pt(ang(i) + ((2 * Math.PI) / n) * k);
    const [d0x, d0y] = dock(i), [d1x, d1y] = dock(i + 1);
    const [r0x, r0y] = pt(ang(i)), [r1x, r1y] = pt(ang(i + 1));
    return [rx + (1 - k) * (d0x - r0x) + k * (d1x - r1x), ry + (1 - k) * (d0y - r0y) + k * (d1y - r1y)];
  };
  const pose = (t: number): Pose | null => {
    const e0 = arrive[0] - travel(0);
    if (t < e0) return null;
    if (t < arrive[0]) {  // out of the trigger card, down into the first station
      const k = easeInOut((t - e0) / travel(0));
      const [dx, dy] = dock(0);
      const c1 = vertical ? [home[0], home[1] + 260] : [home[0] + 320, home[1]];
      const c2 = vertical ? [dx, dy - 240] : [dx - 280, dy - 80];
      const b = (p0: number, p1: number, p2: number, p3: number) =>
        (1 - k) ** 3 * p0 + 3 * (1 - k) ** 2 * k * p1 + 3 * (1 - k) * k * k * p2 + k ** 3 * p3;
      return {x: b(home[0], c1[0], c2[0], dx), y: b(home[1], c1[1], c2[1], dy), w: mW0 + (mw - mW0) * k, h: mH0 + (mh - mH0) * k,
        trav: 0, moving: true, dock: -1};
    }
    const st = (2 * Math.PI) / n;
    for (let i = 0; i < n; i++) {
      const leave = i + 1 < n ? arrive[i + 1] - travel(i + 1) : endAt;
      const next = i + 1 < n ? arrive[i + 1] : endAt + 900;
      if (t < leave) {
        const [x, y] = dock(i);
        return {x, y, w: mw, h: mh, trav: st * i, moving: false, dock: i};
      }
      if (t < next) {
        const k = easeInOut((t - leave) / (next - leave));
        const [x, y] = along(i, k);
        return {x, y, w: mw, h: mh, trav: st * (i + k), moving: true, dock: -1};
      }
    }
    const [x, y] = dock(0);  // round once: back where it started
    return {x, y, w: mw, h: mh, trav: 2 * Math.PI, moving: false, dock: n};
  };
  const now = pose(ms);
  const prev = pose(ms - 40);

  const tIn = springAt(ms, trigger.at);
  const ringIn = springAt(ms, steps[0].at - 300);
  const sc = shortcut ? springAt(ms, shortcut.at, 18, 120) : 0;
  const loopDim = 1 - 0.6 * sc;
  const circ = 2 * Math.PI * R;
  const [tx, ty] = vertical ? [el.w / 2, TH] : [TW, el.h / 2];
  const [ex, ey] = pt(ang(0));
  const scA = vertical ? [tx, ty + 10] : [tx + 10, ty], scB = vertical ? [cx, cy - 70 * u] : [cx - 230, cy];

  // the frame of the small thing, with what the station it sits at is doing to it
  const frame = (p: Pose, key: string | number, o: {rot?: number; sq?: number; ghost?: number; rim?: string} = {}) => {
    if (o.ghost != null) {
      return <div key={key} style={{position: 'absolute', left: p.x - p.w / 2, top: p.y - p.h / 2, width: p.w, height: p.h, borderRadius: 14 * u,
        background: 'rgba(255,255,255,0.5)', opacity: o.ghost, filter: 'blur(3px)'}} />;
    }
    const s = p.dock >= 0 && p.dock < n ? steps[p.dock] : null;
    const a = s ? act(s) : undefined;
    const t = s ? ms - s.at : 0;
    const scan = a === 'render' ? (t % 1500) / 1500 : 0;
    const scribble = a === 'edit' ? interpolate(t, [150, 750], [0, 1], clamp) : 0;
    const sq = o.sq ?? 0;
    const body = (style?: React.CSSProperties) => (trigger.media ? <MediaView media={trigger.media} style={style} />
      : <div style={{width: '100%', height: '100%', background: tint(TONE.cyan, 0.4), ...style}} />);
    return (
      <div key={key} style={{position: 'absolute', left: p.x - p.w / 2, top: p.y - p.h / 2, width: p.w, height: p.h, borderRadius: 14 * u, overflow: 'hidden',
        transform: `rotate(${o.rot ?? 0}deg) scale(${1 + sq * 0.6}, ${1 - sq * 0.6})`, transformOrigin: '50% 100%',
        boxShadow: `0 0 0 3px ${o.rim ?? 'rgba(255,255,255,0.92)'}, 0 16px 34px rgba(0,0,0,0.5)`}}>
        {a === 'render' ? <>
          {/* the whole thing again: the old frame greys out, the new one fills in from the top */}
          <div style={{position: 'absolute', inset: 0}}>{body({filter: 'grayscale(1) brightness(0.45)'})}</div>
          <div style={{position: 'absolute', inset: 0, clipPath: `inset(0 0 ${(1 - scan) * 100}% 0)`}}>{body()}</div>
          <div style={{position: 'absolute', left: 0, right: 0, top: `${scan * 100}%`, height: 3 * u, marginTop: -1.5 * u, background: WARM,
            boxShadow: `0 0 14px ${WARM}`}} />
        </> : <div style={{position: 'absolute', inset: 0}}>{body(a === 'wait' ? {filter: 'brightness(0.45)'} : undefined)}</div>}
        {scribble > 0 ? (
          <svg viewBox="0 0 160 90" preserveAspectRatio="none" style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}>
            <path d="M28,62 C45,40 58,70 74,48 S102,30 118,52 S136,58 140,38" fill="none" stroke={WARM} strokeWidth={7} strokeLinecap="round"
              pathLength={1} strokeDasharray={`${scribble} 1`} />
          </svg>
        ) : null}
        {a === 'wait' ? (
          <svg viewBox="0 0 90 90" style={{position: 'absolute', left: '50%', top: '50%', width: p.h * 0.5, height: p.h * 0.5, marginLeft: -p.h * 0.25, marginTop: -p.h * 0.25}}>
            <circle cx={45} cy={45} r={34} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={8} />
            <circle cx={45} cy={45} r={34} fill="none" stroke={W90} strokeWidth={8} strokeLinecap="round" strokeDasharray="60 214"
              transform={`rotate(${(t / 1000) * 360} 45 45)`} />
          </svg>
        ) : null}
      </div>
    );
  };

  const run = shortcut ? interpolate(ms, [shortcut.at + 150, shortcut.at + 850], [0, 1], clamp) : 0;
  const scLand = shortcut ? thud(ms - (shortcut.at + 850), 500, 0.1) : 0;
  const runPose = (r: number): Pose => {
    const k = easeInOut(r), w = mW0 + (mw * 0.8 - mW0) * k;
    return {x: home[0] + (scB[0] - home[0]) * k, y: home[1] + (scB[1] - home[1]) * k, w, h: (w * 9) / 16, trav: 0, moving: true, dock: -1};
  };

  return (
    <div style={{position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h}}>
      {/* the small thing that started it */}
      <div style={{position: 'absolute', left: 0, top: tTop, width: TW, height: TH, ...glassBox(), display: 'flex', alignItems: 'center',
        gap: 30, padding: 12, paddingRight: 34, ...fadeUp(tIn)}}>
        {trigger.media ? (
          <div style={{width: mW0, height: mH0, borderRadius: 20, overflow: 'hidden', position: 'relative', flexShrink: 0,
            boxShadow: `0 0 0 3px ${tint(TONE.red, 0.8)}`}}><MediaView media={trigger.media} /></div>
        ) : null}
        <div style={{minWidth: 0}}>
          {trigger.kicker ? <div style={{fontFamily: A.font, fontSize: 24, fontWeight: 600, letterSpacing: 4, color: W60}}>{trigger.kicker}</div> : null}
          <div style={{fontFamily: A.font, fontSize: 44, fontWeight: 700, color: W90, marginTop: 8, lineHeight: 1.2}}>{trigger.title}</div>
          {trigger.sub ? <div style={{fontFamily: A.font, fontSize: 28, color: W60, marginTop: 8}}>{trigger.sub}</div> : null}
        </div>
      </div>

      <svg style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}} width={el.w} height={el.h}>
        {/* into the loop */}
        <path d={vertical ? `M${tx},${ty + 10} C${tx},${ty + 70} ${ex},${ey - 120 * u} ${ex},${ey - 60 * u}` : `M${tx + 10},${ty} C${tx + 90},${ty} ${ex - 200},${ey} ${ex - 160},${ey}`}
          fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={3} strokeDasharray="8 12" opacity={springAt(ms, steps[0].at - 200) * loopDim} />
        {/* the ring, and how far round this one small change has had to travel */}
        <g opacity={ringIn * loopDim}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={6} />
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={tint(TONE.red, 0.85)} strokeWidth={6} strokeLinecap="round"
            strokeDasharray={`${((now?.trav ?? 0) / (2 * Math.PI)) * circ} ${circ}`} transform={`rotate(${(a0 * 180) / Math.PI} ${cx} ${cy})`} />
        </g>
        {/* the shortcut cuts straight across */}
        {sc > 0 ? (
          <path d={`M${scA[0]},${scA[1]} L${scB[0]},${scB[1]}`} fill="none" stroke={TONE.green} strokeWidth={6}
            strokeLinecap="round" strokeDasharray={`${sc * 900} 900`} style={{filter: `drop-shadow(0 0 10px ${tint(TONE.green, 0.7)})`}} />
        ) : null}
      </svg>

      {/* the steps around the loop */}
      {steps.map((s, i) => {
        const [x, y] = pt(ang(i));
        const sIn = springAt(ms, s.at - 250, 18, 140);
        const next = i + 1 < n ? steps[i + 1].at : endAt;
        const on = ms >= s.at && ms < next;
        const done = ms >= next;
        const prog = s.progress ? interpolate(ms, [s.at, next + 400], [0, 0.72], clamp) : 0;
        const give = thud(ms - s.at);  // the station gives a little as the thing lands on it
        const t = ms - s.at, a = act(s);
        const iconRot = !on ? 0 : a === 'edit' ? Math.sin(t / 70) * 14 * Math.max(0, 1 - t / 900)
          : a === 'wait' ? 180 * Math.floor(t / 1200) + 180 * easeInOut(Math.min(1, (t % 1200) / 400)) : 0;
        const k = (0.9 + 0.1 * sIn) * (on ? 1.06 : 1);
        return (
          <div key={i} style={{position: 'absolute', left: x - pw / 2, top: y - ph / 2, width: pw, opacity: Math.min(1, sIn * 1.4) * loopDim,
            transform: `scale(${k * (1 + give)}, ${k * (1 - give)})`}}>
            <div style={{height: ph, borderRadius: ph / 2, ...surface(false), display: 'flex', alignItems: 'center', gap: 16 * u, padding: `0 ${26 * u}px 0 ${14 * u}px`,
              boxShadow: on ? `0 0 0 3px ${WARM}, 0 0 30px ${tint(WARM, 0.45)}` : undefined}}>
              <div style={{...iconTile(on ? T.accent : done ? TONE.red : TONE.cyan, 68 * u), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <div style={{transform: `rotate(${iconRot}deg)`, display: 'flex'}}><Icon name={s.icon} size={36 * u} color={GLYPH} stroke={2.2} /></div>
              </div>
              <div style={{fontFamily: A.font, fontSize: 32 * u, fontWeight: 700, color: W90, whiteSpace: 'nowrap'}}>{s.label}</div>
            </div>
            {s.progress && ms >= s.at ? (
              <div style={{position: 'absolute', left: 24 * u, right: 24 * u, top: ph + 14, height: 14 * u, borderRadius: 7, background: 'rgba(255,255,255,0.14)', overflow: 'hidden'}}>
                <div style={{width: `${prog * 100}%`, height: '100%', borderRadius: 7, background: `linear-gradient(90deg, ${tint(WARM, 0.7)}, ${WARM})`}} />
              </div>
            ) : null}
          </div>
        );
      })}

      {/* what each pass costs, in the middle of the loop */}
      <div style={{position: 'absolute', left: cx - 200 * u, top: cy - (meters.length * 140 * u - 20) / 2, width: 400 * u, display: 'flex', flexDirection: 'column', gap: 20,
        opacity: 1 - sc}}>
        {meters.map((m, i) => {
          const s = springAt(ms, m.at, 18, 140);
          if (s <= 0) return null;
          const t = Math.max(0, ms - m.at);
          const secs = Math.floor((t / 1000) * 37);  // waiting runs fast: it is the length of a render, compressed
          const level = (at: number) => 100 - interpolate(at, [0, 2600], [0, 62], {...clamp, easing: easeOut});
          const barW = 400 * u - 48 * u;
          return (
            <div key={i} style={{position: 'relative', height: 120 * u, ...glassBox(26), padding: `${16 * u}px ${24 * u}px`, ...fadeUp(s)}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                <Icon name={m.icon} size={32 * u} color={TONE.red} stroke={2.4} />
                <div style={{fontFamily: A.font, fontSize: 30 * u, fontWeight: 700, color: W90, whiteSpace: 'nowrap'}}>{m.label}</div>
                {m.kind === 'count' ? (
                  <div style={{marginLeft: 'auto', fontFamily: T.mono, fontSize: 36 * u, fontWeight: 700, color: TONE.red, fontVariantNumeric: 'tabular-nums'}}>
                    {`${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`}</div>
                ) : null}
              </div>
              {m.kind === 'drain' ? (
                <div style={{marginTop: 18 * u, height: 16 * u, borderRadius: 8, background: 'rgba(255,255,255,0.12)', overflow: 'hidden'}}>
                  <div style={{width: `${level(t)}%`, height: '100%', borderRadius: 8, background: `linear-gradient(90deg, ${TONE.red}, ${tint(TONE.red, 0.6)})`}} />
                </div>
              ) : <div style={{marginTop: 12 * u, fontFamily: A.font, fontSize: 24 * u, color: W60, whiteSpace: 'nowrap'}}>{m.note ?? ''}</div>}
              {/* what drains drops out of the end of the bar */}
              {m.kind === 'drain' ? Array.from({length: 10}).map((_, j) => {
                const born = j * 260, age = t - born;
                if (age < 0 || age > 1000) return null;
                const sec = age / 1000;
                const x = 24 * u + (barW * level(born)) / 100 + (rnd(j) - 0.35) * 180 * sec;
                const y = 84 * u - 300 * sec + 0.5 * 1500 * sec * sec;
                const r = (9 + 4 * rnd(j + 7)) * u;
                return <div key={j} style={{position: 'absolute', left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: r,
                  background: `radial-gradient(circle at 35% 35%, #ffe7b0, ${WARM} 55%, #c98a2c)`, opacity: 1 - sec,
                  transform: `scaleX(${Math.max(0.15, Math.abs(Math.cos(age / 90)))})`}} />;
              }) : null}
            </div>
          );
        })}
      </div>

      {/* the small thing riding the loop: a short trail while it moves, leaning into the turn, giving a little as it lands */}
      {now ? (() => {
        const rot = prev ? Math.max(-10, Math.min(10, (now.x - prev.x) * 0.35)) : 0;
        const land = now.dock >= 0 && now.dock < n ? thud(ms - arrive[now.dock], 380, 0.12) : 0;
        return (
          <div style={{position: 'absolute', inset: 0, opacity: loopDim}}>
            {now.moving ? [5, 4, 3, 2, 1].map((k) => {
              const g = pose(ms - k * 30);
              return g ? frame(g, `g${k}`, {ghost: 0.18 * (1 - k / 6)}) : null;
            }) : null}
            {frame(now, 'now', {rot, sq: land})}
          </div>
        );
      })() : null}

      {shortcut && sc > 0 ? (
        <div style={{position: 'absolute', left: cx - 240 * u, top: cy - 60 * u, width: 480 * u, height: 120 * u, borderRadius: 60 * u, ...surface(false),
          boxShadow: `0 0 0 3px ${TONE.green}, 0 0 40px ${tint(TONE.green, 0.45)}`, display: 'flex', alignItems: 'center', gap: 18 * u, padding: `0 ${30 * u}px 0 ${16 * u}px`,
          ...fadeUp(sc), transform: `${fadeUp(sc).transform} scale(${1 + scLand}, ${1 - scLand})`}}>
          <div style={{...iconTile(TONE.green, 84 * u), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <Icon name={shortcut.icon} size={44 * u} color={GLYPH} stroke={2.2} /></div>
          <div>
            <div style={{fontFamily: A.font, fontSize: 36 * u, fontWeight: 800, color: W90, whiteSpace: 'nowrap'}}>{shortcut.label}</div>
            {shortcut.sub ? <div style={{fontFamily: A.font, fontSize: 24 * u, color: W60, marginTop: 4, whiteSpace: 'nowrap'}}>{shortcut.sub}</div> : null}
          </div>
        </div>
      ) : null}
      {/* the new way: a copy goes straight across and is done */}
      {run > 0 && run < 1 ? <>
        {[4, 3, 2, 1].map((j) => frame(runPose(Math.max(0, run - j * 0.04)), `s${j}`, {ghost: 0.16 * (1 - j / 5)}))}
        <div style={{position: 'absolute', inset: 0, opacity: interpolate(run, [0.85, 1], [1, 0], clamp)}}>{frame(runPose(run), 'run', {rim: TONE.green})}</div>
      </> : null}

      {outcome ? (() => {
        const s = springAt(ms, outcome.at);
        return s > 0 ? (
          <div style={{position: 'absolute', left: vertical ? 0 : cx - R - 200, top: cy + R + 80, width: vertical ? el.w : 2 * R + 400, display: 'flex',
            justifyContent: 'center', ...fadeUp(s)}}><Label text={outcome.text} color={TONE.red} icon="Repeat" size={40 * u} /></div>
        ) : null;
      })() : null}
    </div>
  );
};
