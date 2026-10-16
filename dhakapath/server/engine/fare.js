// Fare engine: pure functions over config.json (spec section 4). SEED ASSUMPTIONS, NOT OFFICIAL.

export const round5 = (x) => Math.round(x / 5 + 1e-9) * 5;        // nearest 5, halves up (97.5 -> 100)
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function busRegular(km, cfg) { return Math.max(cfg.fares.bus.minimum, Math.round(km * cfg.fares.bus.perKm + 1e-9)); }
export function studentFare(regular, cfg) { return Math.max(cfg.fares.bus.minimum, Math.ceil(regular / cfg.fares.bus.studentDivisor)); }
export function metroFare(km, cfg) { const m = cfg.fares.metro; return clamp(round5(km * m.perKm), m.minimum, m.maximum); }
export function rangeFare(mode, km, { rush = false, rain = false } = {}, cfg) {
  const r = cfg.fares[mode];
  const s = rush && rain ? r.surge.both : rush ? r.surge.rush : rain ? r.surge.rain : 1;
  const low = Math.max(r.minimum, r.lowPerKm * km), high = Math.max(r.minimum, r.highPerKm * km);
  return { low: round5(low * s), high: round5(high * s), baseLow: round5(low), baseHigh: round5(high), surge: s };
}
export function rickshawRange(km, cond, cfg) { return rangeFare('rickshaw', km, cond, cfg); }

// Mode names people and other systems use -> engine modes.
const MODE_ALIAS = { bus: 'bus', 'local bus': 'bus', local_bus: 'bus', localbus: 'bus', 'city bus': 'bus', metro: 'metro', mrt: 'metro', 'mrt-6': 'metro', mrt6: 'metro', 'metro rail': 'metro',
  leguna: 'leguna', tempo: 'leguna', 'human haular': 'leguna', rickshaw: 'rickshaw', riksha: 'rickshaw', cng: 'cng', 'cng auto': 'cng', 'auto rickshaw': 'cng', autorickshaw: 'cng', walk: 'walk', walking: 'walk' };
export function normalizeMode(m) { return typeof m === 'string' ? MODE_ALIAS[m.trim().toLowerCase().replace(/\s+/g, ' ')] || null : null; }

// Integer taka for display. Fares are integers except the rickshaw/CNG midpoint used for ranking
// (e.g. 37.5); amounts are shown rounded, never as 37.49999 or NaN.
export const taka = (x) => (Number.isFinite(x) ? `৳${Math.round(x)}` : '৳?');

// A leg we cannot price: never ৳0 silently. Totals carry fareUnknown so budgets say "unknown".
const unknownFare = (why) => ({ regular: 0, student: 0, rangeLow: 0, rangeHigh: 0, studentApplies: false, surge: 1, unknown: true, note: `Fare unknown: ${why}` });

// leg: { mode, km, line, flatFare? } ; opts: { student, rush, rain (this leg is in rain) }
// km 0 is allowed (the minimum fare applies, as when you board and get off at the next stop);
// a missing, negative or non-numeric km or an unknown mode gives an "unknown" fare, never NaN.
export function fareLeg(leg, opts = {}, cfg) {
  const student = !!opts.student;
  if (!leg || typeof leg !== 'object') return unknownFare('no leg data');
  const mode = normalizeMode(leg.mode);
  if (!mode) return unknownFare(leg.mode == null || leg.mode === '' ? 'vehicle type missing' : `unknown vehicle type "${String(leg.mode).slice(0, 30)}"`);
  const km = typeof leg.km === 'string' && leg.km.trim() !== '' ? Number(leg.km) : leg.km;
  if (mode !== 'walk' && mode !== 'leguna' && !(typeof km === 'number' && Number.isFinite(km) && km >= 0 && km < 1000)) return unknownFare(`distance ${JSON.stringify(leg.km)} is not usable`);
  leg = { ...leg, mode, km };
  switch (mode) {
    case 'bus': {
      const regular = busRegular(leg.km, cfg), stu = studentFare(regular, cfg);
      return { regular, student: stu, rangeLow: student ? stu : regular, rangeHigh: student ? stu : regular, studentApplies: true, surge: 1,
        note: `Bus: max(10, round(${leg.km} km × ${cfg.fares.bus.perKm})) = ৳${regular}; student max(10, ceil(${regular}/2)) = ৳${stu}` };
    }
    case 'metro': {
      const f = metroFare(leg.km, cfg);
      return { regular: f, student: f, rangeLow: f, rangeHigh: f, studentApplies: false, surge: 1,
        note: `MRT-6: ৳5/km for ${leg.km} km, rounded to 5, between ৳20 and ৳100 = ৳${f}; no student discount` };
    }
    case 'leguna': {
      const f = Number(leg.flatFare);
      if (!(Number.isFinite(f) && f > 0)) return unknownFare('this leguna line has no flat fare set');
      return { regular: f, student: f, rangeLow: f, rangeHigh: f, studentApplies: false, surge: 1, note: `Leguna flat fare ৳${f}; no student discount` };
    }
    case 'rickshaw':
    case 'cng': {
      const r = rangeFare(leg.mode, leg.km, { rush: !!opts.rush, rain: !!opts.rain }, cfg);
      const mid = (r.low + r.high) / 2;
      const name = leg.mode === 'cng' ? 'CNG' : 'Rickshaw';
      return { regular: mid, student: mid, rangeLow: r.low, rangeHigh: r.high, baseLow: r.baseLow, baseHigh: r.baseHigh, studentApplies: false, surge: r.surge,
        note: `${name} (negotiable) baseline ৳${r.baseLow}–${r.baseHigh}${r.surge !== 1 ? `, with surge ×${r.surge}: ৳${r.low}–${r.high}` : ''}; no student discount` };
    }
    case 'walk':
      return { regular: 0, student: 0, rangeLow: 0, rangeHigh: 0, studentApplies: false, surge: 1, note: 'Walking: free' };
    default:
      return unknownFare(`unknown vehicle type "${mode}"`);
  }
}

// legs: [{ mode, km, flatFare, rain? }]
export function fareTrip(legs, opts, cfg) {
  const items = (Array.isArray(legs) ? legs : []).map((l) => fareLeg(l, { ...opts, rain: !!(l && l.rain) }, cfg));
  const sum = (k) => items.reduce((s, f) => s + f[k], 0);
  const r = { legs: items, totalFareRegular: sum('regular'), totalFareStudent: sum('student'), fareRangeLow: sum('rangeLow'), fareRangeHigh: sum('rangeHigh') };
  r.fare = opts.student ? r.totalFareStudent : r.totalFareRegular;   // midpoint-based cost used for ranking
  r.fareUnknown = items.some((f) => f.unknown);
  return r;
}

// Fare Truth: claimed amount vs the engine's expected fare (range for rickshaw).
export function checkClaimedFare(claimed, expected) {
  const lo = expected.rangeLow, hi = expected.rangeHigh;
  const c = Number(claimed);
  if (!Number.isFinite(c) || c < 0) return { verdict: 'unknown', text: 'No valid amount given.' };
  if (c < lo) return { verdict: 'below', text: `৳${c} is below the expected ${lo === hi ? '৳' + lo : `৳${lo}–${hi}`}.` };
  if (c <= hi) return { verdict: 'fair', text: `৳${c} is within the expected ${lo === hi ? '৳' + lo : `৳${lo}–${hi}`}.` };
  const pct = Math.round((c / hi - 1) * 100);
  return { verdict: pct <= 20 ? 'slightly_high' : 'overcharge', text: `৳${c} is ${pct}% above the expected ${lo === hi ? '৳' + lo : `৳${lo}–${hi}`}.` };
}

export const fmtRange = (lo, hi) => (Math.round(lo) === Math.round(hi) ? taka(lo) : `${taka(lo)}–${Math.round(hi)}`);
