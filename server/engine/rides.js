// Ride-share board (bonus 3): commuters at the same hub post or join a shared rickshaw / CNG to the
// same destination, and the "split bot" works out the per-person cost from the engine's own fare
// range for that link under the conditions in force (rush / rain surge). No new fare logic: the
// total always comes from E.search, so the board, the route cards and the chat quote one number.
// Members are anonymous ids; other commuters see only a count.

import { hubName } from './network.js';

const MIN = 60000;
export const SHARE_MODES = { rickshaw: { seats: 2, name: 'rickshaw' }, cng: { seats: 3, name: 'CNG' } };
const OPEN_MINUTES = 20;                 // a post expires if nobody leaves within 20 simulated minutes
const MAX_OPEN_PER_HUB = 20;

const ceil = (x) => Math.ceil(x - 1e-9);
// per-person share of a fare range, rounded UP to whole taka so the riders together never pay less than the total
export function splitFare(low, high, people) {
  const n = Math.max(1, Math.floor(people));
  return { people: n, low: ceil(low / n), high: ceil(high / n) };
}

export function rideMethods(E) {
  const store = E.store, net = E.net;
  const list = () => (store.rides = store.rides || []);
  const expire = () => { for (const r of list()) if (r.status === 'open' && E.now() > r.expiresAt) r.status = 'expired'; };

  // total fare for one direct rickshaw/CNG leg between two hubs, from the engine
  function quote(from, to, mode) {
    const r = E.search({ origin: from, destination: to, allowedModes: [mode], maxTransfers: 0 });
    if (!r.ok) return { ok: false, error: 'no_link', message: `There is no direct ${SHARE_MODES[mode].name} link from ${hubName(net, from)} to ${hubName(net, to)} in the network.` };
    const o = r.options.find((x) => x.legs.length === 1 && x.legs[0].mode === mode);
    if (!o) return { ok: false, error: 'no_link', message: `There is no direct ${SHARE_MODES[mode].name} link from ${hubName(net, from)} to ${hubName(net, to)} in the network.` };
    const f = o.legs[0].fare;
    return { ok: true, low: o.fareRangeLow, high: o.fareRangeHigh, baseLow: f.baseLow, baseHigh: f.baseHigh, surge: f.surge, minutes: o.totalMinutes, km: o.legs[0].km, conditions: r.conditions, fareTable: r.fareTable };
  }

  const bot = (q, n, mode) => {
    const s = splitFare(q.low, q.high, n), next = n < SHARE_MODES[mode].seats ? splitFare(q.low, q.high, n + 1) : null;
    const surge = q.surge !== 1 ? ` (includes ×${q.surge} ${q.conditions.rush && q.conditions.rain.length ? 'rush + rain' : q.conditions.rush ? 'rush-hour' : 'rain'} surge; baseline ৳${q.baseLow}–${q.baseHigh})` : '';
    return `Split ${n} way${n === 1 ? '' : 's'}: ৳${s.low}–${s.high} each, of ৳${q.low}–${q.high} total${surge}.${next ? ` With one more rider: ৳${next.low}–${next.high} each.` : ' Seats full.'} Agree the total with the driver before boarding; split it evenly.`;
  };

  function view(r, userId) {
    const q = quote(r.from, r.to, r.mode);
    const n = r.members.length;
    return { id: r.id, from: r.from, to: r.to, fromName: hubName(net, r.from), toName: hubName(net, r.to), mode: r.mode, seats: r.seats, riders: n, status: r.status,
      mine: r.members.includes(userId), createdByMe: r.createdBy === userId, createdAt: r.createdAt, expiresAt: r.expiresAt,
      minutesLeft: Math.max(0, Math.round((r.expiresAt - E.now()) / MIN)), quote: q.ok ? { low: q.low, high: q.high, surge: q.surge, minutes: q.minutes } : null,
      perPerson: q.ok ? splitFare(q.low, q.high, n) : null, ifOneMore: q.ok && n < r.seats ? splitFare(q.low, q.high, n + 1) : null, bot: q.ok ? bot(q, n, r.mode) : q.message };
  }

  return {
    rideQuote({ from, to, mode = 'rickshaw', people = 2 } = {}) {
      const o = E.hubId(from), d = E.hubId(to);
      if (!o || !d) return { ok: false, error: 'unknown_hub', message: 'Tell me both hubs, e.g. "Shahbagh theke Science Lab".' };
      if (o === d) return { ok: false, error: 'same_hub', message: 'Pick two different hubs.' };
      if (!SHARE_MODES[mode]) return { ok: false, error: 'invalid_mode', message: 'Ride-share is for rickshaw or CNG.' };
      const n = Number(people);
      if (!(Number.isInteger(n) && n >= 1 && n <= SHARE_MODES[mode].seats)) return { ok: false, error: 'invalid_people', message: `A ${SHARE_MODES[mode].name} takes 1–${SHARE_MODES[mode].seats} riders.` };
      const q = quote(o, d, mode);
      if (!q.ok) return q;
      return { ok: true, from: o, to: d, fromName: hubName(net, o), toName: hubName(net, d), mode, total: { low: q.low, high: q.high }, perPerson: splitFare(q.low, q.high, n), surge: q.surge, bot: bot(q, n, mode), fareTable: q.fareTable };
    },
    rideList({ hub = null, userId = 'anon' } = {}) {
      expire();
      const h = hub ? E.hubId(hub) : null;
      if (hub && !h) return { ok: false, error: 'unknown_hub', message: `Unknown hub "${String(hub).slice(0, 40)}".` };
      const show = (r) => (r.status === 'open' || (r.status === 'full' && r.members.includes(userId))) && (!h || r.from === h);
      return { ok: true, hub: h, rides: list().filter(show).map((r) => view(r, userId)), now: E.now() };
    },
    rideCreate({ from, to, mode = 'rickshaw', userId = 'anon' } = {}) {
      expire();
      const o = E.hubId(from), d = E.hubId(to);
      if (!o || !d) return { ok: false, error: 'unknown_hub', message: 'Choose two hubs.' };
      if (o === d) return { ok: false, error: 'same_hub', message: 'Pick two different hubs.' };
      if (!SHARE_MODES[mode]) return { ok: false, error: 'invalid_mode', message: 'Ride-share is for rickshaw or CNG.' };
      const q = quote(o, d, mode);
      if (!q.ok) return q;
      if (list().some((r) => r.status === 'open' && r.members.includes(userId))) return { ok: false, error: 'already_sharing', message: 'You are already in an open share. Leave it first.' };
      // join an existing open share to the same place instead of making a duplicate
      const same = list().find((r) => r.status === 'open' && r.from === o && r.to === d && r.mode === mode && r.members.length < r.seats);
      if (same) { same.members.push(userId); if (same.members.length >= same.seats) same.status = 'full'; return { ok: true, joined: true, ride: view(same, userId) }; }
      if (list().filter((r) => r.status === 'open' && r.from === o).length >= MAX_OPEN_PER_HUB) return { ok: false, error: 'board_full', message: 'Too many open shares at this hub right now; join one of them.' };
      const r = { id: 'S' + (list().length + 1) + Math.random().toString(36).slice(2, 5), from: o, to: d, mode, seats: SHARE_MODES[mode].seats, members: [userId], createdBy: userId,
        createdAt: E.now(), expiresAt: E.now() + OPEN_MINUTES * MIN, status: 'open' };
      list().push(r);
      if (list().length > 500) list().shift();
      return { ok: true, joined: false, ride: view(r, userId) };
    },
    rideJoin(id, userId = 'anon') {
      expire();
      const r = list().find((x) => x.id === id);
      if (!r) return { ok: false, error: 'not_found', message: 'No such share.' };
      if (r.status !== 'open') return { ok: false, error: 'closed', message: r.status === 'full' ? 'That share is full.' : 'That share has expired.' };
      if (r.members.includes(userId)) return { ok: true, ride: view(r, userId) };
      if (list().some((x) => x.status === 'open' && x.members.includes(userId))) return { ok: false, error: 'already_sharing', message: 'You are already in an open share. Leave it first.' };
      r.members.push(userId);
      if (r.members.length >= r.seats) r.status = 'full';
      return { ok: true, ride: view(r, userId) };
    },
    rideLeave(id, userId = 'anon') {
      const r = list().find((x) => x.id === id);
      if (!r || !r.members.includes(userId)) return { ok: false, error: 'not_found', message: 'You are not in that share.' };
      r.members = r.members.filter((m) => m !== userId);
      if (!r.members.length) r.status = 'cancelled';
      else if (r.status === 'full') r.status = 'open';
      return { ok: true, ride: view(r, userId) };
    },
  };
}
