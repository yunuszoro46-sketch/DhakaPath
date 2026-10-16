// Map toolbar: route preference (Fastest / Cheapest / Balanced / All three, from KoyJabo) and the
// Street / Schematic switch. The preference picks which engine option is selected; "All three" draws
// cheapest, fastest, balanced and the backup together on the street map.
import { $, $$, store } from './util.js';
import { S, actions } from './store.js';
import { initStreet, drawStreet, streetShown, labelFor, kindOf } from './streetMap.js';

export function initMapControls() {
  const wantStreet = store('dp-mapview') !== 'schematic';
  if (wantStreet) $('#street-wrap').hidden = false;          // Leaflet needs a visible box to measure
  const ok = initStreet();
  actions.drawStreet = () => { drawStreet(); renderPrefs(); };
  actions.renderPrefs = renderPrefs;
  S.mapPref = S.mapPref || null;
  S.mapView = ok ? (store('dp-mapview') === 'schematic' ? 'schematic' : 'street') : 'schematic';
  $('#mapview-toggle').hidden = !ok;
  $$('input[name=mapview]').forEach((r) => { r.checked = r.value === S.mapView; r.onchange = () => { S.mapView = r.value; store('dp-mapview', r.value); applyView(); }; });
  $$('.pref-btn').forEach((b) => b.addEventListener('click', () => setPref(b.dataset.pref)));
  applyView();
  renderPrefs();
}

function applyView() {
  const street = S.mapView === 'street';
  $('#street-wrap').hidden = !street;
  $('#schematic-wrap').hidden = street;
  if (street) streetShown();
}

// the option a preference points at in the current result
export function optionFor(d, pref) {
  if (!d || !pref || pref === 'all') return null;
  return d.options.find((o) => (o.labels || []).includes(labelFor(pref))) || null;
}

export function setPref(k) {
  S.mapPref = k;
  const d = S.result && S.result.ok ? S.result.data : null;
  const o = optionFor(d, k);
  if (o && actions.selectOption) actions.selectOption(o, { keepPref: true });
  renderPrefs();
  actions.drawMap();
}

// after a card click: follow the card's own label so the colour matches
export function prefFromOption(o) { S.mapPref = o ? kindOf(o) : null; renderPrefs(); }

export function renderPrefs() {
  const d = S.result && S.result.ok ? S.result.data : null;
  $$('.pref-btn').forEach((b) => {
    const k = b.dataset.pref;
    b.classList.toggle('active', S.mapPref === k);
    b.setAttribute('aria-pressed', String(S.mapPref === k));
    b.disabled = !d || !!S.sim || (k !== 'all' && !optionFor(d, k));
  });
}
