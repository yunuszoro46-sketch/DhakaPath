const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs');
const FILE = process.argv[2]; const results = []; const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, x]);
const srv = http.createServer((q, s) => { if (q.url === '/') { s.writeHead(200, { 'content-type': 'text/html' }); s.end(fs.readFileSync(FILE)); } else { s.writeHead(404); s.end('nope'); } }).listen(3202);
(async () => { const b = await chromium.launch();
  for (const url of ['http://localhost:3202/', 'file://' + FILE]) {
    const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); const errs = [];
    p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text()) && !/tile\.openstreetmap\.org/.test((m.location() || {}).url || '')) errs.push(m.text()); });
    await p.goto(url); await p.waitForSelector('#opts .opt', { timeout: 15000 }); const T = url.startsWith('file') ? '[file]' : '[static]';
    ok(`${T} in-page engine`, /In-page engine/.test(await p.textContent('#mode-chip')));
    ok(`${T} Dhanmondi→Motijheel student B4 ৳10`, /৳10/.test(await p.textContent('#opts .opt')) && /B4/.test(await p.textContent('#opts .opt')));
    await p.click('[data-tab=sim]'); await p.click('#sim-presets [data-p=sciFlood]'); await p.waitForSelector('#sim-out .simgrid');
    ok(`${T} flood detour`, /detour/.test(await p.textContent('#sim-out')));
    await p.click('[data-tab=alerts]'); await p.fill('#ingest-in', 'Malibagh e onek jam'); await p.click('#ingest-form button.primary'); await p.waitForSelector('#ingest-out .note');
    ok(`${T} ingest`, /gridlock/.test(await p.textContent('#ingest-out')));
    await p.click('#chat-toggle'); await p.fill('#chat-in', 'bus e 40 chaise Farmgate theke Motijheel, ok?'); await p.press('#chat-in', 'Enter');
    await p.waitForFunction(() => /Overcharge/.test(document.querySelector('.msg.bot:last-child').textContent));
    ok(`${T} chat fare check`, true);
    await p.click('#chat-close'); await p.click('[data-tab=search]'); await p.click('#plan-form button.primary'); await p.waitForTimeout(200);
    await p.click('#watch-btn'); await p.waitForSelector('#watch-panel:not([hidden]) .watch-item');
    ok(`${T} Trip Watch works in-page`, /clear/.test(await p.textContent('#watch-list')));
    await p.click('[data-tab=network]'); await p.waitForSelector('#net-lines tbody tr');
    ok(`${T} Network view works in-page`, true);
    await p.click('[data-tab=admin]'); await p.fill('#admin-pw', 'demo'); await p.click('#admin-login button.primary'); await p.waitForSelector('#admin-body:not([hidden])');
    ok(`${T} admin login (preview password) works in-page`, /admin\.login/.test(await p.textContent('#audit')));
    ok(`${T} AI badge in-page`, /offline parser/.test(await p.textContent('#ai-badge')));
    ok(`${T} no errors`, errs.length === 0, errs.join(' | ')); await p.close(); }
  await b.close(); srv.close(); for (const r of results) console.log(r.join('  ')); console.log(results.filter((r) => r[0] === 'PASS').length + '/' + results.length + ' passed');
})().catch((e) => { for (const r of results) console.log(r.join('  ')); console.log('CRASH', e.message.split('\n')[0]); srv.close(); process.exit(1); });
