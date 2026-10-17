// Browser checks for the algorithm-doc additions: backup route, budget "might fit", max minutes,
// status codes, simulator line-down / delay / heavy rain, backup-holds note, applied scenario banner.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3100/';
const OFFLINE = /\.html$/.test(BASE);
const results = [];
const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, String(x).slice(0, 240)]);

(async () => {
  const browser = await chromium.launch();
  for (const [w, theme] of [[1400, 'dark'], [390, 'light']]) {
    if (!OFFLINE) {
      const tok = (await (await fetch(BASE + 'api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'admin123' }) })).json()).data.token;
      await fetch(BASE + 'api/admin/reset', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: '{}' });
    }
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: theme }); await ctx.addInitScript(() => { try { localStorage.setItem('dp-map-phone', 'open'); } catch { /* storage off */ } });   // phones start with the map folded; these checks test it open
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text()) && !/tile\.openstreetmap\.org/.test((m.location() || {}).url || '')) errors.push(m.text()); });
    const T = `[${w}]`;
    await page.goto(BASE);
    await page.waitForSelector('#opts .opt');
    const go = async (o, d, extra = {}) => {
      await page.selectOption('#origin', o); await page.selectOption('#destination', d);
      await page.fill('#departAt', '12:00');
      await page.evaluate(() => { document.querySelector('#filters').open = true; });   // Night Route UI: limits live under More options
      for (const [k, v] of Object.entries({ maxBudget: '', maxTransfers: '', maxTravelTime: '', ...extra })) await page.fill('#' + k, v);
      await page.click('#plan-form button.primary');
      await page.waitForTimeout(OFFLINE ? 250 : 400);
    };
    // 1 backup on Mirpur -> Motijheel
    await page.uncheck('#student');
    await go('MIR', 'MOT');
    const bk = await page.textContent('#search-out .backup').catch(() => '');
    ok(`${T} backup route shown with trigger and delta`, /Backup route/.test(bk) && /most exposed: MRT-6/.test(bk) && /\+15 min/.test(bk) && /card tagged Backup above/.test(bk) && (await page.$$('#opts .opt')).length === 2, bk);
    ok(`${T} Balanced label on the main card`, /Balanced/.test(await page.textContent('#opts')));
    await page.click('#opts .opt:has(.tag:text("Backup"))'); ok(`${T} clicking the backup opens its breakdown`, /B1/.test(await page.textContent('#detail')));
    const stTitle = await page.getAttribute('#search-out .card .row span.muted', 'title');
    ok(`${T} search statistics in the paths-checked tooltip`, /hub paths/.test(stTitle || '') && /search steps/.test(stTitle || ''), stTitle);
    // 2 max minutes
    await go('MIR', 'MOT', { maxTravelTime: '30' });
    const mins = await page.$$eval('#search-out .opt .nums span:first-child', (e) => e.map((x) => parseInt(x.textContent)));
    ok(`${T} max minutes filter (≤30) respected`, mins.length > 0 && mins.every((m) => m <= 30), mins.join(','));
    await go('MIR', 'MOT', { maxTravelTime: '10' });
    const nr = await page.textContent('#search-out');
    ok(`${T} no-route reason category shown`, /NO_ROUTE_WITHIN_CONSTRAINTS/.test(nr) && /10 min or less/.test(nr), nr);
    // 3 budget might fit (Shahbagh -> Science Lab rickshaw only, ৳40)
    for (const m of ['bus', 'walk', 'metro', 'cng']) await page.$eval(`#mode-chips [data-m=${m}]`, (b) => b.click());
    await go('SHA', 'SCI', { maxBudget: '40' });
    const bf = await page.textContent('#search-out');
    ok(`${T} budget: "might fit" listed apart, over-budget labelled`, /might fit your budget/.test(bf) && /over budget/.test(bf) && /৳30–45/.test(bf), bf);
    await go('SHA', 'SCI', { maxBudget: '45' });
    ok(`${T} budget: "Fits ৳45" tag when the top estimate fits`, /Fits ৳45/.test(await page.textContent('#opts')));
    for (const m of ['bus', 'walk', 'metro', 'cng']) await page.$eval(`#mode-chips [data-m=${m}]`, (b) => b.click());
    // 4 simulator: MRT down preset -> backup becomes main
    await go('MIR', 'MOT');
    await page.click('[data-tab=sim]');
    await page.click('#sim-presets [data-p=mrtDown]'); await page.waitForSelector('#sim-apply');
    const s1 = await page.textContent('#sim-out');
    ok(`${T} sim MRT-6 suspended: cut, detour = planned backup`, /MRT6 Mirpur–Motijheel is cut/.test(s1) && /now the main route/.test(s1) && /Simulated conditions, not live/.test(s1), s1);
    // 5 custom: line not running + delay
    await page.evaluate(() => { document.querySelector('#sim-custom').open = true; });   // Night Route UI: these controls live under a disclosure
    await page.selectOption('#sim-down', 'B1');
    await page.selectOption('#sim-delay-line', 'MRT6'); await page.fill('#sim-delay-rate', '50'); await page.fill('#sim-delay-min', '10');
    await page.click('#sim-run'); await page.waitForTimeout(400);
    const s2 = await page.textContent('#sim-out');
    ok(`${T} custom sim: B1 down + MRT-6 delayed named in explanation`, /B1 Mirpur-Motijheel not running/.test(s2) && /MRT-6 delayed \+50% \+10 min/.test(s2), s2.slice(0, 300));
    ok(`${T} custom sim: planned backup cut too`, /cut too/.test(s2), s2);
    // 6 heavy rain
    await page.click('#sim-clear');
    await page.click('#sim-presets [data-p=heavyRain]'); await page.waitForTimeout(400);
    ok(`${T} heavy rain preset runs`, /heavy rain at/.test(await page.textContent('#sim-out')));
    // 7 apply line-down scenario globally -> banner and search avoid MRT
    await page.click('#sim-presets [data-p=mrtDown]'); await page.waitForFunction(() => /MRT-6 suspended/.test(document.querySelector('#sim-out').textContent));
    await page.click('#sim-apply'); await page.waitForTimeout(600);
    const banner = await page.textContent('#scenario-banner');
    ok(`${T} applied scenario banner lists line not running`, /not running: MRT6/.test(banner), banner);
    await page.click('[data-tab=search]'); await go('MIR', 'MOT');
    const cards = await page.textContent('#opts');
    ok(`${T} with MRT-6 down app-wide no card uses MRT-6`, !/MRT-6/.test(cards), cards.slice(0, 200));
    await page.click('#scenario-clear'); await page.waitForTimeout(400);
    ok(`${T} scenario cleared`, await page.isHidden('#scenario-banner'));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(`${T} no horizontal scroll (${sw})`, sw <= w);
    await page.click('[data-tab=sim]'); await page.screenshot({ path: `${__dirname}/sim4-${w}.png`, fullPage: false });
    ok(`${T} no console errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  for (const r of results) console.log(r[0] + '  ' + r[1] + (r[0] === 'FAIL' ? '  ' + r[2] : ''));
  console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
})();
