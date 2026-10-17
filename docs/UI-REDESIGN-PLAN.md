# DhakaPath UI/UX redesign plan (v2 "Night Route")

Status: plan, not yet executed. Written 17 Oct 2026 against the finalized tree (single vanilla frontend, ADR-001).
Executor: read this whole file, then `docs/UI-UX.md`, `public/styles.css`, `public/index.html`, `tools/browser-checks/README.md` before touching anything.

## 0. Ground rules (non-negotiable)

1. **Engine is frozen.** No changes under `server/` except static serving if a new vendored asset folder needs it. Every number on screen still comes from the API.
2. **Zero-install stays.** `npm start` on a fresh clone must work with no `npm install`. No frameworks, no build step for the app. Fonts and icons are vendored files under `public/vendor/` with their licences.
3. **Honesty labels stay word-for-word in the DOM**: seed-data notice, "official source / estimate" badges, "against the estimated range", "Verified against network", confidence marks, "counts once", "approximate area centres". They may move or collapse; they may not disappear.
4. **Selectors are a contract.** 302 + 62 browser checks and the JS modules use ids, `data-tab`, `data-p`, `data-act` and class names. Before renaming anything, grep `public/js` and `tools/browser-checks`. Prefer re-styling and re-parenting over renaming. When a check asserts the *old layout on purpose* (e.g. check11 "phone: map comes before the panels"), update the check in the same commit and say why in the commit message.
5. **Every phase ends green**: `npm test` (96), check3–9 (302), check11-ui (62, updated), fuzz (0 failures), `npm run preview` + static2 (20). Report real numbers only.
6. **Every phase ends with a full clickable preview** (the owner's standing request): `npm run preview`, then publish `dist/dhakapath-preview.html` as an artifact (same URL each phase) plus 1440 / 390 screenshots in dark and light.

## 1. What is wrong today (audit of the current screens)

The engine, map and features are strong. The interface reads as a generic admin dashboard:

| Problem | Where | Effect |
|---|---|---|
| Form wall: NL box + 8 fields + preference segmented control + "Avoid" before any result | Search tab | The answer (the routes) starts below the fold at 1440×900 |
| Two competing search inputs (Banglish box and From/To form) | Search tab | Unclear which one to use |
| Everything is the same rounded card with the same border | All panels | No hierarchy; "SaaS card kit" look |
| Map is a 360 px box with dead space under it on desktop | Map column | The best asset is the smallest thing on screen |
| Header crowded: clock, +15/+30/+90, AI badge, Server, Light, Chat | Header | Noise; wraps on phones |
| Full-width yellow seed-data banner | Top | Eats the hero; reads as an error |
| Six equal tabs incl. Admin; tabs scroll sideways on phones (Share/Admin hidden) | Nav | Admin is promoted to a primary tab; hidden tabs on mobile |
| Route cards show a tag soup (Cheapest, Fastest, Fewest transfers, Balanced, Verified) | Results | The one fact that matters (time, fare, how) is not dominant |
| Emoji as icons (👁 🔊 ⏰ 💬 📍 🚦) | Detail, chat | Inconsistent rendering across OSes |
| Bangla only appears as a suffix in selects | Everywhere | The product is for Dhaka; the language is an afterthought |
| Chat button overlaps the Search button on phones | 390 px | Tap collisions |
| System font only | Everywhere | No identity |

## 2. Reference: KoyJabo (koyjabo.com) — what to borrow, what not to

Could not render the live site from the build sandbox (network blocked); the notes below come from its page text and metadata. Owner may attach screenshots for a closer visual read.

Borrow (patterns, not visuals):
- **From / To first.** The page is the search. Two fields, swap, go. Options are secondary.
- **Bilingual headings** pairing Bangla and English ("ঢাকার স্মার্ট বাস রুট ফাইন্ডার"), Bangla treated as a first-class script.
- **Deep night-navy chrome** (their theme colour is #040814): a transit-at-night mood instead of neutral grey.
- **Clear loading copy** in Bangla ("আপনার রুট লোড হচ্ছে…").
- Stop lists and fares presented together per route.

Do not copy: their logo, wordmark, layout, colours beyond the general "dark navy" mood, copy, or any data. Do not add features they claim that we cannot verify (live GPS tracking, intercity, freight). "Use my location" is allowed only as "nearest hub to me" computed client-side from the browser's geolocation against our 14 hub coordinates, clearly labelled approximate, and only if time allows (Phase 3 stretch).

DhakaPath keeps what KoyJabo does not have: Monsoon Mode before/after, Alert Ingestor with trust states, Fare Truth, Trip Watch, best time, ride-share, honest official vs estimate labels. The redesign should make these *feel* like product features, not tabs.

## 3. Design direction

**Concept: "Night Route".** The map is the stage, the journey is a ticket. Dhaka at night: deep ink-navy, MRT signal green, mode colours as the only colour noise. One bold element; everything else quiet.

**The one memorable element: the journey ticket.** Each route option is a ticket: a large signage-style plate (`38 min` · `৳45–60`) and a horizontal **journey strip** where each leg is a segment sized by its minutes and coloured by mode (MRT-6 violet, bus blue, rickshaw amber...), with transfer dots between. You read the route shape before you read any text. The same strip appears in the Monsoon before/after view and on the offline card.

UI/UX Pro Max note: in this environment the skill ships only its SKILL.md (no `scripts/search.py`, no database). Its workflow (design system first → CSS variables → dark override → UX checks) is applied by hand below. `using-ui-stack` rules (8 px grid, 60-30-10, 1.25 type scale, 5-state controls, z-index scale, 44 px targets) are applied directly.

### 3.1 Colour tokens (60 neutral / 30 brand navy / 10 signal green)

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `--bg` | `#0A1020` night ink | `#F4F6FA` | page, map surround |
| `--surface` | `#101A2E` | `#FFFFFF` | panels, sheet |
| `--surface-2` | `#17233A` | `#EEF2F7` | inputs, segmented controls |
| `--line` | `#23314C` | `#DCE2EB` | dividers |
| `--ink` | `#E8EDF5` | `#0E1626` | text |
| `--muted` | `#93A0B8` | `#56627A` | secondary text (check ≥4.5:1) |
| `--accent` | `#1DB57A` signal green | `#0B7A52` | primary action, selected route, focus fill |
| `--accent-ink` | `#04130C` | `#FFFFFF` | text on accent |
| `--focus` | `#8EC5FF` | `#1D4ED8` | focus ring |
| semantic ok/warn/bad/info | keep current values, re-check contrast on new surfaces | keep | status chips |
| mode colours | keep current `--metro --bus --leguna --rickshaw --cng --walk` | keep | map lines, journey strip, mode plates |
| route-kind colours | keep (Cheapest blue, Fastest green, Balanced purple, Backup orange dashed) | keep | map only |

No pure black. Every token defined for both themes; `prefers-color-scheme` respected; the toggle still writes `data-theme`.

### 3.2 Type

- **UI and Bangla: Hind Siliguri** 400/500/600 (SIL OFL; covers Bangla + Latin, so mixed lines share one rhythm).
- **Plates and figures: Barlow Semi Condensed** 600/700 with tabular figures (SIL OFL; road-signage feel) for minutes, taka, clock, route numbers only.
- Self-host woff2 in `public/vendor/fonts/` with `OFL.txt`; `font-display: swap`; Latin + Bengali subsets only. If the files cannot be fetched in the build environment, keep the current system stack and say so — do not hot-link a font CDN (offline demo).
- Scale (ui-stack 1.25): 12 / 14 / 16 (base, up from 15) / 18 / 20 / 24 / 30 / 36. Plate numbers 30–36. Body line-height 1.5; Bangla line-height 1.6.

### 3.3 Space, shape, depth, motion

- 8 px grid: 4 / 8 / 16 / 24 / 32 / 48. Migrate today's 12 / 20 / 28 values.
- Radius hierarchy instead of one radius everywhere: sheet/drawer 20, card 12, control 10, chip pill, map controls 10.
- Shadows only on things that float (sheet, drawer, map controls, popovers, toasts). Panels on the page are flat, separated by space and hairlines.
- Z-index scale: dropdown 10, sticky 20, overlay 30, modal/drawer 40, toast 50, tooltip 60. Leaflet panes stay below 10 (scope them).
- Motion, one orchestrated moment: on a new search the selected route draws onto the map (stroke-dashoffset, 400 ms ease-out) while the ticket strip fills left to right. Everything else 150–200 ms state changes only. All of it off under `prefers-reduced-motion`.
- 5 states on every control (default, hover, active, focus-visible ring, disabled). Touch targets ≥44 px.

### 3.4 Icons

Replace emoji with one vendored inline SVG sprite (Lucide, ISC licence) at `public/vendor/icons/sprite.svg`: search, swap, mic, clock, eye (watch), volume (read aloud), download (offline card), alarm (best time), message (chat), map-pin, alert-triangle, cloud-rain (Monsoon), users (share), shield (admin), sun/moon, layers (street/schematic), info. Mode glyphs as small text plates ("MRT", "Bus", "Rick", "CNG", "Leg", "Walk") so they never rely on colour alone.

## 4. Layout

### Desktop ≥1100 px

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◆ DhakaPath ঢাকাপথ   Plan · Network · Monsoon · Alerts(1) · Share   ⏱19:04▾  ●AI  ☾  [Ask] │
├────────────────────────┬─────────────────────────────────────────────────┤
│ JOURNEY PANEL (400px)  │                                                 │
│ কোথা থেকে · From  ○──┐ │   [Fastest|Cheapest|Balanced|All]   [Street|Map] │
│ কোথায় · To       ●──┘⇅│                                                 │
│ Student ✓ · Leave now ·│               MAP = THE STAGE                   │
│ Any budget  [Options]  │              (fills the viewport)               │
│ [ Find routes ]        │                                                 │
│ ─────────────────────  │                                                 │
│ ┌ TICKET (selected) ─┐ │                                                 │
│ │ 38 min   ৳45–60    │ │                                                 │
│ │ ███Bus███▌Rick▐MRT │ │                                     legend ▾    │
│ └────────────────────┘ │                                                 │
│ ticket · ticket        │                                                 │
├────────────────────────┴─────────────────────────────────────────────────┤
│ Seed data, not official — details                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

- Panel scrolls on its own; the map is sticky and fills the remaining width and height.
- Other tabs (Network, Monsoon, Alerts, Share) render in the same panel; Admin moves to an overflow menu (shield icon) in the header — still a real `[data-tab=admin]` button.
- Chat becomes a right-side drawer opened from the header "Ask" button.
- Header clock: one control showing the time; +15 / +30 / +90 live in its popover. AI mode and server state collapse into one status dot with a popover giving the full text.
- Seed-data notice: a slim bottom strip (full text present, link to README limitations) plus a one-time dismissible callout on first visit. Never removed.

### Tablet 700–1099 px
Same as desktop with a 360 px panel; map controls wrap into one row.

### Phone <700 px

```
┌──────────────────────┐
│ ◆ DhakaPath   ⏱ ☾    │
│                      │
│   MAP  (46vh)        │  map first (keeps the check)
│  [Fast|Cheap|Bal|All]│
╞══════ ▬▬ ════════════╡  sheet overlaps map by 16px, grab-handle look
│ কোথা থেকে · From      │
│ কোথায় · To        ⇅  │
│ [ Find routes ]      │
│ tickets…             │
│                      │
├──────────────────────┤
│ Plan Net Rain Alerts Share │  fixed bottom nav, 5 items, icons + labels
└──────────────────────┘
```

- Bottom nav replaces the sideways-scrolling tabs (nothing hidden). Admin lives in the header overflow. Chat is a full-screen sheet from a header icon, so no floating button collides with content.
- Draggable bottom sheet (peek / half / full) is a **stretch** item in Phase 5, behind a feature check, only if all checks stay green.

## 5. Component specs

**Journey composer (Plan).** Stacked From/To with the connector line (○ origin, ● destination) and swap button. Bilingual labels. The Banglish sentence box becomes a single "Type it instead / লিখে বলুন" row with the mic, above From/To, collapsed to one line. Filters (student, budget, max transfers, max minutes, leave at, preference, avoid) become a row of value chips ("Student ✓", "Leave 12:00", "Any budget") that open an Options disclosure. Primary button full-width "Find routes / রুট খুঁজুন". Keep every existing input id inside the disclosure.

**Ticket (route option).** One kind label (the reason it is shown, e.g. "Cheapest"); other kinds as a quiet "also fastest" line. Plate row: minutes, taka range, transfers. Journey strip. "Verified against network" stays as a small text line with check glyph. Alerts on route as one warn line. Selected: accent left border + raised surface + map highlight; `aria-pressed` kept.

**Route detail.** Sections with hairline dividers, not nested cards: Steps (numbered because they are a sequence; English/Banglish toggle), Why this route, Fare table (sticky first column on phones), Fare sources, Alerts, then an action bar with icon buttons: Watch, Read aloud, Offline card, Best time.

**Network.** Line list grouped by mode with mode plates; hub search; "approximate area centres" note kept.

**Monsoon (Simulate).** Presets as large illustrated choice chips (cloud-rain, road-block). Result: two tickets side by side (before / after) with the three delta tiles between them; "Apply to the whole app" as a secondary button with its explanation.

**Alerts.** Ingestor input on top with example chips; list as a timeline: status chip (glyph + word) · place · type · age, confidence bar with 0.30 / 0.60 marks, meta line in words, actions. Trust states get distinct but quiet colours.

**Share, Fare Truth, Watch toasts, Admin.** Restyle to the system; Fare Truth verdict as a large verdict line with the basis badge directly under it.

**Empty / loading / error.** Every panel: one-line instruction empty state with an icon; skeleton tickets while searching (bilingual loading line "রুট খোঁজা হচ্ছে… Finding routes…"); errors say what happened and what to do.

## 6. Phases

Each phase = one commit (or a few), all suites green, preview published, screenshots.

| Phase | Scope | Main files | Gate |
|---|---|---|---|
| **P0 Baseline** | Script that lists every id/class/data-attr used by `public/js` and `tools/browser-checks` → `docs/ui-contract.txt`. Baseline screenshots 1440/1024/390/360 × dark/light. Confirm fonts and Lucide can be fetched; if not, record the fallback. | new `tools/ui-contract.mjs` | all suites green, contract file committed |
| **P1 Tokens & type** | New tokens, fonts, icon sprite, 8 px grid, radius hierarchy, 5-state controls, z-index scale. No layout change. Emoji → icons. | `styles.css`, `index.html`, `public/vendor/fonts`, `public/vendor/icons`, JS that renders emoji | suites green; contrast script passes |
| **P2 App shell** | Header (time popover, status dot, overflow Admin, Ask), desktop map-stage layout, phone bottom nav, seed-data strip + first-visit callout, chat drawer. | `index.html`, `styles.css`, `main.js`, `clockBar.js`, `chatDock.js` | check11 updated for new shell; all green |
| **P3 Plan & tickets** | Journey composer, option chips + disclosure, ticket with journey strip, route detail sections, skeleton loading, route-draw motion. Stretch: "nearest hub to me". | `searchPanel.js`, `fareBreakdown.js`, `styles.css` | new checks: ticket strip segment widths ∝ leg minutes; first ticket above the fold at 1440×900 |
| **P4 Secondary panels** | Network, Monsoon (side-by-side tickets), Alerts timeline, Share, Fare Truth, Watch toasts, Admin. Bilingual headings. | the panel JS files, `styles.css` | all green; empty states present |
| **P5 Map polish** | Floating map controls, collapsible legend, marker/label styling for both themes, light-map tuning, schematic map restyle. Stretch: draggable phone sheet. | `streetMap.js`, `map.js`, `mapControls.js`, `styles.css` | check6 green; no label clipping at 360 |
| **P6 QA & ship** | Contrast audit both themes, keyboard walk-through, reduced motion, 320 px, overflow, console clean, a fresh-eyes review by a separate agent that has not seen the work, README screenshots + `docs/UI-UX.md` design-system section rewritten, push to GitHub. | docs, screenshots | all suites green; review findings fixed or listed |

## 7. Acceptance criteria (measured, not judged)

- 1440×900, default search: the first ticket's plate (minutes and fare) is above the fold; map ≥ 60% of viewport width. (Revised during execution: the plan first said "ticket top above 600 px"; adding the KoyJabo-style sort chips and a larger heading pushed the ticket to about 700–740 px, so the check now asks for the plate, which is what a commuter needs to see.)
- 390×844: From, To and "Find routes" visible without scrolling past the map; nothing hidden behind horizontal scroll; no floating element over a tappable control.
- Text contrast ≥ 4.5:1 (≥3:1 for ≥24 px) in both themes for every token pair actually used; script in `tools/` checks it.
- All interactive elements ≥ 44×44 px on phones; visible focus ring everywhere; full keyboard path through Plan → ticket → detail → Watch.
- 0 console errors; no horizontal overflow at 320 / 360 / 390 / 768 / 1024 / 1440.
- `styles.css` stays one file; app JS total grows < 15%; vendored fonts ≤ 250 KB total.
- Every honesty label from §0.3 still present (grep check added to check11).
- Test totals reported from real runs.

## 8. Risks

| Risk | Mitigation |
|---|---|
| DOM restructuring breaks 300+ checks | Selector contract (P0); re-parent instead of rename; fix checks in the same commit only when the old layout is asserted on purpose |
| Fonts/icons cannot be downloaded in the sandbox | System-stack fallback documented; ask the owner to attach the woff2 files |
| Map-as-stage hurts Leaflet sizing | `invalidateSize()` on layout and tab changes; check6 covers it |
| Scope creep into features | Features frozen; only "nearest hub" stretch, labelled approximate |
| Visual drift from KoyJabo copying | Borrow patterns only (§2) |
