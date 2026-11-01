import React from 'react';
import {interpolate} from 'remotion';
import {GLYPH, T, TONE, card, iconTile, ink, surface, tint, toneOn} from './theme';
import {clamp, enter, enterAs, prog} from './anim';
import {MediaView} from './Media';
import {Icon} from './Icon';
import {Label} from './craft';
import type {CanvasElement} from './types';

type P = {el: CanvasElement; ms: number};
const box = (el: CanvasElement): React.CSSProperties => ({position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h});

// Colours over the footage (cards beside the person): clean, light tones that stay crisp on skin, walls and LED light.
// No yellow / amber there - it turns muddy on a lit room. White carries the text; the tone marks the icon and the {key word}.
export const VTONE: Record<string, string> = {accent: '#7FB2FF', blue: '#7FB2FF', cyan: '#5FD4FF', green: '#5BE49B', red: '#FF7A7A',
  orange: '#FF9F80', purple: '#C9A4FF', white: '#ffffff'};
// "a {key} b" -> the key part in colour
export const Marked: React.FC<{text: string; color: string}> = ({text, color}) => (
  <>{text.split(/(\{[^}]*\})/).map((s, i) => s.startsWith('{') ? <span key={i} style={{color}}>{s.slice(1, -1)}</span> : s)}</>
);

export const Kicker: React.FC<{text: string; size?: number; color?: string; icon?: string}> = ({text, size = 24, color = T.faint, icon}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: size * 0.5, fontFamily: T.mono, fontWeight: 700, fontSize: size, letterSpacing: size * 0.14,
    color, textTransform: 'uppercase', whiteSpace: 'nowrap'}}>
    {icon ? <Icon name={icon} size={size * 1.25} color={color} /> : <div style={{width: size * 0.42, height: size * 0.42, borderRadius: 2, background: color}} />}
    {text}
  </div>
);

export const Clip: React.FC<P> = ({el, ms}) => {
  const p = prog(ms, el.atMs, 650);
  const {media, kicker, kickerIcon, caption, captionAtMs, index, glow} = el.props;
  const cp = caption ? prog(ms, captionAtMs ?? el.atMs + 500, 420) : 0;
  return (
    <div style={{...box(el), ...enter(p, 40)}}>
      {kicker ? <div style={{position: 'absolute', top: -52, left: 4}}><Kicker text={kicker} icon={kickerIcon} /></div> : null}
      <div style={{position: 'absolute', inset: 0, borderRadius: T.radius, overflow: 'hidden', background: T.bgDeep,
        border: `1.5px solid ${glow ? tint(T.accent, 0.8) : 'rgba(255,255,255,0.22)'}`,
        boxShadow: `0 40px 100px rgba(0,0,0,0.6)${glow ? `, 0 0 70px ${tint(T.accent, 0.3)}` : ''}`}}>
        <MediaView media={media} fromMs={el.atMs} />
      </div>
      {index != null ? (
        <div style={{position: 'absolute', top: -24, left: -24, width: 68, height: 68, borderRadius: 34, background: T.accent, color: '#111',
          fontFamily: T.font, fontWeight: 900, fontSize: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 0 6px ${T.bg}`}}>{index}</div>
      ) : null}
      {caption ? (
        <div style={{position: 'absolute', left: 24, bottom: 24, opacity: cp, transform: `translateY(${(1 - cp) * 12}px)`}}>
          <Label text={caption} color={T.accent} size={32} /></div>
      ) : null}
    </div>
  );
};

export const Entity: React.FC<P> = ({el, ms}) => {
  const p = prog(ms, el.atMs);
  const {icon, title, sub, tone = 'accent', on, onVideo, enter: how} = el.props;
  const c = TONE[tone] ?? TONE.accent;  // on-video-only tones (purple) fall back on the canvas
  const lit = on != null && ms >= on;
  const glow = on != null ? prog(ms, on, 400) : 0;
  const tile = el.h * 0.54;
  // over the footage: the on-video palette - a tinted glass tile, the sub line in the tone, no yellow
  const v = VTONE[tone] ?? VTONE.accent;
  const tileStyle = onVideo ? {...iconTile(c, tile, onVideo), background: `linear-gradient(160deg, ${tint(v, 0.85)}, ${tint(v, 0.5)})`} : iconTile(c, tile, onVideo);
  return (
    <div style={{...box(el), ...card(lit && !onVideo ? c : undefined, onVideo), ...enterAs(how, p), display: 'flex', alignItems: 'center', gap: el.h * 0.17,
      padding: `0 ${el.h * 0.2}px`, transform: `${enterAs(how, p).transform} scale(${1 + 0.03 * glow * (1 - glow) * 4})`}}>
      <div style={tileStyle}><Icon name={icon} size={tile * 0.56} color={GLYPH} stroke={2.2} /></div>
      <div style={{minWidth: 0}}>
        <div style={{color: ink(onVideo).label, fontFamily: T.font, fontWeight: 700, fontSize: el.h * 0.24, letterSpacing: -0.3, whiteSpace: 'nowrap'}}>
          {onVideo ? <Marked text={title} color={v} /> : title}</div>
        {sub ? <div style={{color: onVideo ? v : lit ? toneOn(c, onVideo) : ink(onVideo).sub, fontFamily: T.font, fontWeight: onVideo ? 600 : 500,
          fontSize: el.h * 0.155, marginTop: 4, whiteSpace: 'nowrap'}}>{sub}</div> : null}
      </div>
    </div>
  );
};

export const Stat: React.FC<P> = ({el, ms}) => {
  const p = prog(ms, el.atMs);
  const {value, decimals = 0, prefix = '', suffix = '', label, icon, tone = 'accent', countMs = 900, onVideo} = el.props;
  const c = TONE[tone];
  const t = interpolate(ms, [el.atMs, el.atMs + countMs], [0, 1], clamp);
  const v = value * (1 - Math.pow(1 - t, 3));
  return (
    <div style={{...box(el), ...enter(p), ...card(undefined, onVideo), padding: `${el.h * 0.1}px ${el.h * 0.13}px`, overflow: 'hidden'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
        {icon ? <Icon name={icon} size={el.h * 0.12} color={toneOn(c, onVideo)} stroke={2.4} /> : null}
        {label ? <div style={{color: toneOn(c, onVideo), fontFamily: T.font, fontSize: el.h * 0.11, fontWeight: 700}}>{label}</div> : null}
      </div>
      <div style={{color: ink(onVideo).label, fontFamily: T.font, fontWeight: 800, fontSize: el.h * 0.44, lineHeight: 1.12, marginTop: el.h * 0.04,
        fontVariantNumeric: 'tabular-nums', letterSpacing: -1}}>
        {prefix}{v.toFixed(decimals)}<span style={{fontSize: el.h * 0.22, marginLeft: 6}}>{suffix}</span>
      </div>
      <div style={{position: 'absolute', left: el.h * 0.13, right: el.h * 0.13, bottom: el.h * 0.1, height: 8, borderRadius: 4, background: ink(onVideo).sub, opacity: 0.25}} />
      <div style={{position: 'absolute', left: el.h * 0.13, bottom: el.h * 0.1, height: 8, borderRadius: 4, width: `calc(${t} * (100% - ${el.h * 0.26}px))`, background: toneOn(c, onVideo)}} />
    </div>
  );
};

export const Shine: React.FC<{at: number; ms: number; dur?: number; radius?: number}> = ({at, ms, dur = 750, radius = T.radius}) => {
  const t = (ms - at) / dur;
  if (t < 0 || t > 1) return null;
  return (
    <div style={{position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', pointerEvents: 'none'}}>
      <div style={{position: 'absolute', top: '-50%', bottom: '-50%', width: '35%', left: `${-40 + t * 150}%`, transform: 'rotate(18deg)',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.32), transparent)'}} />
    </div>
  );
};

const TAG_ICON: Record<string, string> = {red: 'TriangleAlert', green: 'CircleCheck', cyan: 'Info', accent: 'Sparkles'};

export const Tag: React.FC<P> = ({el, ms}) => {
  const p = prog(ms, el.atMs, 380);
  const {text, tone = 'red', icon, onVideo, strip} = el.props;
  const c = TONE[tone] ?? TONE.accent;
  // strip: a line beside the person - reads left to right, larger; white text, the tone on the icon (in a tinted
  // round) and on the {key word}, from the on-video palette
  const v = VTONE[tone] ?? VTONE.accent;
  const fg = strip ? '#ffffff' : toneOn(c, onVideo);
  const ic = icon ?? TAG_ICON[tone] ?? 'Sparkles';
  return (
    <div style={{...box(el), opacity: p, transform: `scale(${1.15 - 0.15 * p}) rotate(${el.props.tilt ?? 0}deg)`, display: 'flex', alignItems: 'center',
      justifyContent: strip ? 'flex-start' : 'center', gap: el.h * (strip ? 0.16 : 0.14), borderRadius: el.h / 2,
      ...(strip ? {padding: `0 ${el.h * 0.4}px 0 ${el.h * 0.14}px`} : {}),
      ...surface(onVideo), color: fg,
      fontFamily: T.font, fontWeight: strip ? 600 : 700, fontSize: el.h * (strip ? 0.4 : 0.38), whiteSpace: 'nowrap', boxSizing: 'border-box'}}>
      {strip
        ? <div style={{width: el.h * 0.72, height: el.h * 0.72, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(160deg, ${tint(v, 0.42)}, ${tint(v, 0.2)})`, boxShadow: `inset 0 0 0 1.5px ${tint(v, 0.5)}`}}>
            <Icon name={ic} size={el.h * 0.38} color={v} stroke={2.4} /></div>
        : <Icon name={ic} size={el.h * 0.4} color={fg} stroke={2.4} />}
      {strip ? <span><Marked text={text} color={v} /></span> : text}
    </div>
  );
};

export const Heading: React.FC<P> = ({el, ms}) => {
  const p = prog(ms, el.atMs, 700);
  const {index, icon, title, en, tone = 'accent'} = el.props;
  const c = TONE[tone];
  return (
    <div style={{...box(el), ...enter(p, 40), display: 'flex', alignItems: 'center', gap: el.h * 0.24}}>
      {icon ? <div style={iconTile(c, el.h * 0.86)}><Icon name={icon} size={el.h * 0.48} color={GLYPH} /></div> : null}
      {index != null && !icon ? (
        <div style={{width: el.h * 0.86, height: el.h * 0.86, borderRadius: el.h, background: c, color: '#111', fontFamily: T.font, fontWeight: 900,
          fontSize: el.h * 0.46, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>{index}</div>
      ) : null}
      <div>
        {en ? <Kicker text={en} size={el.h * 0.17} color={c} /> : null}
        <div style={{color: T.text, fontFamily: T.font, fontWeight: 900, fontSize: el.h * 0.5, lineHeight: 1.2, whiteSpace: 'nowrap', marginTop: 4}}>{title}</div>
      </div>
    </div>
  );
};

export const Note: React.FC<P> = ({el, ms}) => {
  const p = prog(ms, el.atMs);
  const {text, size = 44, tone = 'white', weight = 800, align = 'left', kicker} = el.props;
  return (
    <div style={{...box(el), ...enter(p, 20), textAlign: align}}>
      {kicker ? <Kicker text={kicker} color={T.accent} /> : null}
      <div style={{color: TONE[tone], fontFamily: T.font, fontWeight: weight, fontSize: size, lineHeight: 1.3, marginTop: kicker ? 10 : 0}}>{text}</div>
    </div>
  );
};
