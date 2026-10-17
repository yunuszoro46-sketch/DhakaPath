// Search: natural-language box, constraint form, option cards (labels, Verified badge, trust-aware
// "why" line). The selected option's details are rendered by fareBreakdown.js.
import { $, $$, esc, rng, pills, ic, MODES, MODE_NAME, busy, latest, retryable } from './util.js';
import { S, actions, hubName } from './store.js';
import { post } from './api.js';
import { renderDetail } from './fareBreakdown.js';
import { optionFor, prefFromOption, renderPrefs } from './mapControls.js';
import { kindOf } from './streetMap.js';

export function query() {
  return { origin: $('#origin').value, destination: $('#destination').value, student: $('#student').checked,
    maxBudget: $('#maxBudget').value === '' ? null : Number($('#maxBudget').value), maxTransfers: $('#maxTransfers').value === '' ? null : Number($('#maxTransfers').value), maxTravelTime: $('#maxTravelTime').value === '' ? null : Number($('#maxTravelTime').value),
    avoidHubs: S.avoid, avoidModes: S.avoidModes, sort: ($('input[name=sort]:checked') || {}).value || 'score', departAt: $('#departAt').value || null, singleModeOnly: $('#singleMode').checked };
}

const turn = latest();
let lastQuery = null;
export async function search(body) {
  const q = body || query();
  if (!body && q.origin === q.destination) { $('#search-out').innerHTML = '<div class="note warn">Choose two different hubs.</div>'; return; }
  const btn = body && body.query ? $('#nl-form button[type=submit]') : $('#plan-form button.primary');
  if (btn && btn.getAttribute('aria-busy') === 'true' && !body) return;     // double click: the first search is still running
  const k = turn.next(); lastQuery = q;
  const out = $('#search-out'); out.setAttribute('aria-busy', 'true');
  if (!out.children.length) out.innerHTML = '<div class="skeleton" aria-hidden="true"><p>Finding routes… <span class="bn" lang="bn">রুট খোঁজা হচ্ছে…</span></p><i></i><i></i></div>';
  const r = btn && btn.getAttribute('aria-busy') === 'true' ? await post('/api/search', q) : await busy(btn, 'Searching…', () => post('/api/search', q));
  if (!turn.isCurrent(k)) return;                 // a newer search was started meanwhile
  out.removeAttribute('aria-busy');
  if (!r) return;
  if (!r.ok && retryable(r.error) && S.result && S.result.ok) {   // keep the last good results on a network failure
    const old = $('#search-net'); if (old) old.remove();
    out.insertAdjacentHTML('afterbegin', `<div class="note bad" id="search-net">${esc(r.error.message)} <button type="button" class="ghost small" id="search-retry">Retry</button></div>`);
    $('#search-retry').onclick = () => search(lastQuery);
    return;
  }
  S.result = r; S.sim = null; S.sel = r.ok ? optionFor(r.data, S.mapPref) || r.data.options[0] : null;
  if (S.mapPref !== 'all') S.mapPref = S.sel ? (optionFor(r.data, S.mapPref) ? S.mapPref : prefKind(S.sel)) : S.mapPref;
  if (r.ok && body && body.query) syncForm(r.data);
  renderSearch(); actions.drawMap();
  $('#sim-trip').textContent = r.ok ? `${r.data.originName} → ${r.data.destName}` : `${hubName($('#origin').value)} → ${hubName($('#destination').value)}`;
}

export function syncForm(d) {
  $('#origin').value = d.origin; $('#destination').value = d.dest;
  const c = d.constraints; $('#student').checked = !!c.student; $('#maxBudget').value = c.maxBudget ?? ''; $('#maxTransfers').value = c.maxTransfers ?? ''; $('#maxTravelTime').value = c.maxTravelTime ?? ''; $('#singleMode').checked = !!c.singleModeOnly;
  $('#departAt').value = c.departAt || '';
  S.avoid = [...(c.avoidHubs || [])]; S.avoidModes = [...(c.avoidModes || [])];
  const sr = $(`input[name=sort][value="${c.sort}"]`); if (sr) sr.checked = true;
  renderFilters();
}

const whyLine = (o) => {
  const w = (o.why || []).filter((x) => x.kind !== 'clear');
  if (!w.length) return `<div class="why ok">${ic('check')} No street reports on this route</div>`;
  return w.slice(0, 2).map((x) => `<div class="why ${x.kind}">${x.kind === 'avoids' ? '↪' : x.kind === 'hard' ? '⛔' : x.kind === 'soft' ? '⚠' : 'ⓘ'} ${esc(x.text)}</div>`).join('');
};
const budgetTag = (o) => (!o.budget ? '' : o.budget.status === 'within' ? `<span class="tag rec">Fits ৳${o.budget.limit}</span>` : o.budget.status === 'estimated_within' ? `<span class="tag warn" title="${esc(o.budget.note || '')}">Might fit ৳${o.budget.limit}</span>` : o.budget.status === 'unknown' ? '<span class="tag warn">budget: fare unknown</span>' : '');
const sg = (n) => (n > 0 ? `+${n}` : `${n}`);
const STATUS = { NO_ROUTE_IN_MODELED_NETWORK: 'Not connected in the modelled network', NO_ROUTE_WITHIN_HOP_LIMIT: 'Beyond the 6-hop search limit', NO_ROUTE_WITHIN_CONSTRAINTS: 'Blocked by current conditions or your filters', SEARCH_INCOMPLETE: 'Search stopped early (partial result)' };
const statsTitle = (s) => (s ? `${s.dfsNodes} search steps, ${s.hubPaths} hub paths, ${s.candidates} distinct routes; rejected: ${Object.entries(s.rejected).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}; links skipped: ${Object.entries(s.linksPruned).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}` : '');
const maybeList = (u) => (u && u.length ? `<details class="more"><summary>${u.length} route(s) might fit your budget (typical fare fits, top estimate does not)</summary>${u.map((o, i) => optCard(o, i, 'uncertainBudget')).join('')}</details>` : '');
function backupBlock(d) {
  const b = d.backup;
  if (!b) return '';
  if (!b.option) return b.reason ? `<p class="muted small">${ic('backup')} No backup: ${esc(b.reason)}</p>` : '';
  d.backupList = [b.option];
  const shown = [...d.options, ...d.others].find((o) => o.signature === b.option.signature);
  if (shown) shown.isBackup = true;
  return `<div class="backup"><h3 class="small">${ic('backup')} Backup route <span class="muted">(${sg(b.delta.minutes)} min, ${b.delta.fareLow === b.delta.fareHigh ? sg(b.delta.fareLow) : sg(b.delta.fareLow) + ' to ' + sg(b.delta.fareHigh)} ৳, ${sg(b.delta.transfers)} transfer${Math.abs(b.delta.transfers) === 1 ? '' : 's'} vs main)</span></h3>
    <p class="small" style="margin:0 0 6px">${esc(b.trigger)} ${b.distinct === 'no_shared_service' ? 'Shares no bus, train or rickshaw/CNG link with the main route.' : 'Avoids the main route’s most exposed leg.'}${shown ? ` It is the card tagged <b>Backup</b> ${d.options.includes(shown) ? 'above' : 'under “more options”'}.` : ''}</p>${shown ? '' : optCard(b.option, 0, 'backupList')}</div>`;
}
function optCard(o, i, group) {
  // a ticket: why it is shown (kind label, coloured like its map line), the plate (minutes, fare,
  // transfers; Big Shoulders), the journey strip (one plate per leg), then the trust line
  const kind = kindOf(o), labels = o.labels || [];
  const tags = labels.map((t, j) => `<span class="tag${j === 0 ? ' kind' : ''}${t === 'Cheapest' ? ' rec' : ''}">${t}</span>`).join('');
  return `<button type="button" class="opt k-${kind}" data-g="${group}" data-i="${i}" aria-pressed="${S.sel && S.sel.id === o.id}">
    <div class="t-top"><div class="t-tags">${o.isBackup ? `<span class="tag warn${labels.length ? '' : ' kind'}">Backup</span>` : ''}${tags}${o.fareUnknown ? '<span class="tag warn">fare unknown</span>' : ''}${budgetTag(o)}</div>
      <div class="t-verify">${o.grounded ? `<span class="badge-ok">Verified against network ✓</span>` : '<span class="badge-bad">Not verified</span>'}</div></div>
    <div class="nums"><span>${o.totalMinutes} <small>min</small></span><span>${rng(o.fareRangeLow, o.fareRangeHigh)} <small>${o.student ? 'student' : 'regular'}</small></span><span>${o.transfers} <small>transfer${o.transfers === 1 ? '' : 's'}</small></span></div>
    ${pills(o)}${whyLine(o)}</button>`;
}

export function renderSearch() {
  const r = S.result, out = $('#search-out');
  if (!r) return;
  if (!r.ok) {
    const d = r.data || {};
    if (retryable(r.error)) { out.innerHTML = `<div class="card"><div class="note bad">${esc(r.error.message)}</div><button type="button" class="primary" id="search-retry">Retry</button></div>`; $('#search-retry').onclick = () => search(lastQuery); return; }
    out.innerHTML = `<div class="card">${d.status && STATUS[d.status] ? `<p class="muted small" style="margin:0 0 6px" title="${esc(statsTitle(d.stats))}">${esc(STATUS[d.status])} · ${esc(d.status)}</p>` : ''}<div class="note bad">${esc(r.error.message)}</div>${maybeList(d.uncertainBudget)}${d.cheapestOverBudget ? `<p>Cheapest open option <span class="tag warn">over budget</span>: <b>${rng(d.cheapestOverBudget.fareRangeLow, d.cheapestOverBudget.fareRangeHigh)}</b>, ${d.cheapestOverBudget.totalMinutes} min (${esc(d.cheapestOverBudget.summary)}).</p>` : ''}</div>`;
    return;
  }
  const d = r.data, c = d.constraints, k = d.conditions;
  const bkHtml = backupBlock(d);
  const filt = [c.student && 'student', c.maxBudget != null && `≤ ৳${c.maxBudget}`, c.maxTransfers != null && `≤ ${c.maxTransfers} transfers`, c.maxTravelTime != null && `≤ ${c.maxTravelTime} min`, c.singleModeOnly && 'single mode only', c.avoidHubs.length && 'avoiding ' + c.avoidHubs.map(hubName).join(', '), c.avoidModes.length && 'no ' + c.avoidModes.map((m) => MODE_NAME[m]).join('/')].filter(Boolean);
  const fresh = !out.querySelector('#opts') || out.dataset.trip !== `${d.origin}>${d.dest}`;
  out.dataset.trip = `${d.origin}>${d.dest}`;
  out.innerHTML = `<div class="card${fresh ? ' strip-anim' : ''}">
    <div class="row between" style="margin-bottom:4px"><h2>${esc(d.originName)} → ${esc(d.destName)}</h2><span class="muted small" title="${esc(statsTitle(d.stats))}">${d.considered} paths checked${d.partial ? ' · partial' : ''}</span></div>
    <p class="cond-line${k.rush ? '' : ' calm'}">${filt.length ? `<span class="trip-meta">${esc(filt.join(' · '))}</span>` : ''}${k.rush ? `${ic('rush')} <span><b>Rush hour applied</b> (${k.rushSource}, leaving ${k.departAt}): buses ×1.5, rickshaw/CNG fares surge.</span>` : `${ic('clock')} <span>Leaving ${k.departAt}${k.departSource === 'now' ? ' (now)' : ''}: off-peak.</span>`}${k.scenarioActive ? ` ${ic('rain')} <span>Scenario active: ${esc(k.scenarioLabel || 'simulated conditions')}.</span>` : ''}${d.alertsUsed && d.alertsUsed.length ? ` <span class="cond-alert">${ic('alert')}${d.alertsUsed.length} street alert(s) are shaping these routes.</span>` : ''}</p>
    ${d.parsed ? `<p class="muted small" style="margin:0 0 8px">Read by ${d.parsed.source === 'llm' ? 'AI' : 'rule parser'}: intent ${esc(d.parsed.intent)}</p>` : ''}
    <div id="opts">${d.options.map((o, i) => optCard(o, i, 'options')).join('')}</div>
    ${bkHtml}${maybeList(d.uncertainBudget)}
    ${d.others.length ? `<details class="more others"><summary>${d.others.length} more option(s)</summary>${d.others.map((o, i) => optCard(o, i, 'others')).join('')}</details>` : ''}
  </div><div class="card detail" id="detail"></div>`;
  $$('#search-out .opt').forEach((b) => b.addEventListener('click', () => selectOption(d[b.dataset.g][Number(b.dataset.i)])));
  renderDetail(); renderPrefs();
}

const prefKind = (o) => { const l = (o.labels || [])[0]; return l === 'Cheapest' ? 'cheapest' : l === 'Fastest' ? 'fastest' : l === 'Balanced' ? 'balanced' : null; };
// one place that changes the selected option: cards, map preference buttons
export function selectOption(o, { keepPref = false } = {}) {
  S.sel = o;
  $$('#search-out .opt').forEach((x) => { const d = S.result.data, g = d[x.dataset.g]; x.setAttribute('aria-pressed', String(!!g && g[Number(x.dataset.i)] === o)); });
  if (!keepPref) prefFromOption(o);
  renderDetail(); actions.drawMap();
}

export function renderFilters() {
  $('#avoid-chips').innerHTML = S.avoid.map((a, i) => `<span class="chip">Avoid ${esc(hubName(a))}<button class="x" type="button" data-i="${i}" aria-label="Remove">×</button></span>`).join('');
  $$('#avoid-chips .x').forEach((b) => b.onclick = () => { S.avoid.splice(Number(b.dataset.i), 1); renderFilters(); });
  $('#mode-chips').innerHTML = MODES.map((m) => `<button type="button" class="chip mchip ${m}" data-m="${m}" aria-pressed="${!S.avoidModes.includes(m)}" title="${!S.avoidModes.includes(m) ? 'Allowed: tap to avoid' : 'Avoided: tap to allow'}"><span class="mdot" aria-hidden="true"></span>${MODE_NAME[m]}</button>`).join('');
  $$('#mode-chips [data-m]').forEach((b) => b.onclick = () => { const m = b.dataset.m; S.avoidModes = S.avoidModes.includes(m) ? S.avoidModes.filter((x) => x !== m) : [...S.avoidModes, m]; renderFilters(); });
  const lim = ['#maxBudget', '#maxTransfers', '#maxTravelTime'].filter((id) => $(id).value !== '').length + ($('#singleMode').checked ? 1 : 0) ;
  const n = S.avoid.length + S.avoidModes.length + lim; $('#filter-sum').textContent = n ? `${n} active` : '';
}

export function initSearch() {
  actions.search = search; actions.renderSearch = renderSearch; actions.selectOption = selectOption; actions.syncForm = syncForm; actions.query = query;
  renderFilters();
  $('#plan-form').addEventListener('submit', (e) => { e.preventDefault(); search(); });
  $('#nl-form').addEventListener('submit', (e) => {
    e.preventDefault(); const t = $('#nl-in').value.trim();
    if (!t) { $('#search-out').innerHTML = '<div class="note warn">Type a trip first, e.g. <i>“Mirpur theke Motijheel, student, 40 takar moddhe”</i>, or use the form below.</div>'; $('#nl-in').focus(); return; }
    search({ query: t, sort: ($('input[name=sort]:checked') || {}).value });
  });
  $('#swap').onclick = () => { const a = $('#origin').value; $('#origin').value = $('#destination').value; $('#destination').value = a; search(); };
  $('#filters').addEventListener('change', () => renderFilters());
  // sort chips sit above the results: a change re-ranks the current trip at once
  $$('input[name=sort]').forEach((r) => r.addEventListener('change', () => { if (S.result) search(); }));
  $('#avoid-add').onclick = () => { const v = $('#avoid-pick').value; if (v && !S.avoid.includes(v)) { S.avoid.push(v); renderFilters(); } };
}
