const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3100/';
const OUT = __dirname;
const results = [];
const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, String(x).slice(0, 200)]);
const post = (page, p, b, h = {}) => page.evaluate(async ([p, b, h]) => (await (await fetch(p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': 'checker-0', ...h }, body: JSON.stringify(b) })).json()).data, [p, b, h]);
const nodeLogin = async () => (await (await fetch(BASE + 'api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'admin123' }) })).json()).data.token;

(async () => {
  const browser = await chromium.launch();
  for (const [w, theme] of [[1400, 'dark'], [390, 'light']]) {
    const tok0 = await nodeLogin(); await fetch(BASE + 'api/admin/reset', { method: 'POST', headers: { authorization: 'Bearer ' + tok0, 'content-type': 'application/json' }, body: '{}' });
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: theme }); await ctx.addInitScript(() => { try { localStorage.setItem('dp-map-phone', 'open'); } catch { /* storage off */ } });   // phones start with the map folded; these checks test it open
    const page = await ctx.newPage();
    const errors = [], external = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text()) && !/tile\.openstreetmap\.org/.test((m.location() || {}).url || '')) errors.push(m.text()); });
    const noUser = [];
    page.on('request', (r) => { if (!r.url().startsWith(BASE.replace(/\/$/, '')) && !/^(blob|data):/.test(r.url()) && !/^https:\/\/tile\.openstreetmap\.org\//.test(r.url())) external.push(r.url()); if (r.url().includes('/api/') && !r.headers()['x-user-id']) noUser.push(r.url()); });
    page.on('dialog', (d) => d.accept());
    const T = `[${w}]`;
    await page.goto(BASE);
    await page.waitForSelector('#opts .opt');
    const api0 = await post(page, '/api/search', { origin: 'DHA', destination: 'MOT', student: true, sort: 'score' });
    const first = await page.textContent('#opts .opt');
    ok(`${T} opens on Dhanmondi→Motijheel student; first card = API (${api0.options[0].totalMinutes} min ৳${api0.options[0].fareRangeLow})`, first.includes(api0.options[0].totalMinutes + ' min') && first.includes('৳' + api0.options[0].fareRangeLow) && /Verified against network/.test(first), first);
    ok(`${T} map draws 14 hubs and ${api0.options.length ? 'all' : ''} edges`, (await page.$$eval('#map .map-label', (e) => e.length)) === 14);
    ok(`${T} seed-data banner`, /not official/.test(await page.textContent('.demo-banner')));
    ok(`${T} AI badge shows the offline parser (no key)`, /AI: offline parser/.test(await page.textContent('#ai-badge')));
    ok(`${T} route cards carry a trust "why" line`, /No street reports on this route/.test(await page.textContent('#opts')));
    // NL search
    await page.fill('#nl-in', 'Mirpur theke Motijheel, student, 40 takar moddhe'); await page.press('#nl-in', 'Enter');
    await page.waitForFunction(() => /Mirpur → Motijheel/.test(document.querySelector('#search-out h2').textContent));
    ok(`${T} natural-language search fills the form`, (await page.inputValue('#origin')) === 'MIR' && (await page.inputValue('#maxBudget')) === '40' && await page.isChecked('#student'));
    const fares = await page.$$eval('#search-out .opt .nums span:nth-child(2)', (e) => e.map((x) => x.textContent));
    ok(`${T} every option within ৳40`, fares.every((f) => Math.max(...f.replace(/[৳a-z\s]/g, '').split('–').map(Number)) <= 40), fares.join(','));
    // breakdown regular vs student and MRT no discount
    await page.evaluate(() => { document.querySelector('#filters').open = true; });   // Night Route UI: these controls live under a disclosure
    await page.fill('#maxBudget', ''); await page.uncheck('#student'); await page.click('#plan-form button.primary');
    await page.waitForFunction(() => !/≤/.test(document.querySelector('#search-out').textContent));
    await page.click('#opts .opt:has(.tag:text("Fastest"))');
    const det = await page.textContent('#detail');
    ok(`${T} MRT leg: ৳55 and "does not apply"`, /৳55/.test(det) && /does not apply/.test(det), det.slice(0, 160));
    await page.click('#opts .opt:has(.tag:text("Cheapest"))');
    const det2 = await page.textContent('#detail');
    ok(`${T} B1 leg: regular ৳30, student ৳15, discount applies`, /৳30/.test(det2) && /৳15/.test(det2) && /student discount applies/.test(det2));
    ok(`${T} landmark note marked as sample`, /sample note/.test(det2));
    // sort
    await page.check('input[name=sort][value=time]', { force: true }); await page.click('#plan-form button.primary');
    await page.waitForTimeout(200);
    const mins = await page.$$eval('#opts .opt .nums span:first-child', (e) => e.map((x) => parseInt(x.textContent)));
    ok(`${T} Fastest sort orders by time`, mins.every((m, i) => i === 0 || m >= mins[i - 1]), mins.join(','));
    await page.check('input[name=sort][value=score]', { force: true });
    // fare truth
    await page.selectOption('#origin', 'FAR'); await page.selectOption('#destination', 'MOT'); await page.click('#plan-form button.primary');
    await page.fill('#fc-amount', '40'); await page.selectOption('#fc-mode', 'bus'); await page.click('#fc-form button');
    await page.waitForSelector('#fc-out .note');
    ok(`${T} Fare Truth: ৳40 bus Farmgate→Motijheel is an overcharge`, /Overcharge/.test(await page.textContent('#fc-out')));
    // offline card
    await page.click('#brief-card');
    await page.waitForSelector('#card-dialog[open]');
    const src = await page.getAttribute('#card-img', 'src');
    ok(`${T} offline card renders a PNG`, src && src.startsWith('data:image/png') && src.length > 5000, src && src.length);
    await page.click('#card-close');
    // simulation
    await page.selectOption('#origin', 'DHA'); await page.selectOption('#destination', 'MOT'); await page.check('#student'); await page.click('#plan-form button.primary');
    await page.waitForFunction(() => /Dhanmondi → Motijheel/.test(document.querySelector('#search-out h2').textContent));
    await page.click('[data-tab=sim]');
    await page.click('#sim-presets [data-p=sciFlood]');
    await page.waitForSelector('#sim-out .simgrid');
    const sim = await page.textContent('#sim-out');
    ok(`${T} Science Lab flooded: B4 cut, detour, +min +BDT`, /✖ B4/.test(sim) && /detour/.test(sim) && /\+\d+ min/.test(sim), sim.slice(0, 200));
    ok(`${T} map shows red cut segments`, (await page.$$eval('#map line[stroke="var(--bad)"]', (e) => e.length)) > 0);
    if (w === 1400) await page.screenshot({ path: `${OUT}/s-sim.png`, fullPage: true });
    await page.click('#sim-presets [data-p=sciRain]');
    await page.waitForFunction(() => /Rain at Science Lab/.test(document.querySelector('#sim-out h2').textContent));
    ok(`${T} rain only: same route, slower`, /⏱ B4/.test(await page.textContent('#sim-out')) && !/detour/.test(await page.textContent('#sim-out')));
    // alerts: ingest -> confirmations -> active -> route change -> decay
    await page.click('[data-tab=alerts]');
    await page.fill('#ingest-in', 'Science Lab e hatu pani!! rickshaw o jacche na'); await page.click('#ingest-form button.primary');
    await page.waitForSelector('#ingest-out .note');
    const ing = await page.textContent('#ingest-out');
    ok(`${T} ingest: Science Lab, waterlogging, severity 3, 0.3 unverified`, /Science Lab/.test(ing) && /waterlogging/.test(ing) && /0\.3 → unverified/.test(ing), ing);
    const item = () => page.locator('.alert-item', { hasText: 'hatu pani' });
    await item().locator('[data-act=confirm]').click();
    await page.waitForFunction(() => /counts once/.test(document.querySelector('#ingest-out').textContent));
    ok(`${T} same user confirming counts once`, true);
    await page.click('#new-me'); await item().locator('[data-act=confirm]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.alert-item')].some((a) => /hatu pani/.test(a.textContent) && /confidence 0\.5 /.test(a.textContent)));
    await item().locator('[data-seed]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.alert-item')].some((a) => /hatu pani/.test(a.textContent) && /active/.test(a.querySelector('.status').textContent)));
    ok(`${T} "simulate 2 other users confirm" → active (hard)`, /active/.test(await item().locator('.status').textContent()));
    ok(`${T} map: links at Science Lab drawn solid red`, (await page.$$eval('#map line[stroke="var(--bad)"]', (e) => e.length)) > 0);
    const after = await post(page, '/api/search', { origin: 'DHA', destination: 'MOT', student: true });
    ok(`${T} active alert changes the route away from Science Lab`, after.best.legs.every((l) => !l.stops.includes('SCI')), after.best.summary);
    ok(`${T} why line: "Avoids Science Lab: waterlogging confirmed"`, after.best.why.some((w) => /Avoids Science Lab: waterlogging confirmed/.test(w.text)));
    if (w === 1400) await page.screenshot({ path: `${OUT}/s-alerts.png`, fullPage: true });
    // S2 dispute
    await page.click('#new-me'); await item().locator('[data-act=resolve]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.alert-item')].some((a) => /hatu pani/.test(a.textContent) && /disputed/.test(a.querySelector('.status').textContent)));
    ok(`${T} "clear" vote within 10 min → disputed (S2)`, true);
    // decay via clock
    const c0 = await page.textContent('#clock');
    await page.click('[data-adv="90"]'); await page.waitForTimeout(250);
    ok(`${T} +90 min moves the clock`, (await page.textContent('#clock')) !== c0);
    // admin
    await page.click('[data-tab=admin]');
    await page.fill('#admin-pw', 'wrong'); await page.click('#admin-login button.primary');
    await page.waitForFunction(() => /Wrong admin password/.test(document.querySelector('#admin-login-err').textContent));
    ok(`${T} admin: wrong password refused`, true);
    await page.fill('#admin-pw', 'admin123'); await page.click('#admin-login button.primary');
    await page.waitForSelector('#admin-body:not([hidden])');
    ok(`${T} admin: login opens the admin screen`, true);
    await page.waitForSelector('#queue .alert-item');
    ok(`${T} moderation queue shows the disputed alert and the S1 fare`, /disputed/.test(await page.textContent('#queue')) && /S1/.test(await page.textContent('#queue')));
    await page.click('#line-form button.primary');
    await page.waitForSelector('#ln-errors:not(:empty)');
    ok(`${T} add line: invalid input refused with reasons`, /Not saved/.test(await page.textContent('#ln-errors')));
    await page.fill('#ln-id', 'B8'); await page.fill('#ln-name', 'B8 Uttara-Banasree'); await page.fill('#ln-stops', 'Uttara, Badda, Banasree'); await page.fill('#ln-km', '9, 4');
    await page.click('#line-form button.primary');
    await page.waitForFunction(() => /B8 Uttara-Banasree/.test(document.querySelector('#line-table').textContent));
    ok(`${T} add line B8 appears`, true);
    await page.fill('#f-bus-perKm', '3'); await page.click('#fare-form button.primary');
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#fare-errors').textContent));
    const f = await post(page, '/api/fare', { legs: [{ line: 'B1', from: 'MIR', to: 'MOT' }] });
    ok(`${T} fare chart change recomputes B1 (৳33)`, f.totalFareRegular === 33, f.totalFareRegular);
    await page.waitForFunction(() => /admin\.(line|fares)/.test(document.querySelector('#audit').textContent));
    ok(`${T} audit log records admin actions`, /admin\.line\.post/.test(await page.textContent('#audit')) && /admin\.login/.test(await page.textContent('#audit')));
    await page.click('#reset');
    await page.waitForFunction(() => !/B8 Uttara/.test(document.querySelector('#line-table').textContent));
    ok(`${T} reset restores the seed`, (await post(page, '/api/fare', { legs: [{ line: 'B1', from: 'MIR', to: 'MOT' }] })).totalFareRegular === 30);
    // ---- additions: network view, Banglish, surge, zones, landmark CMS, Trip Watch ----
    await page.click('[data-tab=network]');
    await page.waitForSelector('#net-lines tbody tr');
    const nl = await page.textContent('#net-lines');
    ok(`${T} Network view lists lines with fare, student ½ and state`, /B1/.test(nl) && /৳30/.test(nl) && /student ৳15/.test(nl) && /running/.test(nl) && /CNG/.test(nl), nl.slice(0, 120));
    ok(`${T} Network view shows 14 hub cards`, (await page.$$eval('#net-hubs .hub-card', (e) => e.length)) === 14);
    await page.click('[data-tab=search]');
    await page.selectOption('#origin', 'BAN'); await page.selectOption('#destination', 'MAL'); await page.uncheck('#student');
    await page.evaluate(() => document.querySelector('#filters').open = true);
    for (const m of ['bus']) if ((await page.getAttribute(`#mode-chips [data-m=${m}]`, 'aria-pressed')) === 'true') await page.click(`#mode-chips [data-m=${m}]`);
    await page.fill('#departAt', '18:00'); await page.click('#plan-form button.primary');
    await page.waitForFunction(() => /Banasree → Malibagh/.test(document.querySelector('#search-out h2').textContent));
    const sd = await page.textContent('#search-out');
    ok(`${T} leave at 18:00 → rush hour applied`, /Rush hour applied/.test(sd) && /18:00/.test(sd));
    const fd = await page.textContent('#detail');
    ok(`${T} rickshaw shows baseline ৳50–75 → surge ×1.3 ৳65–100`, /baseline ৳50–75/.test(fd) && /surge ×1\.3: ৳65–100/.test(fd), fd.slice(0, 200));
    await page.click('#detail [data-lang=bn]');
    ok(`${T} Banglish directions toggle`, /rickshaw nin; uthar age bhara thik kore nin/.test(await page.textContent('#detail .steps')));
    await page.click('#detail [data-lang=en]');
    await page.click(`#mode-chips [data-m=bus]`); await page.fill('#departAt', '');
    // landmark CMS
    await page.click('[data-tab=admin]');
    await page.selectOption('#hb-id', 'DHA'); await page.fill('#hb-en', 'Board B4 at the Dhanmondi 27 signal, west side'); await page.fill('#hb-bn', 'Dhanmondi 27 signal er west pash theke uthun');
    await page.click('#hub-form button.primary');
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#hb-errors').textContent));
    // Trip Watch: DHA -> MOT student
    await page.click('[data-tab=search]');
    await page.selectOption('#origin', 'DHA'); await page.selectOption('#destination', 'MOT'); await page.check('#student'); await page.click('#plan-form button.primary');
    await page.waitForFunction(() => /Dhanmondi → Motijheel/.test(document.querySelector('#search-out h2').textContent));
    ok(`${T} edited landmark note shows in directions`, /Dhanmondi 27 signal, west side/.test(await page.textContent('#detail')));
    await page.click('#watch-btn');
    await page.waitForSelector('#watch-panel:not([hidden]) .watch-item');
    ok(`${T} Trip Watch panel shows the saved trip as clear`, /clear/.test(await page.textContent('#watch-list')));
    await page.click('#t-close').catch(() => {});
    const filed = await post(page, '/api/alerts', { hubId: 'SCI', type: 'blockade', text: 'Science Lab michil' }, { 'x-user-id': 'watch-u1' });
    const aid = filed.alert.id;
    await post(page, '/api/demo/seed-users', { alertId: aid });
    await page.click('[data-adv="15"]');
    await page.waitForSelector('#toast:not([hidden])', { timeout: 15000 });
    const tt = await page.textContent('#toast');
    ok(`${T} toast warns: usual route cut, with detour`, /usual route is cut/.test(tt) && /Show detour/.test(tt), tt.slice(0, 160));
    await page.click('#t-show');
    await page.waitForFunction(() => document.querySelector('#detail') && !/Science Lab/.test(document.querySelector('#detail .steps').textContent));
    ok(`${T} "Show detour" opens a route avoiding Science Lab`, true);
    if (w === 1400) await page.screenshot({ path: `${OUT}/s-watch.png`, fullPage: false });
    await page.click('[data-waccept]');
    await page.waitForFunction(() => /clear/.test(document.querySelector('#watch-list .wstatus').textContent));
    ok(`${T} "Switch to it" makes the detour the usual route`, true);
    await page.click('[data-wdel]');
    await page.waitForSelector('#watch-panel[hidden]', { state: 'attached' });
    { const tk = await nodeLogin(); await post(page, '/api/admin/alerts/' + aid + '/moderate', { action: 'remove' }, { authorization: 'Bearer ' + tk }); }
    // apply a simulation to the whole app (global scenario) and clear it
    await page.click('[data-tab=sim]'); await page.click('#sim-presets [data-p=sciFlood]'); await page.waitForSelector('#sim-apply');
    await page.click('#sim-apply'); await page.waitForSelector('#scenario-banner:not([hidden])');
    ok(`${T} "Apply to the whole app" shows the scenario banner`, /Scenario active/.test(await page.textContent('#scenario-banner')));
    await page.click('#scenario-clear'); await page.waitForSelector('#scenario-banner[hidden]', { state: 'attached' });
    // zone simulation
    await page.click('[data-tab=sim]');
    await page.evaluate(() => { document.querySelector('#sim-custom').open = true; });   // Night Route UI: these controls live under a disclosure
    await page.click('#zone-chips [data-z="central-south"]'); await page.click('#sim-run');
    await page.waitForFunction(() => /Custom scenario/.test(document.querySelector('#sim-out h2').textContent));
    ok(`${T} rain by zone runs`, /rain at Science Lab/.test(await page.textContent('#sim-out')));
    await page.click('#sim-clear');
    // chat
    await page.click('#chat-toggle');
    await page.fill('#chat-in', 'Mirpur theke Motijheel, student'); await page.press('#chat-in', 'Enter');
    await page.waitForFunction(() => /Mirpur → Motijheel/.test(document.querySelector('.msg.bot:last-child').textContent));
    const cm = await page.textContent('.msg.bot:last-child');
    ok(`${T} chat route: Verified ✓ and tool chips`, /Verified ✓/.test(cm) && /tool: findRoutes\(MIR->MOT, student\)/.test(cm) && /tool: groundRoute\(/.test(cm), cm.slice(-160));
    await page.fill('#chat-in', 'why not metro?'); await page.press('#chat-in', 'Enter');
    await page.waitForFunction(() => /Best option with metro/.test(document.querySelector('.msg.bot:last-child').textContent));
    ok(`${T} chat follow-up "why not metro?"`, true);
    await page.fill('#chat-in', 'ei trip watch koro'); await page.press('#chat-in', 'Enter');
    await page.waitForFunction(() => /watch korchi/.test(document.querySelector('.msg.bot:last-child').textContent));
    await page.waitForSelector('#watch-panel:not([hidden])');
    ok(`${T} chat "ei trip watch koro" adds a watch`, /Mirpur → Motijheel/.test(await page.textContent('#watch-list')));
    if (await page.isVisible('#chat-dock')) await page.click('#chat-close');   // the phone chat is full-screen; close it to reach the footer
    await page.click('#ground-test');
    await page.waitForFunction(() => /Rejected: not in network/.test(document.querySelector('.msg.bot:last-child').textContent));
    ok(`${T} hallucination test is rejected`, /unknown line "BUS99"/.test(await page.textContent('.msg.bot:last-child')));
    if (w === 1400) await page.screenshot({ path: `${OUT}/s-chat.png`, fullPage: false });
    if (w === 390) await page.screenshot({ path: `${OUT}/s-mobile.png`, fullPage: false });
    await page.click('#chat-close');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(`${T} no sideways scroll`, over <= 0, over);
    ok(`${T} no console errors`, errors.length === 0, errors.join(' | '));
    ok(`${T} no external requests`, external.length === 0, external.join(' '));
    ok(`${T} every API request carries X-User-Id`, noUser.length === 0, noUser.slice(0, 3).join(' '));
    if (w === 1400) { await page.click('[data-tab=search]'); await page.screenshot({ path: `${OUT}/s-search.png`, fullPage: true }); }
    await ctx.close();
  }
  await browser.close();
  for (const r of results) console.log(r.join('  '));
  console.log(results.filter((r) => r[0] === 'PASS').length + '/' + results.length + ' passed');
})().catch((e) => { for (const r of results) console.log(r.join('  ')); console.log('CRASH', e.message.split('\n').slice(0, 6).join(' | ')); process.exit(1); });
