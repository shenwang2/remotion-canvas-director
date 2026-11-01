import React from 'react';
import {Icon} from './Icon';
import {T, tint} from './theme';

// Shared, precise annotation pieces so every mark on screen has the same finish as the layout:
// clean geometry, one stroke weight, system radii, no hand-drawn wobble, no rotation.
export const STROKE = 3;

// A small glass capsule label used by focus marks, scans and clip captions.
export const Label: React.FC<{text: string; color: string; icon?: string; size?: number; style?: React.CSSProperties}> = ({text, color, icon, size = 32, style}) => (
  <div style={{display: 'inline-flex', alignItems: 'center', gap: size * 0.35, padding: `${size * 0.28}px ${size * 0.62}px ${size * 0.28}px ${size * 0.45}px`,
    borderRadius: 999, background: 'rgba(22,22,26,0.62)', backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)',
    boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.32), inset 0 0 0 1px rgba(255,255,255,0.16), 0 10px 24px rgba(0,0,0,0.3)',
    color: '#fff', fontFamily: T.font, fontWeight: 600, fontSize: size, whiteSpace: 'nowrap', ...style}}>
    {icon ? <Icon name={icon} size={size * 1.05} color={color} stroke={2.2} />
      : <div style={{width: size * 0.36, height: size * 0.36, borderRadius: 99, background: color, boxShadow: `0 0 10px ${tint(color, 0.8)}`}} />}
    {text}
  </div>
);

// A focus ring: a rounded rectangle drawn on cleanly, clockwise from the top-left, with a soft glow.
export const FocusRing: React.FC<{w: number; h: number; color: string; p: number}> = ({w, h, color, p}) => {
  const r = Math.min(24, h / 2);
  const d = `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;
  return (
    <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', filter: `drop-shadow(0 0 10px ${tint(color, 0.55)})`}}>
      <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" strokeDasharray="1" strokeDashoffset={1 - p} />
    </svg>
  );
};
