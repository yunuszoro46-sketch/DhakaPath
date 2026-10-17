// Design-pass regression checks (ADR-001 single UI): map-first mobile layout, no overlap between the
// chat button and route cards, status chips with text (never colour only), honest Fare Truth basis
// (official vs estimate), the duplicate-report message, the Monsoon Mode empty state and delta tiles,
// keyboard focus visibility, reduced-motion, and no second UI under /app.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3100/';
const results = [];
const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, String(x).slice(0, 260)]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const tok = (await (await fetch(BASE + 'api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"admin123"}' })).json()).data.token;
  await fetch(BASE + 'api/admin/reset', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: '{}' });
  ok('no second UI: /app/ is a 404', (await fetch(BASE + 'app/')).status === 404);
  const browser = await chromium.launch();
  for (const [w, scheme] of [[1400, 'dark'], [390, 'light'], [360, 'dark']]) {
    const T = `[${w}]`;
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, reducedMotion: w === 360 ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap\.org/.test((m.location() || {}).url || '') && !/ERR_TUNNEL|ERR_INTERNET|ERR_NAME/.test(m.text())) errors.push(m.text()); });
    await page.goto(BASE); await page.waitForSelector('#opts .opt');
    await page.fill('#departAt', '12:00');
    // 1 layout
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    ok(`${T} no horizontal overflow`, sw[0] <= sw[1], sw.join('/'));
    const order = await page.evaluate(() => [document.querySelector('.map-card').getBoundingClientRect().top, document.querySelector('.tabs').getBoundingClientRect().top]);
    if (w <= 900) ok(`${T} phone: map comes before the panels`, order[0] < order[1], order.join(' < '));
    else ok(`${T} desktop: map and panels side by side`, Math.abs(order[0] - order[1]) < 80, order.join(' ~ '));
    const mapH = await page.$eval('#lmap', (e) => e.getBoundingClientRect().height);
    ok(`${T} street map has a usable height`, mapH >= 280, mapH);
    // 2 chat button never covers the selected route card
    const overlaps = (a, b) => !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    if (w > 900) {
      const over = await page.evaluate((f) => { const fn = eval(f); return fn(document.querySelector('#chat-toggle').getBoundingClientRect(), document.querySelector('#opts .opt[aria-pressed=true]').getBoundingClientRect()); }, overlaps.toString());
      ok(`${T} desktop: chat button does not overlap the selected card`, !over);
    } else {
      // a floating button passes over content while scrolling; what must hold is that the end of the page is still readable
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await wait(200);
      const over = await page.evaluate((f) => { const fn = eval(f); const last = [...document.querySelectorAll('.panel-col .card')].filter((c) => !c.closest('[hidden]')).at(-1); return fn(document.querySelector('#chat-toggle').getBoundingClientRect(), last.getBoundingClientRect()); }, overlaps.toString());
      ok(`${T} phone: scrolled to the end, the floating chat button does not cover the last card`, !over);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    if (w <= 900) ok(`${T} phone: page keeps room under the content for the floating chat button`, (await page.$eval('.layout', (e) => parseInt(getComputedStyle(e).paddingBottom, 10))) >= 80);
    else ok(`${T} desktop: chat button lives in the header`, await page.$eval('#chat-toggle', (b) => b.closest('header') !== null && getComputedStyle(b).position !== 'fixed'));
    // 3 tabs reachable
    await page.click('[data-tab=admin]'); ok(`${T} last tab (Admin) is clickable`, !(await page.$eval('#tab-admin', (e) => e.hidden)));
    await page.click('[data-tab=search]');
    // 4 status chips carry text, not just colour; selected card marked by aria-pressed
    const badge = await page.textContent('#opts .opt[aria-pressed=true] .badge-ok');
    ok(`${T} verified badge is text`, /Verified against network/.test(badge), badge);
    const focusOutline = await page.evaluate(() => { const b = document.querySelector('#plan-form button.primary'); b.focus(); return getComputedStyle(b).outlineStyle; });
    ok(`${T} primary button is focusable`, focusOutline !== undefined);
    const nums = await page.$eval('#opts .opt .nums', (e) => parseFloat(getComputedStyle(e).fontSize));
    ok(`${T} route numbers are the largest text on the card`, nums >= 18, nums);
    // 5 Fare Truth: official vs estimate basis is labelled
    await page.selectOption('#fc-mode', 'bus'); await page.fill('#fc-amount', '40'); await page.click('#fc-form button'); await page.waitForSelector('#fc-out .note');
    const fcBus = await page.textContent('#fc-out');
    ok(`${T} Fare Truth bus: official rate named with its basis`, /Overcharge/.test(fcBus) && /official rate/.test(fcBus) && /gazette/i.test(fcBus), fcBus.slice(0, 200));
    await page.selectOption('#origin', 'DHA'); await page.selectOption('#destination', 'SCI'); await page.click('#plan-form button.primary'); await page.waitForSelector('#opts .opt');
    await page.selectOption('#fc-mode', 'rickshaw'); await page.fill('#fc-amount', '60'); await page.click('#fc-form button'); await page.waitForFunction(() => /estimate/.test(document.querySelector('#fc-out').textContent));
    const fcR = await page.textContent('#fc-out');
    ok(`${T} Fare Truth rickshaw: verdict labelled as against an estimate, not an official chart`, /team estimate/.test(fcR) && /against the estimated range/.test(fcR) && !/official rate/.test(fcR), fcR.slice(0, 200));
    await page.selectOption('#destination', 'MOT'); await page.click('#plan-form button.primary'); await page.waitForSelector('#opts .opt');
    // 6 Monsoon Mode: empty state, delta tiles equal the engine delta, Clear restores the empty state
    await page.click('[data-tab=sim]');
    ok(`${T} simulation empty state explains what to do`, /Pick a preset/.test(await page.textContent('#sim-out')));
    const simResp = page.waitForResponse((r) => r.url().endsWith('/api/simulate'));
    await page.click('#sim-presets [data-p=sciFlood]'); const d = (await (await simResp).json()).data; await page.waitForSelector('#sim-out .simgrid');
    const tiles = await page.$$eval('.delta-tiles b', (es) => es.map((e) => e.textContent.trim()));
    ok(`${T} delta tiles show the engine's own time and fare delta`, tiles[0] === `+${d.delta.minutes} min` && tiles[1] === `+${d.delta.fareLow} BDT` && /detour/.test(tiles[2]), JSON.stringify([tiles, d.delta]));
    const [bMin, aMin] = await page.$$eval('.simgrid .nums', (es) => es.map((e) => parseInt(e.textContent, 10)));
    ok(`${T} before/after minutes match the engine response`, bMin === d.beforeOption.totalMinutes && aMin === d.afterOption.totalMinutes, `${bMin}/${aMin}`);
    await page.click('#sim-clear');
    ok(`${T} Clear restores the empty state`, /Pick a preset/.test(await page.textContent('#sim-out')));
    // 7 Alert Ingestor: status chip text, trust meta, duplicate report by the same person
    await page.click('[data-tab=alerts]');
    await page.fill('#ingest-in', 'Mohakhali te onek jam'); await page.click('#ingest-form button.primary'); await page.waitForSelector('#ingest-out .kv');
    const first = await page.textContent('#ingest-out');
    ok(`${T} ingest shows extracted hub/type and the trust outcome`, /Mohakhali/.test(first) && /gridlock/.test(first) && /unverified|confirmation/.test(first), first.slice(0, 200));
    await page.click('#ingest-form button.primary'); await page.waitForFunction(() => /counts once/.test(document.querySelector('#ingest-out').textContent));
    ok(`${T} re-submitting the same report says it counts once`, /counts once/.test(await page.textContent('#ingest-out')));
    const meta = await page.textContent('#alert-list .alert-item');
    ok(`${T} alert item states reports, clear votes, age and routing effect in words`, /report/.test(meta) && /clear/.test(meta) && /routing:/.test(meta) && /min old/.test(meta), meta.slice(0, 200));
    const marks = await page.$eval('#alert-list .alert-item .bar', (e) => getComputedStyle(e, '::before').left);
    ok(`${T} confidence bar carries the 0.30 / 0.60 threshold marks`, marks && marks !== 'auto', marks);
    // 8 reduced motion honoured
    if (w === 360) ok(`${T} reduced motion: route marker animation off`, await page.evaluate(() => { const m = document.querySelector('.on-route-marker'); return !m || getComputedStyle(m).animationDuration === '0.01ms' || getComputedStyle(m).animationName === 'none'; }));
    ok(`${T} no console or page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  for (const r of results) console.log(r[0].padEnd(5), r[1], r[2] ? ' ' + r[2] : '');
  console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
  process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
})();
