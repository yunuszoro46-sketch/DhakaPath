// Best time to leave: same engine search at later departures; rush windows decide the bus time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEngine } from '../server/store/boot.js';
import { chatTurn, newSession } from '../server/ai/chat.js';
import { parseRules } from '../server/ai/parser.js';
import { createServer } from '../server/index.js';

const E0 = () => makeEngine({ seedAlerts: false });

test('just before rush ends: waiting for 10:30 makes the bus faster; metro is unchanged', () => {
  const E = E0();
  const b = E.bestTime({ origin: 'MIR', destination: 'MOT', departAt: '09:50' });
  assert.ok(b.ok);
  assert.ok(b.options[0].timeline.some((s) => s.departAt === '10:30'));          // the minute rush ends is always a slot
  const bus = b.options.find((o) => o.summary === 'B1 Mirpur→Motijheel'), mrt = b.options.find((o) => /^MRT-6/.test(o.summary));
  assert.deepEqual([bus.worthWaiting, bus.best.departAt, bus.now.minutes, bus.best.minutes, bus.savedMinutes], [true, '10:30', 58, 41, 17]);
  assert.equal(mrt.worthWaiting, false);
  assert.ok(mrt.timeline.every((s) => s.minutes === mrt.now.minutes));
  // every slot equals a plain search at that time (same engine, no separate model)
  for (const s of bus.timeline) {
    const r = E.search({ origin: 'MIR', destination: 'MOT', departAt: s.departAt });
    assert.equal([...r.options, ...r.others].find((o) => o.signature === bus.signature).totalMinutes, s.minutes);
  }
  assert.match(b.advice, /leave at 10:30 instead of 09:50 — 58 → 41 min.*arrive 11:11 instead of 10:48/);
});

test('just before rush starts: "leave before 07:30"; mid-day: leave now; rush set by hand: no comparison', () => {
  const E = E0();
  const early = E.bestTime({ origin: 'MIR', destination: 'MOT', departAt: '07:00' });
  assert.equal(early.options.find((o) => o.summary === 'B1 Mirpur→Motijheel').leaveBefore, '07:30');
  assert.match(early.advice, /leave before 07:30/);
  const noon = E.bestTime({ origin: 'MIR', destination: 'MOT', departAt: '12:00' });
  assert.ok(noon.options.every((o) => !o.worthWaiting && !o.leaveBefore));
  assert.match(noon.advice, /^Leave now/);
  E.state.scenario = { ...E.state.scenario, rush: true };
  assert.equal(E.bestTime({ origin: 'MIR', destination: 'MOT', departAt: '09:50' }).rushFixed, true);
});

test('rickshaw surge counts as a saving; bad input is reported, not guessed', () => {
  const E = E0();
  const r = E.bestTime({ origin: 'SHA', destination: 'SCI', allowedModes: ['rickshaw'], departAt: '09:50' });
  const o = r.options[0];
  assert.ok(o.worthWaiting && o.savedFare > 0 && o.best.fareHigh < o.now.fareHigh);
  assert.equal(E.bestTime({ origin: 'MIR', destination: 'MIR' }).error, 'same_hub');
  assert.equal(E.bestTime({ origin: 'Nowhere', destination: 'MOT' }).error, 'unknown_hub');
  assert.equal(E.bestTime({ origin: 'MIR', destination: 'MOT', windowMinutes: 9999 }).windowMinutes, 180);
});

test('chat: Banglish and English ask the same tool; a colon time is read; follow-up reuses the trip', async () => {
  const E = E0();
  assert.equal(parseRules(E.net, 'Mirpur theke Motijheel kokhon ber hobo 9:50 e?').departAt, '09:50');
  assert.equal(parseRules(E.net, 'mirpur 10 theke motijheel 50 takar moddhe').departAt, null);   // no colon -> not a time
  const s = newSession();
  const a = await chatTurn(E, s, 'Mirpur theke Motijheel kokhon ber hobo 9:50 e?', {});
  assert.equal(a.intent, 'best_time');
  assert.deepEqual(a.toolCalls, ['bestTime(MIR->MOT, from 09:50, 8 departures)']);
  assert.match(a.reply, /leave at 10:30/);
  const b = await chatTurn(E, s, 'when should I leave?', {});
  assert.match(b.toolCalls[0], /^bestTime\(MIR->MOT/);
  const g = await chatTurn(E, newSession(), 'Gulshan theke Motijheel kokhon jabo', {});
  assert.match(g.reply, /"gulshan" isn't one of the 14 hubs/);
});

test('POST /api/best-time matches the engine and validates input', async () => {
  const srv = createServer({ env: {}, adminPassword: 'b-pw' }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const call = (b) => fetch(`http://127.0.0.1:${srv.address().port}/api/best-time`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
  try {
    const r = await call({ origin: 'Mirpur', destination: 'Motijheel', departAt: '09:50' });
    assert.ok(r.ok && r.data.options.some((o) => o.worthWaiting && o.best.departAt === '10:30'));
    assert.equal((await call({ origin: 'MIR' })).error.code, 'missing_field');
    assert.equal((await call({ origin: { x: 1 }, destination: 'MOT' })).ok, false);
  } finally { srv.close(); }
});

test('Bangla script from voice input: places, student, budget, times', () => {
  const E = E0();
  const p = parseRules(E.net, 'মিরপুর থেকে মতিঝিল ছাত্র ৪০ টাকার মধ্যে');
  assert.deepEqual([p.intent, p.origin, p.destination, p.student, p.maxBudget], ['route_search', 'MIR', 'MOT', true, 40]);
  assert.equal(parseRules(E.net, 'উত্তরা থেকে যাত্রাবাড়ী সকাল ৯:৫০ এ').departAt, '09:50');
  assert.equal(parseRules(E.net, 'মিরপুর থেকে মতিঝিল বিকাল ৫টায়').departAt, '17:00');
  assert.equal(parseRules(E.net, 'মিরপুর থেকে মতিঝিল কখন বের হব').intent, 'best_time');
});
