import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Player, type PlayerRef} from '@remotion/player';
import {Main} from '../src/Main';
import {applyOverrides, countEdits, listElements, sfxKey, textFields} from './overrides.js';
import {PREVIEW} from '../src/preview';

PREVIEW.html5 = true;  // the browser's hardware decoder for the preview; exports render frame-exact as always
// 流畅预览: the frosted-glass blur is the costliest thing to draw live; switched off it shows the same panels without
// the blur behind them. Exports are never affected.
const fastCss = document.createElement('style');
fastCss.textContent = '.fast-preview * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }'
  + ' .fast-preview [style*="blur("] { filter: none !important; }';  // and the blur in entrances
document.head.appendChild(fastCss);

type Any = any;
const fmt = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
const KIND: Record<string, string> = {glass: '玻璃面板', entity: '卡片', tag: '标签', clip: '画面', heading: '标题', stat: '数字', highlight: '框选',
  roundtrip: '解释动画·回环', retrieve: '解释动画·检索', pipeline: '解释动画·流水线', bigWord: '大字', behind: '身后大字', note: '注释',
  list: '列表', timeline: '时间线', arrow: '箭头', circle: '圈注', stamp: '印章', marker: '标记', strike: '划掉', rise: '上升', scan: '扫描',
  multiply: '倍增', erode: '消减', name: '名字', card: '卡片'};
const ROLE: Record<string, string> = {transition: '转场', reveal: '揭晓', pop: '出现', tick: '计数/打字', notify: '提示', hit: '落定/强调', build: '标题'};
const TABS = [['captions', '字幕'], ['elements', '画面'], ['shots', '镜头'], ['music', '音乐'], ['sfx', '音效'], ['export', '导出']] as const;

const S: Record<string, React.CSSProperties> = {
  app: {display: 'grid', gridTemplateColumns: 'minmax(360px, 42%) 1fr', height: '100%'},
  left: {display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, borderRight: '1px solid var(--line)', minWidth: 0},
  right: {display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0},
  head: {display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line)'},
  tabs: {display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap'},
  list: {overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1},
  row: {background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 6},
  line: {display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'},
  time: {fontVariantNumeric: 'tabular-nums', color: 'var(--sub)', cursor: 'pointer', minWidth: 52},
  sub: {color: 'var(--sub)', fontSize: 12},
};

function App() {
  const [st, setSt] = useState<Any>(null);
  const [ov, setOv] = useState<Any>({});
  const [tab, setTab] = useState<string>('captions');
  const [now, setNow] = useState(0);
  const [musicOn, setMusicOn] = useState(true);
  const [fast, setFast] = useState(() => localStorage.getItem('desk-fast') !== '0');
  const [fps, setFps] = useState(0);
  const [job, setJob] = useState<Any>({state: 'idle'});
  const [busy, setBusy] = useState('');
  const [px, setPx] = useState<Any>(null);
  useEffect(() => {  // the small preview copies are made in the background on first open
    const t = setInterval(async () => {
      const r = await (await fetch('/api/proxies')).json();
      setPx(r);
      if (r.total && r.done >= r.total) clearInterval(t);
    }, 1500);
    return () => clearInterval(t);
  }, []);
  const player = useRef<PlayerRef>(null);
  const stage = useRef<HTMLDivElement>(null);
  // what is selected: an element on screen, a caption or a shot; picked by clicking the preview or a row
  const [sel, setSel] = useState<{kind: 'el' | 'cap' | 'shot'; id: string} | null>(null);
  const [box, setBox] = useState<Any>(null);

  const load = useCallback(async () => {
    const s = await (await fetch('/api/state')).json();
    setSt(s);
    setOv(s.overrides ?? {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // save every edit (debounced)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => fetch('/api/overrides', {method: 'POST', body: JSON.stringify(ov)}), 300);
    return () => clearTimeout(t);
  }, [ov]);

  const base = st && (musicOn ? st.program : st.nomusic ?? st.program);
  const prog = useMemo(() => (base ? applyOverrides(base, ov, {music: musicOn}) : null), [base, ov, musicOn]);

  useEffect(() => {
    const p = player.current;
    if (!p || !prog) return;
    (window as Any).__player = p;
    let n = 0, t0 = performance.now();
    const f = (e: Any) => {
      setNow((e.detail.frame / prog.fps) * 1000);
      n++;
      const dt = performance.now() - t0;
      if (dt > 1000) { setFps(p.isPlaying() ? Math.round((n * 1000) / dt) : 0); n = 0; t0 = performance.now(); }
    };
    p.addEventListener('frameupdate', f);
    return () => p.removeEventListener('frameupdate', f);
  }, [prog]);

  useEffect(() => {
    if (job.state !== 'rendering' && job.state !== 'regenerating') return;
    const t = setInterval(async () => setJob(await (await fetch('/api/job')).json()), 1000);
    return () => clearInterval(t);
  }, [job.state]);

  useEffect(() => {
    const root = stage.current;
    if (!root || !sel) { setBox(null); return; }
    const q = sel.kind === 'el' ? `[data-el="${CSS.escape(sel.id)}"]` : sel.kind === 'cap' ? `[data-cap="${sel.id}"] > div` : null;
    const node = q ? root.querySelector(q) : null;
    if (!node) { setBox(null); return; }
    const rects = (getComputedStyle(node).display === 'contents' ? [...node.querySelectorAll('*')] : [node])
      .map((n) => n.getBoundingClientRect()).filter((r) => r.width > 2 && r.height > 2);
    if (!rects.length) { setBox(null); return; }
    const host = root.getBoundingClientRect();
    const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const x0 = cl(Math.min(...rects.map((r) => r.left)), host.left, host.right), y0 = cl(Math.min(...rects.map((r) => r.top)), host.top, host.bottom);
    const x1 = cl(Math.max(...rects.map((r) => r.right)), host.left, host.right), y1 = cl(Math.max(...rects.map((r) => r.bottom)), host.top, host.bottom);
    setBox(x1 - x0 > 2 && y1 - y0 > 2 ? {left: x0 - host.left, top: y0 - host.top, width: x1 - x0, height: y1 - y0} : null);
  }, [sel, now, prog]);

  // the selected row comes into view
  useEffect(() => {
    if (!sel) return;
    const key = sel.kind === 'el' ? sel.id : `${sel.kind}:${sel.id}`;
    const t = setTimeout(() => document.querySelector(`[data-row="${CSS.escape(key)}"]`)?.scrollIntoView({block: 'center', behavior: 'smooth'}), 60);
    return () => clearTimeout(t);
  }, [sel, tab]);

  if (!st || !prog) return <div style={{padding: 24}}>加载中…</div>;
  const seek = (ms: number) => player.current?.seekTo(Math.ceil((ms / 1000) * prog.fps));
  const upd = (fn: (o: Any) => void) => setOv((o: Any) => { const n = JSON.parse(JSON.stringify(o)); fn(n); return n; });
  const clean = (o: Any, k: string, id: string) => { if (o[k] && o[k][id] && !Object.keys(o[k][id]).filter((x) => x !== 'orig').length) delete o[k][id]; };
  const edits = countEdits(ov);

  return (
    <div style={S.app}>
      <div style={S.left}>
        <div ref={stage} className={fast ? 'fast-preview' : ''} style={{position: 'relative', cursor: 'pointer'}} title="点画面上的东西，右边会跳到它的编辑位置"
          onClick={(e) => {
            const t = e.target as HTMLElement;
            if (t.closest('button, input, [role=slider]')) return;  // the player's own controls
            // the player lays a transparent control layer over the picture, so the click lands on that: look at
            // everything stacked under the pointer and take the topmost thing that is part of the programme
            const under = document.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[];
            const el = under.map((n) => n.closest('[data-el]')?.getAttribute('data-el')).find(Boolean);
            const cap = under.map((n) => n.closest('[data-cap]')?.getAttribute('data-cap')).find((x) => x != null);
            if (el) { setTab('elements'); setSel({kind: 'el', id: el}); return; }
            if (cap != null) { setTab('captions'); setSel({kind: 'cap', id: cap}); return; }
            const shot = prog.shots.find((x: Any) => now >= x.startMs && now < x.endMs);
            if (shot) { setTab('shots'); setSel({kind: 'shot', id: shot.id}); }
          }}>
        <Player ref={player} clickToPlay={false} component={Main as Any} inputProps={prog} durationInFrames={Math.ceil((prog.durationMs / 1000) * prog.fps)}
          compositionWidth={prog.width} compositionHeight={prog.height} fps={prog.fps} controls acknowledgeRemotionLicense
          style={{height: 'calc(100vh - 90px)', aspectRatio: `${prog.width} / ${prog.height}`, maxWidth: '100%', borderRadius: 12, overflow: 'hidden'}} />
          {box ? <div style={{position: 'absolute', ...box, outline: '3px solid var(--accent)', outlineOffset: 3, borderRadius: 8, pointerEvents: 'none',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.25)'}} /> : null}
        </div>
        <div style={{...S.line, marginTop: 10, color: 'var(--sub)'}}>
          <span style={{fontVariantNumeric: 'tabular-nums'}}>{fmt(now)}</span>
          <label style={{display: 'flex', gap: 6, alignItems: 'center'}}><input type="checkbox" checked={musicOn} onChange={(e) => setMusicOn(e.target.checked)} />带音乐预览</label>
          <label style={{display: 'flex', gap: 6, alignItems: 'center'}} title="预览时去掉毛玻璃的模糊，播放更流畅；导出不受影响">
            <input type="checkbox" checked={fast} onChange={(e) => { setFast(e.target.checked); try { localStorage.setItem('desk-fast', e.target.checked ? '1' : '0'); } catch {} }} />流畅预览</label>
          {fps ? <span style={{fontSize: 12, color: fps >= 27 ? 'var(--green)' : 'var(--red)'}}>{fps} 帧/秒</span> : null}
        </div>
      </div>
      <div style={S.right}>
        <div style={S.head}>
          <strong style={{fontSize: 16}}>编辑台</strong>
          <span style={S.sub}>{st.work}</span>
          {px && px.total && px.done < px.total ? <span style={{color: 'var(--accent)', fontSize: 12}}>正在生成预览用的小视频 {px.done}/{px.total}，生成完刷新页面会更流畅</span> : null}
          <span style={{marginLeft: 'auto', color: edits ? 'var(--accent)' : 'var(--sub)'}}>{edits ? `${edits} 处修改（已自动保存）` : '还没有修改'}</span>
          <button className="ghost" disabled={!edits} onClick={() => confirm('撤销全部修改，回到 AI 生成的版本？') && setOv({})}>全部恢复</button>
        </div>
        <div style={S.tabs}>
          {TABS.map(([k, n]) => <button key={k} className={tab === k ? 'primary' : 'ghost'} onClick={() => setTab(k)}>{n}</button>)}
        </div>
        <div style={S.list}>
          {tab === 'captions' && <CaptionStyle base={base} prog={prog} ov={ov} upd={upd} busy={busy} relayout={async () => {
            setBusy('正在按新的字幕位置重新排版…');
            const r = await (await fetch('/api/regenerate', {method: 'POST'})).json();
            setBusy(r.ok ? '' : '重新排版失败：' + (r.log ?? r.error ?? '').slice(-300));
            if (r.ok) load();
          }} />}
          {tab === 'captions' && <Captions base={base} prog={prog} ov={ov} upd={upd} seek={seek} now={now} sel={sel} setSel={setSel} />}
          {tab === 'elements' && <Elements base={base} ov={ov} upd={upd} clean={clean} seek={seek} sel={sel} setSel={setSel} now={now} />}
          {tab === 'shots' && <Shots base={base} ov={ov} upd={upd} seek={seek} sel={sel} setSel={setSel} />}
          {tab === 'music' && <Music st={st} ov={ov} upd={upd} busy={busy} regenerate={async () => {
            setBusy('换曲中，正在重新生成（约半分钟）…');
            const r = await (await fetch('/api/regenerate', {method: 'POST'})).json();
            setBusy(r.ok ? '' : '重新生成失败：' + (r.log ?? r.error ?? '').slice(-300));
            if (r.ok) load();
          }} />}
          {tab === 'sfx' && <Sfx base={base} prog={prog} st={st} ov={ov} upd={upd} seek={seek} />}
          {tab === 'export' && <Export job={job} start={async (music: boolean) => {
            const r = await (await fetch('/api/render', {method: 'POST', body: JSON.stringify({music})})).json();
            if (r.ok) setJob({state: 'rendering', out: r.out, progress: 0});
          }} />}
        </div>
      </div>
    </div>
  );
}

function CaptionStyle({base, prog, ov, upd, busy, relayout}: Any) {
  const st = prog.captionStyle ?? {};
  const portrait = prog.height > prog.width;
  const bottom = st.bottom ?? (portrait ? 0.20 : 0.065);
  const bg = st.bg ?? true, op = st.bgOpacity ?? 0.45, rad = st.radius ?? 0.5;
  const set = (k: string, v: Any) => upd((n: Any) => { n.captionStyle ??= {}; n.captionStyle[k] = v; });
  // from the latest position, so quick repeated clicks all count
  const nudge = (d: number) => upd((n: Any) => {
    n.captionStyle ??= {};
    const cur = n.captionStyle.bottom ?? bottom;
    n.captionStyle.bottom = Math.min(0.4, Math.max(0.03, +(cur + d).toFixed(3)));
  });
  const gen = base.captionStyle ?? {};  // what the panels were laid out around
  const moved = ov.captionStyle && ['bottom', 'bg'].some((k) => k in ov.captionStyle && ov.captionStyle[k] !== gen[k]);
  return (
    <div style={{...S.row, position: 'sticky', top: -12, zIndex: 2}} className={ov.captionStyle ? 'edited' : ''}>
      <div style={S.line}>
        <strong>字幕样式</strong><span style={S.sub}>对全部字幕生效</span>
        {ov.captionStyle ? <button className="ghost" style={{marginLeft: 'auto'}} onClick={() => upd((n: Any) => delete n.captionStyle)}>恢复默认</button> : null}
      </div>
      <div style={S.line}>
        位置 <button onClick={() => nudge(0.01)}>上移</button>
        <button onClick={() => nudge(-0.01)}>下移</button>
        <span style={S.sub}>距底部 {Math.round(bottom * 100)}%</span>
      </div>
      <div style={S.line}>
        <label style={{display: 'flex', gap: 6, alignItems: 'center'}}><input type="checkbox" checked={bg} onChange={(e) => set('bg', e.target.checked)} />黑色半透明底</label>
      </div>
      {bg ? <>
        <div style={S.line}>透明度 <input type="range" min={0.1} max={0.85} step={0.05} value={op} style={{flex: 1}} onChange={(e) => set('bgOpacity', Number(e.target.value))} /><span style={S.sub}>{Math.round(op * 100)}%</span></div>
        <div style={S.line}>圆角 <input type="range" min={0} max={1} step={0.05} value={rad} style={{flex: 1}} onChange={(e) => set('radius', Number(e.target.value))} /><span style={S.sub}>{rad >= 0.99 ? '全圆' : Math.round(rad * 100) + '%'}</span></div>
      </> : null}
      {moved ? <div style={{...S.line, ...S.sub}}>人物镜头里的玻璃面板会在导出时按新位置自动重新排版；想现在就看效果，点
        <button disabled={!!busy} onClick={relayout}>重新排版</button></div> : null}
      {busy ? <div style={{color: 'var(--accent)'}}>{busy}</div> : null}
    </div>
  );
}

const picked = (on: boolean): React.CSSProperties => (on ? {outline: '2px solid var(--accent)', background: '#1f1a12'} : {});
const notControl = (e: Any) => !(e.target as HTMLElement).closest('button, input, textarea, select, label');

function Captions({base, prog, ov, upd, seek, now, sel, setSel}: Any) {
  return base.captions.map((c: Any, i: number) => {
    const o = ov.captions?.[i];
    const cur = prog.captions[i] ?? c;
    const on = now >= cur.startMs && now < cur.endMs;
    const set = (k: string, v: Any) => upd((n: Any) => {
      n.captions ??= {};
      n.captions[i] ??= {orig: c.text};
      n.captions[i][k] = v;
      if (k === 'text' && v === c.text) delete n.captions[i].text;
      if (Object.keys(n.captions[i]).length === 1) delete n.captions[i];
    });
    const nudge = (k: 'startMs' | 'endMs', d: number) => set(k, (o?.[k] ?? c[k]) + d);
    return (
      <div key={i} data-row={`cap:${i}`} style={{...S.row, outline: on ? '1px solid var(--accent)' : undefined, ...picked(sel?.kind === 'cap' && sel.id === String(i))}}
        className={o ? 'edited' : ''} onClick={(e) => { if (notControl(e)) { setSel({kind: 'cap', id: String(i)}); seek(cur.startMs + 1); } }}>
        <div style={S.line}>
          <span style={S.time} onClick={() => seek(cur.startMs + 1)}>{fmt(cur.startMs)}</span>
          <input style={{flex: 1, minWidth: 160}} value={o?.text ?? c.text} onChange={(e) => set('text', e.target.value)} />
        </div>
        <div style={{...S.line, ...S.sub}}>
          开始 <button onClick={() => nudge('startMs', -100)}>-0.1s</button><button onClick={() => nudge('startMs', 100)}>+0.1s</button>
          结束 <button onClick={() => nudge('endMs', -100)}>-0.1s</button><button onClick={() => nudge('endMs', 100)}>+0.1s</button>
          {o ? <button className="ghost" onClick={() => upd((n: Any) => delete n.captions[i])}>恢复</button> : null}
        </div>
      </div>
    );
  });
}

function Elements({base, ov, upd, clean, seek, sel, setSel, now}: Any) {
  const items = listElements(base).filter((x: Any) => !['arrow'].includes(x.kind));
  return items.map((it: Any) => {
    const o = ov.elements?.[it.id] ?? {};
    const fields = it.where === 'bigWord' || it.where === 'behind' ? [{path: '/text', value: it.el.text}] : textFields(it.el.props ?? {}, '/props');
    const set = (fn: (e: Any) => void) => upd((n: Any) => { n.elements ??= {}; n.elements[it.id] ??= {}; fn(n.elements[it.id]); clean(n, 'elements', it.id); });
    return (
      <div key={it.id} data-row={it.id} style={{...S.row, opacity: o.hidden ? 0.5 : 1, ...picked(sel?.kind === 'el' && sel.id === it.id)}}
        className={Object.keys(o).length ? 'edited' : ''} onClick={(e) => {
          if (!notControl(e)) return;
          setSel({kind: 'el', id: it.id});
          seek(it.atMs + (o.shiftMs ?? 0) + 600);  // the moment it has fully come in
        }}>
        <div style={S.line}>
          <span style={S.time} onClick={() => seek(it.atMs + (o.shiftMs ?? 0) + 400)}>{fmt(it.atMs + (o.shiftMs ?? 0))}</span>
          <strong>{KIND[it.kind] ?? it.kind}</strong><span style={S.sub}>{it.shot}</span>
          <span style={{marginLeft: 'auto', ...S.line}}>
            <button onClick={() => set((e) => { e.shiftMs = (e.shiftMs ?? 0) - 200; if (!e.shiftMs) delete e.shiftMs; })}>早 0.2s</button>
            <button onClick={() => set((e) => { e.shiftMs = (e.shiftMs ?? 0) + 200; if (!e.shiftMs) delete e.shiftMs; })}>晚 0.2s</button>
            <button onClick={() => set((e) => { e.hidden = !e.hidden; if (!e.hidden) delete e.hidden; })}>{o.hidden ? '显示' : '隐藏'}</button>
            {Object.keys(o).length ? <button className="ghost" onClick={() => upd((n: Any) => delete n.elements[it.id])}>恢复</button> : null}
          </span>
        </div>
        {!o.hidden && fields.map((f: Any) => {
          const v = o.text?.[f.path] ?? f.value;
          // editing one state of a panel: show that state (its own time), otherwise the element as it comes in
          const st = /\/states\/(\d+)\//.exec(f.path);
          const stAt = st ? it.el.props.states?.[Number(st[1])]?.at : null;
          const showAt = stAt != null ? (it.where === 'elements' ? it.atMs - it.el.atMs + stAt : stAt) + 500 : it.atMs + (o.shiftMs ?? 0) + 600;
          return <textarea key={f.path} rows={Math.min(4, v.split('\n').length)} value={v}
            onFocus={() => { setSel({kind: 'el', id: it.id}); seek(showAt + (o.shiftMs ?? 0) * (stAt != null ? 1 : 0)); }} onChange={(e) => set((x) => {
            x.text ??= {};
            if (e.target.value === f.value) delete x.text[f.path]; else x.text[f.path] = e.target.value;
            if (!Object.keys(x.text).length) delete x.text;
          })} />;
        })}
      </div>
    );
  });
}

function Shots({base, ov, upd, seek, sel, setSel}: Any) {
  return base.shots.map((s: Any, i: number) => {
    const o = ov.shots?.[s.id];
    const shift = (d: number) => upd((n: Any) => { n.shots ??= {}; const v = (n.shots[s.id]?.shiftMs ?? 0) + d; if (v) n.shots[s.id] = {shiftMs: v}; else delete n.shots[s.id]; });
    const name = s.type === 'presenter' ? '人物' : s.type === 'canvas' ? (s.layout === 'recall' ? '画布·回看' : '画布') : '素材';
    return (
      <div key={s.id} data-row={`shot:${s.id}`} style={{...S.row, ...picked(sel?.kind === 'shot' && sel.id === s.id)}}
        className={o || (s.zoom ?? []).some((_: Any, k: number) => ov.zoom?.[`${s.id}#${k}`]) ? 'edited' : ''}
        onClick={(e) => { if (notControl(e)) { setSel({kind: 'shot', id: s.id}); seek(s.startMs + (o?.shiftMs ?? 0) + 1); } }}>
        <div style={S.line}>
          <span style={S.time} onClick={() => seek(s.startMs + (o?.shiftMs ?? 0) + 1)}>{fmt(s.startMs + (o?.shiftMs ?? 0))}</span>
          <strong>{name}</strong><span style={S.sub}>{s.id} · {((s.endMs - s.startMs) / 1000).toFixed(1)}s</span>
          {i > 0 ? <span style={{marginLeft: 'auto', ...S.line}}>
            切入点 <button onClick={() => shift(-200)}>早 0.2s</button><button onClick={() => shift(200)}>晚 0.2s</button>
            {o ? <button className="ghost" onClick={() => upd((n: Any) => delete n.shots[s.id])}>恢复</button> : null}
          </span> : null}
        </div>
        {(s.zoom ?? []).map((z: Any, k: number) => {
          const off = ov.zoom?.[`${s.id}#${k}`]?.off;
          return <div key={k} style={{...S.line, ...S.sub}}>
            <span style={S.time} onClick={() => seek(z.atMs)}>{fmt(z.atMs)}</span>
            景别变化 {z.type === 'push' ? '慢推' : z.scale > 1.01 ? '推近' : '拉回'} ×{z.scale}
            <button onClick={() => upd((n: Any) => { n.zoom ??= {}; if (off) delete n.zoom[`${s.id}#${k}`]; else n.zoom[`${s.id}#${k}`] = {off: true}; })}>{off ? '恢复' : '关掉'}</button>
          </div>;
        })}
      </div>
    );
  });
}

function Music({st, ov, upd, regenerate, busy}: Any) {
  const m = ov.music ?? {};
  const set = (k: string, v: Any) => upd((n: Any) => { n.music ??= {}; if (v === undefined) delete n.music[k]; else n.music[k] = v; if (!Object.keys(n.music).length) delete n.music; });
  const cur = st.program.music;
  const [pick, setPick] = useState(m.track ?? cur?.track ?? '');
  return (
    <>
      <div style={S.row}>
        <div style={S.line}><strong>背景音乐</strong><span style={S.sub}>{cur ? `${cur.track} · ${Math.round(cur.bpm)} BPM` : '这条没有配乐'}</span>
          <label style={{marginLeft: 'auto', display: 'flex', gap: 6}}><input type="checkbox" checked={!m.off} onChange={(e) => set('off', e.target.checked ? undefined : true)} />开启</label></div>
      </div>
      <div style={S.row}>
        <div style={S.line}><strong>整体音量</strong><span style={S.sub}>{m.gainDb ? `${m.gainDb > 0 ? '+' : ''}${m.gainDb} dB` : '默认'}</span>
          {m.gainDb ? <button className="ghost" style={{marginLeft: 'auto'}} onClick={() => set('gainDb', undefined)}>恢复</button> : null}</div>
        <input type="range" min={-12} max={8} step={1} value={m.gainDb ?? 0} onChange={(e) => set('gainDb', Number(e.target.value) || undefined)} />
        <div style={S.sub}>说话时、停顿时、转场涌起都按同样的比例变化</div>
      </div>
      <div style={S.row}>
        <div style={S.line}><strong>转场重音</strong><span style={S.sub}>转场落在拍子上时画面一推、音乐涌起</span>
          <label style={{marginLeft: 'auto', display: 'flex', gap: 6}}><input type="checkbox" checked={m.accents !== false} onChange={(e) => set('accents', e.target.checked ? undefined : false)} />开启</label></div>
      </div>
      <div style={S.row}>
        <div style={S.line}><strong>换曲子</strong><span style={S.sub}>换曲后会重新生成整条（卡点要按新曲子的拍子重算），约半分钟</span></div>
        <div style={S.line}>
          <select style={{flex: 1}} value={pick} onChange={(e) => setPick(e.target.value)}>
            {st.tracks.map((t: Any) => <option key={t.id} value={t.id}>{t.id}（{Math.round(t.bpm)} BPM）{t.id === st.prefs?.default ? ' · 默认' : ''}</option>)}
          </select>
          <button className="primary" disabled={!!busy || pick === cur?.track} onClick={() => { set('track', pick === st.prefs?.default ? undefined : pick); setTimeout(regenerate, 400); }}>换成这首</button>
        </div>
        {busy ? <div style={{color: 'var(--accent)'}}>{busy}</div> : null}
      </div>
    </>
  );
}

function Sfx({base, prog, st, ov, upd, seek}: Any) {
  const idx = st.sfx as Record<string, Any>;
  const g = ov.sfx?.gainDb ?? 0;
  const play = (src: string) => new Audio('/' + src).play();
  const roleOf = (src: string) => idx[src.replace(/^sfx\//, '').replace(/\.mp3$/, '')]?.role;
  const byRole = Object.entries(idx).reduce((a: Any, [k, v]: Any) => ((a[v.role] ??= []).push([k, v]), a), {});
  return (
    <>
      <div style={S.row}>
        <div style={S.line}><strong>音效整体音量</strong><span style={S.sub}>{g ? `${g > 0 ? '+' : ''}${g} dB` : '默认'}</span></div>
        <input type="range" min={-12} max={8} step={1} value={g} onChange={(e) => upd((n: Any) => { n.sfx ??= {}; const v = Number(e.target.value); if (v) n.sfx.gainDb = v; else delete n.sfx.gainDb; })} />
      </div>
      {base.sfx.map((s: Any) => {
        const k = sfxKey(s);
        const o = ov.sfx?.cues?.[k];
        const src = o?.src ?? s.src;
        const set = (v: Any) => upd((n: Any) => { n.sfx ??= {}; n.sfx.cues ??= {}; if (v) n.sfx.cues[k] = v; else delete n.sfx.cues[k]; });
        const role = roleOf(s.src);
        return (
          <div key={k} style={{...S.row, opacity: o?.off ? 0.5 : 1}} className={o ? 'edited' : ''}>
            <div style={S.line}>
              <span style={S.time} onClick={() => seek(s.atMs - 300)}>{fmt(s.atMs)}</span>
              <select value={src} disabled={o?.off} onChange={(e) => set(e.target.value === s.src ? null : {src: e.target.value})}>
                {Object.entries(byRole).map(([r, list]: Any) => (
                  <optgroup key={r} label={(ROLE[r] ?? r) + (r === role ? '（同类）' : '')}>
                    {list.map(([n, v]: Any) => <option key={n} value={`sfx/${n}.mp3`}>{v.name} — {v.use}</option>)}
                  </optgroup>
                ))}
              </select>
              <button onClick={() => play(src)}>试听</button>
              <button onClick={() => set(o?.off ? null : {off: true})}>{o?.off ? '恢复' : '关掉'}</button>
            </div>
          </div>
        );
      })}
    </>
  );
}

function Export({job, start}: Any) {
  const busy = job.state === 'rendering';
  return (
    <>
      <div style={S.row}>
        <strong>导出成片</strong>
        <div style={S.sub}>用和 skill 一样的渲染程序、原分辨率、同样的画质设置，从原始素材重新渲染，画质和直接出片完全一样。</div>
        <div style={S.line}>
          <button className="primary" disabled={busy} onClick={() => start(true)}>导出（带音乐）</button>
          <button disabled={busy} onClick={() => start(false)}>导出（不带音乐，去剪映配乐）</button>
        </div>
      </div>
      {job.state !== 'idle' ? (
        <div style={S.row}>
          <div style={S.line}><strong>{busy ? '渲染中…' : job.state === 'done' ? '完成' : job.state === 'error' ? '出错了' : job.state}</strong>
            {busy ? <span style={S.sub}>{Math.round((job.progress ?? 0) * 100)}%</span> : null}</div>
          {busy ? <div style={{height: 6, background: '#262932', borderRadius: 3}}><div style={{height: 6, width: `${(job.progress ?? 0) * 100}%`, background: 'var(--accent)', borderRadius: 3}} /></div> : null}
          {job.out ? <div style={S.sub}>{job.out}</div> : null}
          {job.state === 'error' ? <pre style={{whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--red)'}}>{job.log}</pre> : null}
        </div>
      ) : null}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
