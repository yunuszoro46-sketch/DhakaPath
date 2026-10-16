// In-memory state (architecture doc §4): network, alerts, fare submissions, users, scenario, clock,
// audit log, watched trips. Persisted as one JSON snapshot by server/index.js. Pure JS (no Node APIs).
import { loadNetwork, checkScenario } from '../engine/network.js';
import { createStore } from '../engine/alerts.js';

const MIN = 60000;
export const DEFAULT_START = Date.UTC(2026, 9, 16, 6, 0);   // 12:00 Dhaka, off-peak (tests); the server starts at real time
const emptyScenario = () => ({ rain: [], blocked: [], rush: null, rainSeverity: 'light', disabledLines: [], blockedEdges: [], delays: [], label: null });

export function createState({ seed, config, start = DEFAULT_START, speed = 0, realNow = () => Date.now() } = {}) {
  if (!seed || !config) throw new Error('createState needs seed and config');
  const state = {
    seed, config, realNow,
    net: loadNetwork(seed, config),
    store: Object.assign(createStore(), { watches: [] }),     // alerts, queue, reportLog, fareReports (= fareSubmissions), watches
    users: {}, scenario: emptyScenario(), auditLog: [], registry: new Map(),
    clock: { simAnchor: start, realAnchor: realNow(), speed },  // simulated clock: simNow = anchor + elapsed real time × speed
    ai: { mode: 'off', lastProvider: null, lastMs: null, lastOk: null, calls: 0, fallbacks: 0 },
  };
  state.now = () => Math.round(state.clock.simAnchor + (state.realNow() - state.clock.realAnchor) * state.clock.speed);
  return state;
}

export function advanceClock(state, minutes) {
  const m = Number(minutes);
  if (!(m > 0 && m <= 24 * 60)) return { ok: false, error: 'invalid_minutes', message: 'minutes must be 1–1440' };
  const t = state.now() + m * MIN;
  state.clock.simAnchor = t; state.clock.realAnchor = state.realNow();
  return { ok: true, now: t, speed: state.clock.speed };
}

export function setSpeed(state, speed) {
  const s = Number(speed);
  if (!(s >= 0 && s <= 600)) return { ok: false, error: 'invalid_speed', message: 'speed must be 0–600' };
  const t = state.now(); state.clock = { simAnchor: t, realAnchor: state.realNow(), speed: s };
  return { ok: true, now: t, speed: s };
}

export function audit(state, actor, action, targetId = null, detail = null) {
  state.auditLog.push({ at: state.now(), actor: actor || 'anon', action, targetId, ...(detail ? { detail } : {}) });
  if (state.auditLog.length > 1000) state.auditLog.splice(0, state.auditLog.length - 1000);
}

export function touchUser(state, id, role = 'commuter') {
  if (!id) return null;
  const u = state.users[id] || (state.users[id] = { id, role, firstSeen: state.now(), requests: 0 });
  u.requests++; u.lastSeen = state.now(); if (role === 'admin') u.role = 'admin';
  return u;
}

export function setScenario(state, sc) {
  const r = checkScenario(state.net, sc, state.now());
  if (!r.ok) return r;
  state.scenario = r.scenario;
  return { ok: true, scenario: state.scenario };
}
export function clearScenario(state) { state.scenario = emptyScenario(); return { ok: true, scenario: state.scenario }; }

export function snapshot(state) {
  const { hubs, lines, edges, config } = state.net;
  return { version: 2, clock: { simNow: state.now(), speed: state.clock.speed }, net: { hubs, lines, edges, config }, store: state.store,
    users: state.users, scenario: state.scenario, auditLog: state.auditLog };
}

export function restore(state, s) {
  if (!s || s.version !== 2 || !s.net || !s.store) return false;
  Object.assign(state.net, loadNetwork(s.net, s.net.config));   // re-checked: a hand-edited state.json cannot inject bad coefficients
  Object.assign(state.store, s.store);
  state.users = s.users || {}; state.scenario = { ...emptyScenario(), ...(s.scenario || {}) }; state.auditLog = s.auditLog || [];
  const simNow = Math.max(Number(s.clock && s.clock.simNow) || 0, state.now());
  state.clock = { simAnchor: simNow, realAnchor: state.realNow(), speed: s.clock ? s.clock.speed : state.clock.speed };
  return true;
}

// Back to seed data (objects are mutated in place so every holder of a reference sees the reset).
export function resetState(state) {
  const fresh = loadNetwork(state.seed, state.config);
  for (const k of Object.keys(state.net)) delete state.net[k];
  Object.assign(state.net, fresh);
  for (const k of Object.keys(state.store)) delete state.store[k];
  Object.assign(state.store, createStore(), { watches: [] });
  state.users = {}; state.scenario = emptyScenario(); state.registry.clear();
  return { ok: true };
}
