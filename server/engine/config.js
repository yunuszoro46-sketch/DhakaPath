// Config guard (pure). Runs whenever a network is loaded (seed, state.json restore, tests, preview).
// - Traffic/ranking/alert COEFFICIENTS that are missing or abnormal fall back to a safe value and are
//   reported in `warnings` (shown by /api/health), so a bad number can never make a time NaN or negative.
// - FARE TABLES are required: a missing or non-numeric fare rule throws ConfigError at load time,
//   because inventing a fare would break "never claim unverified fares". Startup fails loudly
//   instead of a request failing quietly.

export class ConfigError extends Error { constructor(msg) { super(msg); this.name = 'ConfigError'; } }

export const MODES = ['metro', 'bus', 'leguna', 'rickshaw', 'cng', 'walk'];
export const MULT_MAX = 10;
const NEUTRAL = Object.fromEntries(MODES.map((m) => [m, 1]));
// Fallbacks: the seed values from the team spec, used only when the config value is unusable.
const DEF = {
  boardWait: { bus: 8, metro: 5, leguna: 5, rickshaw: 2, cng: 4, walk: 0 },
  transferWalkMinutes: 4,
  ranking: { minutesWeight: 1, fareWeight: 0.4, transferWeight: 8, maxEdges: 6, maxDfsNodes: 200000 },
  alerts: { activeTimeMultiplier: 2, unverifiedTimeMultiplier: 1.25, confirmStep: 0.2, resolveStep: 0.3, resolvedVotesToClose: 2,
    thresholds: { active: 0.6, unverified: 0.3, fading: 0.15 }, halfLifeMinutes: { waterlogging: 45, gridlock: 30, blockade: 60, construction: 1440 },
    initialConfidence: { user: 0.35, ai_ingest: 0.3, admin: 0.9 }, activeBreaksTypes: ['blockade', 'construction', 'waterlogging'] },
  rushHours: [['07:30', '10:30'], ['16:30', '20:00']],
  sanity: { rickshawPerKm: [5, 60], cngPerKm: [10, 100], busMaxFactor: 2, busMinimum: 10, contradictionWindowMinutes: 10, rateLimit: { reports: 3, windowMinutes: 10 }, severityDowngradeMinutes: 30 },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

// A time multiplier: finite and > 0; capped at MULT_MAX. Anything else -> fallback (neutral 1).
export function coef(v, fallback = 1) {
  const n = num(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, MULT_MAX);
}

export function sanitizeConfig(input) {
  const warnings = [];
  const cfg = isObj(input) ? JSON.parse(JSON.stringify(input)) : {};
  const fix = (path, bad, used) => warnings.push(`${path}: ${JSON.stringify(bad)} is not usable, using ${JSON.stringify(used)}`);
  const ranged = (obj, key, path, lo, hi, def, { int = false } = {}) => {
    const n = num(obj[key]);
    const ok = Number.isFinite(n) && n >= lo && n <= hi && (!int || Number.isInteger(n));
    if (!ok) { if (obj[key] !== undefined || def !== undefined) fix(path, obj[key], def); obj[key] = def; } else obj[key] = n;
  };

  // fares: required
  const f = cfg.fares;
  const need = (cond, what) => { if (!cond) throw new ConfigError(`config.fares: ${what}`); };
  need(isObj(f), 'missing');
  for (const [mode, keys] of [['bus', ['perKm', 'minimum', 'studentDivisor']], ['metro', ['perKm', 'minimum', 'maximum']], ['rickshaw', ['lowPerKm', 'highPerKm', 'minimum']], ['cng', ['lowPerKm', 'highPerKm', 'minimum']]]) {
    need(isObj(f[mode]), `${mode} fare rule missing`);
    for (const k of keys) { const n = num(f[mode][k]); need(Number.isFinite(n) && n >= 0, `${mode}.${k} must be a non-negative number (got ${JSON.stringify(f[mode][k])})`); f[mode][k] = n; }
  }
  need(f.bus.studentDivisor > 0, 'bus.studentDivisor must be > 0');
  // fare-table metadata: which version priced a trip, since when, from what source
  if (!(Number.isInteger(num(f.version)) && num(f.version) >= 1)) { if (f.version !== undefined) fix('fares.version', f.version, 1); f.version = 1; } else f.version = num(f.version);
  if (f.effectiveFrom != null && !Number.isFinite(num(f.effectiveFrom))) { fix('fares.effectiveFrom', f.effectiveFrom, null); f.effectiveFrom = null; }
  if (typeof f.source !== 'string') f.source = 'unspecified';
  need(f.metro.maximum >= f.metro.minimum, 'metro.maximum must be >= metro.minimum');
  if (!(num(f.metro.roundTo) > 0)) { if (f.metro.roundTo !== undefined) fix('fares.metro.roundTo', f.metro.roundTo, 5); f.metro.roundTo = 5; }
  for (const m of ['rickshaw', 'cng']) {
    need(f[m].highPerKm >= f[m].lowPerKm, `${m}.highPerKm must be >= lowPerKm`);
    if (!isObj(f[m].surge)) { fix(`fares.${m}.surge`, f[m].surge, { rush: 1, rain: 1, both: 1 }); f[m].surge = {}; }
    for (const k of ['rush', 'rain', 'both']) { const v = coef(f[m].surge[k], NaN); if (Number.isNaN(v)) { fix(`fares.${m}.surge.${k}`, f[m].surge[k], 1); f[m].surge[k] = 1; } else f[m].surge[k] = v; }
    if (!(num(f[m].roundTo) > 0)) f[m].roundTo = 5;
  }

  // traffic coefficients: rush, rain, heavy rain (missing -> neutral, abnormal -> neutral/capped)
  if (!isObj(cfg.conditions)) { fix('conditions', cfg.conditions, 'neutral (no rush/rain slow-down)'); cfg.conditions = {}; }
  for (const k of ['rush', 'rain', 'heavyRain']) {
    const c = cfg.conditions[k];
    if (!isObj(c)) {
      // heavy rain is optional: without it, heavy rain behaves like rain (never milder)
      if (k === 'heavyRain' && c === undefined) { cfg.conditions.heavyRain = { time: { ...cfg.conditions.rain.time }, blocksModes: [] }; continue; }
      fix(`conditions.${k}`, c, 'neutral ×1'); cfg.conditions[k] = { time: { ...NEUTRAL } }; if (k === 'heavyRain') cfg.conditions[k].blocksModes = []; continue;
    }
    if (!isObj(c.time)) { fix(`conditions.${k}.time`, c.time, 'neutral ×1'); c.time = {}; }
    for (const m of MODES) {
      const raw = c.time[m];
      if (raw === undefined) { c.time[m] = 1; continue; }
      const v = coef(raw, NaN);
      if (Number.isNaN(v)) { fix(`conditions.${k}.time.${m}`, raw, 1); c.time[m] = 1; }
      else { if (v !== num(raw)) fix(`conditions.${k}.time.${m}`, raw, v); c.time[m] = v; }
    }
    if (k === 'heavyRain') c.blocksModes = Array.isArray(c.blocksModes) ? c.blocksModes.filter((m) => MODES.includes(m) && m !== 'metro') : [];
  }

  if (!isObj(cfg.boardWait)) { fix('boardWait', cfg.boardWait, DEF.boardWait); cfg.boardWait = {}; }
  for (const m of MODES) ranged(cfg.boardWait, m, `boardWait.${m}`, 0, 120, DEF.boardWait[m]);
  ranged(cfg, 'transferWalkMinutes', 'transferWalkMinutes', 0, 60, DEF.transferWalkMinutes);

  if (!isObj(cfg.ranking)) { fix('ranking', cfg.ranking, DEF.ranking); cfg.ranking = {}; }
  for (const k of ['minutesWeight', 'fareWeight', 'transferWeight']) ranged(cfg.ranking, k, `ranking.${k}`, 0, 1000, DEF.ranking[k]);
  ranged(cfg.ranking, 'maxEdges', 'ranking.maxEdges', 1, 10, DEF.ranking.maxEdges, { int: true });
  ranged(cfg.ranking, 'maxDfsNodes', 'ranking.maxDfsNodes', 1, 5e6, DEF.ranking.maxDfsNodes, { int: true });

  if (!isObj(cfg.alerts)) { fix('alerts', cfg.alerts, 'defaults'); cfg.alerts = {}; }
  const a = cfg.alerts, d = DEF.alerts;
  a.activeTimeMultiplier = coef(a.activeTimeMultiplier, NaN); if (!(a.activeTimeMultiplier >= 1)) { fix('alerts.activeTimeMultiplier', input?.alerts?.activeTimeMultiplier, d.activeTimeMultiplier); a.activeTimeMultiplier = d.activeTimeMultiplier; }
  a.unverifiedTimeMultiplier = coef(a.unverifiedTimeMultiplier, NaN); if (!(a.unverifiedTimeMultiplier >= 1)) { fix('alerts.unverifiedTimeMultiplier', input?.alerts?.unverifiedTimeMultiplier, d.unverifiedTimeMultiplier); a.unverifiedTimeMultiplier = d.unverifiedTimeMultiplier; }
  for (const k of ['confirmStep', 'resolveStep']) ranged(a, k, `alerts.${k}`, 0, 1, d[k]);
  ranged(a, 'resolvedVotesToClose', 'alerts.resolvedVotesToClose', 1, 100, d.resolvedVotesToClose, { int: true });
  for (const k of ['thresholds', 'halfLifeMinutes', 'initialConfidence']) if (!isObj(a[k])) { fix(`alerts.${k}`, a[k], d[k]); a[k] = { ...d[k] }; }
  for (const k of Object.keys(d.thresholds)) ranged(a.thresholds, k, `alerts.thresholds.${k}`, 0, 1, d.thresholds[k]);
  for (const k of Object.keys(d.halfLifeMinutes)) ranged(a.halfLifeMinutes, k, `alerts.halfLifeMinutes.${k}`, 1, 100000, d.halfLifeMinutes[k]);
  for (const k of Object.keys(d.initialConfidence)) ranged(a.initialConfidence, k, `alerts.initialConfidence.${k}`, 0, 1, d.initialConfidence[k]);
  if (!Array.isArray(a.activeBreaksTypes)) { fix('alerts.activeBreaksTypes', a.activeBreaksTypes, d.activeBreaksTypes); a.activeBreaksTypes = [...d.activeBreaksTypes]; }

  const hhmm = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  if (!Array.isArray(cfg.rushHours) || !cfg.rushHours.every((w) => Array.isArray(w) && w.length === 2 && hhmm(w[0]) && hhmm(w[1]))) {
    if (cfg.rushHours !== undefined) fix('rushHours', cfg.rushHours, DEF.rushHours);
    cfg.rushHours = DEF.rushHours.map((w) => [...w]);
  }
  if (!isObj(cfg.sanity)) { fix('sanity', cfg.sanity, 'defaults'); cfg.sanity = {}; }
  cfg.sanity = { ...DEF.sanity, ...cfg.sanity, rateLimit: { ...DEF.sanity.rateLimit, ...(isObj(cfg.sanity.rateLimit) ? cfg.sanity.rateLimit : {}) } };
  return { config: cfg, warnings };
}
