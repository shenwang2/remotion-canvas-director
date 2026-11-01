// Opens the edit desk for one work directory:  node desk/start.mjs <work dir> [port] [--dev]
// Builds the page for production first (smooth preview), then serves it; --dev runs the dev server instead.
// The port: the one given, else $PORT (set by the desktop app's launcher), else the first free one from 5180 -
// Windows sometimes reserves a whole range of ports after a restart, so a fixed port can fail to open.
import {build, createServer, preview} from 'vite';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dev = process.argv.includes('--dev');
const [work, portArg] = args;
if (!work) {
  console.error('usage: node desk/start.mjs <work dir> [port] [--dev]');
  process.exit(1);
}
const canListen = (port) => new Promise((ok) => {
  const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true)));
  s.listen(port, '127.0.0.1');
});
async function pickPort() {
  for (const p of [portArg, process.env.PORT].filter(Boolean).map(Number)) if (await canListen(p)) return p;
  for (let p = 5180; p < 5400; p++) if (await canListen(p)) return p;
  throw new Error('no free port between 5180 and 5400');
}
process.env.DESK_WORK = path.resolve(work);
process.env.DESK_PORT = String(await pickPort());
const configFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vite.config.mjs');
if (dev) {
  const server = await createServer({configFile});
  await server.listen();
  server.printUrls();
} else {
  await build({configFile, logLevel: 'warn'});
  const server = await preview({configFile});
  server.printUrls();
}
console.log(`编辑台已打开：http://127.0.0.1:${process.env.DESK_PORT}`);
