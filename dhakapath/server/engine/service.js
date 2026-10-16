// Binds the pure engine functions to the in-memory state. Routes, the chat tools and the offline
// preview all call these methods, so every number on screen comes from the same code.
import { MODES, DEMO_NOTICE, line, hubName, checkScenario } from './network.js';
import { findRoutes } from './router.js';
import { fareTrip, checkClaimedFare, fmtRange } from './fare.js';
import { groundRoute, FAKE_PLAN } from './ground.js';
import * as A from './alerts.js';
import { s1Fare } from './sanity.js';
import { simulate, PRESETS } from './simulate.js';
import { resolveHub, buildIndex } from './places.js';
import { adminMethods } from './admin.js';
import { watchMethods } from './watch.js';
import { rideMethods } from './rides.js';
import { whyLines } from './why.js';
import { advanceClock } from '../store/state.js';
import { checkTripInput, checkScenarioShape, checkLegs, checkPlace } from './validate.js';
import { normalizeMode } from './fare.js';
import { createRouteCache } from './cache.js';

const MIN = 60000;
const DHAKA_OFFSET = 6 * 60;                     // Asia/Dhaka is UTC+6, no DST
export const dhakaMinutes = (t) => Math.floor(((t / MIN + DHAKA_OFFSET) % 1440 + 1440) % 1440);
export const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const toMin = (s) => { const x = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return x && +x[1] < 24 && +x[2] < 60 ? +x[1] * 60 + +x[2] : null; };
export function isRushAt(minutes, cfg) { return (cfg.rushHours || []).some(([a, b]) => minutes >= toMin(a) && minutes < toMin(b)); }
const bool = (v) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined);

export function createEngine({ state, seedAlerts = true }) {
  const net = state.net, store = state.store, now = state.now;
  const cache = createRouteCache(findRoutes);
  const remember = (o, query) => { state.registry.set(o.id, { option: o, query }); if (state.registry.size > 500) state.registry.delete(state.registry.keys().next().value); };

  const E = {
    state, net, store, now, DEMO_NOTICE, PRESETS,
    advance(minutes) { return advanceClock(state, minutes); },
    hubId(text) { return resolveHub(net, text, buildIndex(net)); },
    fx() { return A.effects(store, net, now()); },
    remember,
    route: (...a) => cache.route(net, ...a),          // cached findRoutes (see cache.js)
    routeCache: cache,
    invalidate() { net.rev = (net.rev || 0) + 1; cache.clear(); },

    // allowedModes (KoyJabo's mode checkboxes) is a whitelist: every other mode is avoided.
    modeFilter(avoid, allowed) {
      const al = allowed.map((m) => (m === 'walking' ? 'walk' : m));
      return [...new Set([...avoid, ...(al.length ? MODES.filter((m) => !al.includes(m)) : [])])];
    },
    normalizeQuery(q = {}) {
      const list = (v) => (Array.isArray(v) ? v : v ? String(v).split(',') : []).map((s) => String(s).trim()).filter(Boolean);
      const num = (v) => (v === '' || v == null ? null : Number(v));
      return {
        origin: E.hubId(q.origin), destination: E.hubId(q.destination), originText: q.origin, destinationText: q.destination,
        constraints: {
          student: q.student === true || q.student === 'true', maxBudget: num(q.maxBudget), maxTransfers: num(q.maxTransfers), maxTravelTime: num(q.maxTravelTime),
          avoidHubs: list(q.avoidHubs).map((h) => E.hubId(h) || h), avoidModes: E.modeFilter(list(q.avoidModes), list(q.allowedModes)), preferredModes: list(q.preferredModes), sort: q.sort || 'score', requireMode: q.requireMode || null,
          allowedModes: list(q.allowedModes).map((m) => (m === 'walking' ? 'walk' : m)), singleModeOnly: q.singleModeOnly === true || q.singleModeOnly === 'true',
        },
        departAt: q.departAt && toMin(q.departAt) != null ? hm(toMin(q.departAt)) : null,
        scenario: E.expandZones(q.scenario && typeof q.scenario === 'object' ? q.scenario : {}),
      };
    },
    // rainZones: ['south-west', ...] -> rain at every hub in those zones
    expandZones(sc) {
      if (!sc || typeof sc !== 'object' || !Array.isArray(sc.rainZones)) return sc;
      const hubs = net.hubs.filter((h) => sc.rainZones.includes(h.zone)).map((h) => h.id);
      return { ...sc, rain: [...new Set([...(sc.rain || []), ...hubs])] };
    },
    // Conditions in force: the global scenario (Simulate panel "apply"), plus rush hour from the
    // departure time or the clock unless rush is set explicitly.
    conditions(n, explicitRush, { withGlobal = true } = {}) {
      const g0 = withGlobal ? state.scenario : {};
      const g = { rain: g0.rain || [], blocked: g0.blocked || [], rush: typeof g0.rush === 'boolean' ? g0.rush : null, rainSeverity: g0.rainSeverity || 'light',
        disabledLines: g0.disabledLines || [], blockedEdges: g0.blockedEdges || [], delays: (g0.delays || []).filter((d) => d.until == null || d.until > now()), label: g0.label };
      const at = n.departAt ? toMin(n.departAt) : dhakaMinutes(now());
      const auto = isRushAt(at, net.config);
      const rush = typeof explicitRush === 'boolean' ? explicitRush : typeof g.rush === 'boolean' ? g.rush : auto;
      const sc = n.scenario || {};
      const u = (k) => [...new Set([...g[k], ...(sc[k] || [])])];
      return { departAt: hm(at), departSource: n.departAt ? 'chosen' : 'now', rush, rushSource: typeof explicitRush === 'boolean' || typeof g.rush === 'boolean' ? 'set' : 'auto',
        rushHours: net.config.rushHours, rain: u('rain'), blocked: u('blocked'), rainSeverity: sc.rainSeverity === 'heavy' || g.rainSeverity === 'heavy' ? 'heavy' : 'light',
        disabledLines: u('disabledLines'), blockedEdges: u('blockedEdges'), delays: [...(sc.delays || []), ...g.delays],
        scenarioActive: !!(g.rain.length || g.blocked.length || typeof g.rush === 'boolean' || g.disabledLines.length || g.blockedEdges.length || g.delays.length), scenarioLabel: g.label };
    },
    // the routing scenario carried by a conditions object
    scenOf(c) { return { rain: c.rain, blocked: c.blocked, rush: c.rush, rainSeverity: c.rainSeverity, disabledLines: c.disabledLines, blockedEdges: c.blockedEdges, delays: c.delays };
    },
    search(q) {
      const v = checkTripInput(q, E.hubId);
      if (!v.ok) return { ...v, options: [] };
      if (q.scenario && typeof q.scenario === 'object') { const s = checkScenarioShape(q.scenario); if (!s.ok) return { ...s, options: [] }; }
      const n = E.normalizeQuery(q);
      if (!n.origin || !n.destination) return { ok: false, error: 'unknown_hub', message: `Unknown place "${!n.origin ? n.originText || '' : n.destinationText || ''}". Known hubs: ${net.hubs.map((h) => h.name).join(', ')}.`, options: [] };
      const c = n.constraints;
      if (c.maxBudget != null && !(c.maxBudget >= 0)) return { ok: false, error: 'invalid_budget', message: 'maxBudget must be a non-negative number', options: [] };
      if ([...c.avoidModes, ...c.preferredModes].some((m) => !MODES.includes(m))) return { ok: false, error: 'invalid_mode', message: `avoidModes and preferredModes must be from ${MODES.join(', ')}`, options: [] };
      if (c.maxTravelTime != null && !(c.maxTravelTime > 0)) return { ok: false, error: 'invalid_time', message: 'maxTravelTime must be a positive number of minutes', options: [] };
      if (q.scenario && typeof q.scenario === 'object') { const v = checkScenario(net, n.scenario, now()); if (!v.ok) return { ...v, options: [] }; n.scenario = { ...v.scenario, rush: n.scenario.rush }; }
      const fx = E.fx();
      const cond = E.conditions(n, typeof n.scenario.rush === 'boolean' ? n.scenario.rush : bool(q.rush));
      const scen = E.scenOf(cond);
      const r = E.route(n.origin, n.destination, c, scen, fx);
      const MN = { metro: 'MRT-6', bus: 'Bus', leguna: 'Leguna', rickshaw: 'Rickshaw', cng: 'CNG', walk: 'Walking' };
      // name the modes still allowed, whether they came from allowedModes (API) or the avoid-mode chips (UI)
      const left = MODES.filter((m) => !c.avoidModes.includes(m));
      if (!r.ok && r.status === 'NO_ROUTE_WITHIN_CONSTRAINTS' && (c.avoidModes.length || c.singleModeOnly) && !r.stats.rejected.maxBudget && !r.stats.rejected.maxTravelTime && !r.stats.rejected.maxTransfers) {
        const only = c.avoidModes.length && left.length ? `using only ${left.map((m) => MN[m]).join(' / ')}` : '';
        r.message = `No open route ${only}${only && c.singleModeOnly ? ' and ' : ''}${c.singleModeOnly ? 'on a single mode' : ''} between ${hubName(net, n.origin)} and ${hubName(net, n.destination)}. Allow more modes to see options.`;
      }
      r.constraints = { ...c, departAt: n.departAt }; r.scenario = scen; r.conditions = cond; r.notice = DEMO_NOTICE; r.now = now(); r.fareTable = E.fareTable();
      if (r.ok) {
        const all = [...new Set([...r.options, ...r.others, ...(r.backup.option ? [r.backup.option] : []), ...r.uncertainBudget])];
        for (const o of all) {
          const g = groundRoute(net, { legs: o.legs.map((l) => ({ line: l.line, from: l.from, to: l.to })), student: c.student, rush: scen.rush, rain: scen.rain });
          o.grounded = g.ok && g.fare.low === o.fareRangeLow && g.fare.high === o.fareRangeHigh;
          remember(o, { origin: n.origin, destination: n.destination, ...c });
        }
        const listed = A.list(store, net, now());
        const hubsOn = new Set(all.flatMap((o) => o.legs.flatMap((l) => l.stops)));
        r.alerts = listed.filter((a) => (a.hubId && hubsOn.has(a.hubId)) || (a.edgeId && all.some((o) => o.legs.some((l) => l.edgeIds.includes(a.edgeId)))));
        r.alertsUsed = fx.used;
        // trust-aware "why" line on every option
        const plain = E.route(n.origin, n.destination, c, scen, { hubs: new Map(), edges: new Map(), used: [] });
        for (const o of all) o.why = whyLines(o, listed, plain.ok ? plain.best : null, fx);
      }
      return r;
    },
    card(id) { const x = state.registry.get(id); return x ? { ok: true, ...x, alerts: A.list(store, net, now()).filter((a) => x.option.legs.some((l) => l.stops.includes(a.hubId))), notice: DEMO_NOTICE, generatedAt: now() } : { ok: false, error: 'not_found', message: 'No such route option (options are kept for the last 500 results).' }; },

    fare({ legs, student, rush } = {}) {
      const v = checkLegs(legs);
      if (!v.ok) return v;
      const g = groundRoute(net, { legs: legs || [], student: !!student, rush: !!rush });
      if (!g.ok) return { ok: false, error: 'not_in_network', message: 'Some legs are not in the network.', errors: g.errors };
      const trip = fareTrip(g.legs.map((l) => ({ mode: l.mode, km: l.km, flatFare: (line(net, l.line) || {}).flatFare })), { student: !!student, rush: !!rush }, net.config);
      return { ok: true, ...trip, legs: g.legs.map((l, i) => ({ line: l.line, mode: l.mode, from: l.from, to: l.to, km: l.km, ...trip.legs[i] })), fareTable: E.fareTable(), notice: DEMO_NOTICE };
    },
    fareCheck({ claimedFare, origin, destination, mode = 'bus', student = false, userId = 'anon', departAt = null, rush }) {
      for (const [f, val] of [['origin', origin], ['destination', destination]]) { const c = checkPlace(val, f); if (!c.ok) return c; }
      mode = normalizeMode(mode) || mode;
      if (typeof claimedFare === 'string' && claimedFare.trim() !== '') claimedFare = Number(claimedFare);
      if (!(typeof claimedFare === 'number' && Number.isFinite(claimedFare) && claimedFare >= 0 && claimedFare <= 100000)) return { ok: false, error: 'invalid_amount', message: 'claimedFare must be a number of taka between 0 and 100000.' };
      const o = E.hubId(origin), d = E.hubId(destination);
      if (!o || !d) return { ok: false, error: 'unknown_hub', message: 'Tell me both places, e.g. "Farmgate theke Motijheel".' };
      if (!MODES.includes(mode)) return { ok: false, error: 'invalid_mode', message: `mode must be one of ${MODES.join(', ')}` };
      if (!(Number(claimedFare) >= 0)) return { ok: false, error: 'invalid_amount', message: 'claimedFare must be a number of taka.' };
      const cond = E.conditions({ departAt: departAt && toMin(departAt) != null ? departAt : null }, bool(rush));
      const r = E.route(o, d, { student: !!student, avoidModes: MODES.filter((m) => m !== mode), sort: 'fare' }, { rush: cond.rush, rain: cond.rain, rainSeverity: cond.rainSeverity }, E.fx());
      if (!r.ok) return { ok: false, error: 'no_route', message: `No ${mode} connection between ${hubName(net, o)} and ${hubName(net, d)} in the network.` };
      const opt = r.options.find((x) => x.labels.includes('Cheapest'));
      if (!opt) return { ok: false, error: 'no_fare_data', message: `No fare data for ${mode} between ${hubName(net, o)} and ${hubName(net, d)}, so the claimed fare cannot be checked.` };
      const expected = { rangeLow: opt.fareRangeLow, rangeHigh: opt.fareRangeHigh };
      const v = checkClaimedFare(claimedFare, expected);
      const km = opt.legs.reduce((s, l) => s + l.km, 0);
      const flag = s1Fare({ mode, amount: claimedFare, km }, net.config);
      const ft = E.fareTable();
      const rec = { id: 'F' + (store.fareReports.length + 1), origin: o, destination: d, mode, km, amount: Number(claimedFare), userId, at: now(), flags: flag ? [flag] : [], fareVersion: ft.version };
      store.fareReports.push(rec);
      // only reports made under the current fare table count: after a price change old reports would skew the median
      const peers = store.fareReports.filter((f) => f.origin === o && f.destination === d && f.mode === mode && !f.flags.length && (f.fareVersion || 1) === ft.version).map((f) => f.amount).sort((a, b) => a - b);
      const res = { ok: true, origin: o, destination: d, originName: hubName(net, o), destName: hubName(net, d), mode, student: !!student, claimedFare: Number(claimedFare),
        expected, conditions: cond, verdict: v.verdict, text: v.text, legs: opt.legs, submission: { id: rec.id, flags: rec.flags, excludedFromStats: rec.flags.length > 0 },
        community: { reports: peers.length, median: peers.length ? peers[Math.floor(peers.length / 2)] : null, fareVersion: ft.version }, fareTable: ft,
        studentNote: mode === 'bus' ? (student ? 'Student half fare applied (bus only).' : 'Students with ID pay half on buses (minimum ৳10).') : 'No student discount on this mode.', notice: DEMO_NOTICE };
      res.script = fareScript(res);
      return res;
    },

    simulate(q) {
      const vt = checkTripInput({ ...q, scenario: undefined }, E.hubId);
      if (!vt.ok) return vt;
      if (q.scenario != null && typeof q.scenario === 'object') { const s = checkScenarioShape(q.scenario); if (!s.ok) return s; }
      if (q.scenario != null && typeof q.scenario === 'string' && !PRESETS[q.scenario]) return { ok: false, error: 'invalid_scenario', message: `Unknown preset "${q.scenario.slice(0, 30)}". Presets: ${Object.keys(PRESETS).join(', ')}.` };
      const n = E.normalizeQuery(q);
      if (!n.origin || !n.destination) return { ok: false, error: 'unknown_hub', message: 'Unknown origin or destination.' };
      const g = state.scenario;
      const gActive = g.rain.length || g.blocked.length || typeof g.rush === 'boolean' || (g.disabledLines || []).length || (g.blockedEdges || []).length || (g.delays || []).length;
      let sc = q.scenario == null ? (gActive ? { ...g, rush: g.rush === true } : null) : q.scenario;
      if (typeof sc === 'string') sc = PRESETS[sc];
      sc = E.expandZones(sc);
      if (!sc || typeof sc !== 'object') return { ok: false, error: 'invalid_scenario', message: `scenario must be {rain, rainSeverity, rush, blocked, disabledLines, blockedEdges, delays} or one of ${Object.keys(PRESETS).join(', ')}` };
      const v = checkScenario(net, sc, now());
      if (!v.ok) return { ...v, message: v.message.replace('Unknown hub(s):', 'Unknown hub(s) in scenario:') };
      sc = { ...v.scenario, rush: !!sc.rush, label: sc.label };
      const cond = E.conditions(n, bool(q.rush), { withGlobal: false });
      const r = simulate(net, n.origin, n.destination, n.constraints, sc, E.fx(), { rush: cond.rush }, (...a) => cache.route(...a));
      return { ...r, label: sc.label || 'Custom scenario', conditions: cond, notice: DEMO_NOTICE };
    },

    // ---- alerts ---------------------------------------------------------------------------
    createAlert(input) { return A.createAlert(store, net, { ...input, hubId: input.hubId ? (E.hubId(input.hubId) || input.hubId) : null }, now()); },
    ingestExtracted(ex, text, userId = 'anon', source = 'ai_ingest') {
      if (ex.isIncident === false) return { ok: false, action: 'not_incident', reason: 'This does not look like a current traffic incident, so nothing was filed.', extracted: ex };
      if (ex.contradictory) {
        store.queue.push({ kind: 'rejected_report', at: now(), userId, text, reason: 'post says both blocked and clear', flags: ['contradictory'] });
        return { ok: false, action: 'rejected', reason: 'The post contradicts itself (problem and "clear" in one message). Sent to the moderation queue.', extracted: ex };
      }
      if (ex.type === 'clear' && ex.hubId) {
        const open = store.alerts.filter((a) => a.hubId === ex.hubId && ['active', 'unverified', 'disputed', 'fading'].includes(A.statusOf(a, now(), net.config)));
        const votes = open.map((a) => A.resolveVote(store, net, a.id, userId, now()));
        return { ok: true, action: 'resolve_votes', extracted: ex, alerts: votes.map((v) => v.alert).filter(Boolean) };
      }
      if (!ex.ok) return { ok: false, action: 'needs_more', reason: `Could not file this: missing ${ex.missing.join(' and ')}.`, extracted: ex };
      const r = E.createAlert({ hubId: ex.hubId, type: ex.type, severity: ex.severity, text, source, userId });
      if (r.ok) { const a = store.alerts.find((x) => x.id === r.alert.id); if (a && !a.rawPost) a.rawPost = String(text).slice(0, 500); }
      return { ...r, action: r.ok ? (r.merged ? 'confirmed_existing' : 'filed') : r.error, extracted: ex };
    },
    confirm(id, userId) { return A.confirm(store, net, id, userId, now()); },
    resolve(id, userId) { return A.resolveVote(store, net, id, userId, now()); },
    moderate(id, action) { return A.moderate(store, net, id, action, now()); },
    alerts(status) { return A.list(store, net, now(), status); },
    queue() { return A.queue(store, net, now()); },
    hubStatus() { return A.hubStatus(store, net, now()); },
    // demo helper: two other commuters confirm (architecture doc §13)
    seedUsers(alertId) {
      const a = alertId ? store.alerts.find((x) => x.id === alertId) : [...store.alerts].reverse().find((x) => ['unverified', 'fading'].includes(A.statusOf(x, now(), net.config)));
      if (!a) return { ok: false, error: 'not_found', message: 'No unverified alert to confirm.' };
      const n = (store.demoUserSeq = (store.demoUserSeq || 0) + 2);
      E.confirm(a.id, `demo-other-${n - 1}`);
      const r = E.confirm(a.id, `demo-other-${n}`);
      return { ok: true, alert: r.alert, confirmedBy: [`demo-other-${n - 1}`, `demo-other-${n}`] };
    },

    groundTest() { const g = groundRoute(net, FAKE_PLAN.plan); return { ok: true, claim: FAKE_PLAN.text, plan: FAKE_PLAN.plan, grounded: g.ok, errors: g.errors, verdict: g.ok ? 'Verified against network ✓' : 'Rejected: not in network' }; },
  };
  Object.assign(E, adminMethods(E), watchMethods(E), rideMethods(E));
  // any successful network/fare edit makes cached routes stale, however the method is called
  for (const m of ['adminRoutes', 'upsertLine', 'updateEdge', 'updateHub', 'updateFares']) {
    const f = E[m]; if (typeof f !== 'function') continue;
    E[m] = (...a) => { const r = f(...a); if (r && r.ok) E.invalidate(); return r; };
  }
  if (seedAlerts) seedDemo(E);
  return E;
}

// P4 template (architecture doc §6): one polite Banglish sentence, numbers only from the result.
export function fareScript(r) {
  const modeBn = { bus: 'bus', metro: 'metro', leguna: 'leguna', rickshaw: 'rickshaw', cng: 'CNG', walk: '' }[r.mode];
  const range = fmtRange(r.expected.rangeLow, r.expected.rangeHigh);
  if (r.verdict === 'overcharge' || r.verdict === 'slightly_high') return `Bhai, ${r.originName} theke ${r.destName} ${modeBn} bhara to ${range}; ৳${r.claimedFare} ektu beshi hoye jacche, ৳${r.expected.rangeHigh} nen?`;
  return `Thik ache, ${r.originName} theke ${r.destName} ${modeBn} bhara ${range}; ৳${r.claimedFare} fair.`;
}

// Demo seed so the pipeline is visible on first load. Labelled as demo reports.
export function seedDemo(E) {
  const r = E.createAlert({ hubId: 'MOH', type: 'gridlock', severity: 2, text: '[demo] Mohakhali flyover er niche onek jam', source: 'user', userId: 'demo-u1' });
  E.confirm(r.alert.id, 'demo-u2');
  E.fareCheck({ claimedFare: 900, origin: 'FAR', destination: 'MOT', mode: 'bus', userId: 'demo-u3' });   // S1 flag -> moderation queue
}
