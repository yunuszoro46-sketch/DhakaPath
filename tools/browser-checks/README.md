# Browser checks (optional)

The headless-browser checks used to verify DhakaPath, kept here so the team can re-run them.
They are not part of `npm test` (that needs nothing installed); these need Playwright.

```bash
npm install --no-save playwright && npx playwright install chromium   # or point NODE_PATH at an existing Playwright install

# start the app in a second terminal with the settings the checks expect
ADMIN_PASSWORD=admin123 STATE_FILE=off CLOCK_SPEED=0 PORT=3100 npm start

node tools/browser-checks/check3.cjs http://localhost:3100/   # core app (104 checks)
node tools/browser-checks/check4.cjs http://localhost:3100/   # backup route, disruptions, budget (34)
node tools/browser-checks/check5.cjs http://localhost:3100/   # map / network fallbacks (24)
node tools/browser-checks/check6.cjs http://localhost:3100/   # street map (50)
node tools/browser-checks/check7.cjs http://localhost:3100/   # loading, retry, connection banner, fare versions (31)
node tools/browser-checks/check8.cjs http://localhost:3100/   # ride-share board, two commuters, split bot (26)
node tools/browser-checks/check9.cjs http://localhost:3100/   # fare sources, best time to leave, voice input (33)
node tools/browser-checks/check11-ui.cjs http://localhost:3100/   # Night Route layout and UI regressions (91)
node tools/browser-checks/check12-i18n.cjs http://localhost:3100/ # English / Bangla switch, Bangla numerals (40)

# design review screenshots (1440 / 1024 / 390 / 360 px, dark and light) into a folder of your choice
node tools/browser-checks/shots.cjs http://localhost:3100/ /tmp/dhakapath-shots

# no browser needed
node tools/ui-contract.mjs --check   # every id the JS and checks use still exists (docs/ui-contract.txt)
node tools/contrast.mjs              # WCAG contrast of the colour tokens in both themes

# the one-file offline preview
npm run preview                      # = python3 tools/bundle.py dist/dhakapath-preview.html
node tools/browser-checks/static2.cjs "$PWD/dist/dhakapath-preview.html"            # 20
node tools/browser-checks/check4.cjs "file://$PWD/dist/dhakapath-preview.html"
node tools/browser-checks/check6.cjs "file://$PWD/dist/dhakapath-preview.html"
node tools/browser-checks/check9.cjs "file://$PWD/dist/dhakapath-preview.html"

# malformed-input fuzz of every endpoint (no browser needed)
node tools/browser-checks/fuzz.mjs                                                   # expect "0 failures"
```

Notes: each check resets the app's data through the admin API. `check3` runs before the others
in a clean state. With internet access the street-map tiles load, so the "tile failure note" check
in `check6` is skipped only when tiles actually fail; screenshots are written next to the scripts.

`check9` uses a stand-in `SpeechRecognition` (headless Chromium has no microphone), so it checks the
voice wiring, not real recognition; try the mic in Chrome or Edge yourself. `check8` pins rush hour
off for its run (the split-bot numbers are off-peak) and clears the scenario at the end.

Since the Night Route redesign some controls live under a disclosure (*More options* on the Plan tab,
*Or build your own conditions* in Monsoon); `check3`, `check4` and `check5` open it before using those
fields, as a person would. `check11` asserts the new layout (map stage on desktop, map-first sheet with a
bottom nav on phones, ticket strips, chat drawer, fonts, contrast-sensitive labels).
