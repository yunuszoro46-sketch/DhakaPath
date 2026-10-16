// Algorithm-doc additions ("Disruption-Aware Transit Routing and Backup Route Optimization"):
// rule precedence and admin delays, disabled lines/links, heavy rain, backup route, budget status,
// no-route status codes and search statistics. Hand-calculated cases from the doc's checklist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNetwork } from '../server/engine/network.js';
import { seed, config as CFG } from '../server/store/seedData.js';
import { findRoutes, edgeState, makeCtx, evaluatePlan } from '../server/engine/router.js';
import { makeEngine } from '../server/store/boot.js';
import { setScenario } from '../server/store/state.js';

const net = loadNetwork(seed, CFG);
const lines = (o) => o.legs.map((l) => l.line);
const everyOption = (r) => [...r.options, ...r.others, ...(r.backup && r.backup.option ? [r.backup.option] : [])];

test('admin delay: 10 × (1 + 0.30) + 3 = 16 min (doc example), most specific delay wins, never stacked', () => {
  const e = { id: 'X:A-B', line: 'B1', mode: 'bus', km: 4, minutes: 10 };
  const st = edgeState(net, e, 'AGA', 'FAR', makeCtx('MIR', 'MOT', {}, { delays: [{ line: 'B1', rate: 0.3, extraMinutes: 3 }] }));
  assert.equal(st.minutes, 16);
  // edge-specific beats line-wide; only one applies
  const both = makeCtx('MIR', 'MOT', {}, { delays: [{ line: 'B1', rate: 1, extraMinutes: 20 }, { edgeId: 'X:A-B', rate: 0.3, extraMinutes: 3 }] });
  assert.equal(edgeState(net, e, 'AGA', 'FAR', both).minutes, 16);
  // on a real one-link leg: B6 Agargaon–Mohammadpur 9 min -> 9 × 1.3 + 3 = 14.7
  const r = findRoutes(net, 'AGA', 'MPR', {}, { delays: [{ edgeId: 'B6:AGA-MPR', rate: 0.3, extraMinutes: 3 }] });
  const b6 = everyOption(r).find((o) => o.summary === 'B6 Agargaon→Mohammadpur');
  assert.equal(b6.legs[0].rideMinutes, 14.7);
  assert.ok(b6.legs[0].reasons.some((x) => /admin delay \+30% \+3 min/.test(x)));
});

test('a line-wide hold-up adds its extra minutes once per leg, not once per link', () => {
  const plain = findRoutes(net, 'MIR', 'MOT', { requireMode: 'metro', maxTransfers: 0 });
  const held = findRoutes(net, 'MIR', 'MOT', { requireMode: 'metro', maxTransfers: 0 }, { delays: [{ line: 'MRT6', extraMinutes: 10 }] });
  const m0 = plain.options[0].legs[0], m1 = held.options[0].legs[0];
  assert.equal(m0.edgeIds.length, 4);
  assert.equal(m1.rideMinutes, m0.rideMinutes + 10);
});

test('disabled line and closed link are never selected, anywhere in the result', () => {
  const r = findRoutes(net, 'MIR', 'MOT', {}, { disabledLines: ['MRT6'] });
  assert.ok(r.ok);
  for (const o of everyOption(r)) assert.ok(!lines(o).includes('MRT6'), o.summary);
  assert.ok(r.stats.linksPruned.disabled > 0);
  const c = findRoutes(net, 'MIR', 'MOT', {}, { blockedEdges: ['B1:FAR-SHA'] });
  for (const o of everyOption(c)) assert.ok(!o.legs.some((l) => l.edgeIds.includes('B1:FAR-SHA')), o.summary);
  // precedence: a disabled line stays closed even when the user requires that mode
  const m = findRoutes(net, 'MIR', 'MOT', { requireMode: 'metro' }, { disabledLines: ['MRT6'] });
  assert.equal(m.ok, false);
});

test('heavy rain takes CNG and leguna off the road only in the rain zone; light rain only slows; metro unaffected', () => {
  const cng = { requireMode: 'cng' };
  assert.ok(findRoutes(net, 'AGA', 'DHA', cng, { rain: ['DHA'] }).ok);                                   // light: CNG still runs
  const heavy = findRoutes(net, 'AGA', 'DHA', cng, { rain: ['DHA'], rainSeverity: 'heavy' });
  const cngNearRain = (r) => everyOption(r).some((o) => o.legs.some((l) => l.mode === 'cng' && l.stops.includes('DHA')));
  assert.ok(heavy.ok);                                                                                      // only CNG legs far from the rain remain
  assert.equal(cngNearRain(heavy), false);
  assert.ok(cngNearRain(findRoutes(net, 'AGA', 'DHA', cng, { rain: ['DHA'] })));
  assert.ok(heavy.stats.linksPruned.weather > 0);
  assert.ok(findRoutes(net, 'AGA', 'DHA', cng, { rain: ['MOT'], rainSeverity: 'heavy' }).ok);         // rain elsewhere: no effect
  const metro = (sc) => findRoutes(net, 'MIR', 'MOT', { requireMode: 'metro', maxTransfers: 0 }, sc).options[0].totalMinutes;
  assert.equal(metro({ rain: ['FAR', 'SHA', 'MOT'], rainSeverity: 'heavy' }), metro({}));
  const bus = (sc) => findRoutes(net, 'MPR', 'SCI', { requireMode: 'bus', maxTransfers: 0 }, sc).options[0].legs[0].rideMinutes;
  assert.ok(bus({ rain: ['DHA'], rainSeverity: 'heavy' }) > bus({ rain: ['DHA'] }));
});

test('backup route: shares no service with the main route, says what would trigger it, and survives that failure', () => {
  const r = findRoutes(net, 'MIR', 'MOT', {});
  const main = r.primary, bk = r.backup;
  assert.equal(main, r.options[0]);
  assert.ok(bk.option, 'a backup exists');
  assert.equal(bk.distinct, 'no_shared_service');
  const svc = (o) => o.legs.filter((l) => l.mode !== 'walk').map((l) => l.line);
  for (const l of svc(bk.option)) assert.ok(!svc(main).includes(l), l);
  assert.match(bk.trigger, /MRT-6/);
  assert.deepEqual(bk.delta, { minutes: bk.option.totalMinutes - main.totalMinutes, fareLow: bk.option.fareRangeLow - main.fareRangeLow,
    fareHigh: bk.option.fareRangeHigh - main.fareRangeHigh, transfers: bk.option.transfers - main.transfers });
  // the failure the trigger names: the backup's own plan is still valid
  assert.ok(evaluatePlan(net, bk.option.legs, {}, { disabledLines: [bk.critical.line] }).ok);
  assert.equal(evaluatePlan(net, main.legs, {}, { disabledLines: [bk.critical.line] }).ok, false);
});

test('backup meets the same constraints, and none is reported when none exists', () => {
  const r = findRoutes(net, 'MIR', 'MOT', { maxBudget: 50, avoidModes: ['cng'] });
  assert.ok(r.backup.option);
  assert.ok(r.backup.option.fareRangeHigh <= 50);
  // at ৳40 every route that fits uses bus B1, so there is honestly no backup
  assert.equal(findRoutes(net, 'MIR', 'MOT', { maxBudget: 40 }).backup.option, null);
  assert.ok(!r.backup.option.legs.some((l) => l.mode === 'cng'));
  const only = findRoutes(net, 'MOT', 'JAT', { avoidModes: ['leguna'] });     // Jatrabari: B4 is the only non-leguna link
  assert.ok(only.ok);
  assert.equal(only.backup.option, null);
  assert.match(only.backup.reason, /No other valid route/);
});

test('budget status uses the top of the fare estimate; "might fit" routes are kept apart, never mixed in', () => {
  const rick = { avoidModes: ['bus', 'walk', 'metro', 'cng'] };            // Shahbagh–Science Lab: rickshaw only, ৳30–45, typical 37.5
  const within = findRoutes(net, 'SHA', 'SCI', { ...rick, maxBudget: 45 });
  assert.equal(within.options[0].budget.status, 'within');
  const maybe = findRoutes(net, 'SHA', 'SCI', { ...rick, maxBudget: 40 });
  assert.equal(maybe.ok, false);
  assert.equal(maybe.error, 'over_budget');
  assert.equal(maybe.uncertainBudget.length, 1);
  assert.equal(maybe.uncertainBudget[0].budget.status, 'estimated_within');
  assert.match(maybe.message, /might fit/);
  const over = findRoutes(net, 'SHA', 'SCI', { ...rick, maxBudget: 25 });
  assert.equal(over.uncertainBudget.length, 0);
  assert.equal(over.cheapestOverBudget.labelled, 'over budget');
  assert.equal(within.options[0].fareConfidence, 'range_estimate');
});

test('no-route responses name the failure category', () => {
  const lonely = loadNetwork({ ...seed, hubs: [...seed.hubs, { id: 'ZZZ', name: 'Island', zone: 'x', lat: 23.7, lng: 90.4, landmarks: [] }] }, CFG);
  assert.equal(findRoutes(lonely, 'MIR', 'ZZZ', {}).status, 'NO_ROUTE_IN_MODELED_NETWORK');
  const shallow = loadNetwork(seed, { ...CFG, ranking: { ...CFG.ranking, maxEdges: 1 } });
  assert.equal(findRoutes(shallow, 'UTT', 'JAT', {}).status, 'NO_ROUTE_WITHIN_HOP_LIMIT');
  const tiny = loadNetwork(seed, { ...CFG, ranking: { ...CFG.ranking, maxDfsNodes: 3 } });
  const inc = findRoutes(tiny, 'UTT', 'JAT', {});
  assert.equal(inc.status, 'SEARCH_INCOMPLETE');
  assert.equal(inc.stats.complete, false);
  const cut = findRoutes(net, 'MOT', 'JAT', {}, { disabledLines: ['B4', 'L1'] });
  assert.deepEqual([cut.status, cut.error], ['NO_ROUTE_WITHIN_CONSTRAINTS', 'no_route']);
  const slow = findRoutes(net, 'MIR', 'MOT', { maxTravelTime: 10 });
  assert.deepEqual([slow.status, slow.error], ['NO_ROUTE_WITHIN_CONSTRAINTS', 'too_slow']);
  assert.equal(findRoutes(net, 'MIR', 'MOT', {}).status, 'OK');
});

test('search statistics match what was processed, and identical runs give identical rankings', () => {
  const r = findRoutes(net, 'MIR', 'MOT', { maxTransfers: 1 });
  const s = r.stats;
  assert.equal(s.hubPaths, r.considered);
  assert.equal(s.candidates + (s.rejected.duplicate || 0), s.hubPaths);
  assert.ok(s.rejected.maxTransfers > 0);
  assert.ok(s.dfsNodes >= s.hubPaths && s.complete);
  const strip = (x) => JSON.stringify({ ...x, stats: { ...x.stats, ms: 0 } });
  assert.equal(strip(findRoutes(net, 'UTT', 'JAT', {})), strip(findRoutes(net, 'UTT', 'JAT', {})));
});

test('Balanced label, max travel time and preferred modes', () => {
  const r = findRoutes(net, 'MIR', 'MOT', {});
  assert.ok(r.best.labels.includes('Balanced'));
  assert.ok(r.options.includes(r.best));
  const t = findRoutes(net, 'MIR', 'MOT', { maxTravelTime: 30 });
  for (const o of [...t.options, ...t.others]) assert.ok(o.totalMinutes <= 30);
  const p = findRoutes(net, 'MIR', 'MOT', { preferredModes: ['leguna'] });
  const pref = p.options.find((o) => o.labels.includes('Preferred mode'));
  assert.ok(pref && pref.legs.some((l) => l.mode === 'leguna'));
  // Bus A -> Bus B is a transfer; the same line is merged into one leg
  for (const o of [...r.options, ...r.others]) {
    for (let i = 1; i < o.legs.length; i++) assert.notEqual(o.legs[i].line, o.legs[i - 1].line);
    assert.equal(o.transfers, o.legs.filter((l) => l.mode !== 'walk').length - 1);
  }
});

test('simulator: disabling the main line switches to the backup planned beforehand, and says so', () => {
  const E = makeEngine({ seedAlerts: false });
  const s = E.simulate({ origin: 'MIR', destination: 'MOT', scenario: 'mrtDown' });
  assert.equal(s.simulated, true);
  assert.ok(s.changedRoute);
  assert.ok(s.backup.holds && s.backup.isNewMain);
  assert.match(s.explanation, /MRT6 Mirpur–Motijheel is cut/);
  assert.match(s.explanation, /backup planned before the change/);
  const d = E.simulate({ origin: 'MIR', destination: 'MOT', scenario: 'mrtDelay' });
  assert.ok(d.brokenSegments.every((x) => x.kind === 'slowed'));
  assert.ok(d.changedRoute);
  const bad = E.simulate({ origin: 'MIR', destination: 'MOT', scenario: { disabledLines: ['NOPE'] } });
  assert.deepEqual([bad.ok, bad.error], [false, 'invalid_scenario']);
});

test('global scenario: a temporary delay applies to searches and expires on the clock', () => {
  const E = makeEngine({ seedAlerts: false });
  assert.ok(setScenario(E.state, { label: 'test', delays: [{ line: 'MRT6', extraMinutes: 30, forMinutes: 60 }] }).ok);
  assert.equal(setScenario(E.state, { disabledLines: ['NOPE'] }).ok, false);
  const metroMin = () => E.search({ origin: 'MIR', destination: 'MOT', requireMode: 'metro', maxTransfers: 0 }).options[0].totalMinutes;
  const held = metroMin();
  E.advance(61);
  assert.equal(held - metroMin(), 30);
});

test('API: search returns status, backup and stats; PUT /api/scenario validates lines and steers routing', async () => {
  const { createServer } = await import('../server/index.js');
  const srv = createServer({ env: {}, adminPassword: 'x-pw' }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, p, body) => (await fetch(base + p, { method, headers: { 'content-type': 'application/json', 'x-user-id': 'algo-tester' }, body: body && JSON.stringify(body) })).json();
  try {
    const s = await call('POST', '/api/search', { origin: 'MIR', destination: 'MOT' });
    assert.equal(s.data.status, 'OK');
    assert.ok(s.data.backup.option && s.data.backup.trigger && s.data.stats.hubPaths > 0);
    const bad = await call('PUT', '/api/scenario', { disabledLines: ['NOPE'] });
    assert.deepEqual([bad.ok, bad.error.code], [false, 'invalid_scenario']);
    const put = await call('PUT', '/api/scenario', { label: 'MRT down', disabledLines: ['MRT6'] });
    assert.ok(put.ok);
    const s2 = await call('POST', '/api/search', { origin: 'MIR', destination: 'MOT' });
    for (const o of [...s2.data.options, ...s2.data.others]) assert.ok(!o.legs.some((l) => l.line === 'MRT6'));
    assert.ok(s2.data.conditions.scenarioActive);
    const nr = await call('POST', '/api/search', { origin: 'MOT', destination: 'JAT', scenario: { disabledLines: ['B4', 'L1'] } });
    assert.deepEqual([nr.ok, nr.data.status], [false, 'NO_ROUTE_WITHIN_CONSTRAINTS']);
  } finally { srv.close(); }
});
