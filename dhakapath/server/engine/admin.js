// Transit-network CMS (problem Part 1): lines, edges, fare chart, landmark notes, and the
// commuter browse view (routes, hub statuses, disruptions with metadata).
import { MODES, RANGE_MODES, DEMO_NOTICE, hub, line, hubName } from './network.js';
import { fareLeg, fmtRange } from './fare.js';
import * as A from './alerts.js';

export function adminMethods(E) {
  const net = E.net;
  return {
    adminRoutes(method, body = {}, id = null) {
      if (method === 'DELETE') {
        const li = net.lines.findIndex((l) => l.id === id);
        if (li >= 0) { const l = net.lines.splice(li, 1)[0]; net.edges = net.edges.filter((e) => e.line !== l.id); return { ok: true, deleted: { line: l.id } }; }
        const ei = net.edges.findIndex((e) => e.id === id);
        if (ei >= 0) return { ok: true, deleted: { edge: net.edges.splice(ei, 1)[0].id } };
        return { ok: false, error: 'not_found', message: `No line or edge "${id}".` };
      }
      if (body.kind === 'fares') return E.updateFares(body.fares || {}, { by: body._by, note: body.note });
      if (body.kind === 'hub') return E.updateHub(body);
      if (body.kind === 'edge') return E.updateEdge(body);
      return E.upsertLine(body, method === 'POST');
    },
    upsertLine(b, creating) {
      const errs = [];
      const mode = b.mode;
      const stops = Array.isArray(b.stops) ? b.stops.map((s) => E.hubId(s) || s) : [];
      const kms = Array.isArray(b.km) ? b.km.map(Number) : [];
      const mins = Array.isArray(b.minutes) ? b.minutes.map(Number) : null;
      if (!b.id || !/^[A-Za-z0-9_-]{1,24}$/.test(b.id)) errs.push('id: 1–24 letters, digits, - or _');
      if (creating && line(net, b.id)) errs.push(`id: line ${b.id} already exists`);
      if (!creating && !line(net, b.id)) errs.push(`id: no line ${b.id} to update`);
      if (!MODES.includes(mode)) errs.push(`mode: one of ${MODES.join(', ')}`);
      if (stops.length < 2) errs.push('stops: at least two hubs');
      stops.forEach((s, i) => { if (!hub(net, s)) errs.push(`stops[${i}]: unknown hub "${s}"`); });
      if (new Set(stops).size !== stops.length) errs.push('stops: a hub appears twice');
      if (kms.length !== stops.length - 1 || kms.some((k) => !(k > 0 && k < 100))) errs.push('km: one distance (0–100) per pair of stops');
      if (mins && (mins.length !== stops.length - 1 || mins.some((m) => !(m > 0 && m < 600)))) errs.push('minutes: one value (1–599) per pair of stops');
      if (mode === 'leguna' && !(Number(b.flatFare) > 0 && Number(b.flatFare) <= 500)) errs.push('flatFare: leguna needs a flat fare (1–500)');
      if (errs.length) return { ok: false, error: 'invalid_line', message: 'The line was not saved.', errors: errs };
      net.lines = net.lines.filter((l) => l.id !== b.id);
      net.edges = net.edges.filter((e) => e.line !== b.id);
      const l = { id: b.id, name: b.name || b.id, mode, stops, status: b.status === 'suspended' ? 'suspended' : 'active' };
      if (mode === 'leguna') l.flatFare = Number(b.flatFare);
      net.lines.push(l);
      for (let k = 0; k < stops.length - 1; k++) {
        const minutes = mins ? mins[k] : mode === 'bus' ? Math.round(kms[k] * 3 * 10) / 10 : Math.round(kms[k] * (mode === 'walk' ? 13 : mode === 'metro' ? 1.8 : 6) * 10) / 10;
        net.edges.push({ id: `${b.id}:${stops[k]}-${stops[k + 1]}`, line: b.id, mode, from: stops[k], to: stops[k + 1], km: kms[k], minutes, studentEligible: mode === 'bus', boardingNote: b.boardingNote || '' });
      }
      return { ok: true, line: l, edges: net.edges.filter((e) => e.line === b.id) };
    },
    updateEdge(b) {
      const e = net.edges.find((x) => x.id === b.id);
      if (!e) return { ok: false, error: 'not_found', message: `No edge "${b.id}".` };
      const errs = [];
      if (b.km != null && !(Number(b.km) > 0 && Number(b.km) < 100)) errs.push('km: 0–100');
      if (b.minutes != null && !(Number(b.minutes) > 0 && Number(b.minutes) < 600)) errs.push('minutes: 1–599');
      if (errs.length) return { ok: false, error: 'invalid_edge', message: 'The edge was not saved.', errors: errs };
      if (b.km != null) e.km = Number(b.km);
      if (b.minutes != null) e.minutes = Number(b.minutes);
      if (b.boardingNote != null) e.boardingNote = String(b.boardingNote).slice(0, 200);
      return { ok: true, edge: e };
    },
    // Fare chart update (real-world price drift). Accepts explicit rates and/or a percentage
    // adjustment of the per-km rates (e.g. after a fuel-price notice), plus surge factors and a note.
    // Every accepted change bumps fares.version, stamps effectiveFrom, and is kept in fareHistory
    // with before/after values, so a past fare report can be read against the table it was made under.
    updateFares(f = {}, { by = 'admin', note = '' } = {}) {
      const errs = [];
      const set = (path, v, lo, hi) => { const n = Number(v); if (!(n >= lo && n <= hi)) { errs.push(`${path}: ${lo}–${hi}`); return undefined; } return n; };
      const cur = net.config.fares, next = JSON.parse(JSON.stringify(cur));
      const PER_KM = { bus: ['perKm'], metro: ['perKm'], rickshaw: ['lowPerKm', 'highPerKm'], cng: ['lowPerKm', 'highPerKm'] };
      // 1. percentage adjustment: { adjustPercent: 10 } (bus, CNG, rickshaw) or { adjustPercent: { bus: 10, cng: 5 } }
      const adj = typeof f.adjustPercent === 'number' ? { bus: f.adjustPercent, rickshaw: f.adjustPercent, cng: f.adjustPercent } : f.adjustPercent && typeof f.adjustPercent === 'object' ? f.adjustPercent : {};
      for (const [m, pct] of Object.entries(adj)) {
        if (!PER_KM[m]) { errs.push(`adjustPercent.${m}: unknown mode`); continue; }
        const p = set(`adjustPercent.${m}`, pct, -50, 100); if (p === undefined) continue;
        for (const k of PER_KM[m]) next[m][k] = Math.round(next[m][k] * (1 + p / 100) * 100) / 100;
      }
      // 2. explicit values win over the adjustment
      if (f.bus) { if (f.bus.perKm != null) next.bus.perKm = set('bus.perKm', f.bus.perKm, 0.5, 20); if (f.bus.minimum != null) next.bus.minimum = set('bus.minimum', f.bus.minimum, 1, 100); }
      if (f.metro) for (const k of ['perKm', 'minimum', 'maximum']) if (f.metro[k] != null) next.metro[k] = set(`metro.${k}`, f.metro[k], 1, 500);
      for (const m of ['rickshaw', 'cng']) if (f[m]) {
        for (const k of ['lowPerKm', 'highPerKm', 'minimum']) if (f[m][k] != null) next[m][k] = set(`${m}.${k}`, f[m][k], 1, 500);
        if (f[m].surge) for (const k of ['rush', 'rain', 'both']) if (f[m].surge[k] != null) next[m].surge[k] = set(`${m}.surge.${k}`, f[m].surge[k], 1, 3);
      }
      if (!errs.length && next.metro.minimum > next.metro.maximum) errs.push('metro: minimum above maximum');
      for (const m of ['rickshaw', 'cng']) if (!errs.length && next[m].lowPerKm > next[m].highPerKm) errs.push(`${m}: lowPerKm above highPerKm`);
      if (note != null && String(note).length > 200) errs.push('note: 200 characters max');
      if (errs.length) return { ok: false, error: 'invalid_fares', message: 'The fare chart was not saved.', errors: errs };
      const changes = [];
      for (const m of ['bus', 'metro', 'rickshaw', 'cng']) for (const k of [...PER_KM[m], 'minimum', 'maximum']) if (next[m][k] !== undefined && next[m][k] !== cur[m][k]) changes.push({ path: `${m}.${k}`, from: cur[m][k], to: next[m][k] });
      for (const m of ['rickshaw', 'cng']) for (const k of ['rush', 'rain', 'both']) if (next[m].surge[k] !== cur[m].surge[k]) changes.push({ path: `${m}.surge.${k}`, from: cur[m].surge[k], to: next[m].surge[k] });
      if (!changes.length) return { ok: false, error: 'no_change', message: 'These are already the current fares; nothing was saved.' };
      next.version = (cur.version || 1) + 1; next.effectiveFrom = E.now(); next.source = `admin update${note ? `: ${String(note).slice(0, 200)}` : ''}`;
      E.store.fareHistory = E.store.fareHistory || [];
      E.store.fareHistory.push({ version: next.version, at: next.effectiveFrom, by, note: note ? String(note).slice(0, 200) : '', changes });
      if (E.store.fareHistory.length > 50) E.store.fareHistory.shift();
      net.config.fares = next;
      net.rev = (net.rev || 0) + 1;
      return { ok: true, fares: next, version: next.version, changes };
    },
    fareTable() { const f = net.config.fares; return { version: f.version || 1, effectiveFrom: f.effectiveFrom || null, source: f.source || '' }; },
    updateHub(b) {
      const h = hub(net, E.hubId(b.id) || b.id);
      if (!h) return { ok: false, error: 'not_found', message: `No hub "${b.id}".` };
      const notes = Array.isArray(b.landmarks) ? b.landmarks : [];
      const errs = [];
      if (!notes.length) errs.push('landmarks: at least one note');
      notes.forEach((n, i) => { if (!n || !String(n.note_en || '').trim()) errs.push(`landmarks[${i}].note_en: required`); if (String((n && n.note_en) || '').length > 200 || String((n && n.note_bn_banglish) || '').length > 200) errs.push(`landmarks[${i}]: 200 characters max`); });
      if (errs.length) return { ok: false, error: 'invalid_hub', message: 'The landmark note was not saved.', errors: errs };
      h.landmarks = notes.map((n) => ({ note_en: String(n.note_en).trim(), note_bn_banglish: String(n.note_bn_banglish || '').trim(), sample: false }));
      return { ok: true, hub: h };
    },
    browse() {
      const status = E.hubStatus();
      const alerts = A.list(E.store, net, E.now()).filter((a) => ['active', 'unverified', 'fading', 'disputed'].includes(a.status));
      const lines = net.lines.map((l) => {
        const es = net.edges.filter((e) => e.line === l.id);
        const km = Math.round(es.reduce((s, e) => s + e.km, 0) * 10) / 10;
        const f = fareLeg({ mode: l.mode, km, flatFare: l.flatFare }, { student: false }, net.config);
        const stopStatus = l.stops.map((h) => status[h]);
        const road = l.mode !== 'metro';
        const state = l.status !== 'active' ? 'suspended' : road && stopStatus.includes('blocked') ? 'disrupted' : road && stopStatus.includes('caution') ? 'caution' : 'running';
        const range = RANGE_MODES.includes(l.mode);
        return { id: l.id, name: l.name, mode: l.mode, from: l.stops[0], to: l.stops.at(-1), fromName: hubName(net, l.stops[0]), toName: hubName(net, l.stops.at(-1)),
          stops: l.stops, stopNames: l.stops.map((h) => hubName(net, h)), km, estMinutes: Math.round(es.reduce((s, e) => s + e.minutes, 0) + (net.config.boardWait[l.mode] || 0)),
          fareRegular: range ? null : f.regular, fareStudent: range ? null : f.student, fareRange: range ? fmtRange(f.rangeLow, f.rangeHigh) : null,
          studentEligible: l.mode === 'bus', state, alerts: alerts.filter((a) => road && l.stops.includes(a.hubId)).map((a) => a.id) };
      });
      const hubs = net.hubs.map((h) => ({ id: h.id, name: h.name, bn: h.bn, zone: h.zone, status: status[h.id], landmarks: h.landmarks,
        lines: net.lines.filter((l) => l.stops.includes(h.id)).map((l) => l.id), alerts: alerts.filter((a) => a.hubId === h.id) }));
      return { ok: true, lines, hubs, disruptions: alerts, now: E.now(), notice: DEMO_NOTICE };
    },
  };
}
