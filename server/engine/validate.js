// Input guards for trip, simulation, fare and watch requests (pure; used by the engine, so the REST
// routes, the chat tools and the offline preview all get the same checks). Each returns
// { ok: true } or { ok: false, error, message, field } — the routes turn that into HTTP 400.
// Rule: a value of the wrong type is rejected, never silently coerced or ignored.

import { MODES } from './config.js';

const SORTS = ['score', 'time', 'fare', 'transfers'];
const bad = (field, message, error = 'invalid_field') => ({ ok: false, error, field, message });
const empty = (v) => v === undefined || v === null || v === '';
const isNum = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
// list fields accept an array of strings or one comma-separated string
const listOf = (v) => (empty(v) ? [] : Array.isArray(v) ? v : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);

// Free-text place: a non-empty string of at most 100 characters (hub id, name, alias or Bangla).
export function checkPlace(v, field) {
  if (empty(v) || (typeof v === 'string' && !v.trim())) return bad(field, `${field} is required (a hub name such as "Mirpur").`, 'missing_field');
  if (typeof v !== 'string') return bad(field, `${field} must be text, e.g. "Mirpur".`);
  if (v.length > 100) return bad(field, `${field} is too long (100 characters max).`);
  return { ok: true };
}

// q: the trip query; resolve(text) -> hubId | null. needEnds: origin and destination required.
export function checkTripInput(q, resolve, { needEnds = true } = {}) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return bad('body', 'Send a JSON object.', 'invalid_body');
  if (needEnds) for (const f of ['origin', 'destination']) { const r = checkPlace(q[f], f); if (!r.ok) return r; }
  if (!empty(q.student) && ![true, false, 'true', 'false'].includes(q.student)) return bad('student', 'student must be true or false.');
  if (!empty(q.maxBudget) && !(isNum(q.maxBudget) && Number(q.maxBudget) >= 0 && Number(q.maxBudget) <= 100000)) return bad('maxBudget', 'maxBudget must be a number of taka between 0 and 100000.', 'invalid_budget');
  if (!empty(q.maxTransfers) && !(isNum(q.maxTransfers) && Number.isInteger(Number(q.maxTransfers)) && Number(q.maxTransfers) >= 0 && Number(q.maxTransfers) <= 5)) return bad('maxTransfers', 'maxTransfers must be a whole number from 0 to 5.');
  if (!empty(q.maxTravelTime) && !(isNum(q.maxTravelTime) && Number(q.maxTravelTime) > 0 && Number(q.maxTravelTime) <= 600)) return bad('maxTravelTime', 'maxTravelTime must be minutes between 1 and 600.', 'invalid_time');
  if (!empty(q.sort) && !SORTS.includes(q.sort)) return bad('sort', `sort must be one of ${SORTS.join(', ')}.`);
  if (!empty(q.departAt) && !(typeof q.departAt === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(q.departAt.trim()))) return bad('departAt', 'departAt must be a time like "08:30".');
  if (!empty(q.requireMode) && !MODES.includes(q.requireMode)) return bad('requireMode', `requireMode must be one of ${MODES.join(', ')}.`, 'invalid_mode');
  if (!empty(q.singleModeOnly) && ![true, false, 'true', 'false'].includes(q.singleModeOnly)) return bad('singleModeOnly', 'singleModeOnly must be true or false.');
  for (const f of ['avoidModes', 'preferredModes', 'allowedModes']) {
    const l = (listOf(q[f]) || null) && listOf(q[f]).map((m) => (m === 'walking' ? 'walk' : m));
    if (!l || l.some((m) => typeof m !== 'string' || !MODES.includes(m))) return bad(f, `${f} must be a list from ${MODES.join(', ')}.`, 'invalid_mode');
  }
  const avoid = listOf(q.avoidHubs);
  if (!avoid || avoid.some((h) => typeof h !== 'string' || h.length > 100)) return bad('avoidHubs', 'avoidHubs must be a list of hub names.');
  const unknown = avoid.filter((h) => !resolve(h));
  if (unknown.length) return bad('avoidHubs', `Unknown hub(s) in avoidHubs: ${unknown.join(', ')}.`, 'unknown_hub');
  if (!empty(q.scenario) && typeof q.scenario !== 'string' && (typeof q.scenario !== 'object' || Array.isArray(q.scenario))) return bad('scenario', 'scenario must be an object or a preset name.', 'invalid_scenario');
  return { ok: true };
}

// Scenario field types (values are checked against the network by checkScenario in network.js).
export function checkScenarioShape(sc) {
  if (!sc || typeof sc !== 'object' || Array.isArray(sc)) return bad('scenario', 'scenario must be an object or a preset name.', 'invalid_scenario');
  for (const f of ['rain', 'blocked', 'rainZones', 'disabledLines', 'blockedEdges']) {
    if (!empty(sc[f]) && !(Array.isArray(sc[f]) && sc[f].every((x) => typeof x === 'string'))) return bad(`scenario.${f}`, `scenario.${f} must be a list of ids.`, 'invalid_scenario');
  }
  if (!empty(sc.delays) && !(Array.isArray(sc.delays) && sc.delays.every((d) => d && typeof d === 'object' && !Array.isArray(d)))) return bad('scenario.delays', 'scenario.delays must be a list of {line|edgeId|hub, rate, extraMinutes}.', 'invalid_scenario');
  if (!empty(sc.rush) && typeof sc.rush !== 'boolean') return bad('scenario.rush', 'scenario.rush must be true or false.', 'invalid_scenario');
  if (!empty(sc.label) && typeof sc.label !== 'string') return bad('scenario.label', 'scenario.label must be text.', 'invalid_scenario');
  return { ok: true };
}

// POST /api/fare legs
export function checkLegs(legs) {
  if (!Array.isArray(legs) || !legs.length) return bad('legs', 'legs must be a non-empty list of {line, from, to}.', 'missing_field');
  if (legs.length > 12) return bad('legs', 'At most 12 legs.');
  for (const [i, l] of legs.entries()) {
    if (!l || typeof l !== 'object' || Array.isArray(l)) return bad(`legs[${i}]`, `legs[${i}] must be an object {line, from, to}.`);
    for (const k of ['line', 'from', 'to']) if (typeof l[k] !== 'string' || !l[k].trim() || l[k].length > 40) return bad(`legs[${i}].${k}`, `legs[${i}].${k} must be an id such as "B1" or "MIR".`);
  }
  return { ok: true };
}
