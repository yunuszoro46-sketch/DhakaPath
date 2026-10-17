// Grounding validator (spec 8.4): a plan is accepted only if every hub and line exists, every leg
// runs along real edges of its line, and any claimed fare equals the engine's fare (exact for bus,
// MRT and leguna; inside the range for rickshaw). Otherwise the caller replaces it with the engine route.
import { hub, line, lineSegment, lineEdge, hubName } from './network.js';
import { fareLeg } from './fare.js';

// plan: { legs: [{ line, from, to, mode?, fare? }], totalFare?, student?, rush?, rain?: [hubIds] }
export function groundRoute(net, plan) {
  const errors = [];
  const legs = Array.isArray(plan && plan.legs) ? plan.legs : [];
  if (!legs.length) return { ok: false, errors: ['plan has no legs'] };
  const out = [];
  legs.forEach((leg, i) => {
    const n = `leg ${i + 1}`;
    if (!hub(net, leg.from)) errors.push(`${n}: unknown hub "${leg.from}"`);
    if (!hub(net, leg.to)) errors.push(`${n}: unknown hub "${leg.to}"`);
    const l = line(net, leg.line);
    if (!l) { errors.push(`${n}: unknown line "${leg.line}"`); return; }
    if (leg.mode && leg.mode !== l.mode) errors.push(`${n}: line ${l.id} is ${l.mode}, not ${leg.mode}`);
    if (i > 0 && legs[i - 1].to !== leg.from) errors.push(`${n}: starts at ${leg.from} but the previous leg ended at ${legs[i - 1].to}`);
    if (!hub(net, leg.from) || !hub(net, leg.to)) return;
    const seg = lineSegment(net, l.id, leg.from, leg.to);
    if (!seg) { errors.push(`${n}: ${l.id} has no edge between ${hubName(net, leg.from)} and ${hubName(net, leg.to)}`); return; }
    const km = Math.round(seg.slice(1).reduce((s, h, k) => s + lineEdge(net, l.id, seg[k], h).km, 0) * 10) / 10;
    const rainSet = new Set(plan.rain || []);
    const f = fareLeg({ mode: l.mode, km, flatFare: l.flatFare }, { student: !!plan.student, rush: !!plan.rush, rain: seg.some((h) => rainSet.has(h)) }, net.config);
    if (leg.fare != null) {
      const c = Number(leg.fare);
      const okFare = l.mode === 'rickshaw' || l.mode === 'cng' ? c >= f.rangeLow && c <= f.rangeHigh : c === (plan.student ? f.student : f.regular);
      if (!okFare) errors.push(`${n}: claimed fare ৳${c} but the engine fare is ${f.rangeLow === f.rangeHigh ? '৳' + f.rangeLow : `৳${f.rangeLow}–${f.rangeHigh}`}`);
    }
    out.push({ line: l.id, mode: l.mode, from: leg.from, to: leg.to, stops: seg, km, fare: f });
  });
  const low = out.reduce((s, l) => s + l.fare.rangeLow, 0), high = out.reduce((s, l) => s + l.fare.rangeHigh, 0);
  if (!errors.length && plan.totalFare != null) {
    const c = Number(plan.totalFare);
    if (c < low || c > high) errors.push(`claimed total ৳${c} but the engine total is ${low === high ? '৳' + low : `৳${low}–${high}`}`);
  }
  return { ok: errors.length === 0, errors, legs: out, fare: { low, high } };
}

// Demo for the "Test AI hallucination" button: a plausible-sounding but invented plan.
export const FAKE_PLAN = { text: 'Bus 99 from Uttara to Banasree, 20 BDT', plan: { legs: [{ line: 'BUS99', mode: 'bus', from: 'UTT', to: 'BAN', fare: 20 }], totalFare: 20 } };
