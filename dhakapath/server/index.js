// DhakaPath server (architecture doc §1): one process, static SPA + JSON API, in-memory state with a
// state.json snapshot, optional free-tier AI. `npm start` -> http://localhost:3000
//
// Default: the built-in Express-compatible app (server/http.js, zero dependencies).
// USE_EXPRESS=1 (after `npm install`): the same route files mounted on real Express.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnv } from './env.js';
import { makeApp } from './store/boot.js';
import { snapshot, restore } from './store/state.js';
import { nodeListener } from './http.js';
import { providers } from './ai/llm.js';
import { errorEnvelope } from './middleware.js';
import { fail } from './routes/_util.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, '..', 'public');

// Builds the app and wires persistence. stateFile: path or null (memory only).
export function createServer(opts = {}) {
  const app = makeApp(opts);
  const { state } = app.locals;
  const file = opts.stateFile || null;
  if (file && existsSync(file)) {
    try { restore(state, JSON.parse(readFileSync(file, 'utf8'))); } catch (e) { (opts.log || console.error)(`ignoring unreadable state file: ${e.message}`); }
  }
  const save = () => { if (!file) return; mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(snapshot(state))); renameSync(tmp, file); };
  const listener = nodeListener(app, { staticDir: PUBLIC, bodyLimit: 10 * 1024, readFile, path });
  const server = http.createServer(async (req, res) => {
    const end = res.end.bind(res);
    if (file && req.method !== 'GET' && req.method !== 'HEAD' && req.url.startsWith('/api/')) {
      res.end = (...a) => {   // after any successful change, snapshot the state (reset deletes it)
        try { if (req.url.startsWith('/api/admin/reset') && res.statusCode < 400) rmSync(file, { force: true }); else if (res.statusCode < 400) save(); } catch (e) { (opts.log || console.error)(`could not save state: ${e.message}`); }
        return end(...a);
      };
    }
    try { await listener(req, res); } catch (e) { (opts.log || console.error)(e.stack || String(e)); if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json' }); end(JSON.stringify({ ok: false, data: null, error: { code: 'server_error', message: 'Something went wrong.' } })); } }
  });
  server.app = app;
  return server;
}

async function createExpressServer(opts) {
  const { default: express } = await import('express');   // untested in the build environment (no npm access there)
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  makeApp({ ...opts, app });
  app.use(express.static(PUBLIC));
  app.use('/api', (req, res) => fail(res, 404, 'not_found', `No route for ${req.method} ${req.path}`));
  app.use(errorEnvelope(opts.log));          // invalid JSON -> 400, too large -> 413, anything thrown -> 500 envelope
  return http.createServer(app);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  loadEnv(path.join(ROOT, '..', '.env'));
  // last line of defence: log and keep serving instead of exiting on a stray rejection
  process.on('unhandledRejection', (e) => console.error('unhandled rejection:', e && e.stack ? e.stack : e));
  const env = process.env;
  const port = Number(env.PORT) || 3000;
  const quiet = env.LOG === 'off';
  const log = quiet ? null : (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);
  let adminPassword = env.ADMIN_PASSWORD || null;
  if (!adminPassword) { adminPassword = Math.random().toString(36).slice(2, 10); console.log(`ADMIN_PASSWORD not set; one-time admin password for this run: ${adminPassword}`); }
  const stateFile = env.STATE_FILE === 'off' ? null : env.STATE_FILE || path.join(ROOT, '..', 'data', 'state.json');
  const opts = { env, adminPassword, stateFile, log, start: Date.now(), speed: Number(env.CLOCK_SPEED ?? 1) };
  let server;
  try { server = env.USE_EXPRESS === '1' ? await createExpressServer(opts) : createServer(opts); }
  catch (e) { console.error(e.name === 'ConfigError' ? `Cannot start: ${e.message}. Fix server/config.json.` : e.stack || e); process.exit(1); }
  server.listen(port, () => {
    const ai = providers(env).map((p) => p.name);
    console.log(`DhakaPath on http://localhost:${port}  (${env.USE_EXPRESS === '1' ? 'Express' : 'built-in router'}; AI: ${ai.length ? ai.join(' then ') + ', rule parser fallback' : 'rule parser only'}; state: ${stateFile || 'memory only'})`);
  });
}
