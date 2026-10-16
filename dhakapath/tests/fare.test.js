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

test('spec §4 worked examples: bus', () => {
  assert.equal(bus(11.0).regular, 27);                 // B1 MIR->MOT
  assert.equal(bus(11.0, true).student, 14);
  assert.equal(bus(3.0).regular, 10);                  // floor
  assert.equal(bus(3.0, true).student, 10);            // floor holds
  assert.equal(bus(5.0, true).student, 10);            // spec §12: 3 km and 5 km both 10
  assert.equal(studentFare(busRegular(5.0, cfg), cfg), 10);
  assert.equal(bus(11.0, true).rangeLow, 14);          // the student flag picks the student fare
});

test('spec §4 worked examples: MRT and leguna have no student discount', () => {
  assert.equal(metroFare(11.0, cfg), 55);
  const m = fareLeg({ mode: 'metro', km: 11.0 }, { student: true }, cfg);
  assert.deepEqual([m.regular, m.student, m.studentApplies], [55, 55, false]);
  assert.equal(metroFare(2.0, cfg), 20);               // minimum
  assert.equal(metroFare(30, cfg), 100);               // maximum
  const l = fareLeg({ mode: 'leguna', km: 3, flatFare: 15 }, { student: true }, cfg);
  assert.deepEqual([l.regular, l.student], [15, 15]);
});

test('spec §4 worked examples: rickshaw BAN->MAL 2.5 km with surges', () => {
  const r = (o) => { const x = rickshawRange(2.5, o, cfg); return [x.low, x.high]; };
  assert.deepEqual(r({}), [50, 75]);
  assert.deepEqual(r({ rush: true }), [65, 100]);
  assert.deepEqual(r({ rain: true }), [75, 115]);
  assert.deepEqual(r({ rush: true, rain: true }), [90, 135]);
  assert.equal(rickshawRange(0.5, {}, cfg).low, 20);   // minimum 20
  const f = fareLeg({ mode: 'rickshaw', km: 2.5 }, { student: true }, cfg);
  assert.equal(f.studentApplies, false); assert.equal(f.student, 62.5);     // midpoint used for cost
});
