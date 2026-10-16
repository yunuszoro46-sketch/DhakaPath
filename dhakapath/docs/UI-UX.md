# DhakaPath: UI / UX README

Everything built on the user-facing side of DhakaPath: layout, panels, map, chat, feedback and error
states, accessibility, and how each was verified. The web app is plain HTML, CSS and ES modules in
`public/` with no framework and no build step; Leaflet 1.9.4 is the only library, vendored locally.

Open it with `npm start` → http://localhost:3000, or open `dist/dhakapath-preview.html` (a one-file
preview that runs the same engine in the page; admin password `demo`).

---

## 1. Design direction

- **Look:** the team's reference page (ChatGPT-style neutral greys), dark first with a full light theme.
  All colours are CSS variables on `:root` (`public/styles.css`), redefined for `[data-theme="light"]`.
  The theme follows the system on first visit; the **Light / Dark** button switches it and is remembered.
- **Accent:** green `#10a37f` (dark) / `#0e8a6b` (light) for primary actions and the selected route card.
- **Status colours:** ok green, warn amber, bad red, info blue, each with a matching background tint.
- **Mode colours** (map lines, mode pills, legend): MRT-6 violet, bus blue, leguna teal, rickshaw amber,
  CNG green, walk grey.
- **Route-kind colours** (street map, from KoyJabo): Cheapest `#2563eb` blue, Fastest `#16a34a` green,
  Balanced `#7c3aed` purple, Backup `#f97316` orange dashed, blocked/cut `#dc2626` red.
- **Honesty is part of the UI:** a permanent banner says the data is seed data, not official; fares are
  shown as ranges where they are negotiable; every route card says whether it was verified against the
  network; hub positions on the street map are labelled approximate; simulations are labelled as such.

## 2. Layout

| Width | Layout |
|---|---|
| Desktop (> 900 px) | Map on the left (sticky), panels on the right |
| Tablet / phone (≤ 900 px) | One column: panels first, map below |
| Phone (≤ 520–640 px) | Smaller map height, compact legend, form grids collapse to one column, the "Server / In-page" chip hides |

- **Header:** DhakaPath brand · simulated clock (Asia/Dhaka) with **+15 / +30 / +90 min** buttons ·
  **AI badge** (`AI: live`, `AI: fallback`, `AI: offline parser`) · where answers are computed
  (`Server` or `In-page engine`) · theme toggle.
- **Banners under the header:** seed-data notice (always); **connection banner** (only when the server
  can't be reached; see §9); **scenario banner** when a simulated scenario is applied to the whole app
  (rain/heavy rain, blocked hubs, rush, lines not running, delays with their expiry) with a **Clear** button.
- **Tabs:** Search · Network · Simulate · Alerts · **Share** · Admin.
- **Trip Watch panel** above the tabs when you watch a trip.
- **Chat dock:** floating **Chat** button, opens a panel that stays open across tabs.
- **Footer:** one-line architecture note and the **Test AI hallucination** button.
- No horizontal scrolling at 390 px (checked in every browser-check suite).

## 3. Search tab

- **Natural-language box** (English, Banglish, Bangla): e.g. *"Mirpur theke Motijheel, student,
  40 takar moddhe"*. The parsed result fills the form below, so the user sees what was understood, and
  the results say whether the AI or the rule parser read it. An empty box shows an example instead of
  doing nothing.
- **Form:** From / To (with a ⇅ swap), Student, Max budget ৳, Max transfers, **Max minutes**,
  Leave at (blank = now; rush hour is applied automatically from the time).
- **Sort:** Best score · Fastest · Cheapest · Fewest transfers.
- **"Avoid hubs or modes"** (collapsible): avoid-hub chips, six mode chips (MRT-6, Bus, Leguna,
  Rickshaw, CNG, Walk; tap to exclude), **Single mode only** checkbox.
- **Result header:** "Origin → Destination", the active filters in one line, the conditions line
  ("Rush hour applied …" / "off-peak", scenario active), how many paths were checked (hover for the
  full search statistics), and a note when street alerts are shaping the routes.
- **Route cards:** labels **Cheapest / Fastest / Fewest transfers / Balanced**, a **Verified against
  network ✓** badge, minutes · fare (regular or student) · transfers, mode pills per leg, and a
  trust-aware "why" line (e.g. "✓ No street reports on this route", "↪ avoids Science Lab blockade
  (confirmed by 3)", "⚠ unverified report …"). Extra tags when they apply: **🛟 Backup**, **Fits ৳X**,
  **Might fit ৳X**, **fare unknown**.
- **Backup route block:** "🛟 Backup route (+15 min, −28 ৳, 0 transfers vs main)", the trigger
  ("Use if any service on the main route stops; most exposed: MRT-6 Mirpur–Motijheel") and how it
  differs. If the backup is already one of the cards, that card is tagged instead of repeated; if there
  is none, it says why.
- **"Might fit your budget"** list (collapsible): routes whose typical fare fits but whose top estimate
  doesn't, kept apart from the main results.
- **"N more options"** (collapsible).
- **No route:** the reason in plain words plus the category (not connected / beyond the 6-hop limit /
  blocked by conditions or filters / search stopped early), the cheapest over-budget option labelled
  **over budget**, and "might fit" routes. Mode filters name the modes left ("No open route using only
  Walking between Uttara and Jatrabari").

### Selected route detail (under the cards)

- **Step by step** in **English / Banglish** (toggle), each step with the boarding **landmark note**
  (📍, marked "sample note" where it is placeholder text).
- **Fare breakdown table:** per leg: km, regular, student, "student discount applies / does not apply",
  rickshaw/CNG **baseline range → surge ×1.3/1.5/1.8 range**; trip total; the ranking midpoint (≈৳, whole
  taka); **fare table version** ("Fare table v2, updated 16 Oct").
- **Why this route**, alerts on the route (status, confidence, age, routing effect).
- **👁 Watch this trip** · **🔊 Read aloud** (browser speech) · **Offline card (PNG)**: a summary card
  drawn on a canvas for low battery / poor connectivity.
- **Fare Truth: is this fare fair?** Enter what you were asked; get fair / slightly high / overcharge
  against the expected range, a polite Banglish line to say to the driver/conductor, the community
  median (reports under the current fare table only), and a student-fare note.

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

- **Routes running now:** each line with mode, origin/destination hubs, base fare, student-pass
  eligibility, estimated time and live state.
- **Hubs and disruptions:** hub statuses and current alerts with their metadata.

## 6. Simulate tab

- Trip taken from the Search tab.
- **Presets:** Rain at Science Lab · Science Lab flooded · Rush hour · Monsoon evening · Heavy rain south ·
  **MRT-6 suspended** · **MRT-6 delayed**.
- **Custom:** rain by zone or by hub, **Heavy rain** checkbox, blocked hubs, rush hour, **Line not running**,
  **Delay line** (+% and +min).
- **Output:** explanation in plain words naming the actual cause, affected segments (✖ cut / ⏱ slowed),
  time and fare change (red up / green down), **"Backup planned before the change: still works / cut too"**,
  before and after cards side by side, and "Simulated conditions, not live incidents".
- **Apply to the whole app** turns the scenario into the global one (banner + every search uses it; delays
  expire after 2 simulated hours).

## 7. Alerts tab

- **Paste a post (Alert Ingestor):** paste a Facebook-style post in Bangla/Banglish/English; it's parsed
  into an alert, filed as unverified, matched to an open alert as a confirmation, counted as a "clear"
  vote, or rejected (contradictory / not an incident) with the reason.
- **Alert list:** status pill, place, type, a **confidence bar**, base vs effective confidence, age,
  minutes since last verified, confirmations, "clear" votes and the routing effect (hard / soft / none).
- **Confirm / It's clear** buttons; demo helper **Simulate 2 other users confirm**.

## 7b. Share tab (bonus 3: ride-share board)

- Pick **From hub**, **To** and **Rickshaw (2 seats)** or **CNG (3 seats)**; the **🤖 split bot** answers at
  once: "Split 2 ways: ৳15–23 each, of ৳30–45 total", with the surge named when rush or rain applies, or
  "There is no direct CNG link …" when there isn't one.
- **Find or start a share:** joins an open share going to the same place if there is one, otherwise posts a
  new one ("Others at the hub can join for the next 20 min").
- **Open shares from <hub>:** riders (e.g. 1/2, "you are in"), minutes left, cost each now and "if one more
  joins", **Join / Leave**. The board refreshes by itself every few seconds; full shares disappear for
  others; only counts are shown, never who.
- **From a route:** every rickshaw/CNG leg in the fare table has "👥 Share this rickshaw and split the fare",
  which opens the tab prefilled.
- **In chat:** "Shahbagh theke Science Lab rickshaw share korbo, amra 2 jon" → split + open shares.

## 8. Admin tab

- Password login (bearer token); wrong password is refused with a message.
- **Moderation queue** (approve / remove) with the sanity-check reason.
- **Boarding landmark notes** editor (English + Banglish).
- **Add a line** (mode, stops, km per segment, flat fare for leguna, boarding note) with field errors.
- **Fare chart:** bus, MRT, rickshaw and **CNG** rates; **fuel-price adjustment %** (bus/CNG/rickshaw
  per-km rates); a **reason / notice** field; shows the current **fare table version**, effective time and
  the last changes (`bus.perKm 2.45→2.65`); save button shows "Saving…" and then "Saved as fare table v2".
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

- **👁 Watch this trip** saves it; the panel re-checks it on every poll against confirmed alerts, rush hour
  and the applied scenario.
- On a change, a **toast** (once per change) with the cause and a verified detour: **Show detour**,
  **Switch to it**, **🔊** read aloud, **Stop watching**. Unverified single reports never trigger a reroute.

## 11. Chat dock

- English, Banglish and Bangla; keeps context ("ar kono option?", "student hole?", "why not metro?",
  "ei trip watch koro", report an incident, ask about a road).
- Each answer shows **Verified ✓ / Not verified**, the AI mode, the intent, and **tool chips** naming the
  engine functions that produced the numbers (e.g. `findRoutes(MIR->MOT)`, `groundRoute(5 options) ✓`).
- The reply includes the backup route and "might fit" budget routes.
- A place that is not one of the 14 hubs ("Gulshan theke …") is named as such with the nearest hubs; it is
  never swapped silently for another place. "From home" asks which hub. Rush hour and rain mentioned in the
  question ("in rush hour", "brishti hocche") change the fare quoted; "metro na niye", "bus lagbe na" avoid
  that mode; "is the Science Lab alert reliable?" answers for that hub; "thanks" gets a friendly reply.
- Suggestion chips under the log; the dock stays open across tabs.
- **Test AI hallucination** (footer) sends a made-up plan ("Bus 99 from Uttara to Banasree, ৳20") and shows
  it **Rejected: not in network**.

## 12. Accessibility

- Semantic tabs (`role="tab"`, `aria-selected`), buttons with `aria-pressed` for toggles and selected cards,
  `aria-expanded` on the chat button, `aria-busy` on busy buttons and loading areas.
- Live regions (`aria-live` / `role="status"` / `role="alert"`) for results, chat, banners and form errors.
- Labels on every input; icon-only buttons have `aria-label`; map hubs are keyboard-focusable.
- Visible focus colour per theme; status never shown by colour alone (text labels, ⛔ / ✖ / ⏱ icons, dash
  patterns); reduced-motion respected on the street map.
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

## 14. How the UI was verified

Headless Chromium at **1400 px dark** and **390 px light**, scripts in `tools/browser-checks/`
(see its README to re-run):

| Suite | Checks | Covers |
|---|---|---|
| `check3.cjs` | 104 | core app: search, NL search, breakdown, sorting, Fare Truth, offline card, why lines, simulations and Apply, alerts flow, clock, admin, Network view, Banglish, Trip Watch, chat, hallucination test, no sideways scroll, no console errors, no unexpected outside requests |
| `check4.cjs` | 34 | backup block/tag, stats tooltip, max minutes, no-route category, budget tags, MRT-6 suspended → backup, custom line-down + delay, heavy rain, apply app-wide |
| `check5.cjs` | 24 | corrupted map positions, network down/malformed, server error mid-search, validation message from the form |
| `check6.cjs` | 50 | street map: markers/labels, A/B, colours per preference, tooltip numbers = engine numbers, All three, card ↔ preference, popup Set Start, single mode, walking-only message, simulation lines, Street/Schematic, tile note, bad coordinates, Leaflet missing |
| `check7.cjs` | 31 | empty search, busy state, double click, latest wins, network down + Retry + banner + back online, simulation Retry, one poll in flight, admin +8% → v2 shown in the breakdown |
| `check8.cjs` | 26 | Share tab: split bot, start, a second commuter joins (full) and leaves, poll refresh, "Share this rickshaw" from a route leg, chat split bot |
| `static2.cjs` | 20 | the one-file preview from a static host and from `file://` |

All pass. A never-answering search was also checked by hand: it gives up after 15 s with a message and the
button comes back.

## 15. Known limits

- Street tiles need internet; the sandbox used for building had none, so live tiles were not seen there
  (the offline fallback was). Check tile loading on a connected machine before the demo.
- In the hosted claude.ai preview, the **Offline card (PNG)** download is blocked by the viewer; it works
  in the app run with `npm start`.
- Hub coordinates are approximate area centres; landmark notes other than Farmgate are sample text.
- The UI keeps six mode chips (CNG separate), not KoyJabo's five checkboxes.
