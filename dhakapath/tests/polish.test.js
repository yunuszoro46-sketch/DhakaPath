// Production polish: versioned fare tables (price drift), the route-result cache, extreme disruptions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeEngine } from '../server/store/boot.js';
import { findRoutes } from '../server/engine/router.js';
import { createServer } from '../server/index.js';

const fresh = () => makeEngine({ seedAlerts: false });
const busLeg = (E, km) => E.fare({ legs: [{ line: 'B1', from: 'MIR', to: 'MOT' }] }).legs[0].regular;

test('fuel-price adjustment: +10% on per-km rates, version bump, history, stamped results', () => {
  const E = fresh();
  assert.equal(E.fareTable().version, 1);
  const before = E.search({ origin: 'MIR', destination: 'MOT', allowedModes: ['bus'] });
  const r = E.updateFares({ adjustPercent: 10 }, { by: 'admin-1', note: 'diesel price notice' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.version, 2);
  assert.equal(E.net.config.fares.bus.perKm, 2.7);                     // 2.45 × 1.10 = 2.695 -> 2.70
  assert.equal(E.net.config.fares.cng.lowPerKm, 38.5);                 // 35 × 1.10
  assert.equal(E.net.config.fares.metro.perKm, 5);                     // MRT is set by the operator, not adjusted by %
  assert.deepEqual(E.store.fareHistory.at(-1).changes.find((c) => c.path === 'bus.perKm'), { path: 'bus.perKm', from: 2.45, to: 2.7 });
  assert.equal(E.store.fareHistory.at(-1).note, 'diesel price notice');
  const after = E.search({ origin: 'MIR', destination: 'MOT', allowedModes: ['bus'] });
  assert.deepEqual([before.fareTable.version, after.fareTable.version], [1, 2]);
  const b0 = before.options.find((o) => o.summary === 'B1 Mirpur→Motijheel'), b1 = after.options.find((o) => o.summary === 'B1 Mirpur→Motijheel');
  assert.ok(b1.fare > b0.fare, `${b0.fare} -> ${b1.fare}`);           // cache was invalidated by the fare change
  assert.equal(busLeg(E), Math.max(10, Math.round(b1.legs[0].km * 2.7)));
});

test('fare updates: explicit values, no-op and invalid input are reported, nothing half-saved', () => {
  const E = fresh();
  assert.equal(E.updateFares({ bus: { perKm: 2.45 } }).error, 'no_change');
  const bad = E.updateFares({ bus: { perKm: 99 }, cng: { lowPerKm: 60, highPerKm: 40 }, adjustPercent: { plane: 5 } });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /bus.perKm/.test(e)) && bad.errors.some((e) => /plane/.test(e)));
  assert.equal(E.net.config.fares.bus.perKm, 2.45);
  assert.equal(E.fareTable().version, 1);
  const ok = E.updateFares({ cng: { surge: { rush: 1.5 } } });
  assert.ok(ok.ok && E.net.config.fares.cng.surge.rush === 1.5 && ok.version === 2);
});

test('community fare median only counts reports made under the current fare table', () => {
  const E = fresh();
  for (const amt of [30, 30, 30]) E.fareCheck({ claimedFare: amt, origin: 'MIR', destination: 'MOT', mode: 'bus', userId: 'u' + amt });
  assert.equal(E.fareCheck({ claimedFare: 30, origin: 'MIR', destination: 'MOT', mode: 'bus' }).community.reports, 4);
  E.updateFares({ adjustPercent: 10 });
  const r = E.fareCheck({ claimedFare: 31, origin: 'MIR', destination: 'MOT', mode: 'bus' });
  assert.deepEqual([r.community.reports, r.community.fareVersion, r.fareTable.version], [1, 2, 2]);
});

test('route cache: identical searches reuse results; alerts, scenario and network edits invalidate', () => {
  const E = fresh(), c = E.routeCache.stats;
  const a = E.search({ origin: 'MIR', destination: 'MOT' });
  const h0 = c.hits;
  const b = E.search({ origin: 'MIR', destination: 'MOT' });
  assert.ok(c.hits > h0);
  assert.deepEqual(b.options.map((o) => o.signature), a.options.map((o) => o.signature));
  // same answer as the uncached engine
  const direct = findRoutes(E.net, 'MIR', 'MOT', E.normalizeQuery({ origin: 'MIR', destination: 'MOT' }).constraints, E.scenOf(b.conditions), E.fx());
  assert.deepEqual(direct.options.map((o) => [o.signature, o.totalMinutes, o.fare]), b.options.map((o) => [o.signature, o.totalMinutes, o.fare]));
  // a confirmed blockade changes the alert effects -> new result
  const al = E.createAlert({ hubId: 'FAR', type: 'blockade', severity: 3, text: 'road closed', source: 'admin', userId: 'adm-1' });
  assert.ok(al.ok);
  const c2 = E.search({ origin: 'DHA', destination: 'MOH' });
  assert.ok(!c2.options.some((o) => o.legs.some((l) => l.stops.slice(1, -1).includes('FAR') && l.mode !== 'metro')));
  // a scenario is part of the key
  const s = E.search({ origin: 'MIR', destination: 'MOT', scenario: { disabledLines: ['MRT6'] } });
  assert.ok(!s.options.some((o) => o.legs.some((l) => l.line === 'MRT6')));
  // a network edit clears the cache
  const n0 = c.clears;
  assert.ok(E.updateHub({ id: 'MIR', landmarks: [{ note_en: 'New note', note_bn_banglish: '' }] }).ok);
  assert.ok(c.clears > n0);
  assert.equal(E.search({ origin: 'MIR', destination: 'MOT' }).options[0].legs[0].landmark.note_en, 'New note');
});

test('Trip Watch polls are served from the cache after the first check', () => {
  const E = fresh();
  for (let i = 0; i < 5; i++) E.watchCreate({ origin: 'UTT', destination: 'JAT', clientId: 'poller' });
  E.watchList('poller');
  const h = E.routeCache.stats.hits, m = E.routeCache.stats.misses;
  E.watchList('poller');
  assert.ok(E.routeCache.stats.hits >= h + 5 && E.routeCache.stats.misses === m);
});

test('extreme disruptions degrade gracefully: gridlock everywhere still routes; everything blocked says why', () => {
  const E = fresh();
  for (const hb of E.net.hubs) E.createAlert({ hubId: hb.id, type: 'gridlock', severity: 3, text: 'jam', source: 'admin', userId: 'adm-' + hb.id });
  const r = E.search({ origin: 'UTT', destination: 'JAT' });
  assert.ok(r.ok && r.options.every((o) => Number.isFinite(o.totalMinutes) && o.totalMinutes > 0));
  const all = E.search({ origin: 'UTT', destination: 'JAT', scenario: { blocked: E.net.hubs.map((h) => h.id), disabledLines: ['MRT6'] } });
  assert.deepEqual([all.ok, all.status], [false, 'NO_ROUTE_WITHIN_CONSTRAINTS']);
});

test('GET /api/fares and an admin fare update over HTTP survive a restart', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dp-fare-')), file = path.join(dir, 'state.json');
  const boot = async () => { const s = createServer({ env: {}, adminPassword: 'f-pw', stateFile: file }).listen(0); await new Promise((r) => s.once('listening', r)); return s; };
  const req = (s, method, p, body, tok) => fetch(`http://127.0.0.1:${s.address().port}${p}`, { method, headers: { 'content-type': 'application/json', 'x-user-id': 'fare-admin', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body && JSON.stringify(body) }).then((r) => r.json());
  try {
    const a = await boot();
    const tok = (await req(a, 'POST', '/api/admin/login', { password: 'f-pw' })).data.token;
    const up = await req(a, 'PUT', '/api/admin/routes', { kind: 'fares', fares: { adjustPercent: 8 }, note: 'test notice' }, tok);
    assert.ok(up.ok && up.data.version === 2, JSON.stringify(up));
    const anon = await req(a, 'PUT', '/api/admin/routes', { kind: 'fares', fares: { adjustPercent: 8 } });
    assert.equal(anon.error.code, 'unauthorized');
    a.close();
    const b = await boot();
    const f = await req(b, 'GET', '/api/fares');
    assert.deepEqual([f.data.fareTable.version, f.data.fares.bus.perKm, f.data.history[0].note], [2, 2.65, 'test notice']);
    assert.equal(f.data.history[0].by, undefined);                      // admin ids are not published
    const s = await req(b, 'POST', '/api/search', { origin: 'MIR', destination: 'MOT' });
    assert.equal(s.data.fareTable.version, 2);
    b.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
