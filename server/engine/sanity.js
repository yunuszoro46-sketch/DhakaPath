// Sanity rules S1–S5 (spec section 7). Each returns a flag (or null) so the caller decides.
import { busRegular } from './fare.js';
const MIN = 60000;

// S1: fare submission realism. km = distance of the trip on that mode.
export function s1Fare({ mode, amount, km }, cfg) {
  const a = Number(amount);
  if (!Number.isFinite(a)) return 'unrealistic_fare';
  if (mode === 'rickshaw' || mode === 'cng') { const pk = a / km; const [lo, hi] = cfg.sanity[mode + 'PerKm']; return pk < lo || pk > hi ? 'unrealistic_fare' : null; }
  if (mode === 'bus') return a < cfg.sanity.busMinimum || a > cfg.sanity.busMaxFactor * busRegular(km, cfg) ? 'unrealistic_fare' : null;
  return null;
}

// S2: a resolve ("clear") vote from a different user within the window of the last verification.
export function s2Contradiction(alert, userId, now, cfg) {
  return !alert.confirmations.includes(userId) && now - alert.lastVerifiedAt <= cfg.sanity.contradictionWindowMinutes * MIN ? 'disputed' : null;
}

// S3: the report must name a known hub or edge.
export function s3Place(net, { hubId, edgeId }) {
  if (hubId && net.hubs.some((h) => h.id === hubId)) return null;
  if (edgeId && net.edges.some((e) => e.id === edgeId)) return null;
  return 'unknown_place';
}

// S4: more than N reports from one user within the window.
export function s4RateLimit(log, userId, now, cfg) {
  const { reports, windowMinutes } = cfg.sanity.rateLimit;
  const recent = log.filter((r) => r.userId === userId && now - r.at <= windowMinutes * MIN).length;
  return recent >= reports ? 'rate_limited' : null;
}

// S5: severity-3 report with no corroboration, older than the limit -> downgrade to 2.
export function s5Downgrade(alert, now, cfg) {
  if (alert.severity === 3 && alert.confirmations.length <= 1 && now - alert.createdAt > cfg.sanity.severityDowngradeMinutes * MIN) {
    alert.severity = 2;
    if (!alert.flags.includes('auto_downgraded')) alert.flags.push('auto_downgraded');
    return true;
  }
  return false;
}
