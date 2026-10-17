// Best time to leave: re-runs the same search at later departure times (now, +15, +30 ... +90 min,
// plus the exact minute a rush window ends) and reports, per route, whether waiting is worth it.
// Every number comes from E.search, so it is the same engine the cards and the chat use.
// Assumes today's alerts, rain and scenario stay as they are; only the departure time moves.
// (time helpers are passed in by service.js, which avoids an import cycle)

const WORTH_MIN = 5;          // a later departure must save at least 5 min on the road ...
const WORTH_TK = 5;           // ... or ৳5, to be recommended over leaving now

export function bestTimeMethods(E, { hm, toMin, isRushAt, dhakaMinutes }) {
  return {
    bestTime(q = {}) {
      const window = Math.min(180, Math.max(15, Math.round(Number(q.windowMinutes) || 90)));
      const step = Math.min(60, Math.max(5, Math.round(Number(q.stepMinutes) || 15)));
      const start = q.departAt && toMin(q.departAt) != null ? toMin(q.departAt) : dhakaMinutes(E.now());
      const cfg = E.net.config;
      // slot grid, plus the minute each rush window ends (that is when the bus gets faster)
      const offs = new Set();
      for (let o = 0; o <= window; o += step) offs.add(o);
      for (const [, b] of cfg.rushHours || []) { const d = ((toMin(b) - start) % 1440 + 1440) % 1440; if (d > 0 && d <= window) offs.add(d); }
      const slots = [...offs].sort((a, b) => a - b).map((o) => ({ offset: o, at: (start + o) % 1440 }));

      const base = { ...q }; delete base.rush; delete base.windowMinutes; delete base.stepMinutes; delete base.signature;
      const first = E.search({ ...base, departAt: hm(start) });
      if (!first.ok) return first;
      if (first.conditions.rushSource === 'set') {
        return { ok: true, from: first.origin, to: first.dest, rushFixed: true, slots: [], options: [],
          advice: 'Rush hour is set by hand in the simulator, so the departure time does not change these routes. Clear the scenario to compare times.' };
      }
      const runs = slots.map((s) => ({ ...s, r: s.offset === 0 ? first : E.search({ ...base, departAt: hm(s.at) }) }));
      const pick = (r, sig) => r.ok ? [...(r.options || []), ...(r.others || [])].find((o) => o.signature === sig) : null;
      const wanted = q.signature ? [q.signature] : first.options.slice(0, 3).map((o) => o.signature);

      const options = wanted.map((sig) => {
        const row = runs.map((s) => { const o = pick(s.r, sig); return o && { departAt: hm(s.at), offset: s.offset, rush: isRushAt(s.at, cfg), minutes: o.totalMinutes, fare: Math.round(o.fare), fareLow: o.fareRangeLow, fareHigh: o.fareRangeHigh, arriveAt: hm((s.at + Math.round(o.totalMinutes)) % 1440) }; }).filter(Boolean);
        const now = row[0]; if (!now) return null;
        const best = row.reduce((b, x) => (x.minutes < b.minutes - 0.01 || (Math.abs(x.minutes - b.minutes) < 0.01 && x.fare < b.fare) ? x : b), now);
        const savedMinutes = Math.round(now.minutes - best.minutes), savedFare = Math.round(now.fare - best.fare);
        const worth = best !== now && (savedMinutes >= WORTH_MIN || savedFare >= WORTH_TK);
        // the opposite case: leaving later gets slower (a rush window starts) -> say "leave before"
        const worse = !worth && row.find((x) => x.offset > 0 && x.minutes - now.minutes >= WORTH_MIN);
        const o0 = pick(first, sig);
        const summary = o0 ? o0.summary : sig;
        const advice = worth
          ? `${summary}: leave at ${best.departAt} instead of ${now.departAt} — ${now.minutes} → ${best.minutes} min on the road (${savedMinutes} min less${savedFare > 0 ? `, ৳${savedFare} cheaper` : ''}). You arrive ${best.arriveAt} instead of ${now.arriveAt}.`
          : worse ? `${summary}: leave before ${worse.departAt} — from then the trip takes ${worse.minutes} min instead of ${now.minutes} (rush hour).`
          : `${summary}: leave now (${now.departAt}). No departure in the next ${window} min is meaningfully faster or cheaper.`;
        return { signature: sig, summary, label: o0 && o0.label, now, best: worth ? best : now, savedMinutes: worth ? savedMinutes : 0, savedFare: worth ? Math.max(0, savedFare) : 0, worthWaiting: worth, leaveBefore: worse ? worse.departAt : null, arriveLaterBy: worth ? ((toMin(best.arriveAt) - toMin(now.arriveAt)) % 1440 + 1440) % 1440 : 0, timeline: row, advice };
      }).filter(Boolean);

      const top = options.find((o) => o.worthWaiting) || options.find((o) => o.leaveBefore);
      const advice = top ? top.advice : options.length ? `Leave now: none of these routes gets meaningfully faster or cheaper in the next ${window} min.` : 'No route to compare.';
      return { ok: true, from: first.origin, to: first.dest, start: hm(start), windowMinutes: window, rushHours: cfg.rushHours,
        options, advice, assumption: 'Assumes current alerts, rain and scenario stay as they are; only the departure time changes (rush-hour multipliers and surges).', fareTable: first.fareTable };
    },
  };
}
