# DhakaPath: UI / UX README

Everything built on the user-facing side of DhakaPath: layout, panels, map, chat, feedback and error
states, accessibility, and how each was verified. The web app is plain HTML, CSS and ES modules in
`public/` with no framework and no build step; Leaflet 1.9.4 is the only library, vendored locally with
two OFL fonts and an SVG icon sprite, so the app works offline.

Open it with `npm start` → http://localhost:3000, or build `npm run preview` and open
`dist/dhakapath-preview.html` (a one-file preview that runs the same engine in the page; admin password `demo`).
Why this is the only frontend: `architecture/adr-001-single-frontend.md`.

---

## 1. Design system ("Night Route", v2)

Plan and reasoning: [`UI-REDESIGN-PLAN.md`](UI-REDESIGN-PLAN.md). The UI is a commuter tool: the map is
the stage, a route is a ticket, and honesty about the data is part of the chrome. Everything is tokens in
`public/styles.css` (`:root` = dark, `[data-theme="light"]` overrides); the theme follows the system on
first visit and the sun / moon button switches and remembers it.

- **The memorable element: the route ticket.** A kind label coloured exactly like its map line
  (Cheapest blue, Fastest green, Balanced purple, Backup orange), a plate of large signage figures
  (minutes, ৳, transfers in Big Shoulders), and a **journey strip**: one segment per leg, coloured by
  mode, its width proportional to the leg's wait + ride minutes (the lighter head of a segment is the
  wait). You read the shape of a trip before any text. The same strip appears in Monsoon before / after.
- **Colour.** Dark (default): night navy `#0a1020`, surfaces `#0f1829` / `#16223a` / `#1e2c47`, text
  `#e8edf5`, muted `#97a3ba`. Light: `#eef2f7` / `#fff` / `#f3f6fa`, text `#0e1626`, muted `#56627a`.
  One accent, signal green (`#1db57a` dark, `#0b7a52` light), for the primary action, the selected state
  and focus of attention. Status colours each have a tint background and are **always paired with text or
  a glyph**. Every text/background pair passes WCAG AA: `node tools/contrast.mjs`.
- **Mode colours** (map lines, journey strip, mode plates): MRT-6 violet, bus blue, leguna teal, rickshaw
  amber, CNG green, walk grey. **Route-kind colours** are fixed so the ticket and the map agree; dark text
  sits on the green and orange labels to keep 4.5:1.
- **Type.** Instrument Sans for the interface, Big Shoulders for figures (road-signage feel), both SIL OFL,
  subset and vendored in `public/vendor/fonts/` (the demo never depends on a font CDN). Bangla falls back to
  the device font (Hind Siliguri, Noto Sans Bengali, Nirmala UI, Bangla Sangam). Scale 12 / 14 / 16 / 18 /
  20 / 24 / 30 / 36 px (1.25 ratio); sentence-case labels; tabular figures in tables.
- **Space and shape.** 8 px grid (4 / 8 / 16 / 24 / 32 / 48, with 12 as the one half step); radius by
  hierarchy: sheet 20, card 12, control 10, chips pill. Shadows only on things that float (map controls,
  drawer, toasts, the phone sheet).
- **Icons.** One inline SVG sprite (Material Design Icons, `tools/make_icons.py`) instead of emoji, so they
  render the same on every OS: nav, planner, actions, empty states, map controls.
- **Status language.** Alert chips carry a glyph and a word (`⛔ Active`, `? Unverified`, `⇄ Disputed`,
  `◔ Fading`, `✓ Resolved`); the confidence bar has marks at 0.30 and 0.60; the routing effect is printed;
  fare sources are **official source** / **estimate** badges; map links use dash patterns as well as colour.
- **Motion.** One orchestrated moment: on a new trip the selected route draws itself onto the map and the
  journey strips fill left to right. Otherwise only state changes (150–200 ms). All off under
  `prefers-reduced-motion`.
- **Every control has five states** (default, hover, active, visible focus ring, disabled); checkboxes are
  drawn so they match both themes; touch targets are 40–44 px on phones.

### KoyJabo reference

Patterns taken from KoyJabo (koyjabo.com), not its look: From / To first, with an icon tile inside each
field (here the same A / B pins as the map); quick sort chips right above the results; icon + label + value
tiles (route summary, Monsoon deltas, network size); bilingual headings with Bangla treated as a first-class
script. Colours, data, copy and layout are DhakaPath's own.

### English / Bangla

The **বাং / EN** button switches the whole interface (`public/js/i18n.js`). English is the source text in
the code; in Bangla mode a MutationObserver translates what is on screen: exact labels, patterns for
sentences with numbers and names (the UI's own and the engine's common ones: directions, why lines,
backup, fare verdicts, best time, Monsoon, share bot), hub names from each hub's `bn` field in the network
data, and every digit as a Bangla digit. It keeps the English original of each text node and attribute,
so switching back restores the exact text. Form values, `data-*` attributes and API requests never change
(every `<option>` has an explicit `value`). Chat replies, pasted posts, the Banglish sample chips and the
conductor script stay as written. The choice is remembered per browser; a browser set to Bangla starts in
Bangla. Checked by `check12-i18n` (40 checks).

## 2. Layout

| Width | Layout |
|---|---|
| Desktop (≥ 1024 px) | Fixed-height app. Header: brand, the five sections, clock with +15 / +30 / +90, AI badge, Admin (shield), বাং / EN, theme, Chat. Planner panel on the left (440 px; 400 px below 1280) scrolls on its own; the map fills the rest, with the route buttons and Street / Schematic switch floating top-left, *Show all hubs* top-right, the legend bottom-left, zoom bottom-right, and the seed-data strip along its bottom edge. Chat is a 400 px drawer on the right. |
| Tablet and phone (< 1024 px) | Map on top (36 vh) with its controls laid over it; the seed-data strip under it (one line, tap to expand); the planner slides up over the map like a sheet (rounded top, grab handle); a fixed bottom nav holds the five sections, so nothing hides behind sideways scrolling. Chat opens full screen. Toasts move to the bottom, above the nav. |
| Phone (≤ 640 px) | Header on two rows: brand + Admin, language, theme, chat; then the clock and the AI badge. On the Plan tab From, To and *Find routes* are visible without scrolling at 390 × 844. |

- **Map on demand:** a **Hide map / Show map** button at the top of the planner. Phones start with the map
  folded (the planner first); desktop starts with it open; the choice is remembered per kind of screen.
- **Resize:** drag the planner's right edge on desktop (320 px up to leaving the map 420 px), or the sheet's
  grab handle on phones (map 180 px to 70% of the screen). Both are keyboard separators (arrows, Shift for
  bigger steps, Home/End, Enter or double-click to reset) and the size is remembered.
- **Banners:** the **connection banner** (only when the server can't be reached; see §9) and the
  **scenario banner** when a simulated scenario is applied to the whole app, with a **Clear** button.
- **Trip Watch panel** at the top of the planner when you watch a trip.
- **Footer** (end of the planner): one-line architecture note and the **Test AI hallucination** button.
- No horizontal scrolling from 320 px up.

## 3. Plan tab

- **Where are you headed?** From and To are the first thing: two large fields, each carrying the same
  **A / B pin** as the map, with a swap button. **Student** (½ bus fare) and **Leave at** (blank = now;
  rush hour is applied automatically from the time) stay visible; **More options** folds in max budget ৳,
  max transfers, max minutes, avoid-hub chips, six mode chips (tap to exclude) and *Single mode only*,
  and shows how many of them are active. **Find routes** (রুট খুঁজুন) is a full-width button.
- **Or just type it:** the natural-language box (English, Banglish, Bangla), e.g. *"Mirpur theke Motijheel,
  student, 40 takar moddhe"*. The parsed result fills the form, so the user sees what was understood, and
  the results say whether the AI or the rule parser read it. An empty box shows an example instead of
  doing nothing.
- **Voice input** (mic icon, in the box and in the chat composer): the browser's own speech recognition,
  with a **বাং / EN** voice-language button (Bangla bn-BD by default, shared by both mics, remembered).
  While listening the mic pulses red, the words appear live, and the final text is sent through the same
  form, with "Heard: “…”" underneath. Tap again to finish, Esc to cancel, 10 s limit; a blocked mic, no
  speech, no network or an unsupported browser is explained in one line; typing always works.
- **Sort chips** right above the results: Best match · Fastest · Cheapest · Fewest changes. Changing one
  re-ranks the current trip at once.
- **Result header:** "Origin → Destination", how many paths were checked (hover for the full search
  statistics), then one conditions line: active filters, "Rush hour applied …" or "off-peak", scenario
  active, and how many street alerts are shaping the routes.
- **Route tickets** (see §1): kind label coloured like the map line plus the other labels it earned
  (Cheapest / Fastest / Fewest transfers / Balanced), **Verified against network ✓**, the plate (minutes,
  fare regular or student, transfers), the journey strip, and the trust-aware "why" line ("No street
  reports on this route", "Avoids Science Lab: waterlogging confirmed (0.70, 3 reports)", "Passes
  Mohakhali: unverified gridlock … only +25% time"). Extra tags when they apply: **Backup**, **Fits ৳X**,
  **Might fit ৳X**, **fare unknown**. The selected ticket is raised and outlined in its kind colour.
- **Backup route block:** "Backup route (+15 min, −28 ৳, 0 transfers vs main)", the trigger
  ("Use if any service on the main route stops; most exposed: MRT-6 Mirpur–Motijheel") and how it
  differs. If the backup is already one of the tickets, that ticket is tagged instead of repeated; if there
  is none, it says why.
- **"Might fit your budget"** list (collapsible): routes whose typical fare fits but whose top estimate
  doesn't, kept apart from the main results.
- **"N more options"** (collapsible).
- **No route:** the reason in plain words plus the category (not connected / beyond the 6-hop limit /
  blocked by conditions or filters / search stopped early), the cheapest over-budget option labelled
  **over budget**, and "might fit" routes. Mode filters name the modes left ("No open route using only
  Walking between Uttara and Jatrabari").

### Selected route detail (under the cards)

- **Step by step**, numbered on a rail (the steps are a sequence), in **English / Banglish** (toggle),
  each with the boarding **landmark note** (pin icon, marked "sample note" where it is placeholder text).
- **Fare breakdown table:** per leg: km, regular, student, "student discount applies / does not apply",
  rickshaw/CNG **baseline range → surge ×1.3/1.5/1.8 range**; trip total; the ranking midpoint (≈৳, whole
  taka); **fare table version** ("Fare table v2, updated 16 Oct"); and **fare sources** for the modes on
  this route: a green **official source** pill for bus (government gazette, ৳2.70/km, minimum ৳10,
  effective 22 Sep 2026, with a link and the date checked) and MRT-6, an amber **estimate** pill for
  rickshaw, CNG and leguna.
- **Why this route**, alerts on the route (status, confidence, age, routing effect).
- Action bar: **Watch this trip** · **Best time to leave** · **Read aloud** (browser speech) · **Offline card (PNG)**: a summary card
  drawn on a canvas for low battery / poor connectivity · **Best time to leave**: a coloured advice line
  (green "leave at 10:30 instead of 09:50 — 58 → 41 min … you arrive 11:11 instead of 10:48", amber "leave
  before 07:30", blue "leave now") and one chip per departure (time, minutes, fare, arrival; the best one
  green, rush departures dashed with a **rush** tag), then the assumption and the rush windows. Busy label
  "Checking later departures…", Retry on a network error, ignored if you pick another route meanwhile.
- **Fare Truth: is this fare fair?** Enter what you were asked; get fair / slightly high / overcharge
  against the expected range, a polite Banglish line to say to the driver/conductor, the basis of the
  verdict (**official rate** with its source, or **team estimate** — then the verdict is labelled *against
  the estimated range*), the community median (reports under the current fare table only), and a
  student-fare note.

## 4. Map

Two views, switchable in the map toolbar (**Street / Schematic**, remembered).

### Street map (default; ported from the team's KoyJabo module)

- Leaflet + OpenStreetMap tiles, 14 hubs at approximate coordinates.
- **Markers:** **A** (start, green) and **B** (destination, red) pins; route stops highlighted in the route
  colour with a soft pulse and a **STOP** badge; blocked hubs red with ⛔; other hubs a dark ring.
  Animations are off for users who prefer reduced motion.
- **Permanent hub labels** in pill style. When zoomed out (whole city on a phone), only A, B and route-stop
  labels stay, so the map doesn't turn into a pile of labels.
- **Hub popup:** name (English + Bangla), landmark note, "position approximate", **Set as Start (A)** /
  **Set as Destination (B)** (searches immediately).
- **Network links:** grey lines; red dashed when every service on a link is out (blocked hub, line not
  running, cut in a simulation). Hover: every service on that link with minutes and why it's out.
- **Route preference buttons:** **Fastest · Cheapest · Balanced · All three.**
  - One kind: that route drawn bold in its colour, the other kinds faded underneath, the matching card
    selected and its detail shown.
  - **All three:** cheapest, fastest and balanced drawn together (different weights so overlaps stay
    visible) plus the backup orange dashed.
  - Clicking a card switches the buttons to that card's kind; buttons for kinds not in the result are
    disabled; during a simulation they are disabled.
- **Sticky route tooltips:** kind, fare range, minutes, transfers, modes; numbers straight from the engine.
- **Simulation on the map:** usual route grey dashed, new route coloured, cut links solid red.
- **Legend** (floating) and **Show all 14 hubs / Focus route** button. The map fits the route on display,
  with tighter padding on phones.
- **Fallbacks:** if tiles can't load (offline), a note under the map says so and hubs/routes are still
  drawn; if Leaflet itself is missing, the app uses the schematic map and hides the switch; hubs with a
  missing or out-of-Dhaka position are left out and named.

### Schematic map

- SVG node-graph of the 14 hubs, lines coloured by mode, parallel lines offset.
- Alert state on the links: **solid red** = trusted hard block, **dashed amber** = unverified report,
  **grey** = fading. Hover a link for the alert text, confidence and age.
- Selected route bold; in a simulation, usual route dashed grey and cut links red; rain shown as a haze.
- Click a hub = set To, Shift+click = set From; hubs are keyboard-focusable (Enter/Space).
- Fallbacks: hubs with bad positions are skipped and named in the legend; if drawing fails or the network
  doesn't load, the map shows a message while search keeps working.

## 5. Network tab (commuter browse view)

- **Network size tiles:** hubs, lines, links and modes, counted from the network data the engine routes on.
- **Routes running now:** each line with mode, origin/destination hubs, base fare, student-pass
  eligibility, estimated time and live state.
- **Hubs and disruptions:** hub statuses and current alerts with their metadata.

## 6. Monsoon tab (simulation)

- Trip taken from the Plan tab.
- **Scenario tiles** (two columns, with an icon for rain, rush, line down or delay): Rain at Science Lab ·
  Science Lab flooded · Rush hour · Monsoon evening · Heavy rain south · **MRT-6 suspended** · **MRT-6 delayed**.
- **Or build your own conditions** (folded): rain by zone or by hub, **Heavy rain** checkbox, blocked hubs, rush hour, **Line not running**,
  **Delay line** (+% and +min).
- **Output:** explanation in plain words naming the actual cause, affected segments (✖ cut / ⏱ slowed),
  **"Backup planned before the change: still works / cut too"**, three delta tiles (time, fare, route:
  *detour* or *same route*) taken from the engine's `delta`, before and after cards side by side, and
  "Simulated conditions, not live incidents". Before any run the panel shows an empty state telling you
  what to do; **Clear** restores it.
- **Apply to the whole app** turns the scenario into the global one (banner + every search uses it; delays
  expire after 2 simulated hours).

## 7. Alerts tab

- **Paste a post (Alert Ingestor):** paste a Facebook-style post in Bangla/Banglish/English; it's parsed
  into an alert, filed as unverified, matched to an open alert as a confirmation, counted as a "clear"
  vote, or rejected (contradictory / not an incident) with the reason.
- **Alert list:** status chip (glyph + word), place, type, a **confidence bar** with marks at 0.30 and 0.60,
  effective vs starting confidence, reports (the poster counts as the first), "clear" votes, age, minutes
  since last verified and the routing effect in words (hard / soft / none). Re-submitting a report you already
  made says it counts once.
- **Confirm / It's clear** buttons; demo helper **Simulate 2 other users confirm**.

## 7b. Share tab (bonus 3: ride-share board)

- Pick **From hub**, **To** and **Rickshaw (2 seats)** or **CNG (3 seats)**; the **split bot** answers at
  once: "Split 2 ways: ৳15–23 each, of ৳30–45 total", with the surge named when rush or rain applies, or
  "There is no direct CNG link …" when there isn't one.
- **Find or start a share:** joins an open share going to the same place if there is one, otherwise posts a
  new one ("Others at the hub can join for the next 20 min").
- **Open shares from <hub>:** riders (e.g. 1/2, "you are in"), minutes left, cost each now and "if one more
  joins", **Join / Leave**. The board refreshes by itself every few seconds; full shares disappear for
  others; only counts are shown, never who.
- **From a route:** every rickshaw/CNG leg in the fare table has "Share this rickshaw and split the fare",
  which opens the tab prefilled.
- **In chat:** "Shahbagh theke Science Lab rickshaw share korbo, amra 2 jon" → split + open shares.

## 8. Admin (shield button in the header)

- Password login (bearer token); wrong password is refused with a message.
- **Moderation queue** (approve / remove) with the sanity-check reason.
- **Boarding landmark notes** editor (English + Banglish).
- **Add a line** (mode, stops, km per segment, flat fare for leguna, boarding note) with field errors.
- **Fare chart:** bus, MRT, rickshaw and **CNG** rates; **fuel-price adjustment %** (bus/CNG/rickshaw
  per-km rates); a **reason / notice** field; shows the current **fare table version**, effective time and
  the last changes (`bus.perKm 2.7→2.92`); save button shows "Saving…" and then "Saved as fare table v2".
- **Lines and edges** table with delete; **Audit log**; **Reset** to seed data.

## 9. Feedback, loading and error states

- **Busy buttons:** Search ("Searching…"), Simulate and presets ("Running…"), fare save ("Saving…"): disabled
  with `aria-busy` while the request runs; a double click sends one request.
- **Results dim** while a new search or simulation is loading.
- **Latest wins:** a slow older response never replaces a newer search.
- **Timeouts:** reads give up after 8 s and retry once; writes after 15 s and are never retried (no double
  "confirm"). Messages: "took too long", "could not reach", "unexpected answer".
- **Network failure:** the last good results stay on screen with the error and a **Retry** button; the
  same for simulations.
- **Connection banner:** "⚠ Connection to DhakaPath lost. Retrying every few seconds; your last results
  stay on screen" → "✓ Back online" (hides after 2.5 s). Also reacts to the browser going offline.
- **Network can't load at start:** a card with **Retry** instead of half-built panels; the map shows a message.
- **Server validation messages** are shown as written (e.g. "maxTravelTime must be minutes between 1 and 600").
- **Polling** (every 3 s for clock, alerts, watched trips) pauses when the tab is hidden and never overlaps.
- **Toasts** for Trip Watch changes and alert actions.

## 10. Trip Watch

- **Watch this trip** saves it; the panel re-checks it on every poll against confirmed alerts, rush hour
  and the applied scenario.
- On a change, a **toast** (once per change) with the cause and a verified detour: **Show detour**,
  **Switch to it**, read aloud, **Stop watching**. Unverified single reports never trigger a reroute.

## 11. Chat drawer

- Opened from **Chat** in the header: a 400 px drawer on the right on desktop (the map stays visible),
  full screen on phones; **Escape** or the close button closes it and returns focus to the Chat button.

- English, Banglish and Bangla; keeps context ("ar kono option?", "student hole?", "why not metro?",
  "ei trip watch koro", report an incident, ask about a road).
- Each answer shows **Verified ✓ / Not verified**, the AI mode, the intent, and **tool chips** naming the
  engine functions that produced the numbers (e.g. `findRoutes(MIR->MOT)`, `groundRoute(5 options) ✓`).
- The reply includes the backup route and "might fit" budget routes.
- A place that is not one of the 14 hubs ("Gulshan theke …") is named as such with the nearest hubs; it is
  never swapped silently for another place. "From home" asks which hub. Rush hour and rain mentioned in the
  question ("in rush hour", "brishti hocche") change the fare quoted; "metro na niye", "bus lagbe na" avoid
  that mode; "is the Science Lab alert reliable?" answers for that hub; "thanks" gets a friendly reply.
- "Kokhon ber hobo?", "কখন বের হব", "when should I leave?" answer with the best time to leave
  (`bestTime(MIR->MOT, from 09:50, 8 departures)`), reusing the last trip when none is named; times like
  "9:50" or "সকাল ৯:৫০" are read.
- Voice input with the same mic and language button as the search box.
- Suggestion chips under the log; the drawer stays open across tabs.
- **Test AI hallucination** (footer) sends a made-up plan ("Bus 99 from Uttara to Banasree, ৳20") and shows
  it **Rejected: not in network**.

## 12. Accessibility

- Skip link to the trip planner; `lang="bn"` set on the page in Bangla mode.
- Semantic tabs (`role="tab"`, `aria-selected`), buttons with `aria-pressed` for toggles, selected tickets and the Admin button,
  `aria-expanded` on the chat button, `aria-busy` on busy buttons and loading areas.
- Live regions (`aria-live` / `role="status"` / `role="alert"`) for results, chat, banners and form errors.
- Labels on every input; icon-only buttons have `aria-label`; map hubs are keyboard-focusable.
- Visible focus ring per theme on every control; every text/background pair passes WCAG AA (`tools/contrast.mjs`);
  touch targets 40–44 px on phones; status never shown by colour alone (text labels, ⛔ / ✖ / ⏱ glyphs, dash
  patterns); the journey strip has a text equivalent (the leg list and each segment's title); reduced motion
  turns off the route draw-in, strip fill and marker pulses.
- All user text is escaped before rendering.

## 13. History (what changed, in order)

1. **Reference HTML adopted**: the team's hub page became the UI base (look, greys, 14 hubs).
2. **Aligned to the build spec**: search, option cards, fare breakdown, simulation, alerts, admin CMS.
3. **Problem-statement gaps + Trip Watch**: Network browse view, landmark editing, baseline vs surge
   fares, departure time / auto rush hour, rain by zone, Banglish directions, Trip Watch.
4. **Architecture doc alignment**: frontend split into one module per panel (`public/js/`), admin login,
   AI badge, +90 min clock, scenario banner, trust "why" lines, demo-users button, audit log, offline
   preview bundle.
5. **Routing-algorithm doc**: backup route block and tag, budget tags and "might fit", no-route categories,
   search statistics tooltip, Max minutes, simulator line-down/delay/heavy-rain controls and presets,
   backup-holds note.
6. **Hardening**: map bad-coordinate guards and fallback messages, network-down Retry card, whole-taka money
   display, "fare unknown" tags.
7. **KoyJabo merge**: street map, route-kind colours, Fastest/Cheapest/Balanced/All three, A/B pins and
   popups, labels, legend, Street/Schematic switch, Single mode only.
8. **Review polish**: busy states, latest-wins, timeouts and retries, connection banner, poll guard,
   empty-search hint, admin fare versioning/fuel adjustment UI, fare table version in the breakdown.
9. **Pre-event review**: chat/NL fixes above and the **Share** tab (ride-share board, split bot, "Share this
   rickshaw" on route legs).
10. **Scoring push**: official fare sources in the breakdown and banner, **⏰ Best time to leave**, **🎤 voice
   input** (Bangla / English) in search and chat; fixed a selector that would have put the search busy state
   on the mic button.
11. **Finalization (ADR-001)**: the React/Leaflet port under `/app` was removed and this app became the only
   frontend. Design-system pass: tokens, type scale, map-first phone layout, segmented tabs, chat button
   moved into the header on desktop (it used to cover the selected route card at 1400×900), status chips
   with glyphs, confidence-bar marks, Monsoon delta tiles, simulation empty state, Fare Truth basis
   labels, "counts once" duplicate-report message, busy sweep, reduced-motion coverage.
12. **Night Route redesign** ([`UI-REDESIGN-PLAN.md`](UI-REDESIGN-PLAN.md), KoyJabo as a pattern reference):
   new tokens (night navy + signal green), vendored fonts and icon sprite (no emoji), the map as the stage
   with a scrolling planner panel, phone sheet + bottom nav, From / To with A / B pins, sort chips, route
   tickets with journey strips, chat drawer, info tiles, drawn checkboxes, contrast audit, and the full
   **English / Bangla switch** with Bangla numerals.

## 14. How the UI was verified

Headless Chromium at **1400 px dark** and **390 px light** (check11 also 1024 and 360 px), scripts in `tools/browser-checks/`
(see its README to re-run):

| Suite | Checks | Covers |
|---|---|---|
| `check3.cjs` | 104 | core app: search, NL search, breakdown, sorting, Fare Truth, offline card, why lines, simulations and Apply, alerts flow, clock, admin, Network view, Banglish, Trip Watch, chat, hallucination test, no sideways scroll, no console errors, no unexpected outside requests |
| `check4.cjs` | 34 | backup block/tag, stats tooltip, max minutes, no-route category, budget tags, MRT-6 suspended → backup, custom line-down + delay, heavy rain, apply app-wide |
| `check5.cjs` | 24 | corrupted map positions, network down/malformed, server error mid-search, validation message from the form |
| `check6.cjs` | 50 | street map: markers/labels, A/B, colours per preference, tooltip numbers = engine numbers, All three, card ↔ preference, popup Set Start, single mode, walking-only message, simulation lines, Street/Schematic, tile note, bad coordinates, Leaflet missing |
| `check7.cjs` | 31 | empty search, busy state, double click, latest wins, network down + Retry + banner + back online, simulation Retry, one poll in flight, admin +8% → v2 shown in the breakdown |
| `check8.cjs` | 26 | Share tab: split bot, start, a second commuter joins (full) and leaves, poll refresh, "Share this rickshaw" from a route leg, chat split bot |
| `check9.cjs` | 33 | gazette citation + link on the bus leg, banner wording, best time (B1 at 09:50 → 10:30 highlighted, rush chips, arrival; MRT-6 leave now), voice with a stand-in recogniser (bn-BD, live text, Bangla trip parsed, language toggle, blocked mic, spoken chat → `bestTime()`), no-speech-support browser |
| `check11-ui.cjs` | 104 | Night Route layout at 1400 / 1024 / 390 / 360 px: map stage on desktop, map-first sheet and fixed bottom nav on phones (all five sections visible, 44 px), From / To / Find visible without scrolling on a phone, first ticket's plate above the fold, journey strip widths ∝ leg minutes, kind label colour = map line colour, vendored fonts loaded, no emoji in header and planner, honesty labels on screen, chat drawer (desktop side / phone full screen) and Escape, 40 px tap targets, 1024 px header and toolbar fit, phone map note not covered, plus the earlier text-badge, Fare Truth basis, Monsoon tiles, duplicate-report, confidence-mark and reduced-motion checks |
| `check12-i18n.cjs` | 46 | English ↔ Bangla switch at 1400 and 390 px: nav, planner, tickets, directions, Fare Truth (form values unchanged), Monsoon, alerts and network in Bangla; Bangla digits on screen except identifiers; the same routes and minutes in both languages; hub cards not doubled; remembered after reload; exact English restored, including the Monsoon trip name |
| `static2.cjs` | 20 | the one-file preview from a static host and from `file://` |

All pass on the final tree (17 Oct 2026; 302 + 94 + 46 + 20), plus `tools/contrast.mjs` (all pairs pass) and an independent review by a separate agent whose 12 findings were fixed and turned into checks above. A never-answering search was also checked by hand: it
gives up after 15 s with a message and the button comes back.

## 15. Known limits

- Street tiles need internet; the sandbox used for building had none, so live tiles were not seen there
  (the offline fallback was). Check tile loading on a connected machine before the demo.
- In the hosted claude.ai preview, the **Offline card (PNG)** download is blocked by the viewer; it works
  in the app run with `npm start`.
- Real speech recognition was not tested (headless Chromium has no microphone); the checks use a stand-in
  recogniser. Try the mic in Chrome or Edge before the demo; in Chrome the audio goes to the browser's speech
  service, so it needs internet.
- Hub coordinates are approximate area centres; landmark notes other than Farmgate are sample text.
- The UI keeps six mode chips (CNG separate).
