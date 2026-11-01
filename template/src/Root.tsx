import React from 'react';
import {Composition} from 'remotion';
import {Main} from './Main';
import type {Program} from './types';

const fallback: Program = {width: 1920, height: 1080, fps: 30, durationMs: 1000, presenter: {src: '', face: {cx: 0.5, cy: 0.4, h: 0.25}},
  title: '', agenda: [], shots: [], captions: [], sfx: []};

export const Root: React.FC = () => (
  <Composition id="Main" component={Main as any} defaultProps={fallback as any} width={1920} height={1080} fps={30} durationInFrames={30}
    calculateMetadata={({props}: {props: any}) => ({width: props.width, height: props.height, fps: props.fps,
      durationInFrames: Math.ceil((props.durationMs / 1000) * props.fps)})} />
);
