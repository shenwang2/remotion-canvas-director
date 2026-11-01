import os from 'node:os';
// The edit desk: a local page that previews the programme with the hand edits on top, saves them next to it
// (overrides.json), regenerates when the music track changes, and exports with the same renderer as the skill.
//   DESK_WORK=<work dir> npx vite --config desk/vite.config.mjs
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {applyOverrides} from './overrides.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.dirname(HERE);
const WORK = process.env.DESK_WORK;
if (!WORK) throw new Error('set DESK_WORK to the work directory');
const SFX_DIR = path.join(WORK, 'public', 'sfx');
const MUSIC_ROOT = process.env.CANVAS_MUSIC_ROOT || path.join(os.homedir(), 'canvas-director-music');
const PY = process.env.DESK_PYTHON || 'python';

const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : d);
const send = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};
const body = (req) => new Promise((ok) => {
  let s = '';
  req.on('data', (c) => (s += c));
  req.on('end', () => ok(s ? JSON.parse(s) : {}));
});

let job = {state: 'idle', log: '', out: null, progress: 0};

// re-runs the programme script; finalize picks up overrides.json (music.track, captionStyle)
async function regenerate() {
  const dir = path.join(WORK, 'scripts');
  const script = fs.readdirSync(dir).filter((f) => /^program.*\.py$/.test(f) && !/_v\d/.test(f))
    .map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!script) {
    job.log = 'no programme script in ' + dir;
    return 1;
  }
  job = {state: 'regenerating', log: '', out: null, progress: 0};
  const code = await run(PY, [`"${script}"`], {cwd: WORK, env: {...process.env, PYTHONIOENCODING: 'utf-8'}});
  job.state = code === 0 ? 'idle' : 'error';
  return code;
}

// ---- preview proxies: small, seek-friendly copies of every video, used only by the preview. Export always
// renders from the originals, so the finished video is untouched by this.
const PROXY = path.join(WORK, '.desk-proxy');
const proxies = {done: 0, total: 0, current: ''};
const fresh = (src, dst) => fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs;
async function makeProxies() {
  const dir = path.join(WORK, 'public', 'media');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => /\.(mp4|mov|webm|m4v)$/i.test(f));
  proxies.total = files.length;
  fs.mkdirSync(path.join(PROXY, 'media'), {recursive: true});
  const fit = "scale='if(gt(iw,ih),min(960,iw),-2)':'if(gt(iw,ih),-2,min(960,ih))'";
  for (const f of files) {
    const src = path.join(dir, f), dst = path.join(PROXY, 'media', f);
    proxies.current = f;
    if (!fresh(src, dst)) {
      const tmp = dst + '.part' + path.extname(f);
      const args = /\.webm$/i.test(f)
        // cut-outs keep their transparency
        ? ['-v', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', `"${src}"`, '-vf', `"${fit}"`, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
          '-b:v', '1500k', '-deadline', 'realtime', '-cpu-used', '8', '-g', '15', '-auto-alt-ref', '0', '-an', `"${tmp}"`]
        : ['-v', 'error', '-y', '-i', `"${src}"`, '-vf', `"${fit}"`, '-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '30', '-g', '15',
          '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', `"${tmp}"`];
      const code = await new Promise((ok) => spawn('ffmpeg', args, {shell: true}).on('close', ok));
      if (code === 0) fs.renameSync(tmp, dst);
    }
    proxies.done++;
  }
  proxies.current = '';
}

const TYPES = {'.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.json': 'application/json'};
function serveFile(req, res, file) {
  const size = fs.statSync(file).size;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  if (!m) {
    res.setHeader('Content-Length', size);
    return fs.createReadStream(file).pipe(res);
  }
  const start = m[1] ? Number(m[1]) : size - Number(m[2]);
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  res.statusCode = 206;
  res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  res.setHeader('Content-Length', end - start + 1);
  fs.createReadStream(file, {start, end}).pipe(res);
}

function run(cmd, args, opts, onLine) {
  return new Promise((ok) => {
    const p = spawn(cmd, args, {shell: true, ...opts});
    const take = (b) => {
      const s = b.toString();
      job.log = (job.log + s).slice(-4000);
      onLine?.(s);
    };
    p.stdout.on('data', take);
    p.stderr.on('data', take);
    p.on('close', ok);
  });
}

function api() {
  return {
    name: 'desk-api',
    configureServer(server) {
      makeProxies();
      server.middlewares.use(handler);
    },
    // the desk normally runs as a production build (start.mjs builds, then serves it): React's development checks
    // on every frame are what make a preview stutter
    configurePreviewServer(server) {
      makeProxies();
      server.middlewares.use(handler);
    },
  };
}

async function handler(req, res, next) {
        const url = decodeURIComponent(req.url.split('?')[0]);
        if (url.startsWith('/media/')) {  // the preview plays the small copy once it is ready
          const src = path.join(WORK, 'public', url), px = path.join(PROXY, url);
          if (fs.existsSync(src) && fresh(src, px)) return serveFile(req, res, px);
        }
        // the work's public files (media, music, sound effects) straight from disk
        if (!url.startsWith('/api/') && !url.startsWith('/assets/') && url !== '/') {
          const f = path.join(WORK, 'public', url);
          if (f.startsWith(path.join(WORK, 'public')) && fs.existsSync(f) && fs.statSync(f).isFile()) return serveFile(req, res, f);
        }
        if (url === '/api/proxies') return send(res, 200, proxies);
        if (!url.startsWith('/api/')) return next();
        try {
          if (url === '/api/state') {
            const prog = readJson(path.join(WORK, 'program.json'));
            const nomusic = readJson(path.join(WORK, 'program.nomusic.json'));
            const ov = readJson(path.join(WORK, 'overrides.json'), {});
            const sfx = readJson(path.join(SFX_DIR, 'sfx.json'), {});
            const cat = readJson(path.join(MUSIC_ROOT, 'catalog.json'), {tracks: {}});
            const tracks = Object.entries(cat.tracks).map(([k, v]) => ({id: k, mood: v.mood, bpm: v.bpm, duration: v.duration}));
            return send(res, 200, {work: WORK, program: prog, nomusic: nomusic, overrides: ov, sfx, tracks,
              prefs: readJson(path.join(MUSIC_ROOT, '偏好.json'), {})});
          }
          if (url === '/api/overrides' && req.method === 'POST') {
            const ov = await body(req);
            fs.writeFileSync(path.join(WORK, 'overrides.json'), JSON.stringify(ov, null, 1), 'utf-8');
            return send(res, 200, {ok: true});
          }
          if (url === '/api/regenerate' && req.method === 'POST') {
            const code = await regenerate();
            return send(res, code === 0 ? 200 : 500, {ok: code === 0, log: job.log});
          }
          if (url === '/api/render' && req.method === 'POST') {
            if (job.state === 'rendering') return send(res, 409, {error: 'already rendering'});
            const {music = true} = await body(req);
            // the captions were moved: lay the presenter panels out again around them first
            const ov0 = readJson(path.join(WORK, 'overrides.json'), {});
            const gen = readJson(path.join(WORK, 'program.json'), {}).captionStyle ?? {};
            if (ov0.captionStyle && ['bottom', 'bg'].some((k) => k in ov0.captionStyle && ov0.captionStyle[k] !== gen[k])) await regenerate();
            const base = readJson(path.join(WORK, music ? 'program.json' : 'program.nomusic.json')) ?? readJson(path.join(WORK, 'program.json'));
            const ov = readJson(path.join(WORK, 'overrides.json'), {});
            const prog = applyOverrides(base, ov, {music});
            const props = path.join(WORK, 'program.edited.json');
            fs.writeFileSync(props, JSON.stringify(prog), 'utf-8');
            fs.mkdirSync(path.join(WORK, 'out'), {recursive: true});
            const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
            const out = path.join(WORK, 'out', `成片_${music ? '带音乐' : '无音乐'}_${stamp}.mp4`);
            job = {state: 'rendering', log: '', out, progress: 0};
            send(res, 200, {ok: true, out});
            const code = await run('npx', ['remotion', 'render', 'src/index.ts', 'Main', `"${out}"`, `--props="${props}"`,
              `--public-dir="${path.join(WORK, 'public')}"`, '--codec=h264', '--crf=18'], {cwd: RUNTIME}, (s) => {
              const m = [...s.matchAll(/(\d+)\/(\d+)/g)].pop();
              if (m) job.progress = Number(m[1]) / Number(m[2]);
            });
            job.state = code === 0 ? 'done' : 'error';
            return;
          }
          if (url === '/api/job') return send(res, 200, job);
          next();
        } catch (e) {
          send(res, 500, {error: String(e)});
        }
}

export default defineConfig({
  root: HERE,
  publicDir: false,  // served from disk by the handler, never copied into the build
  build: {outDir: path.join(HERE, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 4000},
  plugins: [react(), api()],
  server: {host: '127.0.0.1', port: Number(process.env.DESK_PORT || 5180), fs: {allow: [RUNTIME, WORK]}},
  preview: {host: '127.0.0.1', port: Number(process.env.DESK_PORT || 5180)},
  clearScreen: false,
});
