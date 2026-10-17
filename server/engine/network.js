// Network lookups (pure). Seed data and config are passed in (see store/seedData.js), so this
// module runs unchanged in Node, in tests and in the offline browser preview.
// SEED DATA, NOT OFFICIAL: see the _notice fields and the VERIFY items in config.json.

import { sanitizeConfig, MODES as ALL_MODES } from './config.js';
import { checkScenarioShape } from './validate.js';

export const MODES = ALL_MODES;
export const RANGE_MODES = ['rickshaw', 'cng'];
export const DEMO_NOTICE = 'Seed data, not official: distances, times and fares are illustrative and configurable in config.json.';

// Config is checked by sanitizeConfig (engine/config.js): bad coefficients fall back and are listed in
// net.configWarnings; a missing fare table throws ConfigError. Links with unusable km/minutes are
// listed too, and the router never uses them (edgeUsable).
export function loadNetwork(seed, config) {
  const s = JSON.parse(JSON.stringify(seed));
  const { config: cfg, warnings } = sanitizeConfig(config);
  const net = { hubs: s.hubs || [], lines: s.lines || [], edges: s.edges || [], config: cfg };
  const offMap = net.hubs.filter((h) => !(Number.isFinite(h.x) && Number.isFinite(h.y) && h.x >= -60 && h.x <= 1060 && h.y >= -30 && h.y <= 620));
  net.configWarnings = [...warnings, ...offMap.map((h) => `hub ${h.id}: map position ${JSON.stringify([h.x, h.y])} outside the map frame; routing is unaffected, the map leaves it out`),
    ...net.edges.filter((e) => !edgeUsable(e)).map((e) => `edge ${e.id}: km ${JSON.stringify(e.km)} / minutes ${JSON.stringify(e.minutes)} not usable; link skipped by the router`)];
  return net;
}

// A link is only routable with a real distance and travel time.
export const edgeUsable = (e) => !!e && typeof e.km === 'number' && typeof e.minutes === 'number' && Number.isFinite(e.km) && Number.isFinite(e.minutes) && e.km >= 0 && e.minutes > 0 && e.km < 1000 && e.minutes < 1000;

export const hub = (net, id) => net.hubs.find((h) => h.id === id) || null;
export const line = (net, id) => net.lines.find((l) => l.id === id) || null;
export const hubName = (net, id) => (hub(net, id) || { name: id }).name;

// adjacency: hubId -> [{ edge, to }]
export function adjacency(net, { includeInactive = false } = {}) {
  const adj = new Map(net.hubs.map((h) => [h.id, []]));
  for (const e of net.edges) {
    const l = line(net, e.line);
    if (!l || (!includeInactive && l.status !== 'active') || !adj.has(e.from) || !adj.has(e.to)) continue;
    adj.get(e.from).push({ edge: e, to: e.to });
    adj.get(e.to).push({ edge: e, to: e.from });
  }
  return adj;
}

// Validate and normalise a scenario (global, simulated or per-request). Delays may carry
// forMinutes (converted to an `until` timestamp with `now`) so temporary overrides expire.
export function checkScenario(net, sc, now = null) {
  if (sc == null) sc = {};
  const shape = checkScenarioShape(sc);
  if (!shape.ok) return shape;
  const hubIds = new Set(net.hubs.map((h) => h.id)), lineIds = new Set(net.lines.map((l) => l.id)), edgeIds = new Set(net.edges.map((e) => e.id));
  const arr = (v) => (Array.isArray(v) ? v : []);
  const badHubs = [...arr(sc.rain), ...arr(sc.blocked)].filter((h) => !hubIds.has(h));
  const bad = [...arr(sc.disabledLines).filter((l) => !lineIds.has(l)).map((l) => `line ${l}`), ...arr(sc.blockedEdges).filter((e) => !edgeIds.has(e)).map((e) => `link ${e}`)];
  const delays = [];
  for (const d of arr(sc.delays).slice(0, 20)) {
    const target = !d || typeof d !== 'object' ? null : d.edgeId ? (edgeIds.has(d.edgeId) && { edgeId: d.edgeId }) : d.line ? (lineIds.has(d.line) && { line: d.line }) : d.hub ? (hubIds.has(d.hub) && { hub: d.hub }) : null;
    if (!target) { bad.push(`delay target ${(d && (d.edgeId || d.line || d.hub)) || '(none)'}`); continue; }
    const rate = d.rate == null || d.rate === '' ? 0 : Number(d.rate), extra = d.extraMinutes == null || d.extraMinutes === '' ? 0 : Number(d.extraMinutes);
    if (!(rate >= 0 && rate <= 5) || !(extra >= 0 && extra <= 180)) { bad.push('delay values (rate 0–5, extraMinutes 0–180)'); continue; }
    const until = d.until != null ? Number(d.until) : d.forMinutes != null && now != null ? now + Number(d.forMinutes) * 60000 : null;
    delays.push({ ...target, rate, extraMinutes: extra, label: d.label ? String(d.label).slice(0, 60) : null, until: Number.isFinite(until) ? until : null });
  }
  if (sc.rainSeverity != null && !['light', 'heavy'].includes(sc.rainSeverity)) bad.push('rainSeverity (use light or heavy)');
  if (badHubs.length && !bad.length) return { ok: false, error: 'unknown_hub', message: `Unknown hub(s): ${badHubs.join(', ')}` };
  if (badHubs.length || bad.length) return { ok: false, error: 'invalid_scenario', message: `Unknown or invalid: ${[...badHubs.map((h) => `hub ${h}`), ...bad].join(', ')}` };
  return { ok: true, scenario: { rain: [...new Set(arr(sc.rain))], blocked: [...new Set(arr(sc.blocked))], rush: typeof sc.rush === 'boolean' ? sc.rush : null,
    rainSeverity: sc.rainSeverity === 'heavy' ? 'heavy' : 'light', disabledLines: [...new Set(arr(sc.disabledLines))], blockedEdges: [...new Set(arr(sc.blockedEdges))], delays,
    label: sc.label ? String(sc.label).slice(0, 80) : null } };
}

// the edge of `lineId` that joins a and b (either direction)
export function lineEdge(net, lineId, a, b) {
  return net.edges.find((e) => e.line === lineId && ((e.from === a && e.to === b) || (e.from === b && e.to === a))) || null;
}

// stops between a and b along a line, inclusive, or null when the line does not run a→b
export function lineSegment(net, lineId, a, b) {
  const l = line(net, lineId);
  if (!l) return null;
  const i = l.stops.indexOf(a), j = l.stops.indexOf(b);
  if (i < 0 || j < 0 || i === j) return null;
  const seg = i < j ? l.stops.slice(i, j + 1) : l.stops.slice(j, i + 1).reverse();
  for (let k = 0; k < seg.length - 1; k++) if (!lineEdge(net, lineId, seg[k], seg[k + 1])) return null;
  return seg;
}
