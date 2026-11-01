import React, {createContext, useContext} from 'react';
import {Html5Video, Img, Sequence, staticFile, useVideoConfig} from 'remotion';
import {Video} from '@remotion/media';
import type {Media} from './types';
import {PREVIEW} from './preview';

// Absolute time (ms) at which the enclosing scene's clock reads 0. Sequences count from the start of the
// composition, so a scene-relative `fromMs` must be shifted by it, or every clip plays from the wrong point.
export const TimeBase = createContext(0);

// Media starts playing at `fromMs` (scene-relative) so a clip begins when it appears.
export const MediaView: React.FC<{media: Media; fromMs?: number; style?: React.CSSProperties}> = ({media, fromMs = 0, style}) => {
  const {fps} = useVideoConfig();
  const base = useContext(TimeBase);
  const s: React.CSSProperties = {width: '100%', height: '100%', objectFit: media.fit ?? 'cover', display: 'block', ...style};
  if (media.kind === 'image') return <Img src={staticFile(media.src)} style={s} />;
  const V = PREVIEW.html5 ? Html5Video : Video;
  return (
    <Sequence from={Math.round(((base + fromMs) / 1000) * fps)} layout="none">
      <V src={staticFile(media.src)} trimBefore={Math.round(((media.trimMs ?? 0) / 1000) * fps)} muted={media.muted ?? true} loop style={s} />
    </Sequence>
  );
};
