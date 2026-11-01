import type React from 'react';
import {A} from './apple';

// One visual language for the whole programme: iOS.
// The dark canvas uses iOS dark-mode surfaces; cards over the talking-head footage use iOS light mode.
// System colours only, flat icon tiles (Settings style), no outlines or glows, soft small shadows.
export const T = {
  bg: '#0c0f15',
  bgDeep: '#08090d',
  panel: '#1c1c1e',
  panelHi: '#2c2c2e',
  line: 'rgba(255,255,255,0.10)',
  lineHi: 'rgba(255,255,255,0.18)',
  text: '#ffffff',
  sub: 'rgba(235,235,245,0.6)',
  faint: 'rgba(235,235,245,0.3)',
  accent: '#ffd60a', // systemYellow (dark)
  orange: '#ff9f0a',
  cyan: '#64d2ff', // systemTeal (dark)
  blue: '#0a84ff',
  red: '#ff453a',
  green: '#30d158',
  font: A.font,
  mono: '"Segoe UI", "Microsoft YaHei", sans-serif',
  radius: 30,
};
export const TONE: Record<string, string> = {accent: T.accent, orange: T.orange, cyan: T.cyan, blue: T.blue, red: T.red, green: T.green, white: T.text};

// Light-mode system colours, for text and fills on white cards (dark-mode yellow is unreadable on white).
const LIGHT: Record<string, string> = {[T.accent]: '#ff9500', [T.orange]: '#ff9500', [T.cyan]: '#007aff', [T.blue]: '#007aff', [T.red]: '#ff3b30', [T.green]: '#34c759'};
export const toneOn = (tone: string, _onVideo?: boolean) => tone;  // glass everywhere: the bright system tones read on both
void LIGHT;

// Label colours per surface.
export const ink = (_onVideo?: boolean) => ({label: '#ffffff', sub: 'rgba(235,235,245,0.68)'});

export const GLYPH = '#ffffff';

// Canvas card style, set once per render from program.canvasStyle: 'ios' (dark-mode surfaces) or 'glass'.
export const STYLE = {canvas: 'ios' as 'ios' | 'glass'};

// Frosted glass over the lit canvas: a bright rim, a top highlight, the backdrop glows showing through.
const GLASS: React.CSSProperties = {
  background: 'linear-gradient(155deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.05) 48%, rgba(255,255,255,0.10) 100%)',
  backdropFilter: 'blur(34px) saturate(165%) brightness(0.9)',
  WebkitBackdropFilter: 'blur(34px) saturate(165%) brightness(0.9)',
};
// Crystal: barely frosted, the room shows through - the talking-head material.
const CRYSTAL: React.CSSProperties = {
  background: 'linear-gradient(155deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.08) 100%)',
  backdropFilter: 'blur(16px) saturate(180%) brightness(0.9)',
  WebkitBackdropFilter: 'blur(16px) saturate(180%) brightness(0.9)',
};
const CRYSTAL_EDGE = 'inset 0 2px 0 rgba(255,255,255,0.7), inset 0 0 0 2px rgba(255,255,255,0.36), inset 0 -2px 0 rgba(255,255,255,0.16)';
const GLASS_EDGE = 'inset 0 2px 0 rgba(255,255,255,0.5), inset 0 0 0 1.5px rgba(255,255,255,0.26), inset 0 -2px 0 rgba(255,255,255,0.1)';

// The surface every canvas-side element sits on (cards, tags, stamps, rises...).
export const surface = (onVideo?: boolean, extraShadow = ''): React.CSSProperties => {
  if (onVideo) return {...CRYSTAL, textShadow: '0 2px 12px rgba(0,0,0,0.4)',
    boxShadow: ['0 22px 54px rgba(0,0,0,0.16)', CRYSTAL_EDGE, extraShadow].filter(Boolean).join(', ')};
  if (STYLE.canvas === 'glass') return {...GLASS, boxShadow: ['0 26px 60px rgba(0,0,0,0.30)', GLASS_EDGE, extraShadow].filter(Boolean).join(', ')};
  return {background: 'rgba(28,28,30,0.94)', backdropFilter: 'blur(30px) saturate(180%)', boxShadow: ['0 12px 34px rgba(0,0,0,0.38)', extraShadow].filter(Boolean).join(', ')};
};

// Hex colour with alpha, for tinted fills.
export const tint = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// iOS card. onVideo -> light material (notifications/widgets over a photo); otherwise dark-mode surface.
// `active` (the card being talked about) is shown the iOS way: a tint ring, no glow.
export const card = (active?: string, onVideo?: boolean): React.CSSProperties => ({
  // the card being talked about: a thin tinted rim with a soft glow of the same colour
  ...surface(onVideo, active ? `0 0 0 2px ${tint(toneOn(active, onVideo), 0.9)}, 0 0 28px ${tint(toneOn(active, onVideo), 0.3)}` : ''),
  border: 'none',
  borderRadius: T.radius,
  boxSizing: 'border-box',
});

// Settings-style icon tile: a flat system-colour squircle with a white glyph.
export const iconTile = (tone: string, size: number, onVideo?: boolean): React.CSSProperties => {
  const solid = tone === T.accent ? '#ff9f0a' : toneOn(tone, onVideo);
  const glass = onVideo || STYLE.canvas === 'glass';
  return {
    width: size, height: size, borderRadius: size * 0.27, flexShrink: 0,
    // on glass: a tinted glass tile with a rim; otherwise a flat Settings-style tile
    background: glass ? `linear-gradient(160deg, ${tint(solid, 0.75)}, ${tint(solid, 0.4)})` : solid,
    boxShadow: glass ? 'inset 0 1.5px 0 rgba(255,255,255,0.5), inset 0 0 0 1px rgba(255,255,255,0.22)' : undefined,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
};
