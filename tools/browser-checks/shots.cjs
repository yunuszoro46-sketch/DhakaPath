// Screenshots for design review: Plan with a route selected, plus Monsoon and Alerts, at 1440 / 1024 /
// 390 / 360 px in dark and light. Usage: node tools/browser-checks/shots.cjs <baseUrl> <outDir>
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:3100/';
const OUT = process.argv[3] || 'shots';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1440, 900], [1024, 768], [390, 844], [360, 740]]) {
    for (const scheme of ['dark', 'light']) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: w < 500 ? 2 : 1 });
      const p = await ctx.newPage();
      await p.goto(BASE); await p.waitForSelector('#opts .opt'); await p.waitForTimeout(700);
      await p.screenshot({ path: `${OUT}/${w}-${scheme}-plan.png` });
      if (w === 1440 || w === 390) {
        await p.screenshot({ path: `${OUT}/${w}-${scheme}-plan-full.png`, fullPage: true });
        await p.click('[data-tab=sim]'); await p.click('#sim-presets [data-p=sciFlood]'); await p.waitForSelector('#sim-out .simgrid'); await p.waitForTimeout(400);
        await p.screenshot({ path: `${OUT}/${w}-${scheme}-monsoon.png`, fullPage: w < 500 });
        await p.click('#sim-clear').catch(() => {});
        await p.click('[data-tab=alerts]'); await p.waitForTimeout(400);
        await p.screenshot({ path: `${OUT}/${w}-${scheme}-alerts.png`, fullPage: w < 500 });
      }
      await ctx.close();
    }
  }
  await b.close();
  console.log('shots written to ' + OUT);
})();
