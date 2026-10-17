// Disruption simulation (spec section 6, algorithm doc §7): the main route before and after a
// scenario { rain, rainSeverity, rush, blocked, disabledLines, blockedEdges, delays }; active alerts
// feed into both. Also reports whether the backup planned before the change still holds.
import { findRoutes, edgeState, makeCtx, evaluatePlan } from './router.js';
import { hubName, line } from './network.js';

export const PRESETS = {
  sciRain: { label: 'Rain at Science Lab', rain: ['SCI'] },
  sciFlood: { label: 'Science Lab flooded (rain + blocked)', rain: ['SCI'], blocked: ['SCI'] },
  rush: { label: 'Rush hour', rush: true },
  monsoon: { label: 'Monsoon evening (rain south + rush)', rain: ['SCI', 'DHA', 'SHA', 'MOT'], rush: true },
  heavyRain: { label: 'Heavy rain south (CNG & leguna off the road)', rain: ['SCI', 'DHA', 'SHA', 'MOT', 'MPR', 'JAT'], rainSeverity: 'heavy' },
  mrtDown: { label: 'MRT-6 suspended', disabledLines: ['MRT6'] },
  mrtDelay: { label: 'MRT-6 delayed (+50%, +10 min hold-up)', delays: [{ line: 'MRT6', rate: 0.5, extraMinutes: 10, label: 'MRT-6 signal fault' }] },
};
const u = (a, b) => [...new Set([...(a || []), ...(b || [])])];

export function simulate(net, origin, dest, constraints, scenario, alertFx, base = {}, route = findRoutes) {
  // base: conditions already in force (e.g. automatic rush hour); the scenario adds to them
  const sc = { rain: u(base.rain, scenario.rain), rush: !!(scenario.rush || base.rush), blocked: u(base.blocked, scenario.blocked),
    rainSeverity: scenario.rainSeverity === 'heavy' || base.rainSeverity === 'heavy' ? 'heavy' : 'light', disabledLines: u(base.disabledLines, scenario.disabledLines),
    blockedEdges: u(base.blockedEdges, scenario.blockedEdges), delays: [...(scenario.delays || []), ...(base.delays || [])] };
  const before = route(net, origin, dest, constraints, base, alertFx);
  const after = route(net, origin, dest, constraints, sc, alertFx);
  const b = before.ok ? before.primary : null, a = after.ok ? after.primary : null;
  const brokenSegments = [];
  if (b) {
    const ctx0 = makeCtx(origin, dest, constraints, base, alertFx), ctx1 = makeCtx(origin, dest, constraints, sc, alertFx);
    for (const leg of b.legs) for (let k = 0; k < leg.edgeIds.length; k++) {
      const e = net.edges.find((x) => x.id === leg.edgeIds[k]);
      const from = leg.stops[k], to = leg.stops[k + 1];
      const s0 = edgeState(net, e, from, to, ctx0), s1 = edgeState(net, e, from, to, ctx1);
      const seg = { edgeId: e.id, line: e.line, mode: e.mode, from, to, fromName: hubName(net, from), toName: hubName(net, to) };
      if (!s1.ok) brokenSegments.push({ ...seg, kind: 'broken', reason: s1.reason });
      else if (s0.ok && s1.minutes > s0.minutes * 1.05) brokenSegments.push({ ...seg, kind: 'slowed', reason: `${s0.minutes}→${s1.minutes} min (${s1.reasons.join(', ')})` });
    }
  }
  const changed = !!(a && b && a.signature !== b.signature);
  const delta = a && b ? { minutes: a.totalMinutes - b.totalMinutes, fareLow: a.fareRangeLow - b.fareRangeLow, fareHigh: a.fareRangeHigh - b.fareRangeHigh } : null;
  const own = { rain: scenario.rain || [], rush: !!scenario.rush && !base.rush, blocked: scenario.blocked || [] };
  const lname = (id) => (id === 'MRT6' ? 'MRT-6' : (line(net, id) || { name: id }).name);
  const what = [own.rain.length && `${scenario.rainSeverity === 'heavy' ? 'heavy rain' : 'rain'} at ${own.rain.map((h) => hubName(net, h)).join(', ')}`, own.rush && 'rush hour',
    own.blocked.length && `${own.blocked.map((h) => hubName(net, h)).join(', ')} blocked`,
    (scenario.disabledLines || []).length && `${scenario.disabledLines.map(lname).join(', ')} not running`,
    (scenario.blockedEdges || []).length && `${scenario.blockedEdges.length} link(s) closed`,
    (scenario.delays || []).length && `${scenario.delays.map((d) => `${d.edgeId || (d.line ? lname(d.line) : hubName(net, d.hub))} delayed${d.rate ? ` +${Math.round(d.rate * 100)}%` : ''}${d.extraMinutes ? ` +${d.extraMinutes} min` : ''}`).join(', ')}`,
  ].filter(Boolean).join(', ') || (scenario.rush && base.rush ? 'rush hour (already in force)' : 'no change');
  // the backup planned before the change: does it still work afterwards?
  let backup = null;
  if (before.ok && before.backup && before.backup.option) {
    const bo = before.backup.option;
    const ev = evaluatePlan(net, bo.legs, constraints, sc, alertFx);
    backup = { option: bo, trigger: before.backup.trigger, critical: before.backup.critical, holds: ev.ok, brokenAt: ev.ok ? null : ev.brokenAt,
      afterMinutes: ev.ok ? ev.option.totalMinutes : null, isNewMain: !!(a && a.signature === bo.signature) };
  }
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  let explanation;
  if (!b) explanation = 'There was no open route before the scenario.';
  else if (!a) explanation = `With ${what}, no open route remains between ${hubName(net, origin)} and ${hubName(net, dest)}.`;
  else {
    const broken = brokenSegments.filter((s) => s.kind === 'broken');
    // merge consecutive cut links of one line: "MRT6 Mirpur–Motijheel" rather than four pieces
    const runs = [];
    for (const x of broken) { const r = runs[runs.length - 1]; if (r && r.line === x.line && r.to === x.from) { r.to = x.to; r.toName = x.toName; } else runs.push({ ...x }); }
    explanation = `With ${what}, ${broken.length ? `${runs.map((s) => `${s.line} ${s.fromName}–${s.toName}`).join(', ')} ${runs.length === 1 ? 'is' : 'are'} cut` : brokenSegments.length ? `${brokenSegments.length} segment(s) slow down` : 'the usual route is not affected'}. `
      + (changed ? `Detour: ${a.summary}. ` : 'Same route. ')
      + `${a.totalMinutes} min (${sign(delta.minutes)} min), ${a.fareRangeLow === a.fareRangeHigh ? '৳' + a.fareRangeLow : `৳${a.fareRangeLow}–${a.fareRangeHigh}`} (${sign(delta.fareLow)}${delta.fareLow !== delta.fareHigh ? ` to ${sign(delta.fareHigh)}` : ''} BDT).`;
  }
  if (backup && changed) explanation += backup.isNewMain ? ' This is the backup planned before the change.' : backup.holds ? ` The planned backup (${backup.option.summary}) also still works: ${backup.afterMinutes} min.` : ' The planned backup is cut too.';
  return { ok: true, simulated: true, scenario: sc, before, after, beforeOption: b, afterOption: a, brokenSegments, changedRoute: changed, delta, backup, explanation };
}
