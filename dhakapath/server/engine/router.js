// Router (spec section 5): DFS over simple hub paths (max 6 edges), choosing a line for every
// edge, merging consecutive edges on the same line into one leg, adding board waits and 4-min
// transfer walks. Every option is built only from edges that exist and are open.
import { adjacency, line, hub, hubName, edgeUsable } from './network.js';
import { coef } from './config.js';
import { fareTrip } from './fare.js';

const r1 = (x) => Math.round(x * 10) / 10;
const EMPTY_FX = { hubs: new Map(), edges: new Map() };

// Rule precedence (algorithm doc §3): 1 admin/simulated disabled line or link, 2 hard alert or
// blocked hub, 3 heavy-rain mode stop, then time = base·(1+D)·Rrush·Rrain·Ralert + A, where D and A
// come from ONE admin delay (most specific wins: link > line > hub), never stacked. The extra
// minutes A are a boarding/hold-up delay, so a leg pays each delay's A once, not once per link.
// ctx: { origin, dest, rush, rain:Set, rainSeverity, blocked:Set, disabledLines:Set, blockedEdges:Set, delays[], avoidModes:Set, alertFx }
export function pickDelay(delays, e, a, b) {
  if (!delays || !delays.length) return null;
  return delays.find((d) => d.edgeId && d.edgeId === e.id) || delays.find((d) => d.line && !d.edgeId && d.line === e.line)
    || delays.find((d) => d.hub && !d.line && !d.edgeId && (d.hub === a || d.hub === b)) || null;
}

export function edgeState(net, e, a, b, ctx) {
  const cfg = net.config;
  if (!edgeUsable(e)) return { ok: false, rule: 'bad_data', reason: `${e && e.id} has no usable distance/time data` };
  if (ctx.disabledLines && ctx.disabledLines.has(e.line)) return { ok: false, rule: 'disabled', reason: `${e.line} not running (disabled)` };
  if (ctx.blockedEdges && ctx.blockedEdges.has(e.id)) return { ok: false, rule: 'disabled', reason: `${e.line} ${hubName(net, a)}–${hubName(net, b)} closed (disabled link)` };
  if (ctx.avoidModes && ctx.avoidModes.has(e.mode)) return { ok: false, rule: 'avoidMode', reason: `mode ${e.mode} avoided`, filtered: true };
  const road = e.mode !== 'metro';
  const endpoint = (h) => h === ctx.origin || h === ctx.dest;
  const reasons = [], alertIds = [];
  let mult = 1;
  for (const h of [a, b]) {
    if (road && ctx.blocked && ctx.blocked.has(h) && !endpoint(h)) return { ok: false, rule: 'blockedHub', reason: `${hubName(net, h)} blocked` };
    const fx = (ctx.alertFx || EMPTY_FX).hubs.get(h);
    if (fx && road) {
      if (fx.break && !endpoint(h)) return { ok: false, rule: 'alert', reason: `active alert at ${hubName(net, h)} (${fx.labels.join(', ')})`, alertIds: fx.ids };
      const m = coef(fx.break ? cfg.alerts.activeTimeMultiplier : fx.mult);
      if (m !== 1) { mult *= m; reasons.push(`${fx.soft ? 'unverified ' : ''}alert at ${hubName(net, h)} ×${m}`); alertIds.push(...fx.ids); }
    }
  }
  const efx = (ctx.alertFx || EMPTY_FX).edges.get(e.id);
  if (efx) {
    if (efx.break) return { ok: false, rule: 'alert', reason: `active alert on this link (${efx.labels.join(', ')})`, alertIds: efx.ids };
    const em = coef(efx.mult);
    if (em !== 1) { mult *= em; reasons.push(`alert on link ×${em}`); alertIds.push(...efx.ids); }
  }
  const rain = !!(ctx.rain && (ctx.rain.has(a) || ctx.rain.has(b)));
  const heavy = rain && ctx.rainSeverity === 'heavy' && cfg.conditions.heavyRain;
  if (heavy && (heavy.blocksModes || []).includes(e.mode)) return { ok: false, rule: 'weather', reason: `heavy rain: ${e.mode === 'cng' ? 'CNG' : e.mode} not running near ${hubName(net, ctx.rain.has(a) ? a : b)}` };
  if (ctx.rush) { const m = coef(cfg.conditions.rush.time[e.mode]); if (m !== 1) { mult *= m; reasons.push(`rush hour ×${m}`); } }
  if (rain) { const m = coef((heavy ? heavy.time : cfg.conditions.rain.time)[e.mode]); if (m !== 1) { mult *= m; reasons.push(`${heavy ? 'heavy rain' : 'rain'} ×${m}`); } }
  const d = pickDelay(ctx.delays, e, a, b);
  const D = d ? Math.min(5, Math.max(0, Number(d.rate) || 0)) : 0, add = d ? Math.min(180, Math.max(0, Number(d.extraMinutes) || 0)) : 0;
  if (d && (D || add)) reasons.push(`admin delay${D ? ` +${Math.round(D * 100)}%` : ''}${add ? ` +${add} min` : ''}${d.label ? ` (${d.label})` : ''}`);
  const delay = d && add ? { key: d.edgeId || d.line || d.hub, minutes: add } : null;
  return { ok: true, minutes: r1(e.minutes * (1 + D) * mult + (delay ? add : 0)), runMinutes: r1(e.minutes * (1 + D) * mult), delay, base: e.minutes, rain, reasons, alertIds };
}

// Full scenario shape; every caller passes a subset.
export function normScenario(sc = {}) {
  return { rain: sc.rain || [], rush: !!sc.rush, blocked: sc.blocked || [], rainSeverity: sc.rainSeverity === 'heavy' ? 'heavy' : 'light',
    disabledLines: sc.disabledLines || [], blockedEdges: sc.blockedEdges || [], delays: sc.delays || [] };
}

export function makeCtx(origin, dest, constraints = {}, scenario = {}, alertFx = EMPTY_FX) {
  const sc = normScenario(scenario);
  return {
    origin, dest, rush: sc.rush, rain: new Set(sc.rain), rainSeverity: sc.rainSeverity, blocked: new Set(sc.blocked),
    disabledLines: new Set(sc.disabledLines), blockedEdges: new Set(sc.blockedEdges), delays: sc.delays,
    avoidModes: new Set(constraints.avoidModes || []), avoidHubs: new Set(constraints.avoidHubs || []), alertFx,
  };
}

function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }

// Build one option from a list of {edge, from, to, st} steps.
export function buildOption(net, steps, constraints, ctx) {
  const cfg = net.config;
  const legs = [];
  for (const s of steps) {
    const last = legs[legs.length - 1];
    if (last && last.line === s.edge.line) {
      const dup = s.st.delay && last.delayKeys.includes(s.st.delay.key);
      if (s.st.delay && !dup) last.delayKeys.push(s.st.delay.key);
      last.to = s.to; last.stops.push(s.to); last.km = r1(last.km + s.edge.km); last.rideMinutes = r1(last.rideMinutes + (dup ? s.st.runMinutes : s.st.minutes));
      last.edgeIds.push(s.edge.id); last.rain = last.rain || s.st.rain; last.reasons.push(...s.st.reasons); last.alertIds.push(...s.st.alertIds);
    } else {
      const l = line(net, s.edge.line);
      legs.push({ line: l.id, lineName: l.name, mode: l.mode, flatFare: l.flatFare, from: s.from, to: s.to, stops: [s.from, s.to], km: s.edge.km,
        rideMinutes: s.st.minutes, delayKeys: s.st.delay ? [s.st.delay.key] : [], wait: cfg.boardWait[l.mode] ?? 0, edgeIds: [s.edge.id], rain: s.st.rain, reasons: [...s.st.reasons], alertIds: [...s.st.alertIds],
        boardingNote: s.edge.boardingNote || '' });
    }
  }
  const student = !!constraints.student;
  const fares = fareTrip(legs, { student, rush: ctx.rush }, cfg);
  let transferWalk = 0;
  for (let i = 1; i < legs.length; i++) if (legs[i].mode !== 'walk' && legs[i - 1].mode !== 'walk') transferWalk += cfg.transferWalkMinutes;
  const totalMinutes = Math.round(legs.reduce((s, l) => s + l.rideMinutes + l.wait, 0) + transferWalk);
  const transfers = Math.max(0, legs.filter((l) => l.mode !== 'walk').length - 1);
  const warnings = [];
  legs.forEach((l, i) => {
    l.fare = fares.legs[i];
    l.fromName = hubName(net, l.from); l.toName = hubName(net, l.to);
    l.reasons = [...new Set(l.reasons)]; l.alertIds = [...new Set(l.alertIds)];
    const h = hub(net, l.from);
    l.landmark = h && h.landmarks && h.landmarks[0] ? h.landmarks[0] : null;
    const verb = l.mode === 'walk' ? 'Walk' : l.mode === 'rickshaw' ? 'Take a rickshaw' : l.mode === 'cng' ? 'Take a CNG' : `Take ${l.lineName}`;
    const viaBn = l.stops.length > 2 ? `${l.stops.slice(1, -1).map((x) => hubName(net, x)).join(', ')} hoye, ` : '';
    const mins = Math.round(l.rideMinutes);
    l.instructionBn = l.mode === 'walk' ? `${l.fromName} theke ${l.toName} hete jan (~${mins} min).`
      : l.mode === 'rickshaw' || l.mode === 'cng' ? `${l.fromName} theke ${l.toName} ${l.mode === 'cng' ? 'CNG' : 'rickshaw'} nin; uthar age bhara thik kore nin (~${mins} min).`
      : l.mode === 'metro' ? `${l.fromName} station theke MRT-6 e uthun, ${viaBn}${l.toName} e namun (~${mins} min, opekkha ${l.wait} min).`
      : `${l.fromName} theke ${l.lineName} ${l.mode === 'leguna' ? 'leguna' : 'bus'} e uthun, ${viaBn}${l.toName} e namun (~${mins} min, opekkha ${l.wait} min).`;
    const via = l.stops.length > 2 ? ` via ${l.stops.slice(1, -1).map((x) => hubName(net, x)).join(', ')}` : '';
    l.instruction = `${verb} from ${l.fromName} to ${l.toName}${via}: about ${Math.round(l.rideMinutes)} min ride${l.wait ? ` + ${l.wait} min wait` : ''}.`;
    if (ctx.rush && l.mode === 'metro') warnings.push(`MRT-6 crowded in rush hour (${l.fromName}–${l.toName})`);
    for (const r of l.reasons) if (/alert|rain/.test(r)) warnings.push(`${l.fromName}–${l.toName}: ${r}`);
  });
  const sig = legs.map((l) => `${l.line}:${l.from}>${l.to}`).join('|');
  return {
    id: 'opt-' + hash(sig + (student ? ':s' : '') + (ctx.rush ? ':r' : '') + [...(ctx.rain || [])].join(',') + [...(ctx.blocked || [])].join(',')
      + (ctx.rainSeverity === 'heavy' ? ':H' : '') + [...(ctx.disabledLines || [])].join(',') + [...(ctx.blockedEdges || [])].join(',') + (ctx.delays && ctx.delays.length ? JSON.stringify(ctx.delays) : '')),
    signature: sig, legs, totalMinutes, transfers, transferWalkMinutes: transferWalk,
    totalFareRegular: fares.totalFareRegular, totalFareStudent: fares.totalFareStudent, fareRangeLow: fares.fareRangeLow, fareRangeHigh: fares.fareRangeHigh,
    fare: fares.fare, fareUnknown: fares.fareUnknown, student, warnings: [...new Set(warnings)], boardingNotes: legs.map((l) => l.boardingNote).filter(Boolean),
    summary: legs.map((l) => `${l.mode === 'metro' ? 'MRT-6' : l.mode === 'bus' ? l.line : l.mode === 'leguna' ? l.line : l.mode} ${l.fromName}→${l.toName}`).join(' · '),
  };
}

const SORTS = {
  score: (o, w) => o.totalMinutes * w.minutesWeight + w.fareWeight * o.fare + w.transferWeight * o.transfers,
  time: (o) => o.totalMinutes * 1000 + o.fare,
  fare: (o) => o.fare * 1000 + o.totalMinutes,
  transfers: (o) => o.transfers * 100000 + o.totalMinutes * 10 + o.fare,
};

// Service keys a backup must not share: the line for bus/metro/leguna (one operator can stop), the
// link itself for rickshaw/CNG (many vehicles; only the street can close). Walking is never critical.
const serviceKeys = (l) => (l.mode === 'walk' ? [] : l.mode === 'rickshaw' || l.mode === 'cng' ? l.edgeIds.map((id) => 'E:' + id) : ['L:' + l.line]);

// Backup route (algorithm doc §6): the best-scoring valid candidate that shares no line or
// rickshaw/CNG link with the primary; failing that, one that avoids the primary's most exposed leg
// (the longest ride). Chosen from the same validated candidates, so it meets every constraint.
export function pickBackup(net, primary, all) {
  const legs = primary.legs.filter((l) => l.mode !== 'walk');
  if (!legs.length) return { backup: null, reason: 'The main route is walking only, so there is no service to lose.' };
  const crit = legs.reduce((b, l) => (l.rideMinutes > b.rideMinutes ? l : b));
  const pk = new Set(legs.flatMap(serviceKeys)), ck = new Set(serviceKeys(crit));
  const cands = all.filter((o) => o.signature !== primary.signature).sort((a, b) => a.score - b.score || (a.signature < b.signature ? -1 : 1));
  const keys = (o) => o.legs.flatMap(serviceKeys);
  let o = cands.find((x) => !keys(x).some((k) => pk.has(k))), distinct = 'no_shared_service';
  if (!o) { o = cands.find((x) => !keys(x).some((k) => ck.has(k))); distinct = 'avoids_critical_leg'; }
  const critName = `${crit.mode === 'metro' ? 'MRT-6' : crit.mode === 'rickshaw' || crit.mode === 'cng' ? (crit.mode === 'cng' ? 'CNG' : 'rickshaw') : crit.line} ${crit.fromName}–${crit.toName}`;
  const critical = { line: crit.line, mode: crit.mode, from: crit.from, to: crit.to, fromName: crit.fromName, toName: crit.toName, edgeIds: crit.edgeIds, name: critName };
  if (!o) return { backup: null, critical, reason: `No other valid route avoids ${critName} under the current conditions and filters.` };
  return {
    backup: o, critical, distinct, validNow: true,
    trigger: distinct === 'no_shared_service' ? `Use if any service on the main route stops (most exposed: ${critName}).` : `Use if ${critName} stops.`,
    delta: { minutes: o.totalMinutes - primary.totalMinutes, fareLow: o.fareRangeLow - primary.fareRangeLow, fareHigh: o.fareRangeHigh - primary.fareRangeHigh, transfers: o.transfers - primary.transfers },
  };
}

// Budget status (algorithm doc §8). Fares are seed-formula estimates, so "within" means the top of the
// estimate fits, never that the fare is guaranteed.
export function budgetStatus(o, limit) {
  if (limit == null) return null;
  if (o.fareUnknown || !Number.isFinite(o.fareRangeHigh) || !Number.isFinite(o.fare)) return { status: 'unknown', limit, note: 'Part of this route has no fare data, so it cannot be checked against your budget.' };
  if (o.fareRangeHigh <= limit) return { status: 'within', limit };
  if (o.fare <= limit) return { status: 'estimated_within', limit, note: `Typical fare ~৳${Math.round(o.fare)} fits, but it can reach ৳${o.fareRangeHigh}.` };
  return { status: 'over', limit };
}
const fareConfidence = (o) => (o.fareUnknown ? 'unknown' : o.fareRangeLow === o.fareRangeHigh ? 'formula_estimate' : 'range_estimate');

// Shortest hop count from origin to dest using only links allowed by `allow`, or Infinity.
function hops(net, origin, dest, allow) {
  const adj = adjacency(net, { includeInactive: true });
  const dist = new Map([[origin, 0]]), q = [origin];
  while (q.length) {
    const u = q.shift();
    if (u === dest) return dist.get(u);
    for (const { edge, to } of adj.get(u)) if (!dist.has(to) && allow(edge, u, to)) { dist.set(to, dist.get(u) + 1); q.push(to); }
  }
  return Infinity;
}

// constraints: { student, maxBudget, maxTravelTime, singleModeOnly, avoidHubs[], avoidModes[], preferredModes[], maxTransfers, requireMode, sort }
// scenario: { rain:[hubIds], rainSeverity, rush, blocked:[hubIds], disabledLines:[lineIds], blockedEdges:[edgeIds], delays:[{edgeId|line|hub, rate, extraMinutes, label}] }
export function findRoutes(net, origin, dest, constraints = {}, scenario = {}, alertFx = EMPTY_FX) {
  const ids = new Set(net.hubs.map((h) => h.id));
  if (!ids.has(origin) || !ids.has(dest)) return { ok: false, status: 'INVALID_INPUT', error: 'unknown_hub', message: `Unknown hub: ${!ids.has(origin) ? origin : dest}`, options: [] };
  if (origin === dest) return { ok: false, status: 'INVALID_INPUT', error: 'same_hub', message: 'Origin and destination are the same hub.', options: [] };
  const avoidHubs = new Set(constraints.avoidHubs || []);
  if (avoidHubs.has(origin) || avoidHubs.has(dest)) return { ok: false, status: 'INVALID_INPUT', error: 'avoid_endpoint', message: 'You asked to avoid your own origin or destination.', options: [] };
  const t0 = Date.now();
  const ctx = makeCtx(origin, dest, constraints, scenario, alertFx);
  const adj = adjacency(net);
  const maxEdges = net.config.ranking.maxEdges, maxNodes = net.config.ranking.maxDfsNodes || Infinity;
  const stats = { dfsNodes: 0, hubPaths: 0, hopLimitStops: 0, linksPruned: {}, candidates: 0, rejected: {}, complete: true };
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const paths = [];
  const steps = [];
  const visited = new Set([origin]);
  (function dfs(u) {
    if (++stats.dfsNodes > maxNodes) { stats.complete = false; return; }
    if (u === dest) { paths.push(steps.slice()); return; }
    if (steps.length >= maxEdges) { stats.hopLimitStops++; return; }
    for (const { edge, to } of adj.get(u)) {
      if (!stats.complete) return;
      if (visited.has(to)) continue;
      if (avoidHubs.has(to)) { bump(stats.linksPruned, 'avoidHub'); continue; }
      const st = edgeState(net, edge, u, to, ctx);
      if (!st.ok) { bump(stats.linksPruned, st.rule || 'other'); continue; }
      steps.push({ edge, from: u, to, st }); visited.add(to);
      dfs(to);
      visited.delete(to); steps.pop();
    }
  })(origin);
  stats.hubPaths = paths.length;

  const seen = new Set();
  const all = [], uncertain = [];
  for (const p of paths) {
    const o = buildOption(net, p, constraints, ctx);
    if (seen.has(o.signature)) { bump(stats.rejected, 'duplicate'); continue; }
    seen.add(o.signature); stats.candidates++;
    o.fareConfidence = fareConfidence(o);
    if (constraints.requireMode && !o.legs.some((l) => l.mode === constraints.requireMode)) { bump(stats.rejected, 'requireMode'); continue; }
    // single mode (KoyJabo rule): every leg the same mode; CNG counts as rickshaw, walking is its own mode
    if (constraints.singleModeOnly && new Set(o.legs.map((l) => (l.mode === 'cng' ? 'rickshaw' : l.mode))).size > 1) { bump(stats.rejected, 'singleModeOnly'); continue; }
    if (constraints.maxTransfers != null && o.transfers > constraints.maxTransfers) { bump(stats.rejected, 'maxTransfers'); continue; }
    if (constraints.maxTravelTime != null && o.totalMinutes > constraints.maxTravelTime) { bump(stats.rejected, 'maxTravelTime'); continue; }
    if (constraints.maxBudget != null) {
      o.budget = budgetStatus(o, constraints.maxBudget);
      if (o.budget.status !== 'within') { bump(stats.rejected, 'maxBudget'); if (o.budget.status === 'estimated_within') uncertain.push(o); continue; }
    }
    all.push(o);
  }
  stats.ms = Date.now() - t0;
  const w = net.config.ranking;
  for (const o of [...all, ...uncertain]) o.score = r1(SORTS.score(o, w));
  if (!all.length) {
    const rj = stats.rejected;
    let cheapest = null;
    if (rj.maxBudget) {
      const r = findRoutes(net, origin, dest, { ...constraints, maxBudget: null }, scenario, alertFx);
      const c = r.ok ? r.options.find((o) => o.labels.includes('Cheapest')) : null;
      if (c) { cheapest = { fareRangeLow: c.fareRangeLow, fareRangeHigh: c.fareRangeHigh, fare: c.fare, totalMinutes: c.totalMinutes, summary: c.summary, labelled: 'over budget' }; }
    }
    // Which failure category (algorithm doc §10)
    let status, why;
    if (!stats.complete) { status = 'SEARCH_INCOMPLETE'; why = `Search stopped at the safety limit of ${maxNodes} steps before finding a route; this is not proof that none exists.`; }
    else if (hops(net, origin, dest, () => true) === Infinity) { status = 'NO_ROUTE_IN_MODELED_NETWORK'; why = 'These hubs are not connected anywhere in the modelled network.'; }
    else {
      const open = hops(net, origin, dest, (e, a, b) => line(net, e.line).status === 'active' && !avoidHubs.has(b) && edgeState(net, e, a, b, ctx).ok);
      if (open === Infinity) { status = 'NO_ROUTE_WITHIN_CONSTRAINTS'; why = 'Every connection between these hubs is closed or filtered out by the current disruptions and your filters.'; }
      else if (open > maxEdges) { status = 'NO_ROUTE_WITHIN_HOP_LIMIT'; why = `The only open path needs ${open} hops; the search stops at ${maxEdges}.`; }
      else { status = 'NO_ROUTE_WITHIN_CONSTRAINTS'; why = null; }
    }
    const error = rj.maxBudget ? 'over_budget' : rj.maxTravelTime ? 'too_slow' : rj.maxTransfers ? 'too_many_transfers' : 'no_route';
    const message = why && status !== 'NO_ROUTE_WITHIN_CONSTRAINTS' ? why
      : rj.maxBudget ? `No route's top fare estimate fits your budget of ৳${constraints.maxBudget}.${uncertain.length ? ` ${uncertain.length} route(s) might fit at the typical fare.` : ''}`
      : rj.maxTravelTime ? `No open route takes ${constraints.maxTravelTime} min or less.`
      : rj.maxTransfers ? `No route with at most ${constraints.maxTransfers} transfer(s).`
      : why || 'No open route between these hubs with the current blocks and filters.';
    uncertain.sort((a, b) => a.fare - b.fare || a.totalMinutes - b.totalMinutes);
    return { ok: false, status, error, message, options: [], cheapestOverBudget: cheapest, uncertainBudget: uncertain.slice(0, 3), considered: paths.length, stats };
  }
  const min = (f) => all.reduce((b, o) => (f(o) < f(b) ? o : b));
  const priced = all.filter((o) => !o.fareUnknown);
  const cheapest = priced.length ? priced.reduce((b, o) => (SORTS.fare(o) < SORTS.fare(b) ? o : b)) : null, fastest = min((o) => SORTS.time(o)), fewest = min((o) => SORTS.transfers(o));
  for (const o of all) o.labels = [];
  const best = min((o) => o.score);
  if (cheapest) cheapest.labels.push('Cheapest'); fastest.labels.push('Fastest'); fewest.labels.push('Fewest transfers'); best.labels.push('Balanced');
  let preferred = null;
  const pref = new Set(constraints.preferredModes || []);
  if (pref.size) {
    const withPref = all.filter((o) => o.legs.some((l) => pref.has(l.mode)));
    if (withPref.length) { preferred = withPref.reduce((b, o) => (o.score < b.score ? o : b)); preferred.labels.push('Preferred mode'); }
  }
  const sortKey = SORTS[constraints.sort] ? constraints.sort : 'score';
  const by = (a, b) => SORTS[sortKey](a, w) - SORTS[sortKey](b, w);
  const options = [...new Set([cheapest, fastest, fewest, best, preferred].filter(Boolean))].sort(by);
  const others = all.filter((o) => !options.includes(o)).sort((a, b) => a.score - b.score).slice(0, 3);
  const primary = options[0];
  const bk = pickBackup(net, primary, all);
  uncertain.sort((a, b) => a.fare - b.fare || a.totalMinutes - b.totalMinutes);
  return { ok: true, status: stats.complete ? 'OK' : 'SEARCH_INCOMPLETE', partial: !stats.complete, origin, dest, originName: hubName(net, origin), destName: hubName(net, dest),
    options, others, best, primary, backup: bk.backup ? { ...bk, option: bk.backup, backup: undefined } : { option: null, critical: bk.critical || null, reason: bk.reason },
    uncertainBudget: uncertain.slice(0, 3), considered: paths.length, stats, sort: sortKey };
}

// Re-evaluate a known plan (e.g. a watched trip) under current conditions without searching.
// Returns { ok: true, option } or { ok: false, brokenAt: {edgeId, from, to, reason} }.
export function evaluatePlan(net, legs, constraints = {}, scenario = {}, alertFx = EMPTY_FX) {
  const origin = legs[0].from, dest = legs[legs.length - 1].to;
  const ctx = makeCtx(origin, dest, { ...constraints, avoidModes: [] }, scenario, alertFx);
  const steps = [];
  for (const l of legs) {
    for (let k = 0; k < l.stops.length - 1; k++) {
      const a = l.stops[k], b = l.stops[k + 1];
      const e = net.edges.find((x) => x.line === l.line && ((x.from === a && x.to === b) || (x.from === b && x.to === a)));
      if (!e) return { ok: false, brokenAt: { from: a, to: b, line: l.line, reason: 'link no longer in the network' } };
      const st = edgeState(net, e, a, b, ctx);
      if (!st.ok) return { ok: false, brokenAt: { edgeId: e.id, from: a, to: b, line: l.line, reason: st.reason, alertIds: st.alertIds || [] } };
      steps.push({ edge: e, from: a, to: b, st });
    }
  }
  return { ok: true, option: buildOption(net, steps, constraints, ctx) };
}
