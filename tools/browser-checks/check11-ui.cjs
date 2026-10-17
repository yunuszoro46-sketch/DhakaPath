// UI regression checks for the Night Route redesign (docs/UI-REDESIGN-PLAN.md §7) on top of the earlier
// design-pass checks: map-stage layout (desktop panel + full map, phone map first with a bottom nav),
// first route ticket above the fold, From/To/Find reachable on a phone without scrolling, journey strip
// widths proportional to leg minutes, ticket colour = map line colour, vendored fonts and icons (no
// emoji in the UI chrome), honesty labels still on screen, chat drawer and Admin button placement,
// touch targets, status chips with text, honest Fare Truth basis, Monsoon empty state and delta tiles,
// duplicate-report message, reduced motion, and no second UI under /app.
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
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, reducedMotion: w === 360 ? 'reduce' : 'no-preference' }); await ctx.addInitScript(() => { try { localStorage.setItem('dp-map-phone', 'open'); } catch { /* storage off */ } });   // phones start with the map folded; these checks test it open
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap\.org/.test((m.location() || {}).url || '') && !/ERR_TUNNEL|ERR_INTERNET|ERR_NAME/.test(m.text())) errors.push(m.text()); });
    await page.goto(BASE); await page.waitForSelector('#opts .opt');
    await page.fill('#departAt', '12:00');
    // 1 layout: the map is the stage
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    ok(`${T} no horizontal overflow`, sw[0] <= sw[1], sw.join('/'));
    const g = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { map: r('.map-col'), panel: r('.panel-col'), lmap: r('#lmap'), nav: r('.tabs'), vh: innerHeight, vw: innerWidth }; });
    if (w > 1023) {
      ok(`${T} desktop: planner panel on the left, map fills the rest`, g.panel.right <= g.map.left + 1 && g.map.width >= 0.6 * g.vw, JSON.stringify([g.panel.right, g.map.left, g.map.width]));
      ok(`${T} desktop: map runs the full height under the header`, g.lmap.height >= 500, g.lmap.height);
      const t0 = await page.$eval('#opts .opt .nums', (e) => e.getBoundingClientRect().bottom);
      ok(`${T} desktop: first ticket's plate (minutes, fare) is above the fold`, t0 < 900 - 16, t0);
    } else {
      ok(`${T} phone: map comes before the planner`, g.map.top < g.panel.top, `${g.map.top} < ${g.panel.top}`);
      ok(`${T} phone: street map has a usable height`, g.lmap.height >= 250, g.lmap.height);
      ok(`${T} phone: bottom nav is fixed at the bottom`, Math.abs(g.nav.bottom - g.vh) < 2 && (await page.$eval('.tabs', (e) => getComputedStyle(e).position)) === 'fixed', JSON.stringify(g.nav));
      const tabsIn = await page.$$eval('.tabs [role=tab]', (es) => es.map((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.width >= 44 && r.height >= 44; }));
      ok(`${T} phone: all five sections visible in the nav (no sideways scroll), 44 px targets`, tabsIn.length === 5 && tabsIn.every(Boolean), JSON.stringify(tabsIn));
      const reach = await page.evaluate(() => { const navTop = document.querySelector('.tabs').getBoundingClientRect().top; return ['#origin', '#destination', '#plan-form button.find'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.bottom <= navTop && r.top >= 0; }); });
      ok(`${T} phone: From, To and Find routes visible without scrolling`, reach.every(Boolean), JSON.stringify(reach));
      const small = await page.$$eval('.top button, .tabs button, #swap, #plan-form button.find, .pill, .pref-btn', (es) => es.filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [e.id || e.className.baseVal || e.className, Math.round(r.width), Math.round(r.height)]; }).filter(([, , h]) => h < 40));
      ok(`${T} phone: no tiny tap targets in header, nav, planner and map toolbar`, small.length === 0, JSON.stringify(small));
      ok(`${T} phone: page keeps room under the content for the bottom nav`, (await page.$eval('.panel-col', (e) => parseInt(getComputedStyle(e).paddingBottom, 10))) >= 64);
    }
    // 2 chat: a drawer opened from the header, never a floating button over content
    ok(`${T} chat button lives in the header`, await page.$eval('#chat-toggle', (b) => b.closest('header') !== null && getComputedStyle(b).position !== 'fixed'));
    await page.click('#chat-toggle');
    const dock = await page.evaluate(() => { const r = document.querySelector('#chat-dock').getBoundingClientRect(); return [r.width, r.height, innerWidth, innerHeight]; });
    ok(`${T} chat opens as a drawer (desktop: right side, phone: full screen)`, w > 1023 ? dock[0] >= 360 && dock[0] <= 440 : dock[0] === dock[2], JSON.stringify(dock));
    await page.keyboard.press('Escape');
    ok(`${T} Escape closes the chat`, await page.isHidden('#chat-dock'));
    // 3 tabs reachable
    await page.click('[data-tab=admin]'); ok(`${T} Admin (header button) opens its panel`, !(await page.$eval('#tab-admin', (e) => e.hidden)) && (await page.getAttribute('[data-tab=admin]', 'aria-pressed')) === 'true');
    await page.click('[data-tab=search]');
    // 3b tickets: strip widths follow leg minutes, the kind label matches the map line colour
    const strips = await page.$$eval('#opts .opt', (os) => os.map((o) => [...o.querySelectorAll('.modes .mpill')].map((p) => [Number(p.dataset.min), p.getBoundingClientRect().width])));
    const prop = strips.every((legs) => { const tm = legs.reduce((a, [m]) => a + m, 0), tw = legs.reduce((a, [, x]) => a + x, 0); return legs.length === 1 || legs.some(([, x]) => x <= 31) || legs.every(([m, x]) => Math.abs(x / tw - m / tm) < 0.06); });
    ok(`${T} journey strip: each leg's width is proportional to its wait + ride minutes`, prop && strips.length > 0, JSON.stringify(strips));
    const kindCol = await page.$eval('#opts .opt[aria-pressed=true]', (o) => { const k = [...o.classList].find((c) => c.startsWith('k-')).slice(2); const t = o.querySelector('.tag.kind'); return [k, t && getComputedStyle(t).backgroundColor]; });
    const KC = { fastest: 'rgb(22, 163, 74)', cheapest: 'rgb(37, 99, 235)', balanced: 'rgb(124, 58, 237)', backup: 'rgb(249, 115, 22)' };
    ok(`${T} selected ticket's kind label uses its map line colour`, kindCol[1] === KC[kindCol[0]], JSON.stringify(kindCol));
    // 3c identity: vendored fonts, icon sprite, no emoji in the UI chrome, honesty labels on screen
    ok(`${T} vendored fonts load (Instrument Sans, Big Shoulders plate)`, await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "Instrument Sans"') && document.fonts.check('700 30px "Big Shoulders Plate"') && /Big Shoulders Plate/.test(getComputedStyle(document.querySelector('#opts .opt .nums span')).fontFamily); }));
    const emoji = await page.evaluate(() => (document.querySelector('header').textContent + document.querySelector('#tab-search').textContent).match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/gu) || []);
    ok(`${T} no emoji in header and planner (icons come from the sprite)`, emoji.length === 0 && (await page.$$('header svg use')).length >= 5, emoji.join(' '));
    ok(`${T} honesty labels stay on screen`, await page.evaluate(() => { const v = (s) => { const e = document.querySelector(s); const r = e && e.getBoundingClientRect(); return !!r && r.height > 0; }; return v('.demo-banner') && /Seed data, not official/.test(document.querySelector('.demo-banner').textContent) && /approximate area centres/.test(document.querySelector('.map-src').textContent) && /Verified against network/.test(document.querySelector('#opts').textContent); }));
    // 4 status chips carry text, not just colour; selected card marked by aria-pressed
    const badge = await page.textContent('#opts .opt[aria-pressed=true] .badge-ok');
    ok(`${T} verified badge is text`, /Verified against network/.test(badge), badge);
    const focusOutline = await page.evaluate(() => { const b = document.querySelector('#plan-form button.primary'); b.focus(); return getComputedStyle(b).outlineStyle; });
    ok(`${T} primary button is focusable`, focusOutline !== undefined);
    const nums = await page.$eval('#opts .opt .nums span', (e) => parseFloat(getComputedStyle(e).fontSize));
    ok(`${T} route numbers are the largest text on the card (plate)`, nums >= 28, nums);
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
  // tablet landscape / small laptop: the header and the map toolbar must fit at 1024 px
  { const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } }); await ctx.addInitScript(() => { try { localStorage.setItem('dp-map-phone', 'open'); } catch { /* storage off */ } }); const page = await ctx.newPage();
    await page.goto(BASE); await page.waitForSelector('#opts .opt'); await wait(400);
    const g = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const ov = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom); return { sw: document.documentElement.scrollWidth, chat: r('#chat-toggle').right, all: ov(r('.pref-btn.all'), r('#mapview-toggle')) }; });
    ok('[1024] no horizontal overflow; Chat button fully on screen', g.sw <= 1024 && g.chat <= 1024, JSON.stringify(g));
    ok('[1024] route buttons and map-type switch do not overlap', !g.all);
    await ctx.close(); }
  // phone: the "approximate area centres" note is readable, not covered by the legend
  { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await ctx.addInitScript(() => { try { localStorage.setItem('dp-map-phone', 'open'); } catch { /* storage off */ } }); const page = await ctx.newPage();
    await page.goto(BASE); await page.waitForSelector('#opts .opt'); await wait(400);
    const cov = await page.evaluate(() => { const a = document.querySelector('.map-src').getBoundingClientRect(), b = document.querySelector('#street-legend').getBoundingClientRect(); return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom); });
    ok('[390] map note "approximate area centres" not covered by the legend', !cov);
    await ctx.close(); }
  // the map opens when you want it: phones start folded, the button opens and remembers it
  { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
    await page.goto(BASE); await page.waitForSelector('#opts .opt'); await wait(300);
    ok('[390] phone: map starts folded, planner first', await page.isHidden('.map-col') && /Show map/.test(await page.textContent('#map-toggle')) && (await page.getAttribute('#map-toggle', 'aria-expanded')) === 'false');
    await page.click('#map-toggle'); await wait(500);
    ok('[390] phone: Show map opens it with a usable height', (await page.$eval('#lmap', (e) => e.getBoundingClientRect().height)) >= 180 && /Hide map/.test(await page.textContent('#map-toggle')));
    const h0 = await page.$eval('#lmap', (e) => e.getBoundingClientRect().height);
    const hb = await page.$eval('#sheet-handle', (e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.move(hb[0], hb[1]); await page.mouse.down(); await page.mouse.move(hb[0], hb[1] + 120, { steps: 6 }); await page.mouse.up(); await wait(300);
    const h1 = await page.$eval('#lmap', (e) => e.getBoundingClientRect().height);
    ok('[390] phone: dragging the sheet handle down makes the map taller', h1 > h0 + 80, `${h0} -> ${h1}`);
    await page.focus('#sheet-handle'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await wait(200);
    ok('[390] phone: arrow keys on the handle resize too', (await page.$eval('#lmap', (e) => e.getBoundingClientRect().height)) < h1);
    await page.reload(); await page.waitForSelector('#opts .opt'); await wait(400);
    ok('[390] phone: open map and its height are remembered', await page.isVisible('#lmap') && Math.abs((await page.$eval('#lmap', (e) => e.getBoundingClientRect().height)) - (h1 - 40)) < 6);
    await ctx.close(); }
  // desktop: drag the planner edge; hide the map for a full-width planner
  { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
    await page.goto(BASE); await page.waitForSelector('#opts .opt'); await wait(300);
    const w0 = await page.$eval('.panel-col', (e) => e.getBoundingClientRect().width);
    const sp = await page.$eval('#splitter', (e) => { const r = e.getBoundingClientRect(); return [r.x, 450]; });
    await page.mouse.move(sp[0], sp[1]); await page.mouse.down(); await page.mouse.move(sp[0] + 160, sp[1], { steps: 8 }); await page.mouse.up(); await wait(400);
    const w1 = await page.$eval('.panel-col', (e) => e.getBoundingClientRect().width), mw = await page.$eval('#lmap', (e) => e.getBoundingClientRect().width);
    ok('[1440] dragging the planner edge widens the planner and narrows the map', w1 > w0 + 120 && mw < 1440 - w1 + 2, `${w0} -> ${w1}, map ${mw}`);
    await page.focus('#splitter'); await page.keyboard.press('ArrowLeft'); await wait(150);
    ok('[1440] the edge is a keyboard separator with a value', (await page.getAttribute('#splitter', 'role')) === 'separator' && Number(await page.getAttribute('#splitter', 'aria-valuenow')) < w1);
    await page.dblclick('#splitter'); await wait(300);
    ok('[1440] double-click resets the planner width', Math.abs((await page.$eval('.panel-col', (e) => e.getBoundingClientRect().width)) - 440) < 2);
    await page.click('#map-toggle'); await wait(300);
    ok('[1440] Hide map gives the planner the full width', await page.isHidden('.map-col') && (await page.$eval('.panel-col', (e) => e.getBoundingClientRect().width)) > 1300 && (await page.evaluate(() => document.documentElement.scrollWidth)) <= 1440);
    await page.click('#map-toggle'); await wait(500);
    ok('[1440] Show map brings it back at full size', (await page.$eval('#lmap', (e) => e.getBoundingClientRect().width)) > 900);
    await ctx.close(); }
  await browser.close();
  for (const r of results) console.log(r[0].padEnd(5), r[1], r[2] ? ' ' + r[2] : '');
  console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
  process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
})();
