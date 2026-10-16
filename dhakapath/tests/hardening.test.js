// Production hardening: abnormal traffic coefficients, bad link data, fare edge cases, malformed
// requests (built-in router over real HTTP, plus the Express error envelope), prototype pollution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadNetwork } from '../server/engine/network.js';
import { sanitizeConfig, ConfigError, coef } from '../server/engine/config.js';
import { seed, config as CFG } from '../server/store/seedData.js';
import { findRoutes, budgetStatus } from '../server/engine/router.js';
import { fareLeg, fareTrip, normalizeMode, taka, fmtRange } from '../server/engine/fare.js';
import { errorEnvelope, catchAsync, scrub } from '../server/middleware.js';
import { createServer } from '../server/index.js';

const withCfg = (f) => { const c = JSON.parse(JSON.stringify(CFG)); f(c); return c; };
const sane = (r) => [...r.options, ...r.others].every((o) => Number.isFinite(o.totalMinutes) && o.totalMinutes > 0 && Number.isFinite(o.fareRangeHigh) && Number.isFinite(o.score));
const STRESS = { rush: true, rain: ['SCI', 'SHA', 'DHA'], rainSeverity: 'heavy' };

test('abnormal or missing peak-hour / weather / ranking coefficients never produce NaN, negative times or a crash', () => {
  const cases = {
    string: (c) => { c.conditions.rush.time.bus = 'x'; }, negative: (c) => { c.conditions.rush.time.bus = -1; }, zero: (c) => { c.conditions.rain.time.rickshaw = 0; },
    nullValue: (c) => { c.conditions.rush.time.cng = null; }, huge: (c) => { c.conditions.rush.time.bus = 1e9; }, noRush: (c) => { delete c.conditions.rush; },
    noConditions: (c) => { delete c.conditions; }, noHeavy: (c) => { delete c.conditions.heavyRain; }, noBoardWait: (c) => { delete c.boardWait; },
    walkText: (c) => { c.transferWalkMinutes = 'four'; }, noRanking: (c) => { delete c.ranking; }, weightText: (c) => { c.ranking.fareWeight = 'a'; },
    alertMult: (c) => { c.alerts.activeTimeMultiplier = 'x'; c.alerts.unverifiedTimeMultiplier = -2; }, noSurge: (c) => { delete c.fares.rickshaw.surge; },
    badRushHours: (c) => { c.rushHours = [['7am', 'late']]; },
  };
  for (const [name, f] of Object.entries(cases)) {
    const net = loadNetwork(seed, withCfg(f));
    if (name !== 'noHeavy') assert.ok(net.configWarnings.length > 0, `${name}: reported`);   // heavy rain is optional (falls back to rain)
    for (const sc of [{}, STRESS]) {
      const r = findRoutes(net, 'DHA', 'MOT', {}, sc);
      assert.ok(r.ok && sane(r), `${name} ${JSON.stringify(sc)}`);
    }
  }
  // a capped coefficient still slows, it does not explode
  const huge = loadNetwork(seed, withCfg(cases.huge));
  const bus = findRoutes(huge, 'MPR', 'SCI', { requireMode: 'bus', maxTransfers: 0 }, { rush: true }).options[0].legs[0];
  assert.equal(bus.rideMinutes, Math.round(13.5 * 10 * 10) / 10);         // B4 MPR→SCI 9 + 4.5 = 13.5 min × cap 10
  assert.equal(coef('x'), 1); assert.equal(coef(-3), 1); assert.equal(coef(1.5), 1.5); assert.equal(coef(1e9), 10);
  // an alert effect carrying a NaN multiplier is neutralised too
  const fx = { hubs: new Map([['SCI', { break: false, soft: true, mult: NaN, labels: ['x'], ids: ['A'] }]]), edges: new Map() };
  assert.ok(sane(findRoutes(loadNetwork(seed, CFG), 'DHA', 'MOT', {}, STRESS, fx)));
  // the shipped config needs no fixes
  assert.deepEqual(sanitizeConfig(CFG).warnings, []);
});

test('a missing or non-numeric fare table is a startup ConfigError, not a runtime NaN', () => {
  assert.throws(() => loadNetwork(seed, withCfg((c) => { c.fares.bus.perKm = 'x'; })), ConfigError);
  assert.throws(() => loadNetwork(seed, withCfg((c) => { delete c.fares.metro; })), /metro fare rule missing/);
  assert.throws(() => loadNetwork(seed, withCfg((c) => { delete c.fares; })), ConfigError);
});

test('links with unusable distance/time are skipped and reported, never routed with NaN', () => {
  for (const f of [(e) => { e.minutes = 'x'; }, (e) => { e.minutes = -5; }, (e) => { delete e.km; }, (e) => { e.km = Infinity; }]) {
    const s = JSON.parse(JSON.stringify(seed)); s.edges.filter((e) => e.line === 'B4').forEach(f);
    const net = loadNetwork(s, CFG);
    assert.ok(net.configWarnings.some((w) => /edge B4:/.test(w)));
    const r = findRoutes(net, 'DHA', 'MOT', {});
    assert.ok(r.ok && sane(r));
    assert.ok(![...r.options, ...r.others].some((o) => o.legs.some((l) => l.line === 'B4')));
    assert.ok(r.stats.linksPruned.bad_data > 0);
  }
});

test('fares: zero distance, missing/unknown vehicle type, aliases, bad numbers, rounding', () => {
  assert.deepEqual([fareLeg({ mode: 'bus', km: 0 }, {}, CFG).regular, fareLeg({ mode: 'metro', km: 0 }, {}, CFG).regular, fareLeg({ mode: 'rickshaw', km: 0 }, {}, CFG).rangeLow], [10, 20, 20]);
  for (const leg of [null, { km: 3 }, { mode: '', km: 3 }, { mode: 'helicopter', km: 3 }, { mode: 'bus' }, { mode: 'bus', km: -3 }, { mode: 'cng', km: 'x' }, { mode: 'bus', km: NaN }, { mode: 'leguna' }, { mode: 'leguna', flatFare: 'abc' }]) {
    const f = fareLeg(leg, { student: true }, CFG);
    assert.equal(f.unknown, true, JSON.stringify(leg));
    assert.ok([f.regular, f.student, f.rangeLow, f.rangeHigh].every(Number.isFinite));
    assert.match(f.note, /^Fare unknown/);
  }
  assert.deepEqual(['Local Bus', 'CNG', 'MRT-6', 'Rickshaw', 'tempo', ' metro '].map(normalizeMode), ['bus', 'cng', 'metro', 'rickshaw', 'leguna', 'metro']);
  assert.equal(fareLeg({ mode: 'Local Bus', km: 8 }, {}, CFG).regular, 20);           // round(8 × 2.45 = 19.6)
  assert.equal(fareLeg({ mode: 'bus', km: '8' }, {}, CFG).regular, 20);
  assert.equal(fareLeg({ mode: 'bus', km: 0.1 + 0.2 }, {}, CFG).regular, 10);
  const t = fareTrip([{ mode: 'bus', km: 4 }, { mode: 'leguna' }], {}, CFG);
  assert.equal(t.fareUnknown, true);
  assert.equal(budgetStatus({ ...t, fareUnknown: true }, 50).status, 'unknown');
  assert.deepEqual([taka(37.5), taka(37.4999999), taka(NaN), fmtRange(30, 45), fmtRange(37.5, 37.5)], ['৳38', '৳37', '৳?', '৳30–45', '৳38']);
});

test('an unpriced leg never wins "Cheapest" and is labelled', () => {
  const s = JSON.parse(JSON.stringify(seed)); s.lines.find((l) => l.id === 'L1').flatFare = null;
  const r = findRoutes(loadNetwork(s, CFG), 'MOT', 'JAT', {});
  const leg = [...r.options, ...r.others].find((o) => o.legs.some((l) => l.line === 'L1'));
  assert.ok(leg.fareUnknown && leg.fareConfidence === 'unknown');
  assert.ok(!leg.labels.includes('Cheapest'));
});

async function http(fn) {
  const srv = createServer({ env: {}, adminPassword: 'h-pw' }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const send = async (method, p, raw) => { const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', 'x-user-id': 'hard-tester' }, body: raw }); return { status: res.status, json: await res.json() }; };
  try { await fn(send); } finally { srv.close(); }
}

test('malformed requests get clean 400s in the {ok, data, error} envelope; nothing reaches a 500', async () => {
  await http(async (send) => {
    const expect = async (method, p, raw, code) => {
      const r = await send(method, p, raw);
      assert.equal(r.status, 400, `${p} ${raw} -> ${r.status}`);
      assert.deepEqual([r.json.ok, r.json.error.code], [false, code], `${p} ${raw}`);
      assert.equal(typeof r.json.error.message, 'string');
    };
    await expect('POST', '/api/search', '{"origin": "Mirpur",', 'invalid_json');
    for (const raw of ['null', '[]', '"Mirpur"', '42']) await expect('POST', '/api/search', raw, 'invalid_body');
    await expect('POST', '/api/search', '{}', 'missing_field');
    await expect('POST', '/api/search', JSON.stringify({ origin: '   ', destination: 'Motijheel' }), 'missing_field');
    await expect('POST', '/api/search', JSON.stringify({ origin: { a: 1 }, destination: 'Motijheel' }), 'invalid_field');
    await expect('POST', '/api/search', JSON.stringify({ origin: ['Mirpur'], destination: 'Motijheel' }), 'invalid_field');
    await expect('POST', '/api/search', JSON.stringify({ origin: 'Mirpur', destination: 'Motijheel', maxTransfers: 'x' }), 'invalid_field');
    await expect('POST', '/api/search', JSON.stringify({ origin: 'Mirpur', destination: 'Motijheel', avoidHubs: ['Nowhere'] }), 'unknown_hub');
    await expect('POST', '/api/search', JSON.stringify({ origin: 'Mirpur', destination: 'Motijheel', departAt: 99 }), 'invalid_field');
    await expect('POST', '/api/search', JSON.stringify({ origin: 'Mirpur', destination: 'Motijheel', maxBudget: 'cheap' }), 'invalid_budget');
    await expect('POST', '/api/simulate', JSON.stringify({ origin: 'Mirpur', destination: 'Motijheel', scenario: { rain: 'SCI', delays: 'x' } }), 'invalid_scenario');
    await expect('POST', '/api/simulate', JSON.stringify({ origin: 'Mirpur', destination: 'Motijheel', scenario: 'tornado' }), 'invalid_scenario');
    await expect('PUT', '/api/scenario', JSON.stringify({ rainZones: 'south', blocked: 5 }), 'invalid_scenario');
    await expect('POST', '/api/fare', JSON.stringify({ legs: [null] }), 'invalid_field');
    await expect('POST', '/api/fare/check', JSON.stringify({ origin: { x: 1 }, destination: 'MOT', claimedFare: 30 }), 'invalid_field');
    await expect('POST', '/api/fare/check', JSON.stringify({ origin: 'MIR', destination: 'MOT', claimedFare: 'abc' }), 'invalid_amount');
    await expect('POST', '/api/watch', JSON.stringify({ origin: 7, destination: 'MOT' }), 'invalid_field');
    // valid strings still work (form fields arrive as text)
    const okr = await send('POST', '/api/search', JSON.stringify({ origin: 'Mirpur', destination: 'Motijheel', maxBudget: '60', maxTransfers: '1', student: 'true', departAt: '08:30', avoidHubs: 'Uttara' }));
    assert.equal(okr.status, 200);
    const fc = await send('POST', '/api/fare/check', JSON.stringify({ origin: 'MIR', destination: 'MOT', claimedFare: '30', mode: 'Local Bus' }));
    assert.deepEqual([fc.status, fc.json.data.mode], [200, 'bus']);
  });
});

test('prototype-pollution keys and control characters are stripped from request bodies', async () => {
  await http(async (send) => {
    const r = await send('POST', '/api/search', '{"origin":"Mir\\u0000pur","destination":"Motijheel","__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}}}');
    assert.equal(r.status, 200);
    assert.equal(r.json.data.origin, 'MIR');
    assert.equal({}.polluted, undefined);
  });
  const s = scrub(JSON.parse('{"a":{"__proto__":{"x":1},"b":"ok\\u0007"},"prototype":1}'));
  assert.deepEqual(s, { a: { b: 'ok' } });
});

test('Express path: body-parser errors and thrown errors become the envelope; async rejections are caught', async () => {
  const run = (err) => { const res = { headersSent: false, code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; errorEnvelope(null)(err, { method: 'POST', path: '/api/x' }, res, () => {}); return [res.code, res.body.error.code, res.body.ok]; };
  assert.deepEqual(run(Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed', status: 400 })), [400, 'invalid_json', false]);
  assert.deepEqual(run(Object.assign(new Error('big'), { type: 'entity.too.large', status: 413 })), [413, 'body_too_large', false]);
  assert.deepEqual(run(new TypeError('x is undefined')), [500, 'server_error', false]);
  let got = null;
  await new Promise((done) => catchAsync(async () => { throw new Error('boom'); })({}, {}, (e) => { got = e; done(); }));
  assert.equal(got.message, 'boom');
});

test('a hand-edited state.json with abnormal coefficients is repaired on restore and reported by /api/health', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dp-hard-'));
  const file = path.join(dir, 'state.json');
  try {
    const a = createServer({ env: {}, adminPassword: 'x', stateFile: file }).listen(0);
    await new Promise((r) => a.once('listening', r));
    await fetch(`http://127.0.0.1:${a.address().port}/api/clock/advance`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': 'hard-tester' }, body: '{"minutes":5}' });
    a.close();
    const snap = JSON.parse((await import('node:fs')).readFileSync(file, 'utf8'));
    snap.net.config.conditions.rush.time.bus = 'fast'; snap.net.config.transferWalkMinutes = -9;
    writeFileSync(file, JSON.stringify(snap));
    const b = createServer({ env: {}, adminPassword: 'x', stateFile: file }).listen(0);
    await new Promise((r) => b.once('listening', r));
    const base = `http://127.0.0.1:${b.address().port}`;
    const h = await (await fetch(base + '/api/health', { headers: { 'x-user-id': 'hard-tester' } })).json();
    assert.ok(h.data.dataWarnings.some((w) => /conditions\.rush\.time\.bus/.test(w)) && h.data.dataWarnings.some((w) => /transferWalkMinutes/.test(w)));
    const s = await (await fetch(base + '/api/search', { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': 'hard-tester' }, body: JSON.stringify({ origin: 'DHA', destination: 'MOT', departAt: '08:30' }) })).json();
    assert.ok(s.ok && sane(s.data));
    b.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
