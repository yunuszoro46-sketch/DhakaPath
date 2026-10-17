// Map and client fallbacks: corrupted hub positions, network load failure, server errors mid-session.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3100/';
const results = [];
const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, String(x).slice(0, 240)]);

(async () => {
  const browser = await chromium.launch();
  for (const w of [1400, 390]) {
    const T = `[${w}]`;
    const page0 = async (setup) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error' && !/status of [45]\d\d/.test(m.text()) && !/tile\.openstreetmap\.org/.test((m.location() || {}).url || '')) errors.push(m.text()); });
      if (setup) await setup(page);
      await page.goto(BASE);
      return { page, ctx, errors };
    };
    // 1 corrupted coordinates: one hub NaN, one far outside the frame, one missing
    {
      const { page, ctx, errors } = await page0((p) => p.route('**/api/network', async (route) => {
        const res = await route.fetch(); const j = await res.json();
        for (const h of j.data.hubs) { if (h.id === 'SCI') h.x = null; if (h.id === 'BAN') { h.x = 99999; h.y = -5000; } if (h.id === 'JAT') delete h.y; }
        route.fulfill({ response: res, json: j });
      }));
      await page.waitForSelector('#opts .opt');
      const labels = await page.$$eval('#map .map-label', (e) => e.map((x) => x.textContent));
      ok(`${T} map draws the 11 valid hubs and skips 3 bad ones`, labels.length === 11 && !labels.includes('Science Lab'), labels.join(','));
      const leg = await page.textContent('#legend');
      ok(`${T} legend names the hubs left off the map`, /3 hub\(s\) not drawn/.test(leg) && /Science Lab/.test(leg), leg);
      const bad = await page.$$eval('#map line, #map circle', (els) => els.filter((e) => ['x1', 'y1', 'x2', 'y2', 'cx', 'cy'].some((a) => e.hasAttribute(a) && !Number.isFinite(Number(e.getAttribute(a))))).length);
      ok(`${T} no SVG element with a non-numeric coordinate`, bad === 0, bad);
      ok(`${T} search still works (Dhanmondi→Motijheel via Science Lab is a valid route)`, (await page.$$('#opts .opt')).length > 0);
      ok(`${T} no console errors with corrupted map data`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
    // 2 network endpoint down
    {
      const { page, ctx, errors } = await page0((p) => p.route('**/api/network', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"data":null,"error":{"code":"unavailable","message":"down"}}' })));
      await page.waitForSelector('#net-retry', { timeout: 8000 }).catch(() => {});
      ok(`${T} network down: retry card instead of a broken page`, /Can’t load the transit network/.test(await page.textContent('#search-out')) && !!(await page.$('#net-retry')));
      ok(`${T} network down: map shows a fallback message`, /Map unavailable/.test(await page.textContent('#map')));
      ok(`${T} network down: no uncaught errors`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
    // 3 garbage JSON from the network endpoint
    {
      const { page, ctx, errors } = await page0((p) => p.route('**/api/network', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{"hubs":"nope"}}' })));
      await page.waitForSelector('#net-retry', { timeout: 8000 }).catch(() => {});
      ok(`${T} malformed network payload: retry card, no crash`, !!(await page.$('#net-retry')) && errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
    // 4 search API error mid-session: clean message
    {
      const { page, ctx, errors } = await page0();
      await page.waitForSelector('#opts .opt');
      await page.route('**/api/search', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"data":null,"error":{"code":"server_error","message":"Something went wrong."}}' }));
      await page.click('#plan-form button.primary'); await page.waitForTimeout(400);
      ok(`${T} server error on search shows a message, map still drawn`, /Something went wrong/.test(await page.textContent('#search-out')) && (await page.$$('#map .map-label')).length === 14);
      await page.unroute('**/api/search');
      // 5 bad input from the form: negative minutes -> clean 400 message
      await page.evaluate(() => { document.querySelector('#filters').open = true; });   // Night Route UI: limits live under More options
      await page.$eval('#maxTravelTime', (e) => e.removeAttribute('min')); await page.fill('#maxTravelTime', '-5'); await page.click('#plan-form button.primary'); await page.waitForTimeout(400);
      ok(`${T} invalid form value -> readable error`, /maxTravelTime must be minutes/.test(await page.textContent('#search-out')), await page.textContent('#search-out'));
      ok(`${T} no uncaught errors`, errors.length === 0, errors.join(' | '));
      await page.screenshot({ path: `${__dirname}/hard-${w}.png` });
      await ctx.close();
    }
  }
  await browser.close();
  for (const r of results) console.log(r[0] + '  ' + r[1] + (r[0] === 'FAIL' ? '  ' + r[2] : ''));
  console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
})();
