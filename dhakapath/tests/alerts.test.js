import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEngine as createEngine } from '../server/store/boot.js';
import { extractAlertRules } from '../server/ai/parser.js';

const fresh = () => createEngine({ seedAlerts: false });
const status = (e, id) => e.alerts('all').find((a) => a.id === id);

test('spec §7 walk-through: 0.35 soft -> 0.55 soft -> 0.75 hard -> 45 min 0.38 soft -> 90 min 0.19 fading -> 135 min expired', () => {
  const e = fresh();
  const a = e.createAlert({ hubId: 'SCI', type: 'waterlogging', text: 'Science Lab e pani', userId: 'u1' }).alert;
  assert.deepEqual([a.effectiveConfidence, a.status], [0.35, 'unverified']);
  assert.deepEqual([e.confirm(a.id, 'u2').alert.effectiveConfidence, status(e, a.id).status], [0.55, 'unverified']);
  assert.deepEqual([e.confirm(a.id, 'u3').alert.effectiveConfidence, status(e, a.id).status], [0.75, 'active']);
  e.advance(45); assert.deepEqual([status(e, a.id).effectiveConfidence, status(e, a.id).status], [0.38, 'unverified']);
  e.advance(45); assert.deepEqual([status(e, a.id).effectiveConfidence, status(e, a.id).status], [0.19, 'fading']);
  e.advance(45); assert.deepEqual([status(e, a.id).effectiveConfidence, status(e, a.id).status], [0.09, 'expired']);
  assert.ok(!e.alerts().some((x) => x.id === a.id), 'expired alerts are hidden from the default list');
});

test('two confirmations from the same user count once (and the reporter cannot confirm)', () => {
  const e = fresh();
  const a = e.createAlert({ hubId: 'FAR', type: 'gridlock', userId: 'u1' }).alert;
  assert.equal(e.confirm(a.id, 'u1').ignored, true);
  e.confirm(a.id, 'u2');
  assert.equal(e.confirm(a.id, 'u2').ignored, true);
  assert.equal(status(e, a.id).confirmations, 2);
  assert.equal(status(e, a.id).effectiveConfidence, 0.55);
});

test('routing effect: active blockade breaks road links, unverified slows ×1.25, fading has no effect', () => {
  const e = fresh();
  const q = { origin: 'DHA', destination: 'MOT', student: true };
  const base = e.search(q).best;
  assert.equal(base.summary, 'B4 Dhanmondi→Motijheel');
  const a = e.createAlert({ hubId: 'SCI', type: 'blockade', userId: 'u1' }).alert;              // 0.35 unverified
  const soft = e.search(q).best;
  assert.equal(soft.summary, base.summary);
  assert.ok(soft.totalMinutes > base.totalMinutes);
  e.confirm(a.id, 'u2'); e.confirm(a.id, 'u3');                                                 // 0.75 active
  const hard = e.search(q);
  assert.ok([...hard.options, ...hard.others].every((o) => o.legs.every((l) => l.mode === 'metro' || !l.stops.includes('SCI'))));
  assert.notEqual(hard.best.signature, base.signature);
  assert.ok(hard.alertsUsed.includes(a.id));
  e.advance(100);                                                                              // blockade half-life 60: 0.75 -> ~0.24 fading
  assert.equal(status(e, a.id).status, 'fading');
  assert.equal(e.search(q).best.totalMinutes, base.totalMinutes);
});

test('S2 contradiction: a "clear" vote by another user within 10 min disputes the alert and removes it from routing; a third vote settles it', () => {
  const e = fresh();
  const q = { origin: 'DHA', destination: 'MOT' };
  const a = e.createAlert({ hubId: 'SCI', type: 'blockade', userId: 'u1' }).alert;
  e.confirm(a.id, 'u2'); e.confirm(a.id, 'u3');
  assert.equal(status(e, a.id).status, 'active');
  e.advance(5);
  e.resolve(a.id, 'u4');
  assert.equal(status(e, a.id).status, 'disputed');
  assert.ok(status(e, a.id).flags.includes('disputed'));
  assert.equal(e.search(q).alertsUsed.length, 0);
  assert.ok(e.queue().some((x) => x.alertId === a.id && /disputed/.test(x.reason)));
  e.confirm(a.id, 'u5');                                                                       // third vote
  assert.notEqual(status(e, a.id).status, 'disputed');
});

test('two resolved votes close an alert; each lowers confidence by 0.30', () => {
  const e = fresh();
  const a = e.createAlert({ hubId: 'MAL', type: 'gridlock', source: 'admin', userId: 'admin' }).alert;
  assert.equal(a.effectiveConfidence, 0.9); assert.equal(a.status, 'active');
  e.advance(15);
  e.resolve(a.id, 'u1');
  assert.equal(status(e, a.id).baseConfidence, 0.6);
  e.resolve(a.id, 'u2');
  assert.equal(status(e, a.id).status, 'resolved');
});

test('S3 unknown hub rejected; S4 rate limit after 3 reports in 10 min; S5 lone severity-3 downgraded after 30 min', () => {
  const e = fresh();
  const bad = e.createAlert({ hubId: 'NARNIA', type: 'blockade', userId: 'u1' });
  assert.equal(bad.ok, false); assert.match(bad.reason, /S3/);
  for (const h of ['FAR', 'SHA', 'MOT']) assert.equal(e.createAlert({ hubId: h, type: 'gridlock', userId: 'spammer' }).ok, true);
  const fourth = e.createAlert({ hubId: 'MIR', type: 'gridlock', userId: 'spammer' });
  assert.equal(fourth.error, 'rate_limited');
  e.advance(11);
  assert.equal(e.createAlert({ hubId: 'MIR', type: 'gridlock', userId: 'spammer' }).ok, true);
  const s3 = e.createAlert({ hubId: 'BAN', type: 'construction', severity: 3, userId: 'u9' }).alert;
  e.advance(31);
  const v = status(e, s3.id);
  assert.equal(v.severity, 2); assert.ok(v.flags.includes('auto_downgraded'));
  const kinds = e.queue().map((x) => x.kind);
  assert.ok(kinds.includes('rejected_report') && kinds.includes('throttled'));
});

test('S1: unrealistic fare submissions are flagged and excluded from fare stats', () => {
  const e = fresh();
  const a = e.fareCheck({ claimedFare: 900, origin: 'FAR', destination: 'MOT', mode: 'bus', userId: 'u1' });
  assert.deepEqual(a.submission.flags, ['unrealistic_fare']);
  const b = e.fareCheck({ claimedFare: 15, origin: 'FAR', destination: 'MOT', mode: 'bus', userId: 'u2' });
  assert.deepEqual(b.submission.flags, []);
  assert.equal(b.community.reports, 1);
  assert.equal(e.fareCheck({ claimedFare: 200, origin: 'BAN', destination: 'MAL', mode: 'rickshaw' }).submission.flags[0], 'unrealistic_fare');  // 80/km
  assert.equal(e.fareCheck({ claimedFare: 60, origin: 'BAN', destination: 'MAL', mode: 'rickshaw' }).verdict, 'fair');
  assert.equal(e.fareCheck({ claimedFare: 40, origin: 'FAR', destination: 'MOT', mode: 'bus' }).verdict, 'overcharge');   // expected 13
  assert.ok(e.queue().some((x) => x.kind === 'fare'));
});

test('moderation: approve raises to admin trust, remove hides', () => {
  const e = fresh();
  const a = e.createAlert({ hubId: 'SCI', type: 'waterlogging', userId: 'u1' }).alert;
  assert.equal(e.moderate(a.id, 'approve').alert.status, 'active');
  assert.equal(e.moderate(a.id, 'remove').alert.status, 'removed');
  assert.equal(e.moderate(a.id, 'nonsense').ok, false);
});

test('ingest (rules): messy Banglish / Bangla posts become structured alerts at ai_ingest trust (0.30)', () => {
  const e = fresh();
  const x = extractAlertRules(e.net, 'Science Lab e hatu pani!! rickshaw o jacche na');
  assert.deepEqual([x.hubId, x.type, x.severity], ['SCI', 'waterlogging', 3]);
  assert.deepEqual([extractAlertRules(e.net, 'ফার্মগেটে মিছিল, রাস্তা বন্ধ').hubId, extractAlertRules(e.net, 'ফার্মগেটে মিছিল, রাস্তা বন্ধ').type], ['FAR', 'blockade']);
  assert.equal(extractAlertRules(e.net, 'Mohakhali te construction er kaj cholche').type, 'construction');
  assert.equal(extractAlertRules(e.net, 'Malibagh e onek jam').type, 'gridlock');
  assert.equal(extractAlertRules(e.net, 'Shahbagh block, na ekhon clear').contradictory, true);
  const r = e.ingestExtracted(extractAlertRules(e.net, 'Science Lab e pani jome gese'), 'Science Lab e pani jome gese', 'u1');
  assert.equal(r.action, 'filed'); assert.equal(r.alert.effectiveConfidence, 0.3); assert.equal(r.alert.source, 'ai_ingest');
  assert.equal(e.ingestExtracted(extractAlertRules(e.net, 'kichu ekta hoise'), 'kichu ekta hoise', 'u2').action, 'needs_more');
  assert.equal(e.ingestExtracted(extractAlertRules(e.net, 'Shahbagh block, na ekhon clear'), 'Shahbagh block, na ekhon clear', 'u3').action, 'rejected');
  const c = e.ingestExtracted(extractAlertRules(e.net, 'Science Lab ekhon clear'), 'Science Lab ekhon clear', 'u4');
  assert.equal(c.action, 'resolve_votes'); assert.equal(c.alerts.length, 1);
});

test('simulation: before/after, broken segments, delta, explanation', () => {
  const e = fresh();
  const s = e.simulate({ origin: 'DHA', destination: 'MOT', student: true, scenario: 'sciFlood' });
  assert.ok(s.ok && s.changedRoute);
  assert.ok(s.brokenSegments.some((b) => b.kind === 'broken' && b.line === 'B4'));
  assert.ok(s.delta.minutes > 0 && s.delta.fareLow > 0);
  assert.match(s.explanation, /Detour/);
  const rainOnly = e.simulate({ origin: 'DHA', destination: 'MOT', scenario: 'sciRain' });
  assert.equal(rainOnly.changedRoute, false);
  assert.ok(rainOnly.brokenSegments.every((b) => b.kind === 'slowed'));
  assert.equal(e.simulate({ origin: 'DHA', destination: 'MOT', scenario: { blocked: ['XYZ'] } }).ok, false);
});
