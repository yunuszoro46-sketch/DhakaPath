// SVG schematic map. Colour/dash by alert state (also the trust story): solid red = trusted hard
// block, dashed amber = unverified, grey = fading; bold = selected route. Hover an edge for the
// alert text, confidence and age. No map tiles: the hubs carry schematic x/y in the SVG viewBox.
// Defensive: hubs whose x/y are missing or outside the map frame are left out (with a note), links
// and route lines touching them are skipped, and if drawing fails the map shows a fallback message
// while search, directions and fares keep working.
import { $, esc, MODES, MODE_NAME, RANGE } from './util.js';
import { S, actions, hub, hubName } from './store.js';

const ns = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) if (v !== '' && v != null) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
const LABEL = { MOT: [10, 22, 'start'], SHA: [12, -10, 'start'], SCI: [-12, 22, 'end'], FAR: [-12, -10, 'end'], DHA: [-12, 20, 'end'], MPR: [-12, 5, 'end'], AGA: [-12, -10, 'end'], MIR: [-12, -10, 'end'], UTT: [12, -6, 'start'], MOH: [12, -10, 'start'], BAD: [12, -10, 'start'], MAL: [-12, -10, 'end'], BAN: [12, 5, 'start'], JAT: [12, 5, 'start'] };

// Map frame = the SVG viewBox (-60 -30 1120 650). Anything outside cannot be a Dhaka hub on this map.
export const FRAME = { minX: -60, minY: -30, maxX: 1060, maxY: 620 };
export const onMap = (h) => !!h && Number.isFinite(h.x) && Number.isFinite(h.y) && h.x >= FRAME.minX && h.x <= FRAME.maxX && h.y >= FRAME.minY && h.y <= FRAME.maxY;

function geom() {
  const groups = {};
  for (const e of S.net.edges || []) { if (!e || !e.from || !e.to) continue; const k = [e.from, e.to].sort().join('|'); (groups[k] ||= []).push(e); }
  const g = {};
  for (const arr of Object.values(groups)) arr.forEach((e, i) => {
    const a = hub(e.from), b = hub(e.to); if (!onMap(a) || !onMap(b)) return;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, off = (i - (arr.length - 1) / 2) * 7;
    g[e.id] = { x1: a.x + nx * off, y1: a.y + ny * off, x2: b.x + nx * off, y2: b.y + ny * off };
  });
  return g;
}

export function drawMap() {
  const svg = $('#map'); if (!svg) return;
  if (!S.net || !Array.isArray(S.net.hubs)) { mapMessage(svg, 'Map unavailable: network data did not load.'); return; }
  try { draw(svg); } catch (e) { console.warn('map draw failed', e); mapMessage(svg, 'Map could not be drawn. Routes, directions and fares below still work.'); }
  if (actions.drawStreet) actions.drawStreet();   // street map (streetMap.js) draws from the same state
}

function mapMessage(svg, text) {
  svg.innerHTML = '';
  svg.appendChild(el('rect', { x: -60, y: -30, width: 1120, height: 650, fill: 'var(--map-bg)' }));
  svg.appendChild(el('text', { x: 500, y: 290, 'text-anchor': 'middle', class: 'map-label map-fallback' }, text));
  const lg = $('#legend'); if (lg) lg.textContent = '';
}

function draw(svg) {
  svg.innerHTML = '';
  const g = geom();
  const opt = S.sel, sim = S.sim && S.sim.afterOption !== undefined ? S.sim : null;
  const on = new Set(), before = new Set(), broken = new Set();
  if (sim) {
    (sim.afterOption ? sim.afterOption.legs : []).forEach((l) => l.edgeIds.forEach((id) => on.add(id)));
    (sim.beforeOption ? sim.beforeOption.legs : []).forEach((l) => l.edgeIds.forEach((id) => before.add(id)));
    (sim.brokenSegments || []).filter((b) => b.kind === 'broken').forEach((b) => broken.add(b.edgeId));
  } else if (opt && Array.isArray(opt.legs)) opt.legs.forEach((l) => (l.edgeIds || []).forEach((id) => on.add(id)));
  const dim = on.size > 0;
  const base = el('g'), alertL = el('g'), top = el('g');
  for (const e of S.net.edges) {
    const p = g[e.id]; if (!p) continue;
    const near = (S.alerts || []).filter((a) => (a.hubId === e.from || a.hubId === e.to || a.edgeId === e.id) && ['active', 'unverified', 'fading'].includes(a.status) && (e.mode !== 'metro' || a.edgeId === e.id));
    const line = el('line', { ...p, stroke: `var(--${e.mode})`, 'stroke-width': e.mode === 'metro' ? 5 : 3, 'stroke-linecap': 'round', 'stroke-dasharray': e.mode === 'walk' ? '3 6' : RANGE(e.mode) ? '10 6' : '', opacity: dim ? 0.18 : 0.8 });
    const tip = `${e.line} · ${MODE_NAME[e.mode]} ${hubName(e.from)}–${hubName(e.to)} · ${e.km} km · ${e.minutes} min` + near.map((a) => `\n⚠ ${a.placeName} ${a.type}: ${a.status}, confidence ${a.effectiveConfidence}, ${a.ageMinutes} min old${a.text ? ` — “${a.text}”` : ''}`).join('');
    line.appendChild(el('title', {}, tip));
    base.appendChild(line);
    if (near.length) {
      const s = near.some((a) => a.status === 'active') ? 'active' : near.some((a) => a.status === 'unverified') ? 'unverified' : 'fading';
      const ov = el('line', { ...p, stroke: s === 'active' ? 'var(--bad)' : s === 'unverified' ? 'var(--warn)' : 'var(--muted)', 'stroke-width': 3, 'stroke-dasharray': s === 'unverified' ? '8 6' : '', opacity: 0.95 });
      ov.appendChild(el('title', {}, tip)); alertL.appendChild(ov);
    }
    if (on.has(e.id)) top.appendChild(el('line', { ...p, stroke: `var(--${e.mode})`, 'stroke-width': 11, 'stroke-linecap': 'round' }));
    if (before.has(e.id) && !on.has(e.id)) top.appendChild(el('line', { ...p, stroke: 'var(--muted)', 'stroke-width': 6, 'stroke-dasharray': '8 8', 'stroke-linecap': 'round' }));
    if (broken.has(e.id)) top.appendChild(el('line', { ...p, stroke: 'var(--bad)', 'stroke-width': 7, 'stroke-linecap': 'round' }));
  }
  svg.append(base, alertL, top);
  const endsOf = (o) => (o && Array.isArray(o.legs) && o.legs.length ? [o.legs[0].from, o.legs.at(-1).to] : []);
  const ends = new Set(opt ? endsOf(opt) : sim ? endsOf(sim.beforeOption) : []);
  const g0 = S.scenario || {};
  const sc = (sim && sim.scenario) || {};
  const rain = new Set(sim ? sc.rain || [] : [...(g0.rain || []), ...(S.rain || [])]), blocked = new Set(sim ? sc.blocked || [] : g0.blocked || []);
  const hidden = S.net.hubs.filter((h) => !onMap(h));
  for (const h of S.net.hubs) {
    if (!onMap(h)) continue;
    if (rain.has(h.id)) svg.appendChild(el('circle', { cx: h.x, cy: h.y, r: 34, fill: 'var(--info)', opacity: 0.2 }));
    const status = S.hubStatus[h.id] || 'clear';
    const fill = ends.has(h.id) ? 'var(--accent)' : status === 'blocked' ? 'var(--bad)' : status === 'caution' ? 'var(--warn)' : 'var(--map-bg)';
    const c = el('circle', { cx: h.x, cy: h.y, r: ends.has(h.id) ? 13 : 10, fill, stroke: blocked.has(h.id) ? 'var(--bad)' : 'var(--hub)', 'stroke-width': blocked.has(h.id) ? 5 : 2.5, tabindex: 0, role: 'button', 'aria-label': `${h.name}: set as destination` });
    c.appendChild(el('title', {}, `${h.name} (${h.bn}) · status ${status}. Click: set To · Shift+click: set From`));
    c.style.cursor = 'pointer';
    const pick = (ev) => { if (ev.shiftKey) $('#origin').value = h.id; else $('#destination').value = h.id; if ($('#origin').value !== $('#destination').value) actions.search(); };
    c.addEventListener('click', pick); c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(ev); } });
    const [dx, dy, anchor] = LABEL[h.id] || [12, 5, 'start'];
    svg.append(c, el('text', { x: h.x + dx, y: h.y + dy, 'text-anchor': anchor, class: 'map-label' }, h.name));
  }
  $('#legend').innerHTML = MODES.map((m) => `<span><i style="background:var(--${m})"></i>${MODE_NAME[m]}</span>`).join('') +
    (hidden.length ? `<span class="map-warn">⚠ ${hidden.length} hub(s) not drawn (map position missing or out of range): ${hidden.map((h) => esc(String(h.name || h.id))).join(', ')}</span>` : '') +
    '<span><i style="background:var(--bad)"></i>hard alert</span><span><i style="background:repeating-linear-gradient(90deg,var(--warn) 0 5px,transparent 5px 9px)"></i>unverified</span><span><i style="background:var(--muted)"></i>fading</span><span class="muted">Hover a link for alert details · Click a hub: To · Shift+click: From</span>';
}
