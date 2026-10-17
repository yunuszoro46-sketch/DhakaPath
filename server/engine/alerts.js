// Alert trust pipeline (spec section 7). Confidence: base (user 0.35, ai_ingest 0.30, admin 0.90),
// +0.20 per unique confirmation, -0.30 per unique resolved vote, halving every half-life since the
// last verification. Status: >= 0.60 active (hard), 0.30–0.59 unverified (soft), 0.15–0.29 fading
// (no effect), < 0.15 expired. Everything takes an explicit `now` so it is testable.
import { s2Contradiction, s3Place, s4RateLimit, s5Downgrade } from './sanity.js';
import { hubName } from './network.js';

export const TYPES = ['waterlogging', 'construction', 'gridlock', 'blockade'];
const MIN = 60000;
const r2 = (x) => Math.round(x * 100) / 100;

export function createStore() { return { alerts: [], queue: [], reportLog: [], fareReports: [], fareHistory: [], rides: [], seq: 0 }; }

export function effectiveConfidence(a, now, cfg) {
  const half = cfg.alerts.halfLifeMinutes[a.type] || 60;
  return a.baseConfidence * Math.pow(0.5, Math.max(0, now - a.lastVerifiedAt) / MIN / half);
}

export function statusOf(a, now, cfg) {
  if (a.removed) return 'removed';
  if (a.resolved) return 'resolved';
  const c = effectiveConfidence(a, now, cfg);
  const t = cfg.alerts.thresholds;
  if (c < t.fading) return 'expired';
  if (a.flags.includes('disputed')) return 'disputed';
  return c >= t.active ? 'active' : c >= t.unverified ? 'unverified' : 'fading';
}

export function view(net, a, now) {
  const cfg = net.config;
  s5Downgrade(a, now, cfg);
  const status = statusOf(a, now, cfg);
  const eff = effectiveConfidence(a, now, cfg);
  return {
    id: a.id, hubId: a.hubId || null, edgeId: a.edgeId || null, placeName: a.hubId ? hubName(net, a.hubId) : a.edgeId,
    type: a.type, severity: a.severity, text: a.text, source: a.source, createdAt: a.createdAt, lastVerifiedAt: a.lastVerifiedAt,
    confirmations: a.confirmations.length, resolvedVotes: a.resolvedVotes.length, baseConfidence: a.baseConfidence,
    effectiveConfidence: r2(eff), status, flags: [...a.flags],
    ageMinutes: Math.round((now - a.createdAt) / MIN), minutesSinceVerified: Math.round((now - a.lastVerifiedAt) / MIN),
    routingEffect: status === 'active' ? (cfg.alerts.activeBreaksTypes.includes(a.type) ? 'hard: road links broken' : `hard: time ×${cfg.alerts.activeTimeMultiplier}`)
      : status === 'unverified' ? `soft: time ×${cfg.alerts.unverifiedTimeMultiplier}` : 'none',
  };
}

// input: { hubId | edgeId, type, severity, text, source: 'user'|'admin'|'ai_ingest', userId }
export function createAlert(store, net, input, now) {
  const cfg = net.config;
  const userId = input.userId || 'anon';
  const placeFlag = s3Place(net, input);
  const typeOk = TYPES.includes(input.type);
  if (placeFlag || !typeOk) {
    const reason = placeFlag ? `S3: unknown hub or route "${input.hubId || input.edgeId || ''}"` : `unknown alert type "${input.type}"`;
    store.queue.push({ kind: 'rejected_report', at: now, userId, text: input.text || '', reason, flags: [placeFlag || 'unknown_type'] });
    return { ok: false, error: 'rejected', reason };
  }
  if (input.source !== 'admin' && s4RateLimit(store.reportLog, userId, now, cfg)) {
    store.queue.push({ kind: 'throttled', at: now, userId, text: input.text || '', reason: `S4: more than ${cfg.sanity.rateLimit.reports} reports in ${cfg.sanity.rateLimit.windowMinutes} min`, flags: ['rate_limited'] });
    return { ok: false, error: 'rate_limited', reason: 'Too many reports from you in a short time. Try again later.' };
  }
  store.reportLog.push({ userId, at: now });
  // a matching open alert (same place and type) is corroborated instead of duplicated
  const open = store.alerts.find((a) => a.type === input.type && (a.hubId || null) === (input.hubId || null) && (a.edgeId || null) === (input.edgeId || null)
    && !['expired', 'resolved', 'removed'].includes(statusOf(a, now, cfg)));
  if (open) {
    const c = confirm(store, net, open.id, userId, now);
    return { ok: true, merged: true, alert: c.alert, ignored: c.ignored };
  }
  const source = ['user', 'admin', 'ai_ingest'].includes(input.source) ? input.source : 'user';
  const a = {
    id: 'A' + (++store.seq), hubId: input.hubId || null, edgeId: input.edgeId || null, type: input.type,
    severity: [1, 2, 3].includes(Number(input.severity)) ? Number(input.severity) : 2, text: String(input.text || '').slice(0, 280), source,
    createdAt: now, lastVerifiedAt: now, confirmations: [userId], resolvedVotes: [], baseConfidence: cfg.alerts.initialConfidence[source], flags: [],
  };
  store.alerts.push(a);
  return { ok: true, merged: false, alert: view(net, a, now) };
}

export function confirm(store, net, id, userId, now) {
  const cfg = net.config;
  const a = store.alerts.find((x) => x.id === id);
  if (!a) return { ok: false, error: 'not_found' };
  const st = statusOf(a, now, cfg);
  if (['expired', 'resolved', 'removed'].includes(st)) return { ok: false, error: 'closed', alert: view(net, a, now) };
  if (a.confirmations.includes(userId) || a.resolvedVotes.includes(userId)) return { ok: true, ignored: true, alert: view(net, a, now) };
  a.confirmations.push(userId);
  a.baseConfidence = r2(Math.min(1, effectiveConfidence(a, now, cfg) + cfg.alerts.confirmStep));
  a.lastVerifiedAt = now;
  if (a.flags.includes('disputed')) a.flags = a.flags.filter((f) => f !== 'disputed');   // third vote settles the dispute
  return { ok: true, ignored: false, alert: view(net, a, now) };
}

export function resolveVote(store, net, id, userId, now) {
  const cfg = net.config;
  const a = store.alerts.find((x) => x.id === id);
  if (!a) return { ok: false, error: 'not_found' };
  const st = statusOf(a, now, cfg);
  if (['expired', 'resolved', 'removed'].includes(st)) return { ok: false, error: 'closed', alert: view(net, a, now) };
  if (a.resolvedVotes.includes(userId) || a.confirmations.includes(userId)) return { ok: true, ignored: true, alert: view(net, a, now) };
  const wasDisputed = a.flags.includes('disputed');
  const contradiction = s2Contradiction(a, userId, now, cfg);
  a.resolvedVotes.push(userId);
  a.baseConfidence = r2(Math.max(0, a.baseConfidence - cfg.alerts.resolveStep));
  if (a.resolvedVotes.length >= cfg.alerts.resolvedVotesToClose) { a.resolved = true; a.flags = a.flags.filter((f) => f !== 'disputed'); }
  else if (contradiction && !wasDisputed) {
    a.flags.push('disputed');
    store.queue.push({ kind: 'alert', alertId: a.id, at: now, userId, reason: `S2: "clear" vote within ${cfg.sanity.contradictionWindowMinutes} min of a confirmation by another user`, flags: ['disputed'] });
  }
  return { ok: true, ignored: false, alert: view(net, a, now) };
}

export function moderate(store, net, id, action, now) {
  const a = store.alerts.find((x) => x.id === id);
  if (!a) return { ok: false, error: 'not_found' };
  if (action === 'approve') { a.baseConfidence = Math.max(a.baseConfidence, net.config.alerts.initialConfidence.admin); a.lastVerifiedAt = now; a.flags = []; }
  else if (action === 'remove') a.removed = true;
  else if (action === 'clear_flag') a.flags = [];
  else return { ok: false, error: 'bad_action' };
  store.queue = store.queue.filter((q) => q.alertId !== id);
  return { ok: true, alert: view(net, a, now) };
}

export function list(store, net, now, status) {
  const all = store.alerts.map((a) => view(net, a, now)).reverse();
  if (!status) return all.filter((a) => !['expired', 'removed'].includes(a.status));
  if (status === 'all') return all;
  const want = String(status).split(',');
  return all.filter((a) => want.includes(a.status));
}

export function queue(store, net, now) {
  const flagged = store.alerts.filter((a) => a.flags.length && !a.removed).map((a) => ({ kind: 'alert', alertId: a.id, reason: a.flags.join(', '), alert: view(net, a, now) }));
  const others = store.queue.filter((q) => q.kind !== 'alert');
  const fares = store.fareReports.filter((f) => f.flags.length).map((f) => ({ kind: 'fare', at: f.at, userId: f.userId, reason: `S1: ${f.flags.join(', ')} (৳${f.amount} ${f.mode} ${f.origin}→${f.destination})`, flags: f.flags }));
  return [...flagged, ...others, ...fares];
}

// Routing effects: active = hard, unverified = soft; fading, disputed, expired, resolved, removed: none.
export function effects(store, net, now) {
  const cfg = net.config;
  const fx = { hubs: new Map(), edges: new Map(), used: [] };
  for (const a of store.alerts) {
    const st = statusOf(a, now, cfg);
    if (st !== 'active' && st !== 'unverified') continue;
    const map = a.hubId ? fx.hubs : fx.edges;
    const key = a.hubId || a.edgeId;
    const cur = map.get(key) || { break: false, mult: 1, soft: true, ids: [], labels: [] };
    if (st === 'active') {
      cur.soft = false;
      if (cfg.alerts.activeBreaksTypes.includes(a.type)) cur.break = true;
      else cur.mult = Math.max(cur.mult, cfg.alerts.activeTimeMultiplier);
    } else cur.mult = Math.max(cur.mult, cfg.alerts.unverifiedTimeMultiplier);
    cur.ids.push(a.id); cur.labels.push(`${a.type} ${st}`);
    map.set(key, cur);
    fx.used.push(a.id);
  }
  return fx;
}

export function hubStatus(store, net, now) {
  const fx = effects(store, net, now);
  const out = {};
  for (const h of net.hubs) { const f = fx.hubs.get(h.id); out[h.id] = !f ? 'clear' : f.break ? 'blocked' : 'caution'; }
  return out;
}
