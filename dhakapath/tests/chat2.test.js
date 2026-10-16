// Judge-style chat phrases that failed in the pre-event review, now fixed: places that are not hubs,
// rush / rain inside a trip question, "X na niye", hub-specific reliability, small talk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from '../server/store/boot.js';

async function chat(app, sid, message) {
  const r = await app.handle({ method: 'POST', path: '/api/chat', query: {}, body: { message, sessionId: sid }, headers: { 'x-user-id': sid } });
  return r.body.data;
}
const fresh = () => makeApp({ adminPassword: 'x', start: Date.UTC(2026, 9, 16, 6, 0), speed: 0, seedAlerts: false });

test('a place that is not a hub is reported with the nearest hubs, never swapped for the last origin', async () => {
  const app = fresh();
  await chat(app, 'judge-1111', 'Mohakhali theke Badda');
  const d = await chat(app, 'judge-1111', 'gulshan theke motijheel');
  assert.match(d.reply, /"gulshan" isn't one of the 14 hubs/);
  assert.match(d.reply, /nearest: Badda or Mohakhali/);
  assert.deepEqual(d.toolCalls, []);                                   // no route was invented
  const home = await chat(app, 'judge-1111', 'amar bari theke motijheel');
  assert.match(home.reply, /Kon hub theke shuru korben|Which hub are you starting from/);
  // NL search box answers the same way
  const r = await app.handle({ method: 'POST', path: '/api/search', query: {}, body: { query: 'from Banani to Farmgate' }, headers: { 'x-user-id': 'judge-1111' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error.message, /"banani" isn't one of the 14 hubs \(nearest: Mohakhali\)/);
});

test('"in rush hour" and "brishti hocche" change the fare the user is quoted', async () => {
  const app = fresh();
  const off = await chat(app, 'judge-2222', 'CNG fare from Mohakhali to Badda');
  const rush = await chat(app, 'judge-3333', 'how much is the CNG fare from Mohakhali to Badda in rush hour?');
  const o0 = off.data.options[0], o1 = rush.data.options[0];
  assert.equal(o0.legs[0].mode, 'cng'); assert.equal(o1.legs[0].mode, 'cng');
  assert.ok(o1.fareRangeHigh > o0.fareRangeHigh, `${o0.fareRangeHigh} -> ${o1.fareRangeHigh}`);
  assert.equal(o1.legs[0].fare.surge, 1.3);
  assert.match(rush.reply, /rush hour applied \(as asked\)/);
  const rain = await chat(app, 'judge-4444', 'rickshaw bhara koto hobe shahbagh theke science lab, brishti hocche');
  assert.equal(rain.data.options[0].legs[0].fare.surge, 1.5);
  assert.match(rain.reply, /rain at Shahbagh, Science Lab/);
});

test('"metro na niye jabo" and "bus lagbe na" avoid that mode in a follow-up and a new trip', async () => {
  const app = fresh();
  await chat(app, 'judge-5555', 'Mirpur theke Motijheel jabo');
  const d = await chat(app, 'judge-5555', 'metro na niye jabo');
  assert.equal(d.intent, 'route_search');
  assert.ok(d.data.options.every((o) => o.legs.every((l) => l.mode !== 'metro')));
  const b = await chat(app, 'judge-6666', 'bus lagbe na, Mirpur theke Motijheel');
  assert.ok(b.data.options.every((o) => o.legs.every((l) => l.mode !== 'bus')));
});

test('"is the Science Lab alert reliable?" answers about Science Lab; small talk gets a friendly reply', async () => {
  const app = fresh();
  const none = await chat(app, 'judge-7777', 'is the Science Lab alert reliable?');
  assert.match(none.reply, /No open alert at Science Lab/);
  await chat(app, 'judge-7777', 'Science Lab e pani jomse, hatu pani');
  const one = await chat(app, 'judge-8888', 'is the Science Lab alert reliable?');
  assert.match(one.reply, /Science Lab waterlogging: unverified — confidence 0\.35/);
  assert.match((await chat(app, 'judge-7777', 'thanks')).reply, /You're welcome/);
  assert.match((await chat(app, 'judge-7777', 'dhonnobad bhai')).reply, /shagotom/);
});
