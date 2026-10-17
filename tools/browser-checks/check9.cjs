// Official fare sources, best time to leave, voice input. Headless Chromium has no microphone, so
// voice is checked with a stand-in SpeechRecognition that emits the events a real one does; a second
// context without it checks the "not supported" path.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3100/';
const OFFLINE = /\.html$/.test(BASE);
const results = [];
const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, String(x).slice(0, 260)]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// fake recogniser: speaks window.__say (interim first, then final) or fails with window.__fail
const FAKE = `window.SpeechRecognition = class {
  constructor() { this.lang = ''; window.__recs = (window.__recs || 0) + 1; window.__lastRec = this; }
  start() { window.__lang = this.lang; setTimeout(() => {
    if (window.__fail) { this.onerror && this.onerror({ error: window.__fail }); this.onend && this.onend(); return; }
    const t = window.__say || '';
    const ev = (final, txt) => ({ resultIndex: 0, results: Object.assign([Object.assign([{ transcript: txt }], { isFinal: final })], {}) });
    this.onresult && this.onresult(ev(false, t.slice(0, 6)));
    setTimeout(() => { this.onresult && this.onresult(ev(true, t)); this.onend && this.onend(); }, 120);
  }, 120); }
  stop() {} abort() { this.onerror && this.onerror({ error: 'aborted' }); this.onend && this.onend(); }
};`;

(async () => {
  if (!OFFLINE) {
    const tok = (await (await fetch(BASE + 'api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"admin123"}' })).json()).data.token;
    await fetch(BASE + 'api/admin/reset', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: '{}' });
  }
  const browser = await chromium.launch();
  for (const w of [1400, 390]) {
    const T = `[${w}]`;
    const ctx = await browser.newContext({ viewport: { width: w, height: 950 } }); await ctx.addInitScript(() => { try { localStorage.setItem('dp-map-phone', 'open'); } catch { /* storage off */ } });   // phones start with the map folded; these checks test it open
    await ctx.addInitScript(FAKE);
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', (e) => errors.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text()) && !/tile\.openstreetmap\.org/.test((m.location() || {}).url || '')) errors.push(m.text()); });
    await p.goto(BASE); await p.waitForSelector('#opts .opt');

    // 1. fare sources under the breakdown
    await p.selectOption('#origin', 'MIR'); await p.selectOption('#destination', 'MOT'); await p.uncheck('#student'); await p.fill('#departAt', '09:50');
    await p.click('#plan-form button.primary'); await wait(700);
    const bus = await p.$$eval('#opts .opt', (e) => e.map((x) => x.textContent)).then((t) => t.findIndex((x) => /B1/.test(x)));
    if (bus >= 0) { await (await p.$$('#opts .opt'))[bus].click(); await wait(400); }
    const src = await p.textContent('#detail .fare-src').catch(() => '');
    ok(`${T} bus leg cites the gazette with a link`, /official source\s*Bus: Govt gazette \(BRTA chart\), ৳2\.70\/km, minimum ৳10, effective 22 Sep 2026/.test(src) && !!(await p.$('#detail .fare-src a[href^="https://www.dhakatribune.com/"]')), src);
    ok(`${T} demo banner says which fares are official and which are estimates`, /Bus and MRT-6 fare rules follow published official rates; rickshaw, CNG and leguna fares are team estimates/.test(await p.textContent('.demo-banner')));

    // 2. best time to leave for the B1 card at 09:50
    await p.click('#bt-btn'); await p.waitForSelector('#bt-out .bt-line', { timeout: 5000 }).catch(() => {});
    const bt = await p.textContent('#bt-out');
    ok(`${T} best time: wait for 10:30, 58 → 41 min, arrival stated`, /leave at 10:30 instead of 09:50 — 58 → 41 min/.test(bt) && /arrive 11:11 instead of 10:48/.test(bt), bt);
    const chips = await p.$$eval('#bt-out .bt-line li', (e) => e.map((x) => [x.className, x.textContent.replace(/\s+/g, ' ').trim()]));
    ok(`${T} timeline: 10:30 highlighted, rush slots tagged`, chips.some(([c, t]) => /best/.test(c) && /^10:30\s*41 min/.test(t)) && chips.filter(([c]) => /rush/.test(c)).every(([, t]) => /rush$/.test(t)) && chips.some(([c]) => /rush/.test(c)), JSON.stringify(chips).slice(0, 250));
    // MRT-6 card: no gain
    const mrt = await p.$$eval('#opts .opt', (e) => e.map((x) => x.textContent)).then((t) => t.findIndex((x) => /MRT-6/.test(x) && !/B1|B4/.test(x)));
    if (mrt >= 0) { await (await p.$$('#opts .opt'))[mrt].click(); await wait(400); await p.click('#bt-btn'); await wait(900); }
    ok(`${T} metro: leave now`, /leave now \(09:50\)/.test(await p.textContent('#bt-out')), await p.textContent('#bt-out'));

    // 3. voice in the search box (Bangla) -> same parser -> results
    ok(`${T} mic and language button in search and chat`, (await p.$$('#nl-form .mic, #chat-form .mic')).length === 2 && (await p.textContent('#nl-form .vlang')) === 'বাং');
    await p.evaluate(() => { window.__say = 'মিরপুর থেকে মতিঝিল ছাত্র ৪০ টাকার মধ্যে'; window.__fail = null; });
    await p.click('#nl-form .mic'); await wait(150);
    ok(`${T} listening state shown`, (await p.getAttribute('#nl-form .mic', 'aria-pressed')) === 'true' && /Listening in Bangla/.test(await p.textContent('#nl-form + .voice-status')));
    await wait(900);
    ok(`${T} recogniser asked for bn-BD`, (await p.evaluate(() => window.__lang)) === 'bn-BD');
    ok(`${T} heard text fills the box and searches`, (await p.inputValue('#nl-in')) === 'মিরপুর থেকে মতিঝিল ছাত্র ৪০ টাকার মধ্যে' && /Heard:/.test(await p.textContent('#nl-form + .voice-status')), await p.inputValue('#nl-in'));
    const card0 = await p.textContent('#search-out').catch(() => '');
    ok(`${T} spoken Bangla trip parsed: Mirpur → Motijheel, student, ≤৳40`, /Mirpur/.test(card0) && /Motijheel/.test(card0) && (await p.isChecked('#student')) && /40/.test(await p.inputValue('#maxBudget')), card0.slice(0, 200));
    ok(`${T} mic released after the result`, (await p.getAttribute('#nl-form .mic', 'aria-pressed')) === 'false');
    // language switch + an error
    await p.click('#nl-form .vlang');
    ok(`${T} language toggles to EN (both mics)`, (await p.textContent('#nl-form .vlang')) === 'EN' && (await p.textContent('#chat-form .vlang')) === 'EN');
    await p.evaluate(() => { window.__fail = 'not-allowed'; });
    await p.click('#nl-form .mic'); await wait(500);
    ok(`${T} blocked mic explained, box unchanged`, /Microphone permission is blocked/.test(await p.textContent('#nl-form + .voice-status')) && (await p.inputValue('#nl-in')) === 'মিরপুর থেকে মতিঝিল ছাত্র ৪০ টাকার মধ্যে');
    await p.click('#nl-form .vlang');                                        // back to Bangla for the next viewport

    // 4. voice in chat -> best-time intent with tool chip
    await p.click('#chat-toggle'); await wait(300);
    await p.evaluate(() => { window.__fail = null; window.__say = 'মিরপুর থেকে মতিঝিল কখন বের হব'; });
    await p.click('#chat-form .mic'); await wait(1600);
    const last = await p.$$eval('#chat-log .msg', (e) => e.map((x) => x.textContent).pop() || '');
    ok(`${T} spoken chat question answered by bestTime()`, /bestTime\(MIR->MOT/.test(last), last.slice(0, 220));
    await p.click('#chat-close').catch(() => {});

    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(`${T} no horizontal scroll (${sw})`, sw <= w);
    ok(`${T} no console errors`, errors.length === 0, errors.join(' | '));
    await p.screenshot({ path: `${__dirname}/besttime-${w}.png`, fullPage: false });
    await ctx.close();
  }
  // unsupported browser: no SpeechRecognition at all
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } }); await ctx.addInitScript(() => { try { localStorage.setItem('dp-map-phone', 'open'); } catch { /* storage off */ } });   // phones start with the map folded; these checks test it open
  await ctx.addInitScript('delete window.SpeechRecognition; delete window.webkitSpeechRecognition; Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined });');
  const p = await ctx.newPage(); await p.goto(BASE); await p.waitForSelector('#opts .opt');
  await p.click('#nl-form .mic', { force: true }); await wait(200);   // aria-disabled, still clickable for the explanation
  ok('no Web Speech: mic says so, typing still works', /not supported in this browser/.test(await p.textContent('#nl-form + .voice-status')) && (await p.getAttribute('#nl-form .mic', 'aria-disabled')) === 'true');
  await ctx.close();
  await browser.close();
  for (const r of results) console.log(r[0] + '  ' + r[1] + (r[0] === 'FAIL' ? '  ' + r[2] : ''));
  console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
})();
