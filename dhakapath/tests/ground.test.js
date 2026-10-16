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

test('grounding rejects a fake line, a fake edge and a wrong fare; accepts a correct plan', () => {
  assert.equal(groundRoute(net, { legs: [{ line: 'BUS99', from: 'UTT', to: 'BAN', fare: 20 }] }).ok, false);
  const fe = groundRoute(net, { legs: [{ line: 'B1', from: 'MIR', to: 'BAN' }] });
  assert.equal(fe.ok, false); assert.match(fe.errors[0], /no edge/);
  const wf = groundRoute(net, { legs: [{ line: 'B1', from: 'MIR', to: 'MOT', fare: 20 }] });
  assert.equal(wf.ok, false); assert.match(wf.errors[0], /engine fare is ৳27/);
  assert.equal(groundRoute(net, { legs: [{ line: 'B1', from: 'MIR', to: 'MOT', fare: 14 }], student: true }).ok, true);
  assert.equal(groundRoute(net, { legs: [{ line: 'R-BAN-MAL', from: 'BAN', to: 'MAL', fare: 60 }] }).ok, true);   // inside 50–75
  assert.equal(groundRoute(net, { legs: [{ line: 'R-BAN-MAL', from: 'BAN', to: 'MAL', fare: 90 }] }).ok, false);
  assert.equal(groundRoute(net, { legs: [{ line: 'B1', from: 'MIR', to: 'FAR' }, { line: 'MRT6', from: 'SHA', to: 'MOT' }] }).ok, false);   // gap
});
