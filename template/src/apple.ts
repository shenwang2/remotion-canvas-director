import type React from 'react';
import {spring} from 'remotion';
import {loadFont as loadNoto} from '@remotion/google-fonts/NotoSansSC';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';

// Apple-like design language for talking-head overlays: keynote typography for ideas,
// iOS materials for concrete information. Restraint: hierarchy comes from size and weight,
// not from borders or glow; one accent; real materials over the footage.
const noto = loadNoto('normal', {weights: ['400', '500', '700', '900'], subsets: ['chinese-simplified', 'latin'], ignoreTooManyRequestsWarning: true});
const inter = loadInter('normal', {weights: ['400', '600', '800'], subsets: ['latin']});

export const A = {
  font: `${inter.fontFamily}, ${noto.fontFamily}, "PingFang SC", "Microsoft YaHei", sans-serif`,
  label: '#1d1d1f',
  label2: '#6e6e73',
  white: '#ffffff',
  white2: 'rgba(255,255,255,0.62)',
  blue: '#007aff',
  orange: '#ff9500',
  accentGradient: 'linear-gradient(92deg, #ffd25a 0%, #ff9f0a 55%, #ff6b3d 100%)',
  radius: 34,
};

// iOS "regular material" (light): what notifications and widgets use.
export const materialLight: React.CSSProperties = {
  background: 'rgba(255,255,255,0.88)',
  backdropFilter: 'blur(40px) saturate(180%)',
  WebkitBackdropFilter: 'blur(40px) saturate(180%)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.08)',
  borderRadius: A.radius,
};

// Physically based motion: a spring settling, used for every overlay entrance.
export const springAt = (ms: number, at: number, damping = 16, stiffness = 120) =>
  ms < at ? 0 : spring({frame: ((ms - at) / 1000) * 30, fps: 30, config: {damping, stiffness, mass: 1}});

// Enter like Apple UI: slightly smaller and blurred, settling into place.
export const appear = (s: number, dy = 24): React.CSSProperties => ({
  opacity: Math.min(1, s * 1.4),
  transform: `translateY(${(1 - s) * dy}px) scale(${0.94 + 0.06 * s})`,
  filter: s < 0.98 ? `blur(${(1 - s) * 14}px)` : undefined,
});

// "{word}" segments inside a phrase are set in the accent gradient.
export const accentParts = (text: string) => text.split(/(\{[^}]+\})/).filter(Boolean).map((t) => ({accent: t.startsWith('{'), t: t.replace(/[{}]/g, '')}));
