// Simulation panel: presets, rain (light/heavy) by zone or hub, rush, blocked hubs, a line not running,
// an admin delay -> before/after with broken segments, delta and whether the planned backup holds.
// "Apply to the whole app" makes it the global scenario (fake weather / service status).
import { $, $$, esc, rng, pills, ic, busy, latest, retryable } from './util.js';
import { S, actions, hubName } from './store.js';
import { post, put, del } from './api.js';

const turn = latest();
const EMPTY = '<p class="empty"><svg class="ic" aria-hidden="true"><use href="#i-rain"/></svg>Pick a preset or set your own conditions, then run the scenario to see the before / after comparison.</p>';
export async function runSim(scenario, btn) {
  const q = actions.query();
  if (q.origin === q.destination) { $('#sim-out').innerHTML = '<div class="note warn">Choose two different hubs on the Search tab.</div>'; return; }
  const bt = btn || $('#sim-run');
  if (bt.getAttribute('aria-busy') === 'true') return;                 // same button still running
  const k = turn.next();
  const out = $('#sim-out'); out.setAttribute('aria-busy', 'true');
  const r = await busy(bt, 'Running…', () => post('/api/simulate', { ...q, scenario }));
  if (!turn.isCurrent(k)) return;
  out.removeAttribute('aria-busy');
  if (!r.ok) {
    S.sim = null;
    out.innerHTML = `<div class="note bad">${esc(r.error.message)}${retryable(r.error) ? ' <button type="button" class="ghost small" id="sim-retry">Retry</button>' : ''}</div>`;
    if (retryable(r.error)) $('#sim-retry').onclick = () => runSim(scenario);
    return;
  }
  const d = r.data; S.sim = d; S.sel = null; actions.drawMap();
  const b = d.beforeOption, a = d.afterOption, dl = d.delta;
  const sign = (n) => (n > 0 ? '+' + n : String(n));
  const card = (t, o, res) => `<div class="card"><h2>${t}</h2>${o ? `<div class="nums">${o.totalMinutes} min · ${rng(o.fareRangeLow, o.fareRangeHigh)} · ${o.transfers} transfer(s)</div>${pills(o)}<ol class="steps small">${o.legs.map((l) => `<li>${esc(l.instruction)}${l.reasons.length ? ` <span class="cond">⚠ ${esc(l.reasons.join(', '))}</span>` : ''}</li>`).join('')}</ol>` : `<div class="note bad">${esc(res.message || 'No open route.')}</div>`}</div>`;
  const dir = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
  const deltaTiles = dl ? `<div class="compare delta-tiles" aria-label="Change versus the usual route">
      <div><span class="tile-k">${ic('timer')}Time</span><b class="delta ${dir(dl.minutes)}">${sign(dl.minutes)} min</b></div>
      <div><span class="tile-k">${ic('budget')}Fare</span><b class="delta ${dir(dl.fareHigh)}">${dl.fareLow === dl.fareHigh ? sign(dl.fareLow) : sign(dl.fareLow) + ' to ' + sign(dl.fareHigh)} BDT</b></div>
      <div><span class="tile-k">${ic('detour')}Route</span><b>${d.changedRoute ? '↪ detour' : 'same route'}</b></div></div>` : '';
  out.innerHTML = `<div class="card"><h2>${esc(d.label)}</h2><p>${esc(d.explanation)}</p>
    ${d.brokenSegments.length ? `<div class="note bad"><b>Affected segments of the usual route</b><ul style="margin:4px 0 0;padding-left:1.1rem">${d.brokenSegments.map((s) => `<li>${s.kind === 'broken' ? '✖' : '⏱'} ${esc(s.line)} ${esc(s.fromName)}–${esc(s.toName)}: ${esc(s.reason)}</li>`).join('')}</ul></div>` : '<div class="note ok">The usual route is not affected.</div>'}
    ${d.backup ? `<div class="note ${d.backup.holds ? 'ok' : 'bad'}">${ic('backup')} Backup planned before the change (${esc(d.backup.option.summary)}): ${d.backup.holds ? `still works, ${d.backup.afterMinutes} min${d.backup.isNewMain ? ' — now the main route' : ''}` : `cut too (${esc(d.backup.brokenAt.reason)})`}.</div>` : ''}
    ${deltaTiles}
    <div class="row tight" style="margin-top:12px"><button type="button" class="ghost small" id="sim-apply">${ic('rain')}Apply to the whole app</button><span class="muted small">Every search then runs under these conditions until you clear the banner.</span></div></div>
    <div class="simgrid">${card('Before', b, d.before)}${card('After', a, d.after)}</div>
    <p class="muted small">Simulated conditions, not live incidents. Map: red = cut segment, grey dashes = usual route, bold = new route, blue haze = rain. ${esc(d.notice)}</p>`;
  $('#sim-apply').onclick = () => applyScenario({ ...d.scenario, label: d.label });
}

async function applyScenario(sc) {
  const r = await put('/api/scenario', { label: sc.label, rain: sc.rain, blocked: sc.blocked, rush: sc.rush ? true : null, rainSeverity: sc.rainSeverity,
    disabledLines: sc.disabledLines, blockedEdges: sc.blockedEdges, delays: (sc.delays || []).map((x) => ({ ...x, until: undefined, forMinutes: 120 })) });
  if (r.ok) { S.scenario = r.data.scenario; actions.renderScenario(); actions.refreshAll(); }
}
export async function clearScenario() { const r = await del('/api/scenario'); if (r.ok) { S.scenario = r.data.scenario; actions.renderScenario(); actions.refreshAll(); } }

function renderChips() {
  const chip = (arr, id) => `<button type="button" class="chip" data-h="${id}" aria-pressed="${arr.includes(id)}">${esc(hubName(id))}</button>`;
  const zones = [...new Set(S.net.hubs.map((h) => h.zone))];
  $('#zone-chips').innerHTML = zones.map((z) => `<button type="button" class="chip" data-z="${z}" aria-pressed="${S.zones.includes(z)}">${ic('rain')}${esc(z)}</button>`).join('');
  $$('#zone-chips [data-z]').forEach((b) => b.onclick = () => { const z = b.dataset.z; S.zones = S.zones.includes(z) ? S.zones.filter((x) => x !== z) : [...S.zones, z]; b.setAttribute('aria-pressed', String(S.zones.includes(z))); });
  $('#rain-chips').innerHTML = S.net.hubs.map((h) => chip(S.rain, h.id)).join('');
  $('#block-chips').innerHTML = S.net.hubs.map((h) => chip(S.blocked, h.id)).join('');
  for (const [box, key] of [['#rain-chips', 'rain'], ['#block-chips', 'blocked']]) $$(box + ' [data-h]').forEach((b) => b.onclick = () => { const id = b.dataset.h; S[key] = S[key].includes(id) ? S[key].filter((x) => x !== id) : [...S[key], id]; b.setAttribute('aria-pressed', String(S[key].includes(id))); });
  $$('#rain-chips .chip, #block-chips .chip, #zone-chips .chip').forEach((b) => { b.style.textDecoration = 'none'; });
}

export function initSim() {
  actions.runSim = runSim; actions.clearScenario = clearScenario;
  renderChips();
  $('#sim-presets').innerHTML = Object.entries(S.net.presets).map(([k, p]) => `<button type="button" class="chip on" data-p="${k}">${ic(/Down$/.test(k) ? 'blocked' : /Delay$/.test(k) ? 'timer' : k === 'rush' ? 'rush' : 'rain')}${esc(p.label)}</button>`).join('');
  $$('#sim-presets [data-p]').forEach((b) => b.onclick = () => runSim(b.dataset.p, b));
  const svc = S.net.lines.filter((l) => ['bus', 'metro', 'leguna'].includes(l.mode)).map((l) => `<option value="${l.id}">${esc(l.mode === 'metro' ? 'MRT-6' : l.name)}</option>`).join('');
  $('#sim-down').insertAdjacentHTML('beforeend', svc); $('#sim-delay-line').insertAdjacentHTML('beforeend', svc);
  $('#sim-run').onclick = () => {
    const down = $('#sim-down').value, dLine = $('#sim-delay-line').value, rate = Number($('#sim-delay-rate').value || 0) / 100, extra = Number($('#sim-delay-min').value || 0);
    runSim({ label: 'Custom scenario', rain: S.rain, rainZones: S.zones, rainSeverity: $('#sim-heavy').checked ? 'heavy' : 'light', rush: $('#sim-rush').checked, blocked: S.blocked,
      disabledLines: down ? [down] : [], delays: dLine && (rate || extra) ? [{ line: dLine, rate, extraMinutes: extra, label: 'simulated delay' }] : [] });
  };
  $('#sim-clear').onclick = () => { S.rain = []; S.blocked = []; S.zones = []; $('#sim-rush').checked = false; $('#sim-heavy').checked = false; $('#sim-down').value = ''; $('#sim-delay-line').value = ''; $('#sim-delay-rate').value = ''; $('#sim-delay-min').value = ''; S.sim = null; $('#sim-out').innerHTML = EMPTY; renderChips(); actions.drawMap(); };
}
