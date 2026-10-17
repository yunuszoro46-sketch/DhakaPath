// Bootstraps the panels, tabs, theme and the 3-second polling loop (alerts + clock + watched trips).
import { $, $$, esc, store, ic } from './util.js';
import { S, actions } from './store.js';
import { connect, get, onConnection } from './api.js';
import { drawMap } from './map.js';
import { initSearch } from './searchPanel.js';
import { initFareBreakdown } from './fareBreakdown.js';
import { initSim } from './simPanel.js';
import { initAlerts, refreshAlerts } from './alertsPanel.js';
import { initAdmin, refreshAdmin, renderLines } from './adminPanel.js';
import { initChat } from './chatDock.js';
import { initClock, setAi, setClock, pollHealth } from './clockBar.js';
import { refreshNetwork, isNetworkTab } from './networkPanel.js';
import { initWatch, refreshWatches } from './watchPanel.js';
import { initMapControls } from './mapControls.js';
import { initShare, refreshShares, isShareTab } from './sharePanel.js';
import { initVoice } from './voice.js';

// Returns false when the network cannot be loaded; the page then shows a retry card instead of
// half-initialised panels.
async function loadNetwork() {
  const r = await get('/api/network');
  if (!r.ok || !r.data || !Array.isArray(r.data.hubs) || !r.data.hubs.length) return false;
  S.net = r.data; S.hubStatus = r.data.hubStatus; setClock(r.data.now);
  const opts = S.net.hubs.map((h) => `<option value="${h.id}">${esc(h.name)} · ${esc(h.bn)}</option>`).join('');
  for (const id of ['#origin', '#destination']) { const v = $(id).value; $(id).innerHTML = opts; if (v) $(id).value = v; }
  $('#avoid-pick').innerHTML = '<option value="">Choose…</option>' + S.net.hubs.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join('');
  renderLines(); drawMap();
  return true;
}

function networkDown() {
  drawMap();
  const box = $('#search-out');
  if (box) box.innerHTML = '<div class="card"><div class="note bad"><b>Can’t load the transit network.</b> The server may be restarting or your connection dropped. Nothing is wrong with your search.</div><button type="button" class="primary" id="net-retry">Retry</button></div>';
  const b = $('#net-retry'); if (b) b.onclick = () => location.reload();
}

function renderScenario() {
  const sc = S.scenario, el = $('#scenario-banner');
  const dl = (sc && sc.disabledLines) || [], dy = (sc && sc.delays) || [];
  const on = sc && (sc.rain.length || sc.blocked.length || typeof sc.rush === 'boolean' || dl.length || dy.length || (sc.blockedEdges || []).length);
  el.hidden = !on;
  if (on) {
    el.innerHTML = `${ic('rain')} <b>Scenario active for the whole app:</b> ${esc(sc.label || '')} ${[sc.rain.length && (sc.rainSeverity === 'heavy' ? 'heavy rain at ' : 'rain at ') + sc.rain.join(', '), sc.blocked.length && 'blocked ' + sc.blocked.join(', '), sc.rush === true && 'rush hour',
      dl.length && 'not running: ' + dl.join(', '), dy.length && 'delayed: ' + dy.map((x) => `${x.line || x.edgeId || x.hub}${x.until ? ' (until ' + new Date(x.until).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }) + ')' : ''}`).join(', ')].filter(Boolean).map(esc).join(' · ')} <button type="button" class="ghost small" id="scenario-clear">Clear</button>`;
    $('#scenario-clear').onclick = () => actions.clearScenario();
  }
}

async function refreshAll() {
  await refreshAlerts(); await refreshWatches();
  if (S.adminToken) await refreshAdmin();
  if (isNetworkTab()) await refreshNetwork();
  if (S.result && S.result.ok && !S.sim) { const d = S.result.data; const keep = S.sel && S.sel.signature; await actions.search({ ...d.constraints, origin: d.origin, destination: d.dest }); if (keep && S.result.ok) { const all = [...S.result.data.options, ...S.result.data.others]; S.sel = all.find((o) => o.signature === keep) || S.sel; actions.renderSearch(); drawMap(); } }
}

function showTab(name) {
  // section buttons: the five tabs (role=tab) and the Admin button in the header (aria-pressed)
  $$('[data-tab]').forEach((t) => t.setAttribute(t.getAttribute('role') === 'tab' ? 'aria-selected' : 'aria-pressed', String(t.dataset.tab === name)));
  $$('.tabpanel').forEach((p) => (p.hidden = p.id !== 'tab-' + name));
  const col = $('.panel-col'); if (col && col.scrollTop > 0 && matchMedia('(min-width: 1024px)').matches) col.scrollTop = 0;
  if (name !== 'sim' && S.sim) { S.sim = null; S.sel = S.result && S.result.ok ? S.result.data.options[0] : null; drawMap(); actions.renderPrefs && actions.renderPrefs(); }
  if (name === 'alerts') refreshAlerts();
  if (name === 'admin') refreshAdmin();
  if (name === 'network') refreshNetwork();
  if (name === 'share') { refreshShares(); $('#sh-bot').textContent || $('#sh-mode').dispatchEvent(new Event('change')); }
  if (name === 'sim') $('#sim-trip').textContent = `${$('#origin').selectedOptions[0]?.textContent.split(' · ')[0] || ''} → ${$('#destination').selectedOptions[0]?.textContent.split(' · ')[0] || ''}`;
}

// Connection banner: shown after a failed request, hidden (with a short "back online") on the next success.
function initConnectionBanner() {
  const el = $('#conn-banner'); let down = false, timer = null;
  const set = (up) => {
    if (!up && !down) { down = true; clearTimeout(timer); el.className = 'conn-banner bad'; el.textContent = '⚠ Connection to DhakaPath lost. Retrying every few seconds; your last results stay on screen.'; el.hidden = false; }
    else if (up && down) { down = false; el.className = 'conn-banner ok'; el.textContent = '✓ Back online.'; timer = setTimeout(() => { el.hidden = true; }, 2500); }
  };
  onConnection(set);
  addEventListener('offline', () => set(false));
}

async function init() {
  initConnectionBanner();
  document.documentElement.dataset.theme = store('dp-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const themeLabel = () => { const dark = document.documentElement.dataset.theme === 'dark'; $('#theme').innerHTML = ic(dark ? 'sun' : 'moon'); $('#theme').setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`); $('#theme').title = `Switch to ${dark ? 'light' : 'dark'} theme`; };
  themeLabel();
  $('#theme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; themeLabel(); store('dp-theme', t); };
  Object.assign(actions, { drawMap, loadNetwork, refreshAll, showTab, renderScenario, researchIfAny: () => { if (S.result && S.result.ok) { const d = S.result.data; actions.search({ ...d.constraints, origin: d.origin, destination: d.dest }); } } });
  const c = await connect();
  $('#mode-chip').textContent = c.where;
  setAi(c.health.ai, c.health.providers);
  S.scenario = c.health.scenario || null;
  if (!(await loadNetwork())) { networkDown(); return; }
  initMapControls(); initShare(); initSearch(); initFareBreakdown(); initSim(); initAlerts(); initAdmin(c.adminHint); initChat(); initVoice(); initClock(); initWatch();
  renderScenario();
  $('#origin').value = 'DHA'; $('#destination').value = 'MOT'; $('#student').checked = true;
  $$('[data-tab]').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  if (matchMedia('(min-width: 1024px)').matches) $('#street-legend').open = true;   // phones: the legend stays folded over the small map
  $('#card-close').onclick = () => $('#card-dialog').close();
  await refreshAlerts();
  await actions.search();
  await refreshWatches();
  // poll every 3 s for alerts, clock and watched trips (architecture doc §1); skipped while hidden
  // one poll at a time: if the server is slow, the next tick is skipped instead of piling up requests
  let polling = false;
  setInterval(async () => {
    if (document.visibilityState !== 'visible' || polling) return;
    polling = true;
    try { await pollHealth(); await refreshAlerts(); await refreshWatches(); if (isShareTab()) await refreshShares(); } finally { polling = false; }
  }, 3000);
}
init();
