// Tool registry (architecture doc §7). No native LLM function calling: the dispatcher in chat.js
// picks a tool from the intent, and every call is recorded as a chip like
// "findRoutes(MIR->MOT, student)" so the demo shows which engine function answered.
import { fmtRange } from '../engine/fare.js';

const flags = (a) => [a.student && 'student', a.maxBudget != null && `≤৳${a.maxBudget}`, (a.avoidHubs || []).length && `avoid ${a.avoidHubs.join('+')}`,
  (a.avoidModes || []).length && `no ${a.avoidModes.join('/')}`, a.maxTransfers != null && `≤${a.maxTransfers} transfers`, a.requireMode && `with ${a.requireMode}`, a.departAt && `at ${a.departAt}`].filter(Boolean);

export function rulesText(net, mode) {
  const f = net.config.fares;
  const all = {
    bus: `Bus: max(৳${f.bus.minimum}, round(km × ${f.bus.perKm})). Students pay half, rounded up, never below ৳${f.bus.minimum}.`,
    metro: `MRT-6: ৳${f.metro.perKm}/km rounded to ৳5, between ৳${f.metro.minimum} and ৳${f.metro.maximum}. No student discount.`,
    leguna: 'Leguna: flat fare per line. No student discount.',
    rickshaw: `Rickshaw: negotiable, ৳${f.rickshaw.lowPerKm}–${f.rickshaw.highPerKm}/km (min ৳${f.rickshaw.minimum}); rush ×${f.rickshaw.surge.rush}, rain ×${f.rickshaw.surge.rain}, both ×${f.rickshaw.surge.both}. No student discount.`,
    cng: `CNG: negotiable, ৳${f.cng.lowPerKm}–${f.cng.highPerKm}/km (min ৳${f.cng.minimum}); rush ×${f.cng.surge.rush}, rain ×${f.cng.surge.rain}, both ×${f.cng.surge.both}. No student discount.`,
  };
  return mode && all[mode] ? `${mode === 'bus' ? 'Yes' : 'No'}: ${all[mode]} Student half fare applies to buses only.` : Object.values(all).join('\n') + '\nStudent half fare applies to buses only.';
}

export const TOOLS = {
  findRoutes: { run: (E, a) => E.search(a), chip: (a) => `findRoutes(${a.origin}->${a.destination}${flags(a).length ? ', ' + flags(a).join(', ') : ''})` },
  groundRoute: { run: (E, a) => ({ ok: true, grounded: a.options.every((o) => o.grounded) }), chip: (a, r) => `groundRoute(${a.options.length} option${a.options.length === 1 ? '' : 's'}) ${r && r.grounded ? '✓' : '✗'}` },
  compareFares: {
    run: (E, a) => ({ ok: true, rows: a.options.map((o) => ({ summary: o.summary, regular: fmtRange(...regularRange(o)), student: fmtRange(...studentRange(o)), minutes: o.totalMinutes })) }),
    chip: (a) => `compareFares(${a.options.length} options${a.student ? ', student' : ''})`,
  },
  checkClaimedFare: { run: (E, a) => E.fareCheck(a), chip: (a) => `checkClaimedFare(৳${a.claimedFare}, ${a.mode}, ${a.origin}->${a.destination})` },
  createAlert: { run: (E, a) => E.ingestExtracted(a.extracted, a.text, a.userId, a.source || 'user'), chip: (a) => `createAlert(${a.extracted.hubId}, ${a.extracted.type}, severity ${a.extracted.severity})` },
  resolveAlert: { run: (E, a) => E.ingestExtracted(a.extracted, a.text, a.userId, 'user'), chip: (a) => `resolveAlert(${a.extracted.hubId})` },
  confirmAlert: { run: (E, a) => E.confirm(a.alertId, a.userId), chip: (a) => `confirmAlert(${a.alertId})` },
  getAlertReliability: { run: (E, a) => ({ ok: true, alerts: a.pick(E.alerts('all')) }), chip: (a) => `getAlertReliability(${a.label || 'route'})` },
  getFareRules: { run: (E, a) => ({ ok: true, text: rulesText(E.net, a.mode) }), chip: (a) => `getFareRules(${a.mode || 'all'})` },
  simulate: { run: (E, a) => E.simulate(a), chip: (a) => `simulate(${a.origin}->${a.destination}, ${[a.scenario.rain.length && 'rain ' + a.scenario.rain.join('+'), a.scenario.blocked.length && 'blocked ' + a.scenario.blocked.join('+'), a.scenario.rush && 'rush'].filter(Boolean).join(', ')})` },
  roadStatus: { run: (E) => E.browse(), chip: (a) => `roadStatus(${a.hubs.join(', ') || 'all'})` },
  watchTrip: { run: (E, a) => E.watchCreate(a), chip: (a) => `watchTrip(${a.origin}->${a.destination})` },
  splitFare: { run: (E, a) => E.rideQuote(a), chip: (a) => `splitFare(${a.from}->${a.to}, ${a.mode}, ${a.people} people)` },
  bestTime: { run: (E, a) => E.bestTime(a), chip: (a, r) => `bestTime(${a.origin}->${a.destination}${a.departAt ? ', from ' + a.departAt : ''}${r && r.ok ? `, ${r.options.length ? r.options[0].timeline.length : 0} departures` : ''})` },
  rideBoard: { run: (E, a) => E.rideList(a), chip: (a) => `rideBoard(${a.hub})` },
};

function regularRange(o) { return o.legs.reduce((s, l) => { const lo = l.mode === 'rickshaw' || l.mode === 'cng' ? l.fare.rangeLow : l.fare.regular; const hi = l.mode === 'rickshaw' || l.mode === 'cng' ? l.fare.rangeHigh : l.fare.regular; return [s[0] + lo, s[1] + hi]; }, [0, 0]); }
function studentRange(o) { return o.legs.reduce((s, l) => { const lo = l.mode === 'rickshaw' || l.mode === 'cng' ? l.fare.rangeLow : l.fare.student; const hi = l.mode === 'rickshaw' || l.mode === 'cng' ? l.fare.rangeHigh : l.fare.student; return [s[0] + lo, s[1] + hi]; }, [0, 0]); }

// ctx: { engine, calls: [] }
export function callTool(ctx, name, args) {
  const t = TOOLS[name];
  const r = t.run(ctx.engine, args);
  ctx.calls.push(t.chip(args, r));
  return r;
}
