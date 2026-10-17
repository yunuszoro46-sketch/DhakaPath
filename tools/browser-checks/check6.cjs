// Street map (KoyJabo port): hubs, labels, preference buttons, All three, popups, single-mode toggle,
// schematic switch, bad coordinates, Leaflet missing, tile failure note. Engine numbers = map numbers.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3100/';
const OFFLINE = /\.html$/.test(BASE);
const results = [];
const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, String(x).slice(0, 260)]);
const COLORS = { fastest: '#16a34a', cheapest: '#2563eb', balanced: '#7c3aed', backup: '#f97316' };

(async () => {
  const browser = await chromium.launch();
  for (const w of [1400, 390]) {
    const T = `[${w}]`;
    const open = async (setup) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 950 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text()) && !/tile\.openstreetmap\.org/.test((m.location() || {}).url || '')) errors.push(m.text()); });
      if (setup) await setup(page);
      await page.goto(BASE);
      await page.waitForSelector('#opts .opt');
      await page.waitForTimeout(500);
      return { page, ctx, errors };
    };
    const strokes = (page) => page.$$eval('#lmap path.leaflet-interactive', (e) => e.map((p) => [p.getAttribute('stroke'), p.getAttribute('stroke-dasharray'), Number(p.getAttribute('stroke-width'))]));
    const go = async (page, o, d) => { await page.selectOption('#origin', o); await page.selectOption('#destination', d); await page.uncheck('#student'); await page.fill('#departAt', '12:00'); await page.click('#plan-form button.primary'); await page.waitForTimeout(OFFLINE ? 300 : 500); };
    {
      const { page, ctx, errors } = await open();
      ok(`${T} street map is the default view; schematic hidden`, await page.isVisible('#lmap') && await page.isHidden('#schematic-wrap'));
      ok(`${T} 14 hub markers with 14 permanent labels`, (await page.$$eval('#lmap .hub-marker', (e) => e.length)) === 14 && (await page.$$eval('#lmap .hub-tooltip', (e) => e.length)) === 14);
      ok(`${T} A and B pins on the trip ends`, (await page.$$('#lmap .origin-pin')).length === 1 && (await page.$$('#lmap .dest-pin')).length === 1);
      await go(page, 'MIR', 'MOT');
      const api = OFFLINE ? null : await page.evaluate(async () => (await (await fetch('/api/search', { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': 'chk6-user' }, body: JSON.stringify({ origin: 'MIR', destination: 'MOT', departAt: '12:00' }) })).json()).data).catch(() => null);
      // Fastest
      await page.click('.pref-btn.fastest'); await page.waitForTimeout(300);
      let s = await strokes(page);
      ok(`${T} Fastest: main line green, card with Fastest label selected`, s.some(([c, , wd]) => c === COLORS.fastest && wd === 8) && /Fastest/.test(await page.textContent('#opts .opt[aria-pressed=true]')), JSON.stringify(s.slice(-4)));
      // tooltip numbers equal engine numbers
      const fast = api ? api.options.find((o) => o.labels.includes('Fastest')) : null;
      const pt = await page.$eval('#lmap path.leaflet-interactive[stroke="#16a34a"][stroke-width="8"]', (el) => { const m = el.getScreenCTM(), L = el.getTotalLength(); for (let f = 0.5; f < 1; f += 0.05) for (const g of [f, 1 - f]) { const q = el.getPointAtLength(L * g), x = q.x * m.a + m.e, y = q.y * m.d + m.f; if (document.elementFromPoint(x, y) === el) return { x, y }; } return null; }).catch(() => null);
      if (pt) { await page.mouse.move(pt.x - 3, pt.y); await page.mouse.move(pt.x, pt.y); }
      await page.waitForTimeout(200);
      const tt = await page.$$eval('.leaflet-tooltip.edge-tooltip', (e) => e.map((x) => x.textContent).join(' | '));
      ok(`${T} route tooltip shows the engine's fare, time and transfers`, !fast || OFFLINE || (tt.includes(`${fast.totalMinutes} min`) && tt.includes(`৳${fast.fareRangeLow}`) && /transfer/.test(tt)), tt);
      // Cheapest
      await page.click('.pref-btn.cheapest'); await page.waitForTimeout(300);
      s = await strokes(page);
      ok(`${T} Cheapest: main line blue; others faded`, s.some(([c, , wd]) => c === COLORS.cheapest && wd === 8) && s.some(([, , wd]) => wd === 5), JSON.stringify(s.slice(-4)));
      ok(`${T} Cheapest card selected and detail matches`, /Cheapest/.test(await page.textContent('#opts .opt[aria-pressed=true]')) && /B1/.test(await page.textContent('#detail')));
      // All three
      await page.click('.pref-btn.all'); await page.waitForTimeout(300);
      s = await strokes(page);
      const kinds = Object.entries(COLORS).filter(([, c]) => s.some(([sc]) => sc === c)).map(([k]) => k);
      ok(`${T} All three: cheapest, fastest, balanced and dashed backup drawn together`, ['cheapest', 'fastest', 'balanced', 'backup'].every((k) => kinds.includes(k)) && s.some(([c, d]) => c === COLORS.backup && d === '10 8'), kinds.join(','));
      // card click leaves All three and follows the card
      await page.click('#opts .opt:has(.tag:text("Cheapest"))'); await page.waitForTimeout(300);
      ok(`${T} clicking a card switches the preference to that card`, await page.$eval('.pref-btn.cheapest', (b) => b.classList.contains('active')));
      // popup: set start
      await page.click('#lmap-all'); await page.waitForTimeout(300);
      const m = await page.$$('#lmap .leaflet-marker-icon');
      let clicked = false;
      for (const el of m) { const t = await el.getAttribute('title'); if (t === 'Uttara') { await el.click({ force: true }); clicked = true; break; } }
      await page.waitForSelector('.hub-popup .btn-set-origin', { timeout: 3000 }).catch(() => {});
      ok(`${T} hub popup: name, approximate-position note, Set Start / Destination`, clicked && /Uttara/.test(await page.textContent('.hub-popup').catch(() => '')) && /approximate/.test(await page.textContent('.hub-popup').catch(() => '')));
      await page.click('.hub-popup .btn-set-origin').catch(() => {}); await page.waitForTimeout(600);
      ok(`${T} "Set as Start (A)" sets the origin and searches`, (await page.inputValue('#origin')) === 'UTT' && /Uttara → Motijheel/.test(await page.textContent('#search-out h2')));
      // single mode toggle
      await page.$eval('#singleMode', (c) => { c.checked = true; }); await page.click('#plan-form button.primary'); await page.waitForTimeout(500);
      const cards = await page.$$eval('#search-out .opt .pills, #search-out .opt', (e) => e.length);
      const modesPerCard = await page.$$eval('#opts .opt', (els) => els.map((el) => [...el.querySelectorAll('.mpill')].map((p) => p.className.replace('mpill', '').trim())));
      ok(`${T} single mode only: every card uses one mode`, cards > 0 && modesPerCard.every((ms) => new Set(ms.map((m) => (m === 'cng' ? 'rickshaw' : m))).size === 1), JSON.stringify(modesPerCard));
      ok(`${T} single mode shown in the filter line`, /single mode only/.test(await page.textContent('#search-out')));
      await page.$eval('#singleMode', (c) => { c.checked = false; });
      // walking only -> message, map intact
      for (const md of ['metro', 'bus', 'leguna', 'rickshaw', 'cng']) await page.$eval(`#mode-chips [data-m=${md}]`, (b) => b.click());
      await go(page, 'UTT', 'JAT');
      ok(`${T} walking only: clear message, map still has 14 hubs`, /No open route/.test(await page.textContent('#search-out')) && (await page.$$eval('#lmap .hub-marker', (e) => e.length)) === 14, await page.textContent('#search-out'));
      for (const md of ['metro', 'bus', 'leguna', 'rickshaw', 'cng']) await page.$eval(`#mode-chips [data-m=${md}]`, (b) => b.click());
      // simulation drawn on street map
      await go(page, 'MIR', 'MOT');
      await page.click('[data-tab=sim]'); await page.click('#sim-presets [data-p=mrtDown]'); await page.waitForTimeout(500);
      s = await strokes(page);
      ok(`${T} simulation: usual route grey dashed, cut links red, preference buttons disabled`, s.some(([c, d]) => c === '#64748b' && d === '8 8') && s.some(([c, , wd]) => c === '#dc2626' && wd === 7) && await page.$eval('.pref-btn.fastest', (b) => b.disabled));
      await page.click('[data-tab=search]');
      // schematic toggle
      await page.click('input[name=mapview][value=schematic]', { force: true }); await page.waitForTimeout(200);
      ok(`${T} Schematic switch shows the SVG map`, await page.isVisible('#map') && await page.isHidden('#lmap'));
      await page.click('input[name=mapview][value=street]', { force: true }); await page.waitForTimeout(300);
      ok(`${T} back to Street`, await page.isVisible('#lmap'));
      if (!OFFLINE) {   // offline: the note must appear; with internet (tiles load) it must stay hidden
        await page.waitForTimeout(9000);
        const loaded = await page.$$eval('#lmap img.leaflet-tile-loaded', (e) => e.length), note = await page.isVisible('#tile-note');
        ok(`${T} tile note ${loaded ? 'hidden (tiles loaded)' : 'shown (tiles could not load)'}`, loaded ? !note : note, `loaded ${loaded}, note ${note}`);
      }
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      ok(`${T} no horizontal scroll (${sw})`, sw <= w);
      ok(`${T} no console errors`, errors.length === 0, errors.join(' | '));
      await page.screenshot({ path: `${__dirname}/street-${w}.png` });
      await ctx.close();
    }
    if (!OFFLINE) {
      // bad coordinates
      const { page, ctx, errors } = await open((p) => p.route('**/api/network', async (route) => {
        const res = await route.fetch(); const j = await res.json();
        for (const h of j.data.hubs) { if (h.id === 'SCI') h.lat = null; if (h.id === 'BAN') { h.lat = 0; h.lng = 0; } if (h.id === 'JAT') h.lng = 151.2; }
        route.fulfill({ response: res, json: j });
      }));
      ok(`${T} bad coordinates: 11 markers, 3 hubs named as not shown`, (await page.$$eval('#lmap .hub-marker', (e) => e.length)) === 11 && /3 hub\(s\) not shown/.test(await page.textContent('#lmap-hidden')), await page.textContent('#lmap-hidden'));
      const bad = await page.$$eval('#lmap path', (e) => e.filter((p) => /NaN/.test(p.getAttribute('d') || '')).length);
      ok(`${T} bad coordinates: no NaN in any drawn path, route still found`, bad === 0 && (await page.$$('#opts .opt')).length > 0);
      ok(`${T} bad coordinates: no console errors`, errors.length === 0, errors.join(' | '));
      await ctx.close();
      // Leaflet missing -> schematic only
      const r2 = await open((p) => p.route('**/vendor/leaflet/leaflet.js', (route) => route.fulfill({ status: 404, body: '' })));
      const lv = [await r2.page.isVisible('#map'), await r2.page.isHidden('#mapview-toggle'), (await r2.page.$$('#opts .opt')).length];
      ok(`${T} Leaflet unavailable: schematic map, no Street switch, app works`, lv[0] && lv[1] && lv[2] > 0, JSON.stringify(lv));
      ok(`${T} Leaflet unavailable: no uncaught errors`, r2.errors.filter((e) => !/404/.test(e)).length === 0, r2.errors.join(' | '));
      await r2.ctx.close();
    }
  }
  await browser.close();
  for (const r of results) console.log(r[0] + '  ' + r[1] + (r[0] === 'FAIL' ? '  ' + r[2] : ''));
  console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
})();
