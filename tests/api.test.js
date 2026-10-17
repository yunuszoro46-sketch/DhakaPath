// REST contract over real HTTP: {ok, data, error} everywhere, admin token gate, anonymous user ids,
// rate limits, demo helpers, global scenario, audit log, persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../server/index.js';

async function withServer(fn, opts = {}) {
  const srv = createServer({ env: {}, adminPassword: 'test-pw', ...opts }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, p, body, { user = 'tester-1', token, raw } = {}) => {
    const headers = { 'content-type': 'application/json', 'x-user-id': user };
    if (token) headers.authorization = 'Bearer ' + token;
    const res = await fetch(base + p, { method, headers, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, data: json && json.data, error: json && json.error, type: res.headers.get('content-type') };
  };
  const login = async () => (await call('POST', '/api/admin/login', { password: 'test-pw' })).data.token;
  try { await fn(call, login); } finally { srv.close(); }
}
const sig = (o) => o.signature;

test('envelope: {ok, data, error} on success and on every kind of error', async () => {
  await withServer(async (call) => {
    const net = await call('GET', '/api/network');
    assert.deepEqual([net.json.ok, net.json.error, net.data.hubs.length], [true, null, 14]);
    assert.match(net.data.notice, /not official/i);
    const e1 = await call('POST', '/api/search', {});
    assert.deepEqual([e1.status, e1.json.ok, e1.error.code], [400, false, 'missing_field']);
    assert.equal((await call('POST', '/api/search', { origin: 'Narnia', destination: 'MOT' })).error.code, 'unknown_hub');
    assert.equal((await call('POST', '/api/search', { origin: 'MIR', destination: 'MOT', maxBudget: -1 })).error.code, 'invalid_budget');
    const nf = await call('GET', '/api/nope'); assert.deepEqual([nf.status, nf.error.code], [404, 'not_found']);
    const bad = await call('POST', '/api/chat', undefined, { raw: '{bad' }); assert.deepEqual([bad.status, bad.error.code], [400, 'invalid_json']);
    const big = await call('POST', '/api/chat', { message: 'x'.repeat(11000) }); assert.deepEqual([big.status, big.error.code], [413, 'body_too_large']);
    const over = await call('POST', '/api/search', { origin: 'UTT', destination: 'JAT', maxBudget: 5 });
    assert.equal(over.error.code, 'over_budget'); assert.ok(over.data.cheapestOverBudget.fareRangeLow > 5);
    assert.ok(!JSON.stringify(nf.json).includes('at '), 'no stack traces');
    assert.equal((await call('GET', '/')).status, 200);
    assert.equal((await call('GET', '/js/main.js')).status, 200);
  });
});

test('chat answer equals POST /api/search; NL search too', async () => {
  await withServer(async (call) => {
    const api = await call('POST', '/api/search', { origin: 'DHA', destination: 'MOT', student: true, maxBudget: 40, avoidHubs: ['SCI'] });
    const chat = await call('POST', '/api/chat', { message: 'Dhanmondi theke Motijheel, student, 40 takar moddhe, Science Lab bad diye', sessionId: 's1' });
    assert.deepEqual(chat.data.data.options.map(sig), api.data.options.map(sig));
    assert.equal(chat.data.grounded, true); assert.equal(chat.data.aiMode, 'off');
    assert.match(chat.data.toolCalls[0], /^findRoutes\(DHA->MOT, student, ≤৳40, avoid SCI\)$/);
    const nl = await call('POST', '/api/search', { query: 'Dhanmondi theke Motijheel, student, 40 takar moddhe, Science Lab bad diye' });
    assert.deepEqual(nl.data.options.map(sig), api.data.options.map(sig));
    assert.ok(api.data.options.every((o) => Array.isArray(o.why) && o.why.length));
  });
});

test('alerts over HTTP: X-User-Id de-duplicates; demo helper confirms; active alert reroutes; why line explains', async () => {
  await withServer(async (call) => {
    const q = { origin: 'DHA', destination: 'MOT' };
    const base = (await call('POST', '/api/search', q)).data.best;
    const ing = await call('POST', '/api/alerts/ingest', { text: 'Science Lab e michil, rasta bondho' }, { user: 'alice' });
    assert.deepEqual([ing.data.action, ing.data.filed, ing.data.alert.status, ing.data.aiMode], ['filed', true, 'unverified', 'off']);
    const id = ing.data.alert.id;
    assert.equal((await call('POST', `/api/alerts/${id}/confirm`, {}, { user: 'alice' })).data.ignored, true);
    const seeded = await call('POST', '/api/demo/seed-users', {});
    assert.deepEqual([seeded.data.alert.status, seeded.data.confirmedBy.length], ['active', 2]);
    const after = (await call('POST', '/api/search', q)).data;
    assert.notEqual(after.best.signature, base.signature);
    assert.ok(after.best.why.some((w) => w.kind === 'avoids' && /Avoids Science Lab: blockade confirmed/.test(w.text)));
    assert.equal((await call('GET', '/api/alerts?status=active')).data.alerts.length, 1);
    assert.equal((await call('POST', '/api/alerts/nope/confirm', {})).status, 404);
    const needs = await call('POST', '/api/alerts/ingest', { text: 'kichu ekta hoise' });
    assert.deepEqual([needs.status, needs.data.filed, needs.data.action], [200, false, 'needs_more']);
    assert.equal((await call('POST', '/api/alerts', { hubId: 'XYZ', type: 'blockade' })).status, 400);
  }, { seedAlerts: false });
});

test('admin: token gate, CRUD, moderation queue, audit log, reset', async () => {
  await withServer(async (call, login) => {
    assert.equal((await call('GET', '/api/admin/queue')).status, 401);
    assert.equal((await call('POST', '/api/admin/login', { password: 'nope' })).status, 401);
    const token = await login();
    assert.ok(/^[0-9a-f]{48}$/.test(token));
    assert.equal((await call('POST', '/api/admin/routes', { id: 'B8', mode: 'boat', stops: ['MIR'], km: [] }, { token })).error.code, 'invalid_line');
    const okLine = await call('POST', '/api/admin/routes', { id: 'B8', name: 'B8 Uttara-Banasree', mode: 'bus', stops: ['Uttara', 'BAD', 'BAN'], km: [9, 4] }, { token });
    assert.equal(okLine.data.edges.length, 2);
    assert.equal((await call('PUT', '/api/admin/routes', { kind: 'fares', fares: { bus: { perKm: 3 } } }, { token })).data.fares.bus.perKm, 3);
    assert.equal((await call('POST', '/api/fare', { legs: [{ line: 'B1', from: 'MIR', to: 'MOT' }] })).data.totalFareRegular, 33);
    assert.equal((await call('PUT', '/api/admin/routes', { kind: 'hub', id: 'MOT', landmarks: [{ note_en: 'Exit at Shapla Chattar side' }] }, { token })).status, 200);
    assert.equal((await call('DELETE', '/api/admin/routes/B8', undefined, { token })).status, 200);
    assert.equal((await call('DELETE', '/api/admin/routes/B8', undefined, { token })).status, 404);
    const queue = (await call('GET', '/api/admin/queue', undefined, { token })).data.queue;
    assert.ok(queue.some((x) => x.kind === 'fare'), 'the seeded ৳900 bus fare is flagged (S1)');
    const audit = (await call('GET', '/api/admin/audit', undefined, { token })).data.audit.map((a) => a.action);
    for (const a of ['admin.login', 'admin.login.failed', 'admin.line.post', 'admin.fares.put', 'admin.hub.put', 'admin.delete.delete']) assert.ok(audit.includes(a), a);
    assert.equal((await call('POST', '/api/admin/reset', {}, { token })).status, 200);
    assert.equal((await call('POST', '/api/fare', { legs: [{ line: 'B1', from: 'MIR', to: 'MOT' }] })).data.totalFareRegular, 30);
    assert.equal((await call('GET', '/api/alerts')).data.alerts.length, 1, 'reset restores the demo alerts');
  });
});

test('rate limits on /api/chat and /api/alerts (per user id)', async () => {
  await withServer(async (call) => {
    for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/api/chat', { message: 'hi', sessionId: 'r' }, { user: 'spam-1' })).status, 200);
    const r = await call('POST', '/api/chat', { message: 'hi', sessionId: 'r' }, { user: 'spam-1' });
    assert.deepEqual([r.status, r.error.code], [429, 'rate_limited']);
    assert.equal((await call('POST', '/api/chat', { message: 'hi', sessionId: 'r2' }, { user: 'other-user' })).status, 200);
  }, { limits: { chat: 3, alerts: 3 } });
});

test('health reports AI live / fallback / off; global scenario applies to search and clears', async () => {
  await withServer(async (call) => {
    assert.equal((await call('GET', '/api/health')).data.ai, 'off');
    const sc = await call('PUT', '/api/scenario', { label: 'Science Lab flooded', rain: ['SCI'], blocked: ['SCI'] });
    assert.deepEqual(sc.data.scenario.blocked, ['SCI']);
    const s = (await call('POST', '/api/search', { origin: 'DHA', destination: 'MOT' })).data;
    assert.equal(s.conditions.scenarioActive, true);
    assert.ok(s.best.legs.every((l) => !l.stops.includes('SCI')));
    assert.equal((await call('PUT', '/api/scenario', { rain: ['XYZ'] })).error.code, 'unknown_hub');
    await call('DELETE', '/api/scenario');
    assert.equal((await call('POST', '/api/search', { origin: 'DHA', destination: 'MOT' })).data.best.summary, 'B4 Dhanmondi→Motijheel');
    const t0 = (await call('GET', '/api/clock')).data.now;
    assert.equal((await call('POST', '/api/clock/advance', { minutes: 90 })).data.now - t0, 90 * 60000);
    assert.equal((await call('POST', '/api/clock/advance', { minutes: -5 })).status, 400);
    const opt = (await call('POST', '/api/search', { origin: 'MIR', destination: 'MOT' })).data.options[0];
    assert.equal((await call('GET', '/api/card/' + opt.id)).data.option.summary, opt.summary);
    const gt = await call('POST', '/api/ground-test', {});
    assert.deepEqual([gt.data.grounded, gt.data.verdict], [false, 'Rejected: not in network']);
    const fc = await call('POST', '/api/fare/check', { claimedFare: 40, origin: 'Farmgate', destination: 'Motijheel', mode: 'bus' });
    assert.equal(fc.data.verdict, 'overcharge'); assert.match(fc.data.script, /^Bhai, Farmgate theke Motijheel bus bhara to ৳15/);
  });
  // with a key whose calls fail, health switches to "fallback" after the first chat
  const failing = async () => ({ ok: false, status: 500 });
  await withServer(async (call) => {
    assert.equal((await call('GET', '/api/health')).data.ai, 'live');
    const r = await call('POST', '/api/chat', { message: 'Mirpur theke Motijheel', sessionId: 'x' });
    assert.deepEqual([r.data.aiMode, r.data.grounded], ['fallback', true]);
    const h = (await call('GET', '/api/health')).data;
    assert.deepEqual([h.ai, h.providers, h.lastCall.ok], ['fallback', ['groq'], false]);
  }, { env: { GROQ_API_KEY: 'k' }, fetchImpl: failing });
});

test('persistence: state.json snapshot survives a restart; reset deletes it', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dp-'));
  const file = path.join(dir, 'state.json');
  let id;
  try {
  await withServer(async (call, login) => {
    id = (await call('POST', '/api/alerts', { hubId: 'SCI', type: 'blockade' }, { user: 'person-1' })).data.alert.id;
    await call('POST', `/api/alerts/${id}/confirm`, {}, { user: 'person-2' });
    await call('POST', '/api/watch', { origin: 'DHA', destination: 'MOT', clientId: 'me' });
    const token = await login();
    await call('PUT', '/api/admin/routes', { kind: 'hub', id: 'MOT', landmarks: [{ note_en: 'Exit at Shapla Chattar side' }] }, { token });
  }, { stateFile: file });
  assert.ok(existsSync(file));
  await withServer(async (call, login) => {
    const a = (await call('GET', '/api/alerts')).data.alerts.find((x) => x.id === id);
    assert.equal(a.confirmations, 2);
    assert.equal((await call('GET', '/api/browse')).data.hubs.find((h) => h.id === 'MOT').landmarks[0].note_en, 'Exit at Shapla Chattar side');
    assert.equal((await call('GET', '/api/watch?clientId=me')).data.watches.length, 1);
    const token = await login();
    await call('POST', '/api/admin/reset', {}, { token });
    assert.ok(!existsSync(file));
  }, { stateFile: file });
  } finally { rmSync(dir, { recursive: true, force: true }); }    // clean up even when an assertion fails
});
