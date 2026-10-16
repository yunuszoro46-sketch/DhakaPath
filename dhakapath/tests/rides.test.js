// Bonus 3: ride-share board + split bot. The total always comes from the engine's fare for that link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEngine } from '../server/store/boot.js';
import { splitFare } from '../server/engine/rides.js';
import { createServer } from '../server/index.js';

const E0 = () => makeEngine({ seedAlerts: false });

test('split bot: per-person share is the engine range divided and rounded up', () => {
  assert.deepEqual(splitFare(30, 45, 2), { people: 2, low: 15, high: 23 });
  assert.deepEqual(splitFare(140, 200, 3), { people: 3, low: 47, high: 67 });
  assert.ok(splitFare(31, 47, 3).low * 3 >= 31 && splitFare(31, 47, 3).high * 3 >= 47);   // riders never under-pay the total
  const E = E0();
  const q = E.rideQuote({ from: 'Shahbagh', to: 'Science Lab', mode: 'rickshaw', people: 2 });
  const card = E.search({ origin: 'SHA', destination: 'SCI', allowedModes: ['rickshaw'], maxTransfers: 0 }).options[0];
  assert.deepEqual([q.total.low, q.total.high], [card.fareRangeLow, card.fareRangeHigh]);
  assert.match(q.bot, /Split 2 ways: ৳15–23 each, of ৳30–45 total/);
});

test('split bot follows rush / rain surge and rejects what cannot be shared', () => {
  const E = E0();
  const off = E.rideQuote({ from: 'MOH', to: 'BAD', mode: 'cng', people: 3 });
  E.state.scenario = { ...E.state.scenario, rush: true };
  const rush = E.rideQuote({ from: 'MOH', to: 'BAD', mode: 'cng', people: 3 });
  assert.ok(rush.perPerson.high > off.perPerson.high && rush.surge === 1.3);
  assert.match(rush.bot, /×1\.3 rush-hour surge; baseline/);
  assert.equal(E.rideQuote({ from: 'MIR', to: 'MOT', mode: 'cng' }).error, 'no_link');
  assert.equal(E.rideQuote({ from: 'SHA', to: 'SCI', mode: 'bus' }).error, 'invalid_mode');
  assert.equal(E.rideQuote({ from: 'SHA', to: 'SCI', mode: 'rickshaw', people: 3 }).error, 'invalid_people');
  assert.equal(E.rideQuote({ from: 'SHA', to: 'SHA' }).error, 'same_hub');
});

test('board: start, auto-join the same share, full, leave, expiry, one open share per rider', () => {
  const E = E0();
  const a = E.rideCreate({ from: 'SHA', to: 'SCI', mode: 'rickshaw', userId: 'rider-a' });
  assert.ok(a.ok && !a.joined && a.ride.riders === 1);
  assert.equal(E.rideCreate({ from: 'MOH', to: 'BAD', mode: 'cng', userId: 'rider-a' }).error, 'already_sharing');
  const b = E.rideCreate({ from: 'SHA', to: 'SCI', mode: 'rickshaw', userId: 'rider-b' });       // same trip -> joins, no duplicate post
  assert.ok(b.joined && b.ride.id === a.ride.id && b.ride.status === 'full');
  assert.deepEqual(b.ride.perPerson, { people: 2, low: 15, high: 23 });
  assert.equal(E.rideJoin(a.ride.id, 'rider-c').error, 'closed');
  assert.equal(E.rideList({ hub: 'SHA', userId: 'rider-c' }).rides.length, 0);                // full share is hidden from others
  assert.equal(E.rideList({ hub: 'SHA', userId: 'rider-a' }).rides.length, 1);                // but riders still see it
  assert.ok(E.rideLeave(a.ride.id, 'rider-b').ok);
  assert.equal(E.rideList({ hub: 'SHA', userId: 'rider-c' }).rides[0].status, 'open');
  E.advance(21);
  assert.equal(E.rideList({ hub: 'SHA', userId: 'rider-a' }).rides.length, 0);                // expired after 20 min
  assert.ok(E.rideCreate({ from: 'MOH', to: 'BAD', mode: 'cng', userId: 'rider-a' }).ok);      // free to start another
});

test('chat split bot and HTTP endpoints use the same numbers', async () => {
  const srv = createServer({ env: {}, adminPassword: 'r-pw' }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = (m, p, b, u = 'ride-http-1') => fetch(base + p, { method: m, headers: { 'content-type': 'application/json', 'x-user-id': u }, body: b && JSON.stringify(b) }).then((r) => r.json());
  try {
    const q = await call('GET', '/api/rides/quote?from=SHA&to=SCI&mode=rickshaw&people=2');
    const c = await call('POST', '/api/chat', { message: 'Shahbagh theke Science Lab rickshaw share korbo, amra 2 jon', sessionId: 'ride-http-1' });
    assert.equal(c.data.intent, 'ride_share');
    assert.ok(c.data.reply.includes(`৳${q.data.perPerson.low}–${q.data.perPerson.high} each`));
    assert.ok(c.data.toolCalls.some((t) => /^splitFare\(SHA->SCI, rickshaw, 2 people\)$/.test(t)));
    const post = await call('POST', '/api/rides', { from: 'SHA', to: 'SCI', mode: 'rickshaw' });
    assert.ok(post.ok);
    const list = await call('GET', '/api/rides?hub=SHA', undefined, 'ride-http-2');
    assert.equal(list.data.rides.length, 1);
    assert.equal(list.data.rides[0].mine, false);
    assert.equal(JSON.stringify(list.data).includes('ride-http-1'), false);                    // rider ids are not exposed
    const join = await call('POST', `/api/rides/${post.data.ride.id}/join`, {}, 'ride-http-2');
    assert.equal(join.data.ride.status, 'full');
    const bad = await call('POST', '/api/rides', { from: { x: 1 }, to: 'SCI' });
    assert.equal(bad.error.code, 'unknown_hub');
  } finally { srv.close(); }
});
