// In-process fuzz of every endpoint: records any 500 (= an uncaught exception on bad input).
import { makeApp } from '../../server/store/boot.js';
const app = makeApp({ adminPassword: 'pw' });
const errs = [];
const call = async (method, path, body, token) => {
  const headers = { 'x-user-id': 'fuzz-user', ...(token ? { authorization: 'Bearer ' + token } : {}) };
  const r = await app.handle({ method, path, query: {}, body, headers, ip: '1.2.3.4' });
  return r;
};
const tok = (await call('POST', '/api/admin/login', { password: 'pw' })).body.data.token;
const weird = [null, [], 'x', 42, true, {}, { origin: null }, { origin: [] , destination: {} }, { origin: 123, destination: true },
  { origin: '', destination: '' }, { origin: 'MIR', destination: 'MOT', maxBudget: 'abc' }, { origin: 'MIR', destination: 'MOT', maxBudget: -5 },
  { origin: 'MIR', destination: 'MOT', maxTransfers: 'x', maxTravelTime: 'NaN' }, { origin: 'MIR', destination: 'MOT', avoidHubs: 5, avoidModes: { a: 1 } },
  { origin: 'MIR', destination: 'MOT', avoidHubs: [null, 3, {}], avoidModes: [null], preferredModes: 7 },
  { origin: 'MIR', destination: 'MOT', scenario: 'nope' }, { origin: 'MIR', destination: 'MOT', scenario: [] }, { origin: 'MIR', destination: 'MOT', scenario: { rain: 'SCI', blocked: 5, delays: 'x', disabledLines: {} } },
  { origin: 'MIR', destination: 'MOT', scenario: { rainZones: 'south', rain: [null] } }, { origin: 'MIR', destination: 'MOT', scenario: { delays: [null, 5, { line: 'B1', rate: 'x' }] } },
  { origin: 'MIR', destination: 'MOT', departAt: 99 }, { origin: 'MIR', destination: 'MOT', departAt: '25:99' }, { origin: 'MIR', destination: 'MOT', sort: { a: 1 }, student: 'maybe' },
  { query: 123 }, { query: '' }, { query: ['a'] }, { query: 'x'.repeat(5000) }, { origin: { toString: 1 }, destination: 'MOT' },
  { message: null }, { message: 42 }, { message: ['hi'] }, { message: 'Mirpur theke Motijheel', sessionId: { a: 1 } }, { text: 5 }, { text: null },
  { legs: 'x' }, { legs: [null] }, { legs: [{ line: 5, from: [], to: {} }] }, { legs: [{ line: 'B1', from: 'MIR', to: 'MIR' }] }, { legs: [{ line: 'B1', from: 'MIR', to: 'MOT' }], student: 'x', rush: 'y' },
  { claimedFare: 'abc', origin: 'MIR', destination: 'MOT' }, { claimedFare: 1e309, origin: 'MIR', destination: 'MOT', mode: 'bus' }, { claimedFare: 50, origin: 'MIR', destination: 'MOT', mode: 5 },
  { hubId: 5, type: {}, severity: 'x' }, { hubId: 'MIR', type: 'blockade', severity: 99 }, { hubId: 'MIR', type: 'blockade', severity: -1, text: 5 },
  { minutes: 'x' }, { minutes: 1e12 }, { minutes: -100 }, { speed: 'x' }, { speed: -3 }, { speed: 1e9 },
  { password: 5 }, { password: null }, { kind: 'line', id: 5 }, { kind: 'edge', from: 'X', to: 'Y', line: 'B1', km: 'x', minutes: -1 }, { kind: 'hub', id: 'ZZ', name: 5, x: 'a' },
  { action: 5 }, { action: 'approve' }, { clientId: 5, origin: 'MIR', destination: 'MOT' }, { clientId: {}, origin: 'MIR' },
  { label: { x: 1 }, rain: ['SCI'] }, { delays: [{ hub: 'SCI', forMinutes: 'x' }] }, { delays: [{ line: 'B1', rate: 0.3, until: 'x' }] },
];
const eps = [['POST', '/api/search'], ['POST', '/api/best-time'], ['POST', '/api/simulate'], ['POST', '/api/fare'], ['POST', '/api/fare/check'], ['POST', '/api/chat'], ['POST', '/api/alerts'],
  ['POST', '/api/alerts/ingest'], ['POST', '/api/alerts/A1/confirm'], ['POST', '/api/alerts/A1/resolve'], ['POST', '/api/clock/advance'], ['POST', '/api/clock/speed'],
  ['POST', '/api/watch'], ['POST', '/api/watch/W1/accept'], ['POST', '/api/demo/seed-users'], ['POST', '/api/ground-test'], ['PUT', '/api/scenario'], ['POST', '/api/admin/login'],
  ['POST', '/api/rides'], ['POST', '/api/rides/S1/join'], ['POST', '/api/rides/S1/leave'], ['POST', '/api/admin/routes', 1], ['PUT', '/api/admin/routes', 1], ['PUT', '/api/admin/routes/B1', 1], ['POST', '/api/admin/alerts/A1/moderate', 1], ['DELETE', '/api/admin/routes/NOPE', 1]];
for (const [m, p, adm] of eps) for (const b of weird) {
  let r; try { r = await call(m, p, b, adm ? tok : null); } catch (e) { errs.push(`${m} ${p} ${JSON.stringify(b).slice(0, 80)} THREW ${e.message}`); continue; }
  if (r.status >= 500 || !r.body || typeof r.body.ok !== 'boolean') errs.push(`${m} ${p} ${JSON.stringify(b).slice(0, 90)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
}
for (const q of [{ clientId: { a: 1 } }, { status: ['x'] }, { status: 'bogus' }]) for (const p of ['/api/watch', '/api/alerts', '/api/browse', '/api/card/x', '/api/network', '/api/rides', '/api/rides/quote', '/api/fares']) {
  const r = await app.handle({ method: 'GET', path: p, query: q, body: {}, headers: { 'x-user-id': 'fuzz-user' } });
  if (r.status >= 500) errs.push(`GET ${p} ${JSON.stringify(q)} -> ${r.status}`);
}
console.log(errs.length + ' failures'); console.log(errs.join('\n'));
