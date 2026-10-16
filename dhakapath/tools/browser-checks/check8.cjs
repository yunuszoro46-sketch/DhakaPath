// Bonus 3 in the browser: Share tab (split bot, start, auto-join from a second user, leave, full),
// "Share this rickshaw" from a route leg, chat split bot. Two browser contexts = two commuters.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3100/';
const OFFLINE = /\.html$/.test(BASE);
const results = [];
const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, String(x).slice(0, 260)]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!OFFLINE) {
    const tok = (await (await fetch(BASE + 'api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"admin123"}' })).json()).data.token;
    await fetch(BASE + 'api/admin/reset', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: '{}' });
  }
  const browser = await chromium.launch();
  for (const w of [1400, 390]) {
    const T = `[${w}]`;
    const open = async () => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 950 } });
      const page = await ctx.newPage(); const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text()) && !/tile\.openstreetmap\.org/.test((m.location() || {}).url || '')) errors.push(m.text()); });
      await page.goto(BASE); await page.waitForSelector('#opts .opt');
      return { ctx, page, errors };
    };
    const A = await open();
    const p = A.page;
    await p.click('[data-tab=share]'); await wait(500);
    ok(`${T} Share tab: split bot quote for Shahbagh → Science Lab rickshaw`, /🤖 Split 2 ways: ৳15–23 each, of ৳30–45 total/.test(await p.textContent('#sh-bot')), await p.textContent('#sh-bot'));
    await p.selectOption('#sh-mode', 'cng'); await wait(400);
    ok(`${T} switching to CNG with no direct link says so`, /no direct CNG link/.test(await p.textContent('#sh-bot')), await p.textContent('#sh-bot'));
    await p.selectOption('#sh-mode', 'rickshaw'); await wait(300);
    await p.click('#sh-start'); await wait(600);
    ok(`${T} start a share: posted, listed as mine, per-person and "if one more joins"`, /Share posted/.test(await p.textContent('#sh-bot')) && /1\/2 riders \(you are in\)/.test(await p.textContent('#sh-list')) && /৳15–23 each if one more joins/.test(await p.textContent('#sh-list')), await p.textContent('#sh-list'));
    if (!OFFLINE) {
      // a second commuter at the same hub joins
      const B = await open();
      await B.page.click('[data-tab=share]'); await wait(600);
      ok(`${T} second commuter sees the open share (count only, no ids)`, /1\/2 riders/.test(await B.page.textContent('#sh-list')) && !/you are in/.test(await B.page.textContent('#sh-list')));
      await B.page.click('#sh-list [data-sjoin]'); await wait(600);
      ok(`${T} join → full, each pays ৳15–23`, /2\/2 riders \(you are in\)/.test(await B.page.textContent('#sh-list')) && /৳15–23 each/.test(await B.page.textContent('#sh-list')), await B.page.textContent('#sh-list'));
      await wait(3500);                                   // poll refresh on A
      ok(`${T} first commuter's board updates by itself (poll)`, /2\/2 riders/.test(await p.textContent('#sh-list')), await p.textContent('#sh-list'));
      await B.page.click('#sh-list [data-sleave]'); await wait(600);
      ok(`${T} leave → share reopens for others`, /1\/2 riders/.test(await B.page.textContent('#sh-list')) && !!(await B.page.$('#sh-list [data-sjoin]')));
      ok(`${T} second commuter: no console errors`, B.errors.length === 0, B.errors.join(' | '));
      await B.ctx.close();
    }
    await p.click('#sh-list [data-sleave]'); await wait(500);
    // from a route leg
    await p.click('[data-tab=search]');
    await p.selectOption('#origin', 'SHA'); await p.selectOption('#destination', 'SCI'); await p.uncheck('#student'); await p.fill('#departAt', '12:00');
    for (const m of ['metro', 'bus', 'walk', 'cng', 'leguna']) await p.$eval(`#mode-chips [data-m=${m}]`, (b) => b.click());
    await p.click('#plan-form button.primary'); await wait(600);
    const link = await p.$('#detail [data-share]');
    ok(`${T} rickshaw leg offers "Share this rickshaw"`, !!link);
    if (link) { await link.click(); await wait(600); }
    ok(`${T} link opens Share tab prefilled with that leg`, await p.isVisible('#tab-share') && (await p.inputValue('#sh-from')) === 'SHA' && (await p.inputValue('#sh-to')) === 'SCI' && /Split 2 ways/.test(await p.textContent('#sh-bot')));
    for (const m of ['metro', 'bus', 'walk', 'cng', 'leguna']) await p.$eval(`#mode-chips [data-m=${m}]`, (b) => b.click());
    // chat
    await p.click('#chat-toggle'); await p.fill('#chat-in', 'Mohakhali to Badda CNG split 3 people'); await p.press('#chat-in', 'Enter'); await wait(800);
    const last = await p.$$eval('#chat-log .msg', (e) => e.map((x) => x.textContent).pop() || '');
    ok(`${T} chat split bot answers with tool chips`, /Split 3 ways: ৳47–67 each/.test(last) && /splitFare\(MOH->BAD, cng, 3 people\)/.test(last), last.slice(0, 200));
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(`${T} no horizontal scroll (${sw})`, sw <= w);
    ok(`${T} no console errors`, A.errors.length === 0, A.errors.join(' | '));
    await p.click('#chat-close').catch(() => {});
    await p.click('[data-tab=share]'); await wait(300); await p.screenshot({ path: `${__dirname}/share-${w}.png`, fullPage: false });
    await A.ctx.close();
  }
  await browser.close();
  for (const r of results) console.log(r[0] + '  ' + r[1] + (r[0] === 'FAIL' ? '  ' + r[2] : ''));
  console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
})();
