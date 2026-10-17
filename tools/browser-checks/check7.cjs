// Client error states: network failure keeps last results + Retry + banner, busy buttons, double
// click, latest-wins, empty NL input, poll overlap, admin fare adjustment with version display.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3100/';
const results = [];
const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, String(x).slice(0, 260)]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const tok = (await (await fetch(BASE + 'api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"admin123"}' })).json()).data.token;
  await fetch(BASE + 'api/admin/reset', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: '{}' });
  const browser = await chromium.launch();
  for (const w of [1400, 390]) {
    const T = `[${w}]`;
    const ctx = await browser.newContext({ viewport: { width: w, height: 950 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d|ERR_FAILED|ERR_INTERNET_DISCONNECTED/.test(m.text()) && !/tile\.openstreetmap\.org/.test((m.location() || {}).url || '')) errors.push(m.text()); });
    let searches = 0; page.on('request', (r) => { if (r.url().endsWith('/api/search')) searches++; });
    await page.goto(BASE); await page.waitForSelector('#opts .opt');
    await page.fill('#departAt', '12:00'); await page.uncheck('#student');
    // 1 empty natural-language box
    await page.fill('#nl-in', '   '); await page.click('#nl-form button[type=submit]');
    ok(`${T} empty search box: helpful warning, no request`, /Type a trip first/.test(await page.textContent('#search-out')));
    await page.click('#plan-form button.primary'); await page.waitForSelector('#opts .opt');
    const firstCard = await page.textContent('#opts .opt');
    // 2 busy state + double click = one request
    await page.route('**/api/search', async (route) => { await wait(1200); route.continue().catch(() => {}); });
    const n0 = searches;
    await page.click('#plan-form button.primary');
    await wait(150);
    const btn = await page.$eval('#plan-form button.primary', (b) => [b.disabled, b.textContent, b.getAttribute('aria-busy')]);
    ok(`${T} search button shows a busy state`, btn[0] && /Searching/.test(btn[1]) && btn[2] === 'true', JSON.stringify(btn));
    ok(`${T} results dimmed while loading`, (await page.getAttribute('#search-out', 'aria-busy')) === 'true');
    await page.click('#plan-form button.primary', { force: true }).catch(() => {});
    await wait(1700);
    ok(`${T} double click sends one search`, searches - n0 === 1, searches - n0);
    ok(`${T} button restored`, await page.$eval('#plan-form button.primary', (b) => !b.disabled && /Find routes/.test(b.textContent)));
    await page.unroute('**/api/search');
    // 3 latest wins: slow first search (Uttara), fast second (Mirpur) -> Mirpur stays
    let first = true;
    await page.route('**/api/search', async (route) => { if (first) { first = false; await wait(1500); } route.continue().catch(() => {}); });
    await page.selectOption('#origin', 'UTT'); page.evaluate(() => document.querySelector('#plan-form').requestSubmit());
    await wait(100);
    await page.selectOption('#origin', 'MIR');
    await page.evaluate(() => window.__dpSearch && 0);
    await page.evaluate(() => { const b = document.querySelector('#plan-form button.primary'); b.removeAttribute('aria-busy'); b.disabled = false; });
    await page.evaluate(() => document.querySelector('#plan-form').requestSubmit());
    await wait(2200);
    ok(`${T} a slow older response does not overwrite the newer search`, /Mirpur → Motijheel/.test(await page.textContent('#search-out h2')), await page.textContent('#search-out h2'));
    await page.unroute('**/api/search');
    // 4 network failure: last results kept, Retry, banner; recovery hides banner
    await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
    await page.click('#plan-form button.primary'); await wait(1500);
    const out = await page.textContent('#search-out');
    ok(`${T} network down: message + Retry, last results still shown`, /Could not reach DhakaPath/.test(out) && !!(await page.$('#search-retry')) && (await page.$$('#opts .opt')).length > 0, out.slice(0, 160));
    await page.waitForSelector('#conn-banner:not([hidden])', { timeout: 8000 }).catch(() => {});
    ok(`${T} connection-lost banner appears`, /Connection to DhakaPath lost/.test(await page.textContent('#conn-banner')) && await page.isVisible('#conn-banner'));
    await page.unroute('**/api/**');
    await page.click('#search-retry'); await wait(800);
    ok(`${T} Retry recovers and the banner says back online`, !(await page.$('#search-net')) && /Back online/.test(await page.textContent('#conn-banner')));
    await wait(3000);
    ok(`${T} banner hides after recovery`, await page.isHidden('#conn-banner'));
    // 5 simulate busy + failure retry
    await page.click('[data-tab=sim]');
    await page.route('**/api/simulate', (route) => route.abort('internetdisconnected'));
    await page.click('#sim-presets [data-p=mrtDown]'); await wait(600);
    ok(`${T} simulation network error offers Retry`, /Could not reach/.test(await page.textContent('#sim-out')) && !!(await page.$('#sim-retry')));
    await page.unroute('**/api/simulate');
    await page.click('#sim-retry'); await page.waitForSelector('#sim-apply', { timeout: 5000 }).catch(() => {});
    ok(`${T} simulation Retry works`, /MRT-6 suspended/.test(await page.textContent('#sim-out')));
    await page.click('[data-tab=search]');
    // 6 polls never overlap when the server is slow
    let inflight = 0, maxIn = 0;
    await page.route('**/api/health', async (route) => { inflight++; maxIn = Math.max(maxIn, inflight); await wait(4000); inflight--; route.continue().catch(() => {}); });
    await wait(10000);
    ok(`${T} slow server: at most one poll in flight`, maxIn <= 1, maxIn);
    await page.unroute('**/api/health');
    if (w === 1400) {
      // 7 admin fare adjustment (+8%) -> version shown in admin and in the route breakdown
      await page.click('[data-tab=admin]'); await page.fill('#admin-pw', 'admin123'); await page.click('#admin-login button[type=submit], #admin-login-btn, form#admin-login button').catch(() => {});
      await page.waitForSelector('#fare-form', { state: 'visible', timeout: 5000 }).catch(() => {});
      await wait(500);
      ok(`${T} admin fare form shows the table version`, /Fare table v1/.test(await page.textContent('#fare-version')), await page.textContent('#fare-version').catch(() => ''));
      await page.fill('#f-adjust', '8'); await page.fill('#f-note', 'browser check notice');
      await page.click('#fare-form button[type=submit]'); await wait(800);
      ok(`${T} +8% saved as v2 with the changes listed`, /Saved as fare table v2/.test(await page.textContent('#fare-errors')) && /v2: bus\.perKm 2\.7→2\.92/.test(await page.textContent('#fare-version')), (await page.textContent('#fare-errors')) + ' / ' + (await page.textContent('#fare-version')));
      await page.click('[data-tab=search]'); await page.click('#plan-form button.primary'); await wait(600);
      ok(`${T} route breakdown names fare table v2`, /Fare table v2/.test(await page.textContent('#detail')));
    }
    ok(`${T} no console errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  await fetch(BASE + 'api/admin/reset', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: '{}' });
  for (const r of results) console.log(r[0] + '  ' + r[1] + (r[0] === 'FAIL' ? '  ' + r[2] : ''));
  console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
})();
