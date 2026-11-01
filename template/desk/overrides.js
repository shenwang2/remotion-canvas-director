// The edit desk's layer of hand edits, applied on top of the generated programme (program.json). The generated
// programme is never touched: regenerating it keeps these edits, and the preview and the export both go through
// applyOverrides, so what you see is what renders.
//
// overrides.json:
//   captions: {"<index>": {orig, text?, startMs?, endMs?}}        orig: the caption text it was made against
//   elements: {"<id>": {hidden?, shiftMs?, text?: {"<path>": "new text"}}}
//             ids: canvas/overlay element ids, "<shot>#big<i>", "<shot>#behind<i>"
//   shots:    {"<shot id>": {shiftMs}}                             moves the change into this shot
//   zoom:     {"<shot>#<i>": {off: true}}
//   music:    {off?, gainDb?, accents?: false, track?}             track is applied by regenerating
//   sfx:      {gainDb?, cues: {"<atMs>|<src>": {off?, src?}}}
//   captionStyle: {bottom?, bg?, bgOpacity?, radius?}            position and band of the captions

export const TEXT_KEYS = new Set(['text', 'title', 'sub', 'kicker', 'label', 'hero', 'hero_sub', 'heroSub', 'line', 'quote', 'note', 'en',
  'caption', 'name', 'value', 'unit', 'word', 'outcome']);

const clone = (x) => JSON.parse(JSON.stringify(x));

// every editable string inside an element's props: [{path, value}]
export function textFields(obj, base = '') {
  const out = [];
  const walk = (o, path) => {
    if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}/${i}`));
    else if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && TEXT_KEYS.has(k) && v.trim()) out.push({path: `${path}/${k}`, value: v});
        else if (v && typeof v === 'object' && !['media', 'bg', 'matte', 'frame'].includes(k)) walk(v, `${path}/${k}`);
      }
    }
  };
  walk(obj, base);
  return out;
}

const setPath = (obj, path, value) => {
  const parts = path.split('/').filter(Boolean);
  let o = obj;
  for (const p of parts.slice(0, -1)) {
    if (o == null) return;
    o = o[p];
  }
  if (o != null && parts.length) o[parts[parts.length - 1]] = value;
};

// canvas shots keep scene-relative times (canvaslib _localize); moving where a canvas shot starts moves them the
// other way, so everything still appears on the same word
function relocalize(shot, d) {
  const shiftAt = (o) => {
    if (Array.isArray(o)) o.forEach(shiftAt);
    else if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (k === 'at' && typeof v === 'number') o[k] = v - d;
        else if (k !== 'relight') shiftAt(v);
      }
    }
  };
  for (const e of shot.elements ?? []) {
    e.atMs -= d;
    if (typeof e.outMs === 'number') e.outMs -= d;
    for (const k of ['on', 'captionAtMs', 'outMs']) if (typeof e.props?.[k] === 'number') e.props[k] -= d;
    for (const n of [...(e.props?.nodes ?? []), ...(e.props?.items ?? [])]) {
      if ('atMs' in n) n.atMs -= d;
      if ('doneAtMs' in n) n.doneAtMs -= d;
    }
    shiftAt(e.props);
  }
  for (const c of shot.camera ?? []) c.atMs -= d;
}

// every visible thing on screen, with a stable id, its shot and when it comes in (absolute ms)
export function listElements(p) {
  const out = [];
  for (const s of p.shots) {
    const base = s.type === 'canvas' ? s.startMs : 0;
    for (const e of s.elements ?? []) out.push({id: e.id, shot: s.id, kind: e.kind, atMs: base + e.atMs, el: e, where: 'elements'});
    for (const e of s.overlays ?? []) out.push({id: e.id, shot: s.id, kind: e.kind, atMs: e.atMs, el: e, where: 'overlays'});
    (s.bigWord ?? []).forEach((b, i) => out.push({id: `${s.id}#big${i}`, shot: s.id, kind: 'bigWord', atMs: b.atMs, el: b, where: 'bigWord'}));
    (s.behind ?? []).forEach((b, i) => out.push({id: `${s.id}#behind${i}`, shot: s.id, kind: 'behind', atMs: b.atMs, el: b, where: 'behind'}));
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

export const sfxKey = (s) => `${s.atMs}|${s.src}`;

export function applyOverrides(program, ov = {}, {music = true} = {}) {
  const p = clone(program);
  if (!music) delete p.music;

  // captions
  if (ov.captionStyle) p.captionStyle = {...(p.captionStyle ?? {}), ...ov.captionStyle};
  for (const [i, c] of Object.entries(ov.captions ?? {})) {
    let idx = Number(i);
    if (p.captions[idx]?.text !== c.orig) idx = p.captions.findIndex((x) => x.text === c.orig);
    if (idx < 0) continue;
    const cap = p.captions[idx];
    if (c.text != null) cap.text = c.text;
    if (c.startMs != null) cap.startMs = c.startMs;
    if (c.endMs != null) cap.endMs = c.endMs;
  }

  // where shots change
  for (const [id, o] of Object.entries(ov.shots ?? {})) {
    const i = p.shots.findIndex((s) => s.id === id);
    if (i <= 0 || !o.shiftMs) continue;
    const a = p.shots[i - 1], b = p.shots[i];
    const d = Math.max(a.startMs + 500 - b.startMs, Math.min(b.endMs - 500 - b.startMs, o.shiftMs));
    a.endMs = b.startMs = b.startMs + d;
    if (b.type === 'canvas') relocalize(b, d);
  }

  // elements: text, timing, hidden
  const els = ov.elements ?? {};
  for (const s of p.shots) {
    const touch = (list, idOf) => {
      if (!list) return list;
      return list.filter((e, i) => {
        const o = els[idOf(e, i)];
        if (!o) return true;
        if (o.hidden) return false;
        if (o.shiftMs) {
          e.atMs += o.shiftMs;
          if (typeof e.outMs === 'number') e.outMs += o.shiftMs;
        }
        for (const [path, v] of Object.entries(o.text ?? {})) setPath(e, path, v);
        return true;
      });
    };
    if (s.elements) s.elements = touch(s.elements, (e) => e.id);
    if (s.overlays) s.overlays = touch(s.overlays, (e) => e.id);
    if (s.bigWord) s.bigWord = touch(s.bigWord, (e, i) => `${s.id}#big${i}`);
    if (s.behind) s.behind = touch(s.behind, (e, i) => `${s.id}#behind${i}`);
    if (s.zoom) s.zoom = s.zoom.filter((z, i) => !ov.zoom?.[`${s.id}#${i}`]?.off);
  }

  // music
  if (p.music) {
    const m = ov.music ?? {};
    if (m.off) delete p.music;
    else {
      if (m.gainDb) {
        const k = Math.pow(10, m.gainDb / 20);
        p.music.gain = {...p.music.gain, v: p.music.gain.v.map((x) => Math.min(1, x * k))};
      }
      if (m.accents === false) p.music.accents = [];
    }
  }

  // sound effects
  const sg = ov.sfx?.gainDb ? Math.pow(10, ov.sfx.gainDb / 20) : 1;
  // a cue is found again even if regenerating moved it a little (cutting to a new track's beat): same sound, within 0.4 s
  const cues = Object.entries(ov.sfx?.cues ?? {}).map(([k, v]) => {
    const [at, ...src] = k.split('|');
    return {at: Number(at), src: src.join('|'), v};
  });
  const find = (s) => ov.sfx?.cues?.[sfxKey(s)] ?? cues.find((c) => c.src === s.src && Math.abs(c.at - s.atMs) <= 400)?.v;
  p.sfx = (p.sfx ?? []).flatMap((s) => {
    const o = find(s);
    if (o?.off) return [];
    return [{...s, src: o?.src ?? s.src, volume: Math.min(1, s.volume * sg)}];
  });
  return p;
}

// how many edits there are, for the header
export function countEdits(ov = {}) {
  let n = Object.keys(ov.captions ?? {}).length + Object.keys(ov.elements ?? {}).length + Object.keys(ov.shots ?? {}).length
    + Object.keys(ov.zoom ?? {}).length + Object.keys(ov.sfx?.cues ?? {}).length;
  const m = ov.music ?? {};
  n += (m.off ? 1 : 0) + (m.gainDb ? 1 : 0) + (m.accents === false ? 1 : 0) + (m.track ? 1 : 0) + (ov.sfx?.gainDb ? 1 : 0);
  n += Object.keys(ov.captionStyle ?? {}).length;
  return n;
}
