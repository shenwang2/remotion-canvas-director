import {Easing, interpolate} from 'remotion';
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
// Shared entrance: 0..1 progress over `dur` ms after `at`.
export const prog = (ms: number, at: number, dur = 520) => interpolate(ms, [at, at + dur], [0, 1], {...clamp, easing: easeOut});
export const enter = (p: number, dy = 28) => ({opacity: p, transform: `translateY(${(1 - p) * dy}px) scale(${0.965 + 0.035 * p})`});
// Alternative entrances, chosen by context: slide in from the side the card lives on, flip over, or pop.
export const enterAs = (how: string | undefined, p: number) => {
  switch (how) {
    case 'slideL': return {opacity: p, transform: `translateX(${(1 - p) * -80}px)`};
    case 'slideR': return {opacity: p, transform: `translateX(${(1 - p) * 80}px)`};
    case 'flip': return {opacity: Math.min(1, p * 2), transform: `perspective(900px) rotateX(${(1 - p) * -80}deg)`, transformOrigin: 'top'};
    case 'pop': return {opacity: Math.min(1, p * 3), transform: `scale(${p < 0.7 ? 0.6 + p * 0.71 : 1.1 - (p - 0.7) * 0.33})`};
    default: return enter(p);
  }
};
