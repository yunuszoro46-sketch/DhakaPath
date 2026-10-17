// Drag to resize the planner and the map.
//   Desktop (≥1024 px): the vertical handle on the planner's right edge sets the panel width; the map
//   takes the rest. Phones and tablets: the sheet's grab handle sets the map height above it.
// Both handles are role="separator": pointer drag, arrow keys (Shift = bigger steps), Home/End for the
// limits, double-click or Enter to reset. The size is remembered per browser; Leaflet re-measures by
// itself (streetMap.js observes the map box).
import { $, store } from './util.js';

const root = document.documentElement;
const desktop = () => matchMedia('(min-width: 1024px)').matches;
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

// limits follow the window: the map always keeps at least 420 px (desktop) or the planner 30% (phone)
const W = { min: 320, max: () => Math.max(320, Math.min(760, innerWidth - 420)), def: () => (innerWidth < 1280 ? 400 : 440), key: 'dp-panel-w', prop: '--panel-w' };
const H = { min: 180, max: () => Math.max(180, Math.round(innerHeight * 0.7)), def: () => Math.max(260, Math.round(innerHeight * 0.36)), key: 'dp-map-h', prop: '--map-h' };

const clamp = (s, v) => Math.round(Math.min(s.max(), Math.max(s.min, v)));
const current = (s) => num(store(s.key)) ?? s.def();
function apply(s, v, { save = true } = {}) {
  const x = clamp(s, v);
  root.style.setProperty(s.prop, x + 'px');
  if (save) store(s.key, String(x));
  const h = s === W ? $('#splitter') : $('#sheet-handle');
  if (h) { h.setAttribute('aria-valuenow', String(x)); h.setAttribute('aria-valuemin', String(s.min)); h.setAttribute('aria-valuemax', String(s.max())); h.setAttribute('aria-valuetext', `${x} pixels`); }
  return x;
}
function reset(s) {
  store(s.key, ''); root.style.removeProperty(s.prop);
  const h = s === W ? $('#splitter') : $('#sheet-handle'); if (h) h.setAttribute('aria-valuenow', String(clamp(s, s.def())));
}

function wire(handle, s, axis) {
  if (!handle) return;
  let start = 0, from = 0, dragging = false;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true; start = axis === 'x' ? e.clientX : e.clientY; from = current(s);
    if (s === W) from = $('.panel-col').getBoundingClientRect().width;
    if (s === H) from = $('#lmap') && !$('#street-wrap').hidden ? $('#lmap').getBoundingClientRect().height : from;
    handle.setPointerCapture(e.pointerId); handle.classList.add('dragging'); root.classList.add('resizing');
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const d = (axis === 'x' ? e.clientX : e.clientY) - start;
    apply(s, from + d, { save: false });
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false; handle.classList.remove('dragging'); root.classList.remove('resizing');
    try { handle.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    store(s.key, String(parseInt(getComputedStyle(root).getPropertyValue(s.prop), 10) || current(s)));
  };
  handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', () => reset(s));
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 80 : 20, v = current(s);
    const more = axis === 'x' ? 'ArrowRight' : 'ArrowDown', less = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    if (e.key === more) apply(s, v + step); else if (e.key === less) apply(s, v - step);
    else if (e.key === 'Home') apply(s, s.min); else if (e.key === 'End') apply(s, s.max());
    else if (e.key === 'Enter') reset(s); else return;
    e.preventDefault();
  });
}

// The map opens when you want it: on phones it starts folded (the planner first), on desktop it starts
// open (the map is the stage); either way the button remembers your choice for that kind of screen.
const mapKey = () => (desktop() ? 'dp-map-desk' : 'dp-map-phone');
const mapWanted = () => { const v = store(mapKey()); return v ? v === 'open' : desktop(); };
function showMap(open, { save = true } = {}) {
  root.classList.toggle('map-hidden', !open);
  const b = $('#map-toggle');
  if (b) { b.setAttribute('aria-expanded', String(open)); b.querySelector('.mt-label').textContent = open ? 'Hide map' : 'Show map'; }
  if (save) store(mapKey(), open ? 'open' : 'closed');
  if (open) dispatchEvent(new Event('resize'));          // Leaflet re-measures the box it was hidden in
}

export function initResize() {
  const mt = $('#map-toggle');
  if (mt) mt.onclick = () => showMap(root.classList.contains('map-hidden'));
  showMap(mapWanted(), { save: false });
  let wasDesk = desktop();
  addEventListener('resize', () => { if (desktop() !== wasDesk) { wasDesk = desktop(); showMap(mapWanted(), { save: false }); } });
  wire($('#splitter'), W, 'x');
  wire($('#sheet-handle'), H, 'y');
  const restore = () => {
    for (const s of [W, H]) { const v = num(store(s.key)); if (v !== null) apply(s, v, { save: false }); else { root.style.removeProperty(s.prop); const h = s === W ? $('#splitter') : $('#sheet-handle'); if (h) h.setAttribute('aria-valuenow', String(clamp(s, s.def()))); } }
  };
  restore();
  addEventListener('resize', restore);
  void desktop;
}
