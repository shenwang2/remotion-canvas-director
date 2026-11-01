import type {Program} from './types';

// The bottom of the frame, worked out from the captions: in portrait the platform's own UI (description, comments
// scrolling up) covers the lowest part, so the captions sit higher (captionStyle.bottom, editable in the desk), the
// avatar sits just above them and the canvas frames its content above the avatar. canvaslib/common.py mirrors
// captionGeo to keep the glass panels of presenter shots clear of the captions.
export const CAPTION_BOTTOM = {portrait: 0.20, landscape: 0.065};

export function captionGeo(p: Program) {
  const {width: W, height: H} = p;
  const portrait = H > W;
  const st = p.captionStyle ?? {};
  const font = Math.min(W, H) * (portrait ? 0.05 : 0.0418);
  const bg = st.bg ?? true;
  const padY = bg ? font * 0.3 : 0, padX = bg ? font * 0.5 : 0;
  const boxH = font * 1.3 + 2 * padY;
  const bottom = (st.bottom ?? (portrait ? CAPTION_BOTTOM.portrait : CAPTION_BOTTOM.landscape)) * H;
  return {font, bg, padX, padY, boxH, bottom, top: H - bottom - boxH, opacity: st.bgOpacity ?? 0.45, radius: st.radius ?? 0.5};
}

export function avatarGeo(p: Program) {
  const {width: W, height: H} = p;
  const portrait = H > W;
  const D = Math.min(W, H) * (portrait ? 0.26 : 0.21);
  const x = W - D - W * (portrait ? 0.05 : 0.035);
  // portrait: just above the captions (never lower than it used to sit)
  const y = portrait ? Math.min(H * 0.62, captionGeo(p).top - H * 0.012 - D) : H - D - H * 0.06;
  return {D, x, y};
}

// Where canvas content may reach at the bottom in portrait: above the avatar.
export const portraitSafeBottom = (p: Program) => Math.min(0.6, avatarGeo(p).y / p.height - 0.01);
