// Language switch: full English ↔ full Bangla (বাংলা) with Bangla numerals. Checks that the switch
// translates the chrome, planner, tickets, route detail, Monsoon, alerts and network panels, that
// numbers on screen use Bangla digits, that the choice survives a reload, that switching back gives
// back the exact English text, and that the routing answers are the same in both languages (the
// switch only changes what is displayed). Usage: node check12-i18n.cjs http://localhost:3100/
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3100/';
const results = [];
const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, String(x).slice(0, 300)]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// share of letters that are Latin, ignoring names that stay Latin on purpose
// visible text of a panel without user-written content (posts, sample Banglish inputs), which stays as typed
const panelText = (page, sel) => page.$eval(sel, (root) => { const skip = '.quote,#ingest-examples,#chat-suggest,.msg.user,code,textarea,#me,.toolchip,[translate=no]'; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n, out = ''; while ((n = w.nextNode())) if (!n.parentElement.closest(skip)) out += n.nodeValue + ' '; return out; });
const latinShare = (t) => { const s = t.replace(/DhakaPath|KoyJabo|OpenStreetMap|Leaflet|server\/data\/seed\.json|config\.json|BRTA|INIF|PNG|Shift|AI|EN|MRT\d?|[A-Z]\d+|[A-Z]-[A-Z]{3}-[A-Z]{3}|v\d+/g, ''); const lat = (s.match(/[A-Za-z]/g) || []).length, bn = (s.match(/[\u0980-\u09FF]/g) || []).length; return lat / Math.max(1, lat + bn); };

(async () => {
  const tok = (await (await fetch(BASE + 'api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"admin123"}' })).json()).data.token;
  await fetch(BASE + 'api/admin/reset', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: '{}' });
  const browser = await chromium.launch();
  for (const w of [1400, 390]) {
    const T = `[${w}]`;
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(BASE); await page.waitForSelector('#opts .opt'); await page.fill('#departAt', '12:00'); await page.click('#plan-form button.primary'); await wait(600);
    ok(`${T} English by default`, (await page.getAttribute('html', 'lang')) === 'en' && /Find routes/.test(await page.textContent('#plan-form button.find')));
    const enPlan = await page.textContent('#tab-search'), enNav = await page.textContent('.tabs');
    const enMins = await page.$$eval('#opts .opt .nums span:first-child', (e) => e.map((x) => x.textContent));
    // switch to Bangla
    await page.click('#lang-toggle'); await wait(500);
    ok(`${T} switch sets lang="bn" and the toggle offers English back`, (await page.getAttribute('html', 'lang')) === 'bn' && (await page.textContent('#lang-toggle')) === 'EN');
    const nav = await page.textContent('.tabs');
    ok(`${T} nav in Bangla`, /পরিকল্পনা/.test(nav) && /নেটওয়ার্ক/.test(nav) && /বর্ষা/.test(nav) && /সতর্কতা/.test(nav) && /শেয়ার/.test(nav), nav);
    ok(`${T} planner in Bangla`, /কোথা থেকে/.test(await page.textContent('#plan-form')) && /রুট খুঁজুন/.test(await page.textContent('#plan-form button.find')) && /শিক্ষার্থী/.test(await page.textContent('.opts-row')));
    const plan = await panelText(page, '#tab-search');
    ok(`${T} Plan tab is Bangla text (Latin share under 8%)`, latinShare(plan) < 0.08, latinShare(plan).toFixed(3));
    const mins = await page.$$eval('#opts .opt .nums span:first-child', (e) => e.map((x) => x.textContent));
    ok(`${T} ticket numbers use Bangla digits`, mins.length > 0 && mins.every((m) => /^[০-৯]+ মিনিট$/.test(m.trim())), mins.join(' | '));
    const digitsLeft = await page.evaluate(() => { const skip = 'script,style,code,textarea,input,select,#me,.toolchip,.msg.user,.quote,#ingest-examples,#chat-suggest,[translate=no],.leaflet-control-attribution'; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const out = []; let n; while ((n = w.nextNode())) { if (n.parentElement.closest(skip)) continue; const v = n.nodeValue.replace(/[A-Za-z0-9_-]*[0-9][A-Za-z0-9_-]*/g, (t) => (/[A-Za-z]/.test(t) ? '' : t)); if (/[0-9]/.test(v)) out.push(n.nodeValue.trim()); } return out; });
    ok(`${T} no Western digits left on screen (identifiers like B4 stay as typed)`, digitsLeft.length === 0, digitsLeft.slice(0, 6).join(' | '));
    ok(`${T} clock in Bangla digits`, /^[০-৯]{2}:[০-৯]{2}$/.test((await page.textContent('#clock')).trim()), await page.textContent('#clock'));
    ok(`${T} hub names in Bangla in the selects`, /ধানমন্ডি/.test(await page.$eval('#origin', (s) => s.selectedOptions[0].textContent)));
    ok(`${T} directions in Bangla`, /থেকে/.test(await page.textContent('#detail .steps')) && /মিনিট/.test(await page.textContent('#detail .steps')), (await page.textContent('#detail .steps')).slice(0, 160));
    // the engine answer is the same: only the display changes
    const bnMins = mins.map((m) => Number(m.replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/\D/g, '')));
    ok(`${T} same routes and minutes as in English`, JSON.stringify(bnMins) === JSON.stringify(enMins.map((m) => parseInt(m, 10))), `${bnMins} vs ${enMins}`);
    // forms still send English values: Fare Truth answers in Bangla for the bus fare
    await page.selectOption('#fc-mode', 'bus'); await page.fill('#fc-amount', '40'); await page.click('#fc-form button'); await page.waitForSelector('#fc-out .note'); await wait(300);
    const fc = await page.textContent('#fc-out');
    ok(`${T} Fare Truth works in Bangla (form values unchanged)`, /অতিরিক্ত ভাড়া/.test(fc) && /সরকারি হার/.test(fc) && (await page.inputValue('#fc-mode')) === 'bus', fc.slice(0, 160));
    ok(`${T} Fare Truth student note in Bangla (no English left in the verdict)`, !/[A-Za-z]{3,}/.test(await page.textContent('#fc-out .note')), await page.textContent('#fc-out .note'));
    // new content rendered while in Bangla is translated too
    await page.click('[data-tab=sim]'); await page.click('#sim-presets [data-p=sciFlood]'); await page.waitForSelector('#sim-out .simgrid'); await wait(400);
    const sim = await panelText(page, '#tab-sim');
    ok(`${T} Monsoon result in Bangla with Bangla digits`, /আগে/.test(sim) && /পরে/.test(sim) && /বিকল্প পথ/.test(sim) && !/[0-9]/.test(await page.textContent('.delta-tiles')), (await page.textContent('.delta-tiles')).replace(/\s+/g, ' '));
    ok(`${T} Monsoon tab is Bangla text (Latin share under 10%)`, latinShare(sim) < 0.10, latinShare(sim).toFixed(3));
    await page.click('#sim-clear');
    await page.click('[data-tab=alerts]'); await wait(400);
    const al = await panelText(page, '#tab-alerts');
    ok(`${T} Alerts tab in Bangla (user posts excluded; Latin share under 8%)`, /রাস্তার খবর/.test(al) && latinShare(al) < 0.08, latinShare(al).toFixed(3) + ' ' + (al.match(/[A-Za-z][A-Za-z ]{6,}/g) || []).slice(0, 5).join(' | '));
    await page.click('[data-tab=network]'); await wait(600);
    ok(`${T} hub cards do not repeat the name`, !(await page.$$eval('#net-hubs .hub-card b', (bs) => bs.some((b) => { const t = b.innerText.split(/\s+/).filter(Boolean); return t.length > 1 && t[0] === t[1]; }))));
    ok(`${T} Network tab in Bangla with counted stats`, /হাব/.test(await page.textContent('#net-stats')) && /১৪/.test(await page.textContent('#net-stats')));
    await page.click('[data-tab=search]'); await wait(300);
    // persists across reloads
    await page.reload(); await page.waitForSelector('#opts .opt'); await wait(500);
    ok(`${T} Bangla is remembered after a reload`, (await page.getAttribute('html', 'lang')) === 'bn' && /রুট খুঁজুন/.test(await page.textContent('#plan-form button.find')));
    // back to English: exact original text
    await page.click('#lang-toggle'); await wait(400);
    await page.fill('#departAt', '12:00'); await page.click('#plan-form button.primary'); await wait(600);
    await page.click('[data-tab=sim]'); const simTrip = await page.textContent('#sim-trip'); await page.click('[data-tab=search]');
    ok(`${T} Monsoon trip name back in English`, /^[A-Za-z ]+ → [A-Za-z ]+$/.test(simTrip), simTrip);
    ok(`${T} switching back restores English`, (await page.getAttribute('html', 'lang')) === 'en' && (await page.textContent('.tabs')) === enNav && /Find routes/.test(await page.textContent('#plan-form button.find')));
    ok(`${T} English Plan tab text matches the original`, (await page.textContent('#tab-search')).replace(/\d\d:\d\d/g, '') === enPlan.replace(/\d\d:\d\d/g, ''));
    ok(`${T} no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  for (const r of results) console.log(r[0].padEnd(5), r[1], r[2] ? ' ' + r[2] : '');
  console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
  process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
})();
