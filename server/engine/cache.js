// Route-result cache (pure). A findRoutes result depends only on: origin, destination, constraints,
// the scenario (rush/rain/blocks/disabled lines/delays), the alert EFFECTS (break / multiplier per
// hub and link, not the decaying confidence numbers) and the network itself. Polls, Trip Watch
// re-checks and repeated searches therefore reuse results until one of those changes. Any network
// or fare edit calls clear(). Results are returned as shallow copies so callers can stamp their own
// top-level fields without touching the cached entry.

export function fxSignature(fx) {
  if (!fx) return '';
  const part = (m) => [...(m || new Map())].map(([k, v]) => `${k}:${v.break ? 'B' : ''}${v.soft ? 'S' : ''}${v.mult}`).sort().join(',');
  return `${part(fx.hubs)}|${part(fx.edges)}`;
}

export function createRouteCache(find, { max = 300 } = {}) {
  const map = new Map();
  const stats = { hits: 0, misses: 0, clears: 0 };
  return {
    stats,
    clear() { map.clear(); stats.clears++; },
    route(net, origin, dest, constraints = {}, scenario = {}, fx) {
      let key;
      try { key = JSON.stringify([net.rev || 0, origin, dest, constraints, scenario, fxSignature(fx)]); } catch { return find(net, origin, dest, constraints, scenario, fx); }
      const hit = map.get(key);
      if (hit) { stats.hits++; map.delete(key); map.set(key, hit); return { ...hit, cached: true }; }
      stats.misses++;
      const r = find(net, origin, dest, constraints, scenario, fx);
      map.set(key, r);
      if (map.size > max) map.delete(map.keys().next().value);
      return { ...r };
    },
  };
}
