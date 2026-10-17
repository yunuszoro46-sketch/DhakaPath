// Static serving of the single frontend (ADR-001): `/` is the app, there is no second UI under
// `/app`, vendored Leaflet and its licence ship with it, and the static handler never leaves public/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from '../server/index.js';

async function withServer(fn) {
  const srv = createServer({ env: {}, adminPassword: 'test-pw' }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = async (p) => { const res = await fetch(base + p); return { status: res.status, type: res.headers.get('content-type') || '', text: await res.text() }; };
  try { await fn(get); } finally { srv.close(); }
}

test('the app is served at / with its stylesheet, modules and vendored Leaflet', async () => {
  await withServer(async (get) => {
    const home = await get('/');
    assert.equal(home.status, 200); assert.match(home.type, /text\/html/);
    for (const id of ['search-out', 'sim-out', 'ingest-form', 'fc-form', 'chat-dock', 'lmap', 'map']) assert.ok(home.text.includes(`id="${id}"`), `index.html has #${id}`);
    assert.ok(!/\/app\//.test(home.text), 'no link to a second UI');
    assert.ok(/openstreetmap\.org\/copyright|OpenStreetMap/.test(readFileSync(new URL('../public/js/streetMap.js', import.meta.url), 'utf8')), 'OSM attribution kept');
    for (const [p, re] of [['/styles.css', /text\/css/], ['/js/main.js', /javascript/], ['/vendor/leaflet/leaflet.js', /javascript/], ['/vendor/leaflet/leaflet.css', /text\/css/]]) {
      const r = await get(p); assert.equal(r.status, 200, p); assert.match(r.type, re, p);
    }
    assert.match((await get('/vendor/leaflet/LICENSE')).text, /Copyright/);
  });
});

test('no second frontend: /app and /app/anything are plain 404s, not an SPA fallback', async () => {
  await withServer(async (get) => {
    for (const p of ['/app', '/app/', '/app/admin', '/app/assets/index.js']) assert.equal((await get(p)).status, 404, p);
  });
});

test('static handler stays inside public/ and unknown API paths return the JSON envelope', async () => {
  await withServer(async (get) => {
    const esc = await get('/..%2F..%2Fpackage.json');
    assert.ok([403, 404].includes(esc.status), `traversal blocked (${esc.status})`);
    assert.ok(!esc.text.includes('"scripts"'), 'package.json not leaked');
    const api = await get('/api/does-not-exist');
    assert.equal(api.status, 404); assert.match(api.type, /json/);
    const j = JSON.parse(api.text); assert.equal(j.ok, false); assert.equal(j.data, null); assert.ok(j.error && j.error.code);
  });
});
