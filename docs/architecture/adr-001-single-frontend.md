# ADR-001: One user-facing frontend (the vanilla-JS app in `public/`)

## Status
Accepted — 17 Oct 2026

## Context
- **Problem:** the repository shipped two user-facing apps that called the same `/api/*`: the
  vanilla HTML/CSS/ES-module app in `public/` (served at `/`) and a React 18 + Vite + react-leaflet
  port of the team's "KoyJabo" design in `frontend/` (built into `public/app/`, served at `/app/`).
  Two parallel UIs double the verification surface, the documentation, and the chance that a judge
  sees two different numbers for the same trip. The finalization plan requires exactly one primary
  app at `/`.
- **Constraints:** hackathon team, days not weeks; the deterministic engine in `server/engine` must
  stay the single source of truth; the demo must run with no AI key and ideally no `npm install`;
  the build environment used for this decision has **no npm registry access** (Vite, react-leaflet
  and React 18 could not be installed; only esbuild + React 19 were available globally).

## Options Considered

| Option | Pros | Cons | Complexity |
| ------ | ---- | ---- | ---------- |
| A. Keep both | No migration work | Two UIs to verify and document; features diverge (React had no Monsoon before/after, no ride-share, no best-time, no clock controls, no schematic fallback); README must explain two URLs | Low now, high forever |
| B. React + Leaflet as the only app at `/` | Bolder visual design out of the box; component model | Missing required journeys (no `POST /api/simulate`, i.e. no Monsoon Mode comparison; no `/api/browse`, `/api/rides`, `/api/best-time`, `/api/clock`); still imports a client-side `engine/router.js`; 936-line `AdminPortal.jsx`, 2 960-line stylesheet; **cannot be rebuilt in this environment** (react-leaflet/Vite unavailable), so every fix would be unverifiable; 25 browser checks vs 300+ | High |
| C. Vanilla app in `public/` as the only app at `/` (chosen) | Covers every required journey (search, Monsoon Mode before/after with engine deltas, Alert Ingestor with trust lifecycle, Fare Truth, Trip Watch, chat, admin); no build step, so `npm start` works on a fresh clone with nothing installed; 20 small modules (< 160 lines each); 322 existing headless-browser checks; works as a one-file offline preview | Visual design was plain and dense; mobile put the map at the bottom; needs a design pass | Medium (CSS/HTML, no logic change) |

## Decision
Keep the vanilla-JS app in `public/` as the **only** user-facing application, served at `/`.
Remove `frontend/`, the built `public/app/`, the `/app` SPA fallback in `server/http.js` and
`server/index.js`, `tools/bundle_react.py` and `tools/browser-checks/check10-react.cjs`, and the
React-specific documentation. Give the remaining app a design-system pass (tokens, typography scale,
spacing, map-first mobile layout, status chips with icons, loading/empty/error states) **without
changing the engine or the API**.

## Rationale
Feature completeness and verifiability decided it. Option B would have meant re-implementing the
Monsoon Mode comparison, ride-share, best-time and clock controls in React while being unable to
build or test the result here; the plan forbids claiming verification that did not happen. Option C
keeps the engine contract, the 300+ checks and the zero-install start, and the visual gap is a CSS
problem, which is cheap to close and easy to verify in a browser.

## Consequences
- **Positive:** one URL, one README, one set of checks; fresh clone starts with `npm start`;
  Leaflet stays vendored (BSD-2 licence kept in `public/vendor/leaflet/LICENSE`); no React/Vite
  supply chain to keep up to date.
- **Negative:** the KoyJabo visual identity is not carried over 1:1; contributors who prefer a
  component framework lose the React entry point.
- **Mitigation:** the map, route colours, A/B pins, labels and popups from KoyJabo were already
  ported into `public/js/streetMap.js`; the new stylesheet is organised as tokens + components so a
  future framework port has a documented design system to follow (`docs/UI-UX.md`).

## Revisit Trigger
- The team adopts a build step for other reasons (TypeScript, bundling), or
- a required journey becomes impossible to express cleanly in vanilla modules (e.g. shared state
  across many interdependent panels), or
- the UI grows past ~30 modules and the hand-wired `actions` registry in `store.js` becomes the
  main source of bugs.
