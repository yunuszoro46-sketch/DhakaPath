import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNetwork } from '../server/engine/network.js';
import { seed, config as CFG } from '../server/store/seedData.js';
import { fareLeg, busRegular, studentFare, metroFare, rickshawRange } from '../server/engine/fare.js';
import { findRoutes } from '../server/engine/router.js';
import { groundRoute } from '../server/engine/ground.js';

const net = loadNetwork(seed, CFG);
const cfg = net.config;
const bus = (km, student = false) => fareLeg({ mode: 'bus', km }, { student }, cfg);

test('MIR->MOT shows the designed trade-off: cheap slow bus, fast metro, and a mixed option', () => {
  const r = findRoutes(net, 'MIR', 'MOT', {});
  const all = [...r.options, ...r.others];
  const cheap = r.options.find((o) => o.labels.includes('Cheapest'));
  const fast = r.options.find((o) => o.labels.includes('Fastest'));
  assert.equal(cheap.summary, 'B1 Mirpur→Motijheel'); assert.equal(cheap.totalFareRegular, 30);
  assert.equal(fast.summary, 'MRT-6 Mirpur→Motijheel'); assert.equal(fast.totalFareRegular, 55);
  assert.ok(fast.totalMinutes < cheap.totalMinutes);
  assert.ok(all.some((o) => new Set(o.legs.map((l) => l.mode)).size > 1), 'a mixed-mode option exists');
  assert.ok(r.options.length <= 3);
});

test('every option for every hub pair is grounded: real edges on real lines, same fare', () => {
  let n = 0;
  for (const a of net.hubs) for (const b of net.hubs) {
    if (a.id === b.id) continue;
    const r = findRoutes(net, a.id, b.id, {});
    assert.ok(r.ok, `${a.id}->${b.id}`);
    for (const o of [...r.options, ...r.others]) {
      const g = groundRoute(net, { legs: o.legs.map((l) => ({ line: l.line, from: l.from, to: l.to, fare: l.mode === 'rickshaw' ? l.fare.rangeLow : l.fare.regular })) });
      assert.ok(g.ok, `${a.id}->${b.id}: ${g.errors.join('; ')}`);
      assert.deepEqual([g.fare.low, g.fare.high], [o.fareRangeLow, o.fareRangeHigh]);
      n++;
    }
  }
  assert.ok(n > 400);
});

test('labels point at the true cheapest / fastest / fewest transfers; sort overrides order', () => {
  const r = findRoutes(net, 'DHA', 'BAD', {});
  const all = [...r.options, ...r.others];
  const lab = (x) => r.options.find((o) => o.labels.includes(x));
  assert.ok(all.every((o) => o.fare >= lab('Cheapest').fare));
  assert.ok(all.every((o) => o.totalMinutes >= lab('Fastest').totalMinutes));
  assert.ok(all.every((o) => o.transfers >= lab('Fewest transfers').transfers));
  const byTime = findRoutes(net, 'DHA', 'BAD', { sort: 'time' }).options.map((o) => o.totalMinutes);
  assert.deepEqual(byTime, [...byTime].sort((a, b) => a - b));
});

test('constraints: maxBudget, avoidHubs, avoidModes, maxTransfers', () => {
  const r = findRoutes(net, 'MIR', 'MOT', { student: true, maxBudget: 20 });
  assert.ok(r.ok && [...r.options, ...r.others].every((o) => o.fareRangeHigh <= 20));
  const none = findRoutes(net, 'UTT', 'JAT', { maxBudget: 5 });
  assert.equal(none.error, 'over_budget'); assert.ok(none.cheapestOverBudget.fareRangeLow > 5);
  const av = findRoutes(net, 'MIR', 'MOT', { avoidHubs: ['FAR'] });
  for (const o of [...av.options, ...av.others]) assert.ok(o.legs.every((l) => !l.stops.includes('FAR')));
  const nm = findRoutes(net, 'MIR', 'MOT', { avoidModes: ['metro'] });
  for (const o of [...nm.options, ...nm.others]) assert.ok(o.legs.every((l) => l.mode !== 'metro'));
  const mt = findRoutes(net, 'DHA', 'BAD', { maxTransfers: 1 });
  for (const o of [...mt.options, ...mt.others]) assert.ok(o.transfers <= 1);
  assert.equal(findRoutes(net, 'MIR', 'MOT', { avoidHubs: ['MOT'] }).error, 'avoid_endpoint');
});

test('blocked hub: no road pass-through, MRT still passes, endpoint still reachable', () => {
  const r = findRoutes(net, 'DHA', 'MOT', {}, { blocked: ['SCI'] });
  for (const o of [...r.options, ...r.others]) for (const l of o.legs) {
    if (l.mode !== 'metro') assert.ok(!l.stops.slice(1, -1).includes('SCI') && (l.from !== 'SCI' && l.to !== 'SCI'), o.summary);
  }
  const mrt = findRoutes(net, 'MIR', 'MOT', {}, { blocked: ['FAR'] });
  assert.ok(mrt.options.some((o) => o.summary === 'MRT-6 Mirpur→Motijheel'));          // elevated: passes FAR
  assert.ok([...mrt.options, ...mrt.others].every((o) => o.legs.every((l) => l.mode === 'metro' || !l.stops.includes('FAR'))));
  const end = findRoutes(net, 'DHA', 'SCI', {}, { blocked: ['SCI'] });
  assert.ok(end.ok, 'a blocked hub can still be the destination');
});

test('demo scenario: Dhanmondi -> Motijheel, student. Normal B4 direct; Science Lab flooded -> visibly different detour', () => {
  const normal = findRoutes(net, 'DHA', 'MOT', { student: true });
  assert.equal(normal.best.summary, 'B4 Dhanmondi→Motijheel');
  const rain = findRoutes(net, 'DHA', 'MOT', { student: true }, { rain: ['SCI'] });
  assert.ok(rain.best.totalMinutes > normal.best.totalMinutes);                       // rain alone only slows B4
  const flood = findRoutes(net, 'DHA', 'MOT', { student: true }, { rain: ['SCI'], blocked: ['SCI'] });
  assert.notEqual(flood.best.signature, normal.best.signature);
  assert.ok(flood.best.legs.every((l) => !l.stops.includes('SCI')));
  assert.ok(flood.best.legs.some((l) => l.from === 'MPR' || l.to === 'MPR'));         // the MPR/AGA path from the spec
});

test('rush hour slows buses ×1.5 and flags MRT as crowded without slowing it', () => {
  const a = findRoutes(net, 'MIR', 'MOT', { avoidModes: ['metro', 'leguna'] });
  const b = findRoutes(net, 'MIR', 'MOT', { avoidModes: ['metro', 'leguna'] }, { rush: true });
  assert.ok(b.best.totalMinutes > a.best.totalMinutes);
  const m = findRoutes(net, 'MIR', 'MOT', { avoidModes: ['bus', 'leguna'] }, { rush: true });
  const metro = [...m.options, ...m.others].find((o) => o.summary === 'MRT-6 Mirpur→Motijheel');
  assert.equal(metro.totalMinutes, 26);
  assert.ok(metro.warnings.some((w) => /crowded/.test(w)));
});
