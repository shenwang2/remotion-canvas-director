export type Rect = {x: number; y: number; w: number; h: number};
export type Media = {src: string; kind: 'video' | 'image'; trimMs?: number; muted?: boolean; fit?: 'cover' | 'contain'; aspect?: number};

// Canvas elements live in world coordinates (world units = output pixels at zoom 1).
export type CanvasElement = Rect & {
  id: string;
  kind: 'clip' | 'entity' | 'stat' | 'list' | 'tag' | 'arrow' | 'heading' | 'note' | 'timeline' | 'highlight'
    | 'stamp' | 'rise' | 'multiply' | 'scan' | 'erode' | 'strike' | 'marker' | 'circle'
    | 'phrases' | 'loop' | 'dialog' | 'notify' | 'glass'
    | 'retrieve' | 'pipeline' | 'roundtrip';
  atMs: number; // relative to scene start
  outMs?: number;
  props: Record<string, any>;
};
// Camera stop: frame the union of these element ids (or a world rect) from atMs on.
export type CameraStop = {atMs: number; focus?: string[]; rect?: Rect; pad?: number; moveMs?: number; raw?: boolean};

export type Shot =
  | {type: 'presenter'; id: string; startMs: number; endMs: number; chapter?: number; zoom?: {atMs: number; scale: number; moveMs?: number; type?: 'push' | 'cut' | 'snap'}[]; bigWord?: {text: string; sub?: string; atMs: number; endMs: number}[]; behind?: import('./composite').Behind[]; sticker?: import('./composite').Sticker[]; hud?: 'agenda' | 'chapter' | 'recap' | 'none';
      // Cards beside the person, in design space (2560x1440 landscape / 1440x2560 portrait); times absolute.
      overlays?: CanvasElement[]}
  | {type: 'canvas'; id: string; startMs: number; endMs: number; chapter?: number; elements: CanvasElement[]; camera: CameraStop[]; label?: string; world?: string; layout?: string}
  | {type: 'source'; id: string; startMs: number; endMs: number; chapter?: number; media: Media; quote?: string; label?: string};

export type Program = {
  width: number; height: number; fps: number; durationMs: number;
  presenter: {src: string; face: {cx: number; cy: number; h: number}; track?: {ms: number; cx: number; cy: number; h: number}[]};
  title: string;
  canvasStyle?: 'ios' | 'glass';
  brand?: {name: string; icon?: string; meta?: string[]};
  agenda: {title: string; en: string; icon?: string; atMs?: number}[];
  shots: Shot[];
  captions: {startMs: number; endMs: number; text: string}[];
  sfx: {atMs: number; src: string; volume: number}[];
  // captions: bottom = distance from the bottom edge (fraction of the height); a rounded translucent black band behind them
  captionStyle?: {bottom?: number; bg?: boolean; bgOpacity?: number; radius?: number};
  // background music: played in segments (video ms from/to, track ms), at a gain sampled every stepMs (canvaslib/bgm.py)
  music?: {src: string; segments: [number, number, number][]; gain: {stepMs: number; v: number[]}; accents?: {atMs: number; k: number}[]};
};
