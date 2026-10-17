// Street map: a plain-JS port of the team's KoyJabo MapView.jsx (React + react-leaflet) onto Leaflet
// 1.9.4 (vendored in public/vendor/leaflet). Same colours (Cheapest blue, Fastest green, Balanced
// purple, Backup orange dashed), "All three" view, sticky route tooltips, A/B markers, permanent hub
// labels and Set Start / Destination popups. Every line drawn comes from DhakaPath's engine result
// (S.result / S.sim); the map never computes or validates routes. Positions are approximate area
// centres. If Leaflet is missing the schematic SVG map is used; if tiles fail the vector layer stays
// on a plain background with a note.
import { $, esc, rng } from './util.js';
import { S, actions, hubName } from './store.js';

export const ROUTE_COLORS = { cheapest: '#2563eb', fastest: '#16a34a', balanced: '#7c3aed', backup: '#f97316' };
const WEIGHT = { cheapest: 9, fastest: 6, balanced: 3.5, backup: 4 };
const DIR = { UTT: 'top', MIR: 'left', MPR: 'left', DHA: 'left', SCI: 'bottom', SHA: 'right', MOT: 'right', JAT: 'bottom', BAN: 'right', BAD: 'right', MAL: 'right', MOH: 'top', AGA: 'top', FAR: 'top' };
const DHAKA = { minLat: 23.6, maxLat: 24.0, minLng: 90.2, maxLng: 90.6 };
export const inDhaka = (h) => !!h && Number.isFinite(h.lat) && Number.isFinite(h.lng) && h.lat > DHAKA.minLat && h.lat < DHAKA.maxLat && h.lng > DHAKA.minLng && h.lng < DHAKA.maxLng;

let map = null, net = null, routes = null, tiles = null, viewAll = false, lastFit = '';
const tileState = { ok: 0, err: 0, timedOut: false };

export const streetReady = () => !!map;

export function initStreet() {
  const L = window.L, el = $('#lmap');
  if (!L || !el || map) return !!map;
  map = L.map(el, { zoomControl: true, scrollWheelZoom: true }).setView([23.775, 90.4], 12);
  tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
  tiles.on('tileload', () => { tileState.ok++; tileNote(); });
  tiles.on('tileerror', () => { tileState.err++; tileNote(); });
  tiles.addTo(map);
  setTimeout(() => { tileState.timedOut = true; tileNote(); }, 8000);
  net = L.layerGroup().addTo(map); routes = L.layerGroup().addTo(map);
  // Leaflet measures its box: refit when the map goes from hidden (0×0) to visible or changes size
  let lastW = el.clientWidth;
  if (window.ResizeObserver) new ResizeObserver(() => { map.invalidateSize(); if (el.clientWidth && el.clientWidth !== lastW) { lastW = el.clientWidth; lastFit = ''; drawStreet(); } }).observe(el);
  // zoomed out (whole city on a phone): only A, B and route-stop labels stay; tap a hub for its name
  const far = () => el.classList.toggle('lmap-far', map.getZoom() < 12);
  map.on('zoomend', far); far();
  map.on('popupopen', (e) => {
    const box = e.popup.getElement(); if (!box) return;
    box.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
      $(b.dataset.set === 'origin' ? '#origin' : '#destination').value = b.dataset.hub;
      map.closePopup();
      if ($('#origin').value !== $('#destination').value) actions.search();
    }));
  });
  $('#lmap-all').onclick = () => { viewAll = !viewAll; lastFit = ''; drawStreet(); };
  return true;
}

function tileNote() {
  const n = $('#tile-note'); if (!n) return;
  n.hidden = !(tileState.ok === 0 && (tileState.err >= 4 || tileState.timedOut));
}

// which kind a route option is, for colour: the map preference, else its first label
export function kindOf(o, pref) {
  if (!o) return 'balanced';
  if (pref && pref !== 'all' && labelFor(pref) && (o.labels || []).includes(labelFor(pref))) return pref;
  if (o.isBackup && !(o.labels || []).length) return 'backup';
  const l = (o.labels || [])[0];
  return l === 'Cheapest' ? 'cheapest' : l === 'Fastest' ? 'fastest' : l === 'Balanced' ? 'balanced' : o.isBackup ? 'backup' : 'balanced';
}
export const labelFor = (k) => ({ cheapest: 'Cheapest', fastest: 'Fastest', balanced: 'Balanced' })[k];

const hubIdsOf = (o) => (o && Array.isArray(o.legs) && o.legs.length ? [o.legs[0].from, ...o.legs.flatMap((l) => (l.stops || []).slice(1))] : []);
// ordered hub pairs -> latlng segments; a pair with a hub off the map is skipped, never drawn to (0,0)
function segs(o) {
  const ids = hubIdsOf(o), out = [];
  for (let i = 1; i < ids.length; i++) { const a = hubById(ids[i - 1]), b = hubById(ids[i]); if (inDhaka(a) && inDhaka(b)) out.push([[a.lat, a.lng], [b.lat, b.lng]]); }
  return out;
}
const hubById = (id) => S.net.hubs.find((h) => h.id === id);
const modesOf = (o) => [...new Set(o.legs.map((l) => ({ metro: 'MRT-6', walk: 'walking' })[l.mode] || l.mode))].join(' + ');
const tip = (o, kind, alt) => `<div style="font-weight:800;color:${ROUTE_COLORS[kind]};text-transform:uppercase">${kind} route${alt ? ' (alternative)' : ''}</div><div><b>${rng(o.fareRangeLow, o.fareRangeHigh)}</b> · ${o.totalMinutes} min · ${o.transfers} transfer(s)</div><div class="small" style="color:#475569">Modes: ${esc(modesOf(o))}</div>`;

function icon(h, st) {
  const L = window.L;
  const mk = (cls, inner, size, style = '') => L.divIcon({ className: 'hub-icon-container', html: `<div class="hub-marker ${cls}" style="${style}" title="${esc(h.name)}">${inner}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  if (st.origin) return mk('hub-pin origin-pin', '<span class="marker-symbol">A</span>', 34);
  if (st.dest) return mk('hub-pin dest-pin', '<span class="marker-symbol">B</span>', 34);
  if (st.blocked) return mk('blocked-marker', '<span class="marker-symbol">⛔</span>', 28);
  if (st.onRoute) return mk('on-route-marker', '<div class="marker-core"></div>', 26, `--route-color:${st.color}`);
  return mk('standard-marker', '<div class="marker-core"></div>', 22);
}

// what to draw, from the engine's own result
function plan() {
  const sim = S.sim && S.sim.afterOption !== undefined ? S.sim : null;
  if (sim) return { sim, lines: [sim.beforeOption && { o: sim.beforeOption, kind: 'before' }, sim.afterOption && { o: sim.afterOption, kind: 'balanced' }].filter(Boolean), focus: sim.afterOption || sim.beforeOption };
  const d = S.result && S.result.ok ? S.result.data : null;
  if (!d) return { lines: [], focus: null };
  const byLabel = (t) => d.options.find((o) => (o.labels || []).includes(t));
  const set = { cheapest: byLabel('Cheapest'), fastest: byLabel('Fastest'), balanced: byLabel('Balanced'), backup: d.backup && d.backup.option };
  if (S.mapPref === 'all') return { all: true, lines: ['cheapest', 'fastest', 'balanced', 'backup'].filter((k) => set[k]).map((k) => ({ o: set[k], kind: k })), focus: null };
  const sel = S.sel, kind = kindOf(sel, S.mapPref);
  const others = Object.entries(set).filter(([, o]) => o && sel && o.signature !== sel.signature).map(([k, o]) => ({ o, kind: k, alt: true }));
  return { lines: [...others, sel && { o: sel, kind, main: true }].filter(Boolean), focus: sel, kind };
}

export function drawStreet() {
  if (!map || !S.net) return;
  try { draw(); } catch (e) { console.warn('street map draw failed', e); }
}

function draw() {
  const L = window.L;
  net.clearLayers(); routes.clearLayers();
  const p = plan(), g0 = S.scenario || {}, sc = (p.sim && p.sim.scenario) || g0;
  const blockedHubs = new Set([...(sc.blocked || []), ...Object.entries(S.hubStatus || {}).filter(([, s]) => s === 'blocked').map(([h]) => h)]);
  const offLines = new Set(sc.disabledLines || []), cut = new Set(((p.sim && p.sim.brokenSegments) || []).filter((b) => b.kind === 'broken').map((b) => b.edgeId));
  // network links (one grey line per hub pair; red dashed when every service on it is out)
  const pairs = new Map();
  for (const e of S.net.edges || []) { const k = [e.from, e.to].sort().join('|'); (pairs.get(k) || pairs.set(k, []).get(k)).push(e); }
  for (const [k, es] of pairs) {
    const [a, b] = k.split('|').map(hubById); if (!inDhaka(a) || !inDhaka(b)) continue;
    const why = (e) => (cut.has(e.id) ? 'cut in this simulation' : offLines.has(e.line) ? 'line not running' : e.mode !== 'metro' && (blockedHubs.has(a.id) || blockedHubs.has(b.id)) ? 'hub blocked' : '');
    const out = es.every((e) => why(e));
    L.polyline([[a.lat, a.lng], [b.lat, b.lng]], out ? { color: '#dc2626', weight: 4, dashArray: '4 8', opacity: 0.9 } : { color: '#64748b', weight: 3, opacity: 0.65 })
      .bindTooltip(`<div style="font-weight:700">${esc(a.name)} ↔ ${esc(b.name)}</div>${out ? '<div style="color:#dc2626;font-weight:600">BLOCKED / UNAVAILABLE</div>' : ''}<div class="small" style="color:#475569">${es.map((e) => `${esc(e.line)} (${esc(e.mode)}) · ${e.minutes} min${why(e) ? ` ✕ ${why(e)}` : ''}`).join('<br>')}</div>`, { sticky: true, className: 'edge-tooltip' }).addTo(net);
  }
  // routes
  for (const r of p.lines) {
    const pos = segs(r.o); if (!pos.length) continue;
    const color = r.kind === 'before' ? '#64748b' : ROUTE_COLORS[r.kind];
    const style = p.all ? { color, weight: WEIGHT[r.kind], opacity: 0.9, dashArray: r.kind === 'backup' ? '10 8' : undefined }
      : r.kind === 'before' ? { color, weight: 6, opacity: 0.7, dashArray: '8 8' } : r.alt ? { color, weight: 5, opacity: 0.35, dashArray: r.kind === 'backup' ? '8 8' : undefined }
      : { color, weight: 8, opacity: 0.95, dashArray: r.kind === 'backup' ? '12 10' : undefined };
    L.polyline(pos, style).bindTooltip(r.kind === 'before' ? `<b>Usual route (before)</b><br>${esc(r.o.summary)}` : tip(r.o, r.kind, r.alt), { sticky: true, className: 'edge-tooltip' }).addTo(routes);
  }
  for (const id of cut) { const e = S.net.edges.find((x) => x.id === id); const a = e && hubById(e.from), b = e && hubById(e.to); if (inDhaka(a) && inDhaka(b)) L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: '#dc2626', weight: 7, opacity: 0.95 }).addTo(routes); }
  // hubs
  const focusIds = p.all ? new Set(p.lines.flatMap((r) => hubIdsOf(r.o))) : new Set(hubIdsOf(p.focus));
  const ends = p.focus ? [hubIdsOf(p.focus)[0], hubIdsOf(p.focus).at(-1)] : [$('#origin').value, $('#destination').value];
  const col = ROUTE_COLORS[p.kind] || ROUTE_COLORS.balanced;
  const hidden = [];
  for (const h of S.net.hubs) {
    if (!inDhaka(h)) { hidden.push(h); continue; }
    const st = { origin: h.id === ends[0], dest: h.id === ends[1], blocked: blockedHubs.has(h.id), onRoute: focusIds.has(h.id), color: col };
    const dir = DIR[h.id] || 'right';
    const m = L.marker([h.lat, h.lng], { icon: icon(h, st), zIndexOffset: st.origin || st.dest ? 1200 : st.onRoute ? 900 : 600, keyboard: true, title: h.name });
    m.bindTooltip(`<span class="hub-tooltip-content" style="--route-color:${col}">${st.origin ? '<span class="hub-badge badge-origin">A</span>' : ''}${st.dest ? '<span class="hub-badge badge-dest">B</span>' : ''}${st.onRoute && !st.origin && !st.dest ? '<span class="hub-badge badge-route">STOP</span>' : ''}<span class="hub-name">${esc(h.name)}</span>${st.blocked ? '<span class="hub-badge badge-blocked">⛔ Blocked</span>' : ''}</span>`,
      { permanent: true, direction: dir, offset: dir === 'left' ? [-14, 0] : dir === 'top' ? [0, -12] : dir === 'bottom' ? [0, 12] : [14, 0], className: `hub-tooltip${st.origin ? ' tt-origin' : ''}${st.dest ? ' tt-dest' : ''}${st.onRoute ? ' tt-route' : ''}${st.blocked ? ' tt-blocked' : ''}` });
    const note = h.landmarks && h.landmarks[0] ? h.landmarks[0].note_en : '';
    m.bindPopup(`<div class="hub-popup-content"><div class="popup-header"><h4>${esc(h.name)} <small>${esc(h.bn || '')}</small></h4>${st.blocked ? '<span class="popup-badge-blocked">Blocked</span>' : ''}</div>${note ? `<p class="landmark">📍 ${esc(note)}</p>` : ''}<p class="landmark">Position approximate.</p>
      <div class="popup-actions"><button type="button" class="btn-set-origin" data-set="origin" data-hub="${h.id}" ${$('#origin').value === h.id ? 'disabled' : ''}>${$('#origin').value === h.id ? '✓ Current Start (A)' : 'Set as Start (A)'}</button><button type="button" class="btn-set-dest" data-set="dest" data-hub="${h.id}" ${$('#destination').value === h.id ? 'disabled' : ''}>${$('#destination').value === h.id ? '✓ Current End (B)' : 'Set as Destination (B)'}</button></div></div>`, { className: 'hub-popup', offset: [0, -12] });
    m.addTo(net);
  }
  $('#lmap-hidden').textContent = hidden.length ? `⚠ ${hidden.length} hub(s) not shown (position missing or outside Dhaka): ${hidden.map((h) => h.name || h.id).join(', ')}` : '';
  $('#lmap-all').textContent = viewAll ? '🎯 Focus route' : `🗺 Show all ${S.net.hubs.length - hidden.length} hubs`;
  // fit only when what is shown changes (polling redraws every few seconds)
  // fit the route on display (KoyJabo behaviour); faded alternatives may run off-screen
  const shown = viewAll || (!p.focus && !p.all) ? S.net.hubs.filter(inDhaka).map((h) => [h.lat, h.lng]) : p.all || p.sim ? p.lines.flatMap((r) => segs(r.o).flat()) : segs(p.focus).flat();
  const key = viewAll ? 'all' : p.lines.map((r) => r.o.signature + r.kind).join(',') || 'none';
  if (key !== lastFit && shown.length && map.getSize().x > 0) { lastFit = key; const narrow = map.getSize().x < 520;   // phones: small padding so the route still fills the map
    map.fitBounds(shown, narrow ? { paddingTopLeft: [72, 60], paddingBottomRight: [72, 30], maxZoom: 14, animate: false } : { paddingTopLeft: [110, 70], paddingBottomRight: [120, 50], maxZoom: 14, animate: false }); }   // no animation: a fit during a running zoom animation is otherwise dropped
}

export function streetShown() { map && setTimeout(() => { map.invalidateSize(); lastFit = ''; drawStreet(); }, 0); }
