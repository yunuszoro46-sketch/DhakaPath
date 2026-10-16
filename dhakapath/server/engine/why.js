// Trust-aware "why" line for a route card (architecture doc task 14): which reports shaped this
// option and how much each was trusted. Pure function of the option, the alert list and the route
// that would win if there were no alerts at all.

// option: router option; alerts: alerts.list() views; plainBest: best option with no alert effects;
// fx: alerts.effects() (hard/soft map)
export function whyLines(option, alerts, plainBest, fx) {
  const stops = new Set(option.legs.flatMap((l) => l.stops));
  const roadStops = new Set(option.legs.filter((l) => l.mode !== 'metro').flatMap((l) => l.stops));
  const out = [];
  const reports = (a) => `${a.confirmations} report${a.confirmations === 1 ? '' : 's'}`;
  // detours: a hard alert sits on the alert-free best route but not on this option
  if (plainBest && plainBest.signature !== option.signature) {
    const plainStops = new Set(plainBest.legs.filter((l) => l.mode !== 'metro').flatMap((l) => l.stops));
    for (const a of alerts) {
      if (a.status === 'active' && a.hubId && plainStops.has(a.hubId) && !roadStops.has(a.hubId) && fx.hubs.get(a.hubId)?.break) {
        out.push({ kind: 'avoids', alertId: a.id, text: `Avoids ${a.placeName}: ${a.type} confirmed (${a.effectiveConfidence}, ${reports(a)})` });
      }
    }
  }
  for (const a of alerts) {
    if (!a.hubId || !stops.has(a.hubId)) continue;
    const onRoad = roadStops.has(a.hubId);
    if (a.status === 'active') out.push({ kind: 'hard', alertId: a.id, text: onRoad ? `Passes ${a.placeName}: ${a.type} confirmed (${a.effectiveConfidence}) → ${a.routingEffect.replace('hard: ', '')}` : `Metro passes over ${a.placeName}: ${a.type} there does not affect it` });
    else if (a.status === 'unverified') out.push({ kind: 'soft', alertId: a.id, text: onRoad ? `Passes ${a.placeName}: unverified ${a.type} (${a.effectiveConfidence}, ${reports(a)}) → only +25% time, not trusted enough to block` : `Metro passes over ${a.placeName} (unverified ${a.type})` });
    else if (a.status === 'fading') out.push({ kind: 'ignored', alertId: a.id, text: `Ignores fading report at ${a.placeName} (${a.effectiveConfidence}, last verified ${a.minutesSinceVerified} min ago)` });
    else if (a.status === 'disputed') out.push({ kind: 'ignored', alertId: a.id, text: `Ignores disputed report at ${a.placeName} (conflicting votes)` });
  }
  if (!out.length) out.push({ kind: 'clear', text: 'No street reports on this route' });
  return out;
}
