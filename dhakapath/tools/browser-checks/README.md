# Browser checks (optional)

The headless-browser checks used to verify DhakaPath, kept here so the team can re-run them.
They are not part of `npm test` (that needs nothing installed); these need Playwright.

```bash
npm install --no-save playwright && npx playwright install chromium

# start the app in a second terminal with the settings the checks expect
ADMIN_PASSWORD=admin123 STATE_FILE=off CLOCK_SPEED=0 PORT=3100 npm start

node tools/browser-checks/check3.cjs http://localhost:3100/   # core app (104 checks)
node tools/browser-checks/check4.cjs http://localhost:3100/   # backup route, disruptions, budget (34)
node tools/browser-checks/check5.cjs http://localhost:3100/   # map / network fallbacks (24)
node tools/browser-checks/check6.cjs http://localhost:3100/   # street map (50)
node tools/browser-checks/check7.cjs http://localhost:3100/   # loading, retry, connection banner, fare versions (31)
node tools/browser-checks/check8.cjs http://localhost:3100/   # ride-share board, two commuters, split bot (26)

# the one-file offline preview
python3 tools/bundle.py dist/dhakapath-preview.html
node tools/browser-checks/static2.cjs "$PWD/dist/dhakapath-preview.html"            # 20
node tools/browser-checks/check4.cjs "file://$PWD/dist/dhakapath-preview.html"
node tools/browser-checks/check6.cjs "file://$PWD/dist/dhakapath-preview.html"

# malformed-input fuzz of every endpoint (no browser needed)
node tools/browser-checks/fuzz.mjs                                                   # expect "0 failures"
```

Notes: each check resets the app's data through the admin API. `check3` runs before the others
in a clean state. With internet access the street-map tiles load, so the "tile failure note" check
in `check6` is skipped only when tiles actually fail; screenshots are written next to the scripts.
