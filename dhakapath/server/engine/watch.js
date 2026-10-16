// Trip Watch: save a trip; it is re-checked against confirmed alerts, the global scenario and
// rush hour, and the user is told (once per change) when the usual route is cut or slower,
// with a grounded detour.
import { line, hubName } from './network.js';
import { findRoutes, evaluatePlan } from './router.js';
import { fmtRange } from './fare.js';
import { groundRoute } from './ground.js';
import * as A from './alerts.js';

export function snapshotOption(o) {
  return { signature: o.signature, summary: o.summary, totalMinutes: o.totalMinutes, fareRangeLow: o.fareRangeLow, fareRangeHigh: o.fareRangeHigh, transfers: o.transfers,
    legs: o.legs.map((l) => ({ line: l.line, mode: l.mode, from: l.from, to: l.to, stops: l.stops })) };
}

export function watchMethods(E) {
  const net = E.net, store = E.store;
  return {
    watchCreate(q) {
      const r = E.search(q);
      if (!r.ok) return { ok: false, error: r.error, message: r.message };
      const n = E.normalizeQuery(q);
      const w = { id: 'W' + (store.watches.length + 1) + Math.random().toString(36).slice(2, 5), clientId: String(q.clientId || 'anon').slice(0, 64),
        query: { origin: n.origin, destination: n.destination, ...n.constraints, departAt: n.departAt }, label: `${r.originName} → ${r.destName}`,
        baseline: snapshotOption(r.best), createdAt: E.now(), lastStatus: 'ok' };
      store.watches.push(w);
      return { ok: true, watch: E.watchCheck(w) };
    },
    watchCheck(w) {
      const n = E.normalizeQuery(w.query);
      const cond = E.conditions(n);
      const fx = E.fx();
      const scen = E.scenOf(cond);
      const ev = evaluatePlan(net, w.baseline.legs, n.constraints, scen, fx);
      const cur = E.route(n.origin, n.destination, n.constraints, scen, fx);
      const alt = cur.ok ? cur.best : null;
      const onRoute = new Set(w.baseline.legs.flatMap((l) => l.stops));
      const causes = A.list(store, net, E.now()).filter((a) => ['active', 'unverified', 'disputed'].includes(a.status) && onRoute.has(a.hubId))
        .map((a) => ({ alertId: a.id, text: `${a.placeName} ${a.type} (${a.status}, confidence ${a.effectiveConfidence})`, status: a.status }));
      if (cond.rush) causes.push({ text: `rush hour (${cond.rushSource === 'auto' ? 'auto, ' : ''}${cond.departAt})`, status: 'rush' });
      if (cond.scenarioActive) causes.push({ text: `scenario: ${cond.scenarioLabel || 'simulated conditions'}`, status: 'scenario' });
      const sign = (x) => (x > 0 ? `+${x}` : `${x}`);
      const usual = w.baseline;
      let status, message, current = null;
      if (!ev.ok) {
        status = alt ? 'reroute' : 'no_route';
        const where = `${line(net, ev.brokenAt.line) ? ev.brokenAt.line : ''} ${hubName(net, ev.brokenAt.from)}–${hubName(net, ev.brokenAt.to)}`.trim();
        message = alt ? `Your usual route is cut at ${where}: ${ev.brokenAt.reason}. Take ${alt.summary} instead: ${alt.totalMinutes} min (${sign(alt.totalMinutes - usual.totalMinutes)} min vs usual), ${fmtRange(alt.fareRangeLow, alt.fareRangeHigh)}.`
          : `Your usual route is cut at ${where} (${ev.brokenAt.reason}) and no open route remains right now.`;
      } else {
        current = ev.option;
        const slow = Math.round(current.totalMinutes - usual.totalMinutes);
        const better = alt && alt.signature !== usual.signature && alt.totalMinutes + 5 <= current.totalMinutes;
        status = better ? 'better_route' : slow >= 5 ? 'slower' : 'ok';
        const why = causes.length ? ` (${causes.map((c) => c.text).join('; ')})` : '';
        message = status === 'ok' ? `Clear. Usual route ${current.totalMinutes} min, ${fmtRange(current.fareRangeLow, current.fareRangeHigh)}.`
          : status === 'slower' ? `Usual route still open but ${slow} min slower now${why}. No faster option.`
          : `Usual route is ${current.totalMinutes} min now${why}. ${alt.summary} is ${current.totalMinutes - alt.totalMinutes} min faster: ${alt.totalMinutes} min, ${fmtRange(alt.fareRangeLow, alt.fareRangeHigh)}.`;
      }
      if (alt) {
        const g = groundRoute(net, { legs: alt.legs.map((l) => ({ line: l.line, from: l.from, to: l.to })), student: !!n.constraints.student, rush: scen.rush, rain: scen.rain });
        alt.grounded = g.ok; E.remember(alt, { origin: n.origin, destination: n.destination, ...n.constraints });
      }
      const changed = status !== w.lastStatus;
      w.lastStatus = status; w.lastCheckedAt = E.now();
      return { id: w.id, label: w.label, query: w.query, status, changed, message, causes, conditions: cond, usual, current: current && snapshotOption(current),
        suggestion: alt && (status === 'reroute' || status === 'better_route') ? alt : null, brokenAt: ev.ok ? null : ev.brokenAt, checkedAt: E.now() };
    },
    watchList(clientId) { return { ok: true, watches: store.watches.filter((w) => !clientId || w.clientId === clientId).map((w) => E.watchCheck(w)), now: E.now() }; },
    watchAccept(id) {
      const w = store.watches.find((x) => x.id === id);
      if (!w) return { ok: false, error: 'not_found', message: 'No such watched trip.' };
      const r = E.search({ ...w.query });
      if (!r.ok) return { ok: false, error: r.error, message: r.message };
      w.baseline = snapshotOption(r.best); w.lastStatus = 'ok';
      return { ok: true, watch: E.watchCheck(w) };
    },
    watchDelete(id) { const i = store.watches.findIndex((x) => x.id === id); if (i < 0) return { ok: false, error: 'not_found', message: 'No such watched trip.' }; store.watches.splice(i, 1); return { ok: true }; },
  };
}
