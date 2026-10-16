# DhakaPath

A grounded route, fare and street-alert assistant for Dhaka commuters (INIF 2026 Smart City hackathon).

**Architecture: a grounded graph engine with a thin AI layer.** The graph decides routes, fares and alert status; the AI only parses messages and rewrites explanations. This repository implements the team's *Build Spec (shared contract)* (hubs, lines, fare formulas, alert trust rules, REST paths, chat intents) and is laid out as in the companion *Hackathon Architecture (reliability-first)* document: one language, one repo, one server, no database server, no build pipeline. **The AI never makes a decision; if it is down, the app still works.**

> **Seed data, not official.**
> - Every number in `server/data/seed.json` and `server/config.json` is an assumption taken from the spec.
> - Items marked **VERIFY** (BRTA bus rate, MRT-6 fare table, rickshaw rates, landmark notes) must be checked against a current source before the demo.
> - Landmark notes marked `sample` are placeholders.
> - If a judge asks: *"seed data, configurable in config.json."*

## Run it

Node.js 20 or later (tested on 22.22.0). Nothing has to be installed.

```bash
cp .env.example .env           # optional: AI keys, ADMIN_PASSWORD, PORT
npm start                      # http://localhost:3000
npm run dev                    # same, restarts on file changes (node --watch)
npm test                       # 85 automated tests
npm run reset                  # delete data/state.json -> next start uses seed.json + demo alerts
python3 tools/bundle.py dist/dhakapath-preview.html   # one-file offline preview
```

Optional browser checks (need Playwright) and the endpoint fuzz: see `tools/browser-checks/README.md`.
Everything on the UI / UX side (panels, map, states, accessibility, how it was verified): `docs/UI-UX.md`.

- **AI (optional, free tier):** `GEMINI_API_KEY` (primary) and/or `GROQ_API_KEY` (backup). Without keys the header shows **AI: offline parser** and the rule parser answers everything.
- **Admin:** set `ADMIN_PASSWORD` in `.env`. If it is empty, a one-time password is printed when the server starts. In the offline preview the password is `demo`.
- **Express:** the routes are written against the Express API but run on a tiny built-in Express-compatible router (`server/http.js`), so `npm start` needs no `npm install`. To run on real Express: `npm install` then `USE_EXPRESS=1 npm start`. *That path was not tested in the build environment (no npm registry access there); saved state (`state.json`) is only wired on the built-in router.*

## Beyond the spec: what the problem statement needs that the spec left out

| Addition | Why (INIF problem statement) |
|---|---|
| **CNG connectors** (5 links, unmetered range fare with surge; no student discount; S1 check) | Part 3 names "rickshaws or CNGs" as non-metered segments; the spec had no CNG. CNG rates are an assumption marked VERIFY. |
| **Commuter Network view** (Network tab, `GET /api/browse`) | Part 1: commuters must browse active routes, hub statuses and disruptions with mode, origin/destination hub, base fare, student eligibility and estimated time. The spec only had an admin view. |
| **Landmark-note editing** (Admin, `PUT /api/admin/routes {kind:'hub'}`) | Part 1 lists "boarding landmark notes" as managed content. Edited notes appear in directions immediately. |
| **Baseline vs surge fares** shown side by side for rickshaw/CNG | Part 3: "indicating baseline rates versus rush-hour or weather surge rates". |
| **Rush hour from the departure time** ("Leave at", or the clock; `rushHours` in config) | Surge fares and bus delays should reflect when you travel without a manual toggle. Rush can still be forced on/off. |
| **Rain by zone** in the simulation (`scenario.rainZones`) | Part 3: "heavy rain/waterlogging in specific zones". |
| **Road-condition questions** in chat ("Science Lab er rasta kemon?") and **"jam bad diye"** (avoid every hub with an alert) | Part 2: "check road conditions using natural language… avoiding specific congested intersections". |
| **Banglish directions** (toggle in the route view; chat answers Banglish messages in Banglish) | Part 5 supports Banglish; directions people can follow in their own register. |
| **Departure time and explicit mode in chat** ("bikal 5 tay", "CNG e jabo") | Natural follow-on to multi-constraint search. |
| **Saved state** (`data/state.json`; `STATE_FILE=off` to disable; Reset and `npm run reset` clear it) | CMS edits, alerts, fare reports and watched trips survive a restart. |

### The standout feature: Trip Watch

Save a trip once ("👁 Watch this trip", or *"ei trip watch koro"* in chat). DhakaPath keeps re-checking that exact route against **confirmed** alerts and rush hour, and tells you as soon as something changes:

- **reroute**: a confirmed alert cuts the usual route; you see which segment, which alert (with its confidence), and a **grounded** detour with the time and fare difference, then *Show detour* or *Switch to it* in one tap;
- **faster route** / **slower**: rush hour or a soft alert changes the trade-off;
- **clear again** when the alert fades or is resolved.

Unverified (single) reports never trigger a reroute, so a commuter is not sent on a detour by one unconfirmed post. Each change is announced once (toast + optional read-aloud). Endpoints: `POST /api/watch`, `GET /api/watch?clientId=`, `POST /api/watch/:id/accept`, `DELETE /api/watch/:id`.

## Layout (architecture doc §2–3)

```
server/
  index.js            boot: .env, logging, state.json load/save, built-in router or Express
  http.js             tiny Express-compatible app (app.use/get/post/put/delete, req/res subset); also runs in the browser preview
  env.js              .env loader (what dotenv does)
  middleware.js       anonymous user id (X-User-Id), admin bearer-token gate, rate limits, request log
  config.json         fares, waits, multipliers, half-lives, thresholds, rush windows (VERIFY values)
  data/seed.json      14 hubs (aliases, sample landmarks), 23 lines, 37 edges (spec §2–3 + 5 CNG connectors)
  data/demoCache.json expected parsed JSON for the 6 scripted demo inputs (used only if a live AI call fails)
  store/state.js      in-memory collections, simulated clock {simNow, speed}, scenario, users, audit log, snapshot/restore/reset
  store/boot.js       builds engine + app (used by the server, the tests and the preview)
  engine/             PURE functions + the state-bound service
    network.js places.js fare.js router.js alerts.js sanity.js ground.js simulate.js why.js
    service.js        search, fare check, simulate, alerts, demo helper (binds the pure functions to state)
    admin.js          lines/edges/fare chart/landmark CRUD + commuter browse view
    watch.js          Trip Watch
  ai/
    llm.js            callLLM: Gemini then Groq, 4 s timeout, JSON mode, temperature 0; P1–P4 with validation
    prompts.js        P1 intent, P2 alert extractor (<post> wrapped), P3 explainer, P4 Fare Truth script
    parser.js         rule-based Banglish parser + alert extractor (always-on fallback)
    tools.js          tool registry; every call becomes a chip like "findRoutes(MIR->MOT, student)"
    chat.js           session context + dispatcher (switch(intent) -> tool) + chat/alert-paste pipelines
  routes/             thin handlers: health network search fare simulate alerts chat clock watch demo admin
public/
  index.html styles.css
  js/  main api store util map searchPanel fareBreakdown simPanel alertsPanel adminPanel
       chatDock clockBar offlineCard networkPanel watchPanel     (each file under 100 lines)
tests/ fare router ground alerts parser api features (.test.js)
tools/ make_seed.py make_demo_cache.js reset.js bundle.py
```

Request flow (chat): message → `ai.parseIntent` (LLM, else demo cache, else rule parser) → dispatcher calls an engine tool → `groundRoute` on every route → `explain` (LLM or template) → `{reply, data, grounded, aiMode, toolCalls}`. Every number on screen comes from `engine/`.

## How it works

### Fares (`fare.js`). Spec §4; all values in `config.json`.

| Mode | Regular | Student | Surge |
|---|---|---|---|
| Bus | max(10, round(km × 2.45)) | max(10, ceil(regular / 2)) | time only |
| MRT-6 | clamp(round5(km × 5), 20, 100) | same as regular | none |
| Leguna | flat fare per line | same | none |
| Rickshaw | range from 20/km to 30/km, minimum 20, rounded to 5 | same | rush ×1.3, rain ×1.5, both ×1.8 |

All the worked examples in spec §4 are unit tests and pass. For rickshaws, the route cost uses the midpoint of the range and the range is what's displayed.

### Backup route and service disruptions (from the team's routing-algorithm doc)

Added on top of the spec engine, using the same DFS and the same validated candidates:

- **Backup route** on every search (`backup` in `/api/search`, a "🛟 Backup" block in the UI, a "Backup:" line in chat). It is the best-scoring valid route that shares **no** bus/metro/leguna line and no rickshaw/CNG link with the main route; if none exists, one that avoids the main route's most exposed leg (its longest ride); otherwise `option: null` with the reason. It meets the same filters (budget, avoided modes…) and carries its `trigger` ("Use if … stops") and the time/fare/transfer difference. The simulator reports whether the backup planned before a change still holds.
- **Service changes in a scenario:** `disabledLines`, `blockedEdges`, and admin `delays: [{line | edgeId | hub, rate, extraMinutes, label, forMinutes}]`. Time on a link = base × (1 + rate) × rush × rain × alert, plus `extraMinutes` once per leg (a hold-up, not per stop). One delay applies per link (link beats line beats hub; never stacked). `forMinutes` makes it expire on the clock. Rule order: disabled line/link → hard alert or blocked hub → heavy-rain stop → time multipliers.
- **Heavy rain** (`rainSeverity: 'heavy'`): stronger slow-downs and CNG and leguna stop in the rain area; rickshaws, buses and the metro keep running. *Team assumption, in `config.json`.*
- **Budget status** on each option when a budget is set: `within` (the top of the estimate fits), `estimated_within` (the typical fare fits, the top does not; listed separately as "might fit", never mixed into the results) and `over`. Fares carry `fareConfidence: formula_estimate | range_estimate`; nothing is called guaranteed.
- **Why there is no route** (`status`): `NO_ROUTE_IN_MODELED_NETWORK`, `NO_ROUTE_WITHIN_HOP_LIMIT`, `NO_ROUTE_WITHIN_CONSTRAINTS`, `SEARCH_INCOMPLETE` (a safety limit, `ranking.maxDfsNodes`, never reached on the seed network). Every search returns `stats` (search steps, hub paths, distinct routes, rejections by rule, links skipped by rule).
- **Extras:** a `Balanced` label on the best-score route, `maxTravelTime` ("Max minutes" in the form), `preferredModes` (API: labels the best route that uses one).
- Simulator presets **MRT-6 suspended**, **MRT-6 delayed** and **Heavy rain south**, plus "Line not running" and "Delay line" controls.

Kept from the spec where the algorithm doc differs: bus ৳2.45/km (doc: 2.70), the spec's score formula (the doc's normalised score ranks almost the same), the `{ok, data, error}` envelope, an error for origin = destination, and two-way links (no directed services or operating hours).

### Routing (`router.js`). Spec §5.

1. **Paths.** A depth-first search lists every simple hub path of at most 6 edges, choosing a line for each edge.
2. **Legs.** Consecutive edges on the same line are merged into one leg.
3. **Time.** Each leg gets a boarding wait: bus 8 min, MRT 5 min, leguna 5 min, rickshaw 2 min. A transfer between legs adds a 4-minute walk.
4. **Filters.** `maxBudget`, `avoidHubs`, `avoidModes` and `maxTransfers` remove options.
5. **Labels.** Cheapest, Fastest and Fewest transfers each mark the true best option for that criterion; duplicates are merged.
6. **Sorting.** The default score is minutes + 0.4 × fare + 8 × transfers. The sort buttons (time, fare, transfers) override it.
7. **More options.** The next options by score are returned as `others`, for "ar kono option?".

Each option includes:
- `legs[]`, `totalMinutes`;
- `totalFareRegular`, `totalFareStudent`, `fareRangeLow` and `fareRangeHigh`;
- `transfers`, `warnings[]`, `boardingNotes[]`;
- the landmark note of each leg's boarding hub.

### Simulation (`sim.js`). Spec §6.

A scenario has the shape `{ rain: [hubIds], rainSeverity, rush, blocked: [hubIds], disabledLines, blockedEdges, delays }` (see above for the last four), and active alerts feed into it too.

- **Rush hour:** bus time ×1.5, rickshaw time ×1.3, MRT not slowed but flagged "crowded".
- **Rain at a hub:** for edges touching it, bus time ×1.4, rickshaw time ×1.3 and fare ×1.5. The MRT is unaffected because it is elevated.
- **Blocked hub:** every non-MRT edge touching it is broken, so a route can't pass through it, but it can still be the start or end of a trip.

The output has the route before and after, `brokenSegments[]`, a time and fare `delta`, and a templated explanation.

### Alerts (`alerts.js`, `sanity.js`). Spec §7.

**Confidence:**
- starts at user 0.35, AI-ingested 0.30, admin 0.90;
- each unique confirmation adds 0.20 and resets the verification time;
- each unique "clear" vote subtracts 0.30, and 2 such votes resolve the alert;
- effective confidence = base × 0.5^(minutes since last verified ÷ half-life). Half-lives: waterlogging 45 min, gridlock 30, blockade 60, construction 24 h.

**Status and effect on routing:**

| Effective confidence | Status | Effect |
|---|---|---|
| ≥ 0.60 | active | hard |
| 0.30–0.59 | unverified | soft: time ×1.25 |
| 0.15–0.29 | fading | none |
| < 0.15 | expired | hidden |

**Sanity rules:**
- **S1:** unrealistic fare submissions are flagged and left out of fare statistics.
- **S2:** a "clear" vote from another user within 10 simulated minutes marks the alert *disputed*, which takes it out of routing until a third vote or an admin decides.
- **S3:** a report naming an unknown hub or route is rejected.
- **S4:** more than 3 reports from one user in 10 minutes are throttled.
- **S5:** an uncorroborated severity-3 report older than 30 minutes is downgraded to severity 2.

Flagged items appear in the Admin moderation queue with the reason.

### Grounding (`ground.js`). Spec §8.4.

`groundRoute(plan)` checks that:
- every hub and line exists;
- every leg runs along real edges of its line;
- legs join up end to end;
- any claimed fare equals the engine fare (exact for bus, MRT and leguna; inside the range for rickshaw).

Every search option is grounded and shows a **"Verified against network ✓"** badge. The **"Test AI hallucination"** button in the footer sends the fake plan *"Bus 99 from Uttara to Banasree, 20 BDT"* through the check, and it is rejected.

### AI (`ai/`). Spec §8 and architecture doc §5–7.

- **Three jobs only:** P1 intent extraction, P2 alert extraction from messy posts, P3 explanation and Banglish phrasing; plus P4, a polite Banglish sentence for the conductor in Fare Truth. Prompts are in `ai/prompts.js`.
- **Reliability:** temperature 0, JSON mode, 4 s timeout, Gemini first and one retry on Groq, then the **demo cache** (6 scripted inputs), then the **rule parser**. The header badge shows **AI: live**, **AI: fallback (offline parser)** or **AI: offline parser** (no key); each chat answer shows its own AI mode.
- **Validation:** unknown hub IDs are dropped, unknown intents become `unknown`; a place the model dropped is filled from the rule parser (which only reads the text). P2 output with `isIncident: false` files nothing. P3/P4 text is rejected if it contains any number that is not in the engine's result.
- **Prompt injection:** pasted posts are wrapped in `<post>` tags and labelled as data (their own `<post>` tags are stripped); the model has no write access, only the code dispatcher does, and sanity rules still run. Only the last 6 turns plus the session context are sent.
- **No native function calling:** one JSON intent plus a `switch(intent)` dispatcher (`ai/chat.js`) calling the tool registry (`ai/tools.js`): `findRoutes`, `groundRoute`, `compareFares`, `checkClaimedFare`, `createAlert`, `resolveAlert`, `confirmAlert`, `getAlertReliability`, `getFareRules`, `simulate`, `roadStatus`, `watchTrip`. The chat shows a chip per call.

Chat intents: `route_search`, `fare_check`, `report_alert`, `alternatives`, `fare_rules_qa`, `alert_reliability_qa`, `confirm_alert`, plus `compare_fares`, `simulate` ("what if Science Lab e brishti hoy?"), `road_status`, `watch_trip`; follow-ups "ar kono option?", "student hole?", "why not metro?", "bhara koto?".

### Trust-aware "why" line (architecture doc task 14)

Every route card says which street reports shaped it and how much each was trusted, e.g. *"Avoids Science Lab: blockade confirmed (0.75, 3 reports)"*, *"Passes Mohakhali: unverified gridlock (0.55, 2 reports) → only +25% time, not trusted enough to block"*, *"Ignores fading report at Farmgate (0.19)"*.

### Street map (merged from the team's KoyJabo module)

KoyJabo (React 18 + react-leaflet) was merged as a **port**, not copied in: DhakaPath has no React or build step, npm is unavailable in the build environment, and KoyJabo's own `router.js` uses different data and fares (bus ৳2.70/km, lines A–F), which would have given the map and the chat different numbers. So DhakaPath's engine stays the only engine and KoyJabo's map was rewritten in plain JS on the same Leaflet version:

- `public/js/streetMap.js` (port of `MapView.jsx`): 14 hubs at KoyJabo's approximate coordinates (now `lat`/`lng` in `seed.json`, `coordsApprox: true`), A/B pins, permanent labels, popups with **Set as Start (A) / Destination (B)**, grey network links with per-service tooltips (red dashed when every service is out), route lines in KoyJabo's colours: **Cheapest #2563eb, Fastest #16a34a, Balanced #7c3aed, Backup #f97316 dashed**, sticky tooltips with fare, time, transfers and modes, a legend, "Show all 14 hubs / Focus route". In a simulation: usual route grey dashed, cut links red.
- `public/js/mapControls.js`: the **Fastest / Cheapest / Balanced / All three** selector (selects that engine option; All three draws the three plus the backup) and a **Street / Schematic** switch.
- Engine: KoyJabo's `allowedModes` (whitelist) and `singleModeOnly` (all legs one mode; CNG counts as rickshaw; walking is its own mode) are constraints in DhakaPath's engine, so the API, chat and UI share them. The UI keeps DhakaPath's six mode chips (CNG is separate in our spec) and adds a "Single mode only" box.
- Leaflet 1.9.4 is vendored in `public/vendor/leaflet/` (BSD-2, LICENSE included), loaded locally, never from a CDN. Tiles come from OpenStreetMap (free, attribution shown; mind the OSM tile usage policy for heavy traffic). Without tiles the vector map still works on a plain background with a note; without Leaflet the schematic SVG map is used.
- KoyJabo's CSS classes `.hub-marker`, `.hub-tooltip`, `.edge-tooltip`, `.pref-btn`, the popup and pin styles are in `styles.css`; its floating `.legend` is `.street-legend` here (DhakaPath already has `.legend`). KoyJabo's A/B markers used `origin-marker`/`dest-marker`, which its CSS never styled; they use its `.origin-pin`/`.dest-pin` styles here.
- `tests/koyjabo.test.js` ports `koyjabo/tests/engine.test.mjs` onto DhakaPath's engine. Two assertions assert the spec value instead and say so: the 8 km student bus fare (৳10 at 2.45/km; KoyJabo ৳11 at 2.70) and heavy rain (stops CNG/leguna here; KoyJabo suspends buses).

### Ride-share board and split bot (bonus 3)

`server/engine/rides.js`, `public/js/sharePanel.js`, **Share** tab. Commuters at the same hub post or join a shared rickshaw (2 seats) or CNG (3 seats) to the same destination. The split bot takes the engine's own fare range for that direct link under the conditions in force (rush / rain surge, current fare table) and divides it per rider, rounded **up** to whole taka so the riders never pay less than the total, and also shows the cost "if one more joins". Starting a share for a trip that already has an open one joins it instead of duplicating; a full share is hidden from others; leaving reopens it; posts expire after 20 simulated minutes; one open share per commuter; other commuters see only a rider count, never ids. A rickshaw/CNG leg in a route's fare table has "👥 Share this … and split the fare", which opens the tab prefilled. In chat: *"Shahbagh theke Science Lab rickshaw share korbo, amra 2 jon"* → `splitFare(SHA->SCI, rickshaw, 2 people)` + `rideBoard(SHA)`.

### Fare changes, caching and client error states

- **Fare tables are versioned** (`config.fares.version`, `effectiveFrom`, `source`). Admin → Fare chart edits every rate (bus, MRT, rickshaw, **CNG**, surge factors) or applies a **fuel-price adjustment %** to the bus/CNG/rickshaw per-km rates (MRT is set by the operator, so it is not adjusted by %). Each save bumps the version, records who/when/why and every `from → to` change in `fareHistory` (last 50, saved in `state.json`), and clears cached routes. Search, fare and Fare Truth responses carry `fareTable: {version, effectiveFrom}`; the route breakdown shows "Fare table vN". Community fare medians only count reports made under the current table. `GET /api/fares` publishes the table and recent changes (without admin ids).
- **Route cache** (`engine/cache.js`): results are keyed by trip, filters, conditions in force, alert *effects* and a network revision, so repeated searches, polls and Trip Watch re-checks reuse them (Mirpur→Motijheel: about 70 ms first time, 0.3 ms repeated; 10 watched trips per poll: 74 ms → 2 ms). Any network or fare edit, and Reset, clear it.
- **Client** (`public/js/api.js`, `util.js`): GETs time out after 8 s and retry once; writes time out after 15 s and are never retried automatically; a non-JSON reply is reported as such. Search and simulation buttons show a busy state, a double click sends one request, and a slow older response never overwrites a newer one. On a network failure the last results stay on screen with a Retry button; a banner says the connection was lost and "Back online" when it returns. Polls never overlap. An empty search box gets an example instead of silence.

### Hardening against bad data and bad requests

- **Coefficients** (`engine/config.js`): every config load (seed, `state.json` restore, tests, preview) goes through `sanitizeConfig`. Rush, rain and heavy-rain multipliers, board waits, transfer walk, ranking weights, alert multipliers and rush windows that are missing, non-numeric, zero or negative fall back to a safe value (multipliers to ×1, capped at ×10); each fix is listed in `GET /api/health` → `dataWarnings`. The router also re-checks every multiplier per link (`coef()`), so a NaN alert effect cannot leak in. A missing or non-numeric **fare table** stops the server at startup with `ConfigError` (we never invent a fare).
- **Link data:** a link with an unusable `km` or `minutes` is reported and never routed (`stats.linksPruned.bad_data`).
- **Fares** (`engine/fare.js`): km 0 → the minimum fare; missing/negative/non-numeric km, missing or unknown vehicle type, or a leguna with no flat fare → a leg marked **fare unknown** (never NaN, never a silent ৳0); such a route can't be labelled Cheapest and its budget status is `unknown`. Mode names like "Local Bus", "CNG", "MRT-6", "tempo" are understood. Amounts are shown as whole taka (`taka()`, `fmtRange()`; the x.5 rickshaw midpoint shows as ≈৳38).
- **Requests** (`engine/validate.js`, `middleware.js`): bodies must be JSON objects; `__proto__`/`constructor`/`prototype` keys and control characters are stripped. Origin/destination, budgets, transfers, minutes, times, modes, avoided hubs, scenarios and fare legs are type-checked and return **400** with `error.field` instead of being coerced or ignored. On the optional Express path an error handler returns the same envelope for invalid JSON (400), oversized bodies (413) and anything thrown (500), and async handlers are wrapped so rejections can't escape. Unhandled rejections are logged, not fatal.
- **Map** (`public/js/map.js`): the map is an SVG schematic (no tiles). Hubs whose position is missing or outside the map frame are left out with a note in the legend, along with any links and route lines touching them; if drawing fails the map shows a message while search, directions and fares keep working. If the network can't load, the page shows a Retry card instead of half-built panels.

### Reliability and security (architecture doc §9–10)

- **Response shape everywhere:** `{ok, data, error}`; no stack traces.
- **Commuters:** no login; the browser sends a random id as `X-User-Id` (used only to de-duplicate confirmations and rate-limit). `?demoUser=2` in the URL, or "Be someone else", acts as another commuter.
- **Admin:** password from `.env` → random bearer token kept in memory (expires on restart). All `/api/admin/*` routes except login require it.
- **Limits:** request body 10 KB, text 500 characters, 30 requests per minute per user on `/api/chat` and `/api/alerts*`.
- **Audit log:** logins, CRUD, moderation, alert actions, scenario changes, clock jumps, demo helpers (`GET /api/admin/audit`).
- **Logging:** one line per request and per LLM call (provider, ms, fallback). `LOG=off` silences it.
- **XSS:** user text is escaped or set with `textContent`. Keys stay in the server `.env`.

## REST API (spec §9 + architecture doc additions)

Every response is `{ok, data, error}`. Admin routes need `Authorization: Bearer <token>` from `POST /api/admin/login`.

| Method and path | Purpose |
|---|---|
| `GET /api/health` | `{ai: 'live' \| 'fallback' \| 'off', providers, lastCall, now, scenario}` |
| `GET /api/network` · `GET /api/browse` | Map data · commuter view (routes with metadata, hub status, disruptions) |
| `POST /api/search` | `{query}` or `{origin, destination, student, maxBudget, avoidHubs, avoidModes, maxTransfers, sort, departAt}` |
| `POST /api/fare` · `POST /api/fare/check` | Fares for given legs · Fare Truth verdict + conductor sentence |
| `POST /api/simulate` · `GET/PUT/DELETE /api/scenario` | Before/after/broken/delta · the global "what if" the whole app runs under |
| `GET /api/alerts?status=` · `POST /api/alerts` · `POST /api/alerts/ingest` | List · structured report · paste a post |
| `POST /api/alerts/:id/confirm` · `/resolve` | Corroborate · vote "clear" |
| `POST /api/chat` | `{sessionId, message}` → `{reply, data, grounded, aiMode, toolCalls, intent}` |
| `GET /api/clock` · `POST /api/clock/advance` · `POST /api/clock/speed` | Simulated clock (+15/+30/+90) |
| `POST /api/watch` · `GET /api/watch` · `POST /api/watch/:id/accept` · `DELETE /api/watch/:id` | Trip Watch |
| `GET /api/rides?hub=` · `GET /api/rides/quote?from&to&mode&people` · `POST /api/rides` · `POST /api/rides/:id/join` · `/leave` | Ride-share board and split bot (bonus 3) |
| `GET /api/fares` | Current fare table, version and recent changes |
| `POST /api/demo/seed-users` | Demo helper: two other commuters confirm an alert |
| `POST /api/ground-test` · `GET /api/card/:optionId` | Hallucination demo · offline card data |
| `POST /api/admin/login` | Password → token |
| `POST/PUT/DELETE /api/admin/routes[/:id]` | Lines; `{kind:'edge'}`, `{kind:'fares'}`, `{kind:'hub'}` (landmark notes) |
| `POST /api/admin/alerts/:id/moderate` · `GET /api/admin/queue` · `GET /api/admin/audit` · `POST /api/admin/reset` | Moderation · queue · audit log · restore seed + demo alerts |

The spec's `/api/fare` row was cut off in the document; `{legs, student}` is our reading of it.

## Demo script (spec §13)

1. **Search.** Use *"Dhanmondi theke Motijheel, student"* (the default trip): B4 direct, ৳10 for a student, with the regular-vs-student fare breakdown.
2. **Alerts.** Paste *"Science Lab e hatu pani!!"*: it is filed as unverified (0.30) and drawn as a dashed amber line. Press **Simulate 2 other users confirm** (or "Be someone else" + Confirm twice): it becomes 0.70 active, a solid red line, and route cards say *"Avoids Science Lab: waterlogging confirmed"*. Another person pressing "It's clear" within 10 minutes makes it *disputed* (S2).
3. **Simulate.** Choose **Science Lab flooded**: B4 is cut, the detour is B4→B6→B1 via Mohammadpur and Agargaon, +47 min and +৳20.
4. **Decay.** Press **+90 min**: the alert fades.
5. **Chat.** *"Farmgate bondho, onno route?"*, then *"student hole?"*, with the Verified ✓ badge on each answer.
6. **Grounding.** Use the footer link **Test AI hallucination**: the plan is rejected.
7. **Fare Truth.** The conductor asked ৳40: overcharge. Then **Offline card (PNG)**.

## Spec decisions taken (please confirm with the team)

- **Rain alone doesn't produce a detour.** In the Dhanmondi → Motijheel demo, the spec's rain multipliers only slow B4 (+4 min). The visible detour needs Science Lab *blocked* as well, which the preset "Science Lab flooded (rain + blocked)" does. An active waterlogging alert there has the same effect. "Rain at Science Lab" alone is kept as its own preset.
- **Meaning of a "hard" alert effect.** The spec says "edge broken/heavy penalty". Here, blockade, construction and waterlogging break road edges at the hub, and gridlock doubles the travel time.
- **Confirmations build on current confidence.** A confirmation adds 0.20 to the *current effective* confidence, not to the original base, so a stale alert doesn't jump back to its old value.
- **Values the spec doesn't give.** The leguna rush/rain multipliers, walk rain multiplier, leguna and rickshaw boarding waits, and metro and walk minutes for new admin-created lines are assumptions, marked `_assumption` in `config.json`.
- **Heavy rain stops CNG and leguna, not rickshaws.** Our assumption (small engines stall in waterlogging; rickshaws keep running). Change `conditions.heavyRain.blocksModes` if the team disagrees.
- **Student floor.** The 10 BDT minimum applies *after* the half fare: `max(10, ceil(regular/2))`, as the spec's §1 reading and examples say.

## Open items from spec §15

- [ ] Verify the bus rate, MRT-6 fares and rickshaw ranges, then update `config.json`.
- [ ] Confirm the student-floor reading.
- [ ] Write real landmark notes. Only Farmgate's note comes from the spec; the rest are marked `sample`.
- [ ] Put a Gemini or Groq key in `.env` and test `ai/llm.js` live. **So far it has only been tested with fake model responses.**
- [ ] If the team wants real Express: `npm install`, `USE_EXPRESS=1 npm start`, and re-run the checks (not possible in the build environment).
- [x] Tune the seed so the Dhanmondi → Motijheel demo gives a clear detour. Done using the "flooded" preset; see the decisions above.

## What was verified

**`npm test`: 85 tests, 85 pass** (Node 22.22.0), in the files the architecture doc names plus `algo.test.js`, `hardening.test.js`, `koyjabo.test.js`, `polish.test.js`, `chat2.test.js` (non-hub places like Gulshan reported with nearest hubs, never swapped silently; rush/rain inside a trip question change the quoted fare; "metro na niye"; hub-specific reliability; small talk) and `rides.test.js` (split maths, surge, rejections, board lifecycle, chat = API numbers, no ids exposed) and, in `polish.test.js` (fare adjustment and versions, invalid/no-op fare updates, version-aware medians, cache hits/invalidation and equality with the uncached engine, Trip Watch served from cache, gridlock everywhere, everything blocked, `/api/fares` and fare history across a restart):

- `fare.test.js`, `router.test.js`, `ground.test.js`: every spec §4 fare example; student floor at 3 and 5 km; all 182 hub pairs grounded; labels, sorting, the four constraints; MIR→MOT trade-off; blocked hub pass-through vs endpoint; the Dhanmondi→Motijheel flood detour; rush hour; fake line / fake edge / wrong fare rejected.
- `alerts.test.js`: the §7 decay walk-through (0, 45, 90, 135 min); same user counts once; hard/soft/fading effects on routing; S1–S5; resolution; moderation; Banglish/Bangla post extraction; simulation output.
- `parser.test.js`: the rule parser on Banglish/Bangla samples (incl. "what if" and compare); the dispatcher's tool chips; LLM output validation; **callLLM failover Gemini → Groq, 4 s timeout, and "off" with no keys**; chatTurn live / demo cache / rule fallback; explanation number check; `isIncident: false`; the `<post>` wrapping.
- `api.test.js` (real HTTP): the `{ok, data, error}` envelope on success and every error (400/401/404/413/429, invalid JSON); chat equals `/api/search`; X-User-Id de-duplication; demo helper; why line; admin token gate, CRUD, queue, audit log, reset; rate limits per user; health live → fallback; global scenario; clock +90; Fare Truth sentence; `state.json` persistence across a restart.
- `algo.test.js`: the routing-algorithm doc's checklist: the 10 × 1.3 + 3 = 16 min delay; most specific delay wins, never stacked; a line hold-up counted once per leg; disabled lines/links never selected (main, others or backup); heavy rain stops CNG only near the rain, metro unaffected; backup shares no service, survives the failure its trigger names, meets the filters, and is `null` when none exists (Mirpur→Motijheel at ৳40); within / might fit / over budget; all four no-route statuses; stats add up; identical runs give identical output; Balanced, max minutes, preferred modes; Bus A→Bus B is a transfer; simulator "MRT-6 suspended" switches to the planned backup; a temporary delay expires on the clock; the HTTP API for all of it.
- `hardening.test.js`: 15 kinds of corrupted coefficients under rush + heavy rain (no NaN or negative times); fare-table errors at startup; bad link data skipped; fare edge cases, aliases and rounding; unpriced legs never "Cheapest"; 20 malformed requests over real HTTP all return 400 with the right code; prototype pollution and control characters stripped; the Express error envelope and async wrapper; a hand-edited `state.json` repaired on restore and reported by `/api/health`. A separate fuzz run of 22 endpoints × 70 malformed bodies produced no 500s.
- `features.test.js`: CNG fares, rush from departure time, zone rain, browse view, landmark editing, Banglish directions, Trip Watch (ok → reroute → accept, slower in rush) and its endpoints.

**Browser checks** (headless Chromium, 1400 px dark and 390 px light): **104 of 104 pass**: search, NL search, fare breakdown, sorting, Fare Truth, offline card, why lines, AI badge, flood/rain/zone simulations and "Apply to the whole app", the alert flow with "Simulate 2 other users confirm", +90 min, admin login (wrong password refused), queue, CMS, audit log, reset, Network view, Banglish toggle, Trip Watch (toast → Show detour → Switch → Stop), the chat dock (Verified badge, tool chips, "why not metro?", "ei trip watch koro") and the hallucination test; no sideways scrolling, no console errors, no external requests, every API request carries X-User-Id. A further **34 of 34** cover the additions: backup block and tag, stats tooltip, max minutes, no-route category, "might fit" and "Fits ৳45", MRT-6 suspended → backup becomes the main route, custom line-down + delay (backup cut too), heavy rain, applying a line-down scenario app-wide; these also pass against the offline preview. **24 of 24** cover the fallbacks: corrupted hub positions (3 hubs skipped and named, no NaN in the SVG, search still works), `/api/network` down or malformed (Retry card, map message), a server error mid-search, and a server-side validation message from the form. **50 of 50** cover the street map: 14 markers and labels, A/B pins, Fastest/Cheapest colours and selected card, a route tooltip showing the engine's own minutes and fare, All three (all four colours, dashed backup), card click following the preference, hub popup → Set as Start, Single mode only, walking-only message with the map intact, simulation lines, Street/Schematic switch, tile-failure note, bad coordinates (3 hubs left out and named, no NaN), Leaflet missing (schematic only); 38 of them also pass against the offline preview. **31 of 31** cover client error states: empty search box, busy button and dimmed results, double click → one request, latest response wins, network down (last results kept, Retry, banner, back online), simulation Retry, at most one poll in flight against a slow server, admin +8% → fare table v2 shown in the breakdown; and a never-answering search gives up after 15 s with a message.

**Offline preview:** 20 of 20 checks pass from a static host and from `file://` (in-page engine, admin password `demo`).

**Not built:** Bonus 1 (signboard OCR). **Untested:** live Gemini/Groq calls (no key) and the `USE_EXPRESS=1` path (no npm access in the build environment). Saved state is a local JSON file; on hosts with an ephemeral disk (e.g. Render free tier) it resets on redeploy.
