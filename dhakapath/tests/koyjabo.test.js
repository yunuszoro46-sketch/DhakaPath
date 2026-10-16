// KoyJabo's engine assertions (koyjabo/tests/engine.test.mjs), ported onto DhakaPath's engine, which
// stays the only engine. Hub ids are DhakaPath's (mirpur -> MIR). Where KoyJabo's numbers differ
// from the team spec (bus ৳2.70/km, heavy rain suspending buses), the spec value is asserted and the
// difference is noted next to the assertion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNetwork } from '../server/engine/network.js';
import { seed, config as CFG } from '../server/store/seedData.js';
import { findRoutes, edgeState, makeCtx } from '../server/engine/router.js';
import { fareLeg } from '../server/engine/fare.js';
import { makeEngine } from '../server/store/boot.js';

const net = loadNetwork(seed, CFG);
const E = makeEngine({ seedAlerts: false });
const all = (r) => [...r.options, ...r.others];

test('KoyJabo core: delay formula, minimum fares, input errors', () => {
  const e = { id: 'X:A-B', line: 'X', mode: 'bus', km: 3, minutes: 10 };
  assert.equal(edgeState(net, e, 'MIR', 'AGA', makeCtx('MIR', 'MOT', {}, { delays: [{ line: 'X', rate: 0.3, extraMinutes: 3 }] })).minutes, 16);
  assert.equal(fareLeg({ mode: 'bus', km: 1 }, {}, CFG).regular, 10);
  // KoyJabo: 8 km student = ceil(round(8 × 2.70) / 2) = 11. Spec rate 2.45: round(19.6) = 20 -> 10.
  assert.equal(fareLeg({ mode: 'bus', km: 8 }, { student: true }, CFG).student, 10);
  assert.equal(findRoutes(net, 'NOPE', 'MOT').status, 'INVALID_INPUT');
  assert.equal(findRoutes(net, 'MIR', 'MIR').error, 'same_hub');            // KoyJabo: SAME_LOCATION
});

test('KoyJabo core: cheapest vs fastest, no cycles, hop limit, legs and transfers, determinism', () => {
  const r = findRoutes(net, 'MIR', 'MOT', {});
  const cheap = r.options.find((o) => o.labels.includes('Cheapest')), fast = r.options.find((o) => o.labels.includes('Fastest'));
  assert.ok(cheap.fare <= fast.fare && fast.totalMinutes <= cheap.totalMinutes);
  for (const o of all(r)) {
    const hubs = [o.legs[0].from, ...o.legs.flatMap((l) => l.stops.slice(1))];
    assert.equal(new Set(hubs).size, hubs.length);
    assert.ok(hubs.length - 1 <= 6);
    assert.equal(o.transfers, o.legs.filter((l) => l.mode !== 'walk').length - 1);
  }
  assert.equal(JSON.stringify(findRoutes(net, 'UTT', 'JAT', {}).options), JSON.stringify(findRoutes(net, 'UTT', 'JAT', {}).options));
});

test('KoyJabo disruptions: disabled MRT-6 + blocked Farmgate, backup avoids the critical line, strict budget', () => {
  const s = findRoutes(net, 'MIR', 'MOT', {}, { disabledLines: ['MRT6'], blocked: ['FAR'] });
  for (const o of all(s)) {
    assert.ok(!o.legs.some((l) => l.line === 'MRT6'));
    assert.ok(!o.legs.flatMap((l) => l.stops).slice(1, -1).includes('FAR'));
  }
  const r = findRoutes(net, 'MIR', 'MOT', {});
  assert.ok(r.backup.option && !r.backup.option.legs.some((l) => l.line === r.backup.critical.line));
  const tight = findRoutes(net, 'MIR', 'MOT', { maxBudget: 5 });
  assert.equal(tight.status, 'NO_ROUTE_WITHIN_CONSTRAINTS');
  assert.ok(tight.cheapestOverBudget);
  // KoyJabo: heavy rain suspends buses. Team assumption here: heavy rain stops CNG and leguna in the rain area.
  const rain = findRoutes(net, 'MIR', 'MOT', {}, { rain: ['MIR', 'AGA', 'FAR', 'SHA', 'MOT'], rainSeverity: 'heavy' });
  assert.ok(rain.ok && !all(rain).some((o) => o.legs.some((l) => ['cng', 'leguna'].includes(l.mode))));
});

test('KoyJabo mode filters: metro only, bus only, single mode, walking only (clear message)', () => {
  const metro = E.search({ origin: 'Mirpur', destination: 'Motijheel', allowedModes: ['metro'] });
  assert.ok(metro.ok && all(metro).every((o) => o.legs.every((l) => l.mode === 'metro')));
  const bus = E.search({ origin: 'Mirpur', destination: 'Motijheel', allowedModes: ['bus'] });
  assert.ok(bus.ok && all(bus).every((o) => o.legs.every((l) => l.mode === 'bus')));
  const single = E.search({ origin: 'Mirpur', destination: 'Motijheel', singleModeOnly: true });
  assert.ok(single.ok);
  for (const o of [...all(single), single.backup.option].filter(Boolean)) assert.equal(new Set(o.legs.map((l) => (l.mode === 'cng' ? 'rickshaw' : l.mode))).size, 1, o.summary);
  assert.ok(single.stats.rejected.singleModeOnly > 0);
  const walk = E.search({ origin: 'Uttara', destination: 'Jatrabari', allowedModes: ['walking'] });
  assert.equal(walk.status, 'NO_ROUTE_WITHIN_CONSTRAINTS');
  assert.match(walk.message, /Walking/);
  // allowedModes and singleModeOnly are validated like every other field
  assert.equal(E.search({ origin: 'Mirpur', destination: 'Motijheel', allowedModes: ['boat'] }).error, 'invalid_mode');
  assert.equal(E.search({ origin: 'Mirpur', destination: 'Motijheel', singleModeOnly: 'sometimes' }).error, 'invalid_field');
});

test('every hub has an approximate map position inside Dhaka', () => {
  for (const h of net.hubs) {
    assert.ok(h.lat > 23.6 && h.lat < 24.0 && h.lng > 90.2 && h.lng < 90.6, h.id);
    assert.equal(h.coordsApprox, true);
  }
});
