// Additions beyond the team spec that the problem statement asks for, plus Trip Watch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/index.js';
import { makeEngine as createEngine } from '../server/store/boot.js';
import { isRushAt, dhakaMinutes } from '../server/engine/service.js';
import { loadNetwork } from '../server/engine/network.js';
import { seed, config } from '../server/store/seedData.js';
import { rangeFare, fareLeg } from '../server/engine/fare.js';
import { findRoutes } from '../server/engine/router.js';
import { groundRoute } from '../server/engine/ground.js';
import { parseRules } from '../server/ai/parser.js';
import { handle, newSession } from '../server/ai/chat.js';

const net = loadNetwork(seed, config);
const T = (h, m = 0) => Date.UTC(2026, 9, 16, h - 6, m);          // Dhaka wall time -> UTC ms

test('CNG: unmetered range fare with baseline vs surge; no student discount; grounded and S1-checked', () => {
  const f = fareLeg({ mode: 'cng', km: 4 }, { student: true }, net.config);
  assert.deepEqual([f.rangeLow, f.rangeHigh, f.baseLow, f.baseHigh, f.studentApplies], [140, 200, 140, 200, false]);
  const s = rangeFare('cng', 4, { rush: true, rain: true }, net.config);
  assert.deepEqual([s.baseLow, s.baseHigh, s.low, s.high], [140, 200, 225, 320]);      // both ×1.6
  assert.equal(rangeFare('cng', 1, {}, net.config).low, 60);                            // minimum
  const r = findRoutes(net, 'MOH', 'BAD', { avoidModes: ['bus'] });
  assert.ok([...r.options, ...r.others].some((o) => o.legs.some((l) => l.mode === 'cng')));
  assert.equal(groundRoute(net, { legs: [{ line: 'C-MOH-BAD', from: 'MOH', to: 'BAD', fare: 150 }] }).ok, true);
  assert.equal(groundRoute(net, { legs: [{ line: 'C-MOH-BAD', from: 'MOH', to: 'BAD', fare: 500 }] }).ok, false);
  const e = createEngine({ seedAlerts: false });
  assert.deepEqual(e.fareCheck({ claimedFare: 900, origin: 'MOH', destination: 'BAD', mode: 'cng' }).submission.flags, ['unrealistic_fare']);
  assert.equal(e.fareCheck({ claimedFare: 180, origin: 'MOH', destination: 'BAD', mode: 'cng' }).verdict, 'fair');
});

test('rush hour follows the departure time or the clock unless set explicitly', () => {
  assert.equal(isRushAt(8 * 60 + 30, net.config), true);
  assert.equal(isRushAt(12 * 60, net.config), false);
  assert.equal(isRushAt(17 * 60, net.config), true);
  assert.equal(dhakaMinutes(T(17, 5)), 17 * 60 + 5);
  const noon = createEngine({ seedAlerts: false, start: T(12) });
  const q = { origin: 'MIR', destination: 'MOT', avoidModes: ['metro', 'leguna', 'cng'] };
  const a = noon.search(q), b = noon.search({ ...q, departAt: '08:30' }), c = noon.search({ ...q, departAt: '08:30', rush: false });
  assert.deepEqual([a.conditions.rush, a.conditions.departSource], [false, 'now']);
  assert.deepEqual([b.conditions.rush, b.conditions.rushSource, b.conditions.departAt], [true, 'auto', '08:30']);
  assert.ok(b.best.totalMinutes > a.best.totalMinutes);
  assert.equal(c.conditions.rush, false);
  const evening = createEngine({ seedAlerts: false, start: T(17, 30) });
  assert.equal(evening.search(q).conditions.rush, true);
  assert.ok(evening.search(q).options.every((o) => o.grounded), 'surged options still ground');
});

test('simulation: rain by zone, and automatic rush hour is in both before and after', () => {
  const e = createEngine({ seedAlerts: false, start: T(12) });
  const z = e.simulate({ origin: 'DHA', destination: 'MOT', scenario: { label: 'Rain south-west', rainZones: ['south-west', 'central-south'] } });
  assert.ok(z.ok); assert.deepEqual(z.scenario.rain.sort(), ['DHA', 'SCI']);
  const ev = createEngine({ seedAlerts: false, start: T(18) });
  const s = ev.simulate({ origin: 'DHA', destination: 'MOT', scenario: 'sciRain' });
  assert.equal(s.conditions.rush, true);
  assert.equal(s.before.best.legs[0].reasons.some((r) => /rush/.test(r)), true);
  assert.ok(!/rush hour,/.test(s.explanation), 'the explanation names only what the scenario adds');
});

test('commuter browse view: every line with mode, ends, fare, student eligibility, time and state; hub status', () => {
  const e = createEngine({ seedAlerts: false });
  const b = e.browse();
  const b1 = b.lines.find((l) => l.id === 'B1');
  assert.deepEqual([b1.mode, b1.fromName, b1.toName, b1.fareRegular, b1.fareStudent, b1.studentEligible, b1.state], ['bus', 'Mirpur', 'Motijheel', 27, 14, true, 'running']);
  assert.equal(b.lines.find((l) => l.id === 'MRT6').studentEligible, false);
  assert.match(b.lines.find((l) => l.id === 'C-MOH-BAD').fareRange, /৳140–200/);
  const a = e.createAlert({ hubId: 'SCI', type: 'blockade', source: 'admin', userId: 'admin' }).alert;
  const b2 = e.browse();
  assert.equal(b2.hubs.find((h) => h.id === 'SCI').status, 'blocked');
  assert.equal(b2.lines.find((l) => l.id === 'B4').state, 'disrupted');
  assert.equal(b2.lines.find((l) => l.id === 'B4').alerts[0], a.id);
  assert.equal(b2.disruptions.length, 1);
});

test('CMS: landmark notes can be edited and appear in route instructions', () => {
  const e = createEngine({ seedAlerts: false });
  assert.equal(e.updateHub({ id: 'DHA', landmarks: [] }).ok, false);
  const r = e.updateHub({ id: 'Dhanmondi', landmarks: [{ note_en: 'Board B4 at the Dhanmondi 27 signal, west side', note_bn_banglish: 'Dhanmondi 27 signal er west pash theke B4 e uthun' }] });
  assert.ok(r.ok);
  const o = e.search({ origin: 'DHA', destination: 'MOT' }).best;
  assert.deepEqual([o.legs[0].landmark.note_en, o.legs[0].landmark.sample], ['Board B4 at the Dhanmondi 27 signal, west side', false]);
});

test('directions in Banglish for every mode', () => {
  const e = createEngine({ seedAlerts: false });
  const all = [];
  for (const [a, b] of [['DHA', 'MOT'], ['MIR', 'MOT'], ['BAN', 'BAD'], ['MOH', 'BAD'], ['MOT', 'JAT'], ['SHA', 'SCI']]) {
    const r = e.search({ origin: a, destination: b });
    for (const o of [...r.options, ...r.others]) all.push(...o.legs);
  }
  for (const m of ['bus', 'metro', 'rickshaw', 'cng', 'leguna', 'walk']) assert.ok(all.some((l) => l.mode === m), m);
  assert.ok(all.every((l) => /theke/.test(l.instructionBn)));
  assert.ok(all.filter((l) => l.mode === 'rickshaw' || l.mode === 'cng').every((l) => /bhara thik kore nin/.test(l.instructionBn)));
});

test('Trip Watch: ok -> reroute when a confirmed alert cuts the usual route -> accept the detour', () => {
  const e = createEngine({ seedAlerts: false, start: T(12) });
  const w = e.watchCreate({ origin: 'DHA', destination: 'MOT', student: true, clientId: 'me' }).watch;
  assert.deepEqual([w.status, w.usual.summary], ['ok', 'B4 Dhanmondi→Motijheel']);
  const a = e.createAlert({ hubId: 'SCI', type: 'waterlogging', userId: 'u1' }).alert;            // 0.35 unverified: soft
  const soft = e.watchList('me').watches[0];
  assert.equal(soft.status, 'ok');                                                               // +25% on two short legs is under 5 min
  e.confirm(a.id, 'u2'); e.confirm(a.id, 'u3');                                                  // 0.75 active: hard
  const hard = e.watchList('me').watches[0];
  assert.equal(hard.status, 'reroute'); assert.equal(hard.changed, true);
  assert.match(hard.message, /Your usual route is cut at B4 Dhanmondi–Science Lab/);
  assert.ok(hard.suggestion.legs.every((l) => !l.stops.includes('SCI')) && hard.suggestion.grounded);
  assert.ok(hard.causes.some((c) => /waterlogging \(active/.test(c.text)));
  assert.equal(e.watchList('me').watches[0].changed, false, 'the same status is not announced twice');
  assert.equal(e.watchList('someone-else').watches.length, 0);
  const acc = e.watchAccept(w.id).watch;
  assert.equal(acc.status, 'ok'); assert.notEqual(acc.usual.summary, 'B4 Dhanmondi→Motijheel');
  assert.ok(e.watchDelete(w.id).ok); assert.equal(e.watchList('me').watches.length, 0);
});

test('Trip Watch: rush hour makes the usual bus slower, or a faster route available', () => {
  const e = createEngine({ seedAlerts: false, start: T(12) });
  const w = e.watchCreate({ origin: 'MIR', destination: 'MOT', avoidModes: ['metro', 'leguna', 'cng', 'rickshaw'], clientId: 'me' }).watch;
  assert.equal(w.status, 'ok');
  e.advance(5 * 60);                                                                             // 17:00, rush hour
  const later = e.watchList('me').watches[0];
  assert.equal(later.status, 'slower'); assert.match(later.message, /rush hour \(auto, 17:00\)/);
  const e2 = createEngine({ seedAlerts: false, start: T(12) });
  e2.watchCreate({ origin: 'DHA', destination: 'BAD', clientId: 'me' });
  e2.advance(5 * 60);
  assert.ok(['ok', 'slower', 'better_route'].includes(e2.watchList('me').watches[0].status));
});

test('REST: browse and Trip Watch endpoints', async () => {
  const srv = createServer({ env: {}, adminPassword: 'pw', seedAlerts: false }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const c = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${srv.address().port}${p}`, { method, headers: { 'content-type': 'application/json', 'x-user-id': 'watcher-1' }, body: body && JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };
  try {
    assert.equal((await c('GET', '/api/browse')).data.lines.length, 23);
    const w = await c('POST', '/api/watch', { origin: 'DHA', destination: 'MOT' });
    assert.equal(w.data.watch.status, 'ok');
    await c('POST', '/api/alerts', { hubId: 'SCI', type: 'blockade' });
    await c('POST', '/api/demo/seed-users', {});
    const list = (await c('GET', '/api/watch')).data.watches;             // clientId defaults to the X-User-Id
    assert.deepEqual([list.length, list[0].status, list[0].changed], [1, 'reroute', true]);
    assert.equal((await c('POST', `/api/watch/${w.data.watch.id}/accept`, {})).data.watch.status, 'ok');
    assert.equal((await c('DELETE', '/api/watch/nope')).status, 404);
    assert.equal((await c('DELETE', `/api/watch/${w.data.watch.id}`)).status, 200);
  } finally { srv.close(); }
});
