// Alerts: paste a post (Alert Ingestor), list with confidence bar and age, confirm / "it's clear",
// and the demo helper "simulate 2 other users confirm".
import { $, $$, esc } from './util.js';
import { S, actions } from './store.js';
import { get, post, currentUser, switchUser } from './api.js';

let lastHtml = '';
export async function refreshAlerts() {
  const f = $('#alert-filter').value;
  const [r, all] = await Promise.all([get('/api/alerts' + (f ? '?status=' + f : '')), get('/api/alerts?status=all')]);
  if (!r.ok || !all.ok) return;
  S.alerts = all.data.alerts; S.hubStatus = r.data.hubStatus; actions.setClock(r.data.now);
  const act = S.alerts.filter((a) => a.status === 'active').length;
  $('#alert-count').textContent = act ? String(act) : '';
  const html = r.data.alerts.length ? r.data.alerts.map((a) => `<div class="alert-item">
    <div><span class="status ${a.status}">${a.status}</span> <b>${esc(a.placeName)}</b> · ${esc(a.type)} · severity ${a.severity} · <span class="muted small">${esc(a.source)}</span>${a.flags.length ? ` <span class="badge-bad">${esc(a.flags.join(', '))}</span>` : ''}</div>
    ${a.text ? `<div class="small muted">“${esc(a.text)}”</div>` : ''}
    <div class="bar" role="img" aria-label="Effective confidence ${a.effectiveConfidence} of 1; marks at 0.30 (unverified) and 0.60 (active)" title="effective confidence ${a.effectiveConfidence}; marks at 0.30 and 0.60"><i style="width:${Math.round(a.effectiveConfidence * 100)}%"></i></div>
    <div class="small muted alert-meta"><span>confidence <b>${a.effectiveConfidence}</b> (started ${a.baseConfidence})</span><span>${a.confirmations} report${a.confirmations === 1 ? '' : 's'} incl. the poster</span><span>${a.resolvedVotes} “clear” vote${a.resolvedVotes === 1 ? '' : 's'}</span><span>${a.ageMinutes} min old · last verified ${a.minutesSinceVerified} min ago</span><span class="effect ${a.routingEffect.startsWith('hard') ? 'hard' : a.routingEffect.startsWith('soft') ? 'soft' : 'none'}">routing: ${esc(a.routingEffect)}</span></div>
    ${['active', 'unverified', 'fading', 'disputed'].includes(a.status) ? `<div class="row tight" style="margin-top:5px"><button class="ghost small" data-act="confirm" data-id="${a.id}">Confirm</button><button class="ghost small" data-act="resolve" data-id="${a.id}">It's clear</button>${a.status !== 'active' ? `<button class="ghost small" data-seed="${a.id}">Simulate 2 other users confirm</button>` : ''}</div>` : ''}
  </div>`).join('') : '<p class="empty">No alerts in this view.</p>';
  if (html === lastHtml) { actions.drawMap(); return; }                 // the 3 s poll: no re-render (keeps focus) unless something changed
  lastHtml = html; $('#alert-list').innerHTML = html;
  $$('#alert-list [data-act]').forEach((b) => b.addEventListener('click', async () => {
    const res = await post(`/api/alerts/${b.dataset.id}/${b.dataset.act}`, {});
    $('#ingest-out').innerHTML = res.ok && res.data.ignored ? `<div class="note warn">You (${esc(currentUser())}) already voted on this alert, so it counts once. Press “Be someone else” to vote as another commuter.</div>` : res.ok ? '' : `<div class="note bad">${esc(res.error.message)}</div>`;
    await actions.refreshAll();
  }));
  $$('#alert-list [data-seed]').forEach((b) => b.addEventListener('click', async () => { await post('/api/demo/seed-users', { alertId: b.dataset.seed }); await actions.refreshAll(); }));
  actions.drawMap();
}

async function ingest(text) {
  if (!text.trim()) return;
  const r = await post('/api/alerts/ingest', { text });
  if (!r.ok) { $('#ingest-out').innerHTML = `<div class="note bad">${esc(r.error.message)}</div>`; return; }
  const d = r.data, x = d.extracted || {};
  const msg = { filed: ['warn', 'Filed as unverified (soft effect until confirmed).'], confirmed_existing: ['warn', d.ignored ? 'Matched an open alert you already reported or voted on, so it counts once. Press “Be someone else” to confirm as another commuter.' : 'Matched an open alert: counted as your confirmation.'], resolve_votes: ['ok', `Counted as a “clear” vote on ${(d.alerts || []).length} open alert(s).`],
    rejected: ['bad', d.reason], needs_more: ['warn', d.reason], not_incident: ['info', d.reason] }[d.action] || ['info', d.reason || ''];
  $('#ingest-out').innerHTML = `<dl class="kv"><dt>Read by</dt><dd>${x.source === 'llm' ? 'AI (P2)' : x.source === 'cache' ? 'demo cache' : 'rule parser'} · AI ${esc(d.aiMode)}</dd><dt>Hub</dt><dd>${esc(x.placeName || '—')}</dd><dt>Type</dt><dd>${esc(x.type || '—')}</dd><dt>Severity</dt><dd>${x.severity || '—'}</dd>${x.keywords ? `<dt>Keywords</dt><dd>${esc(Object.entries(x.keywords).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · '))}</dd>` : ''}</dl>
    <div class="note ${msg[0]}">${esc(msg[1])}${d.alert ? ` Confidence ${d.alert.effectiveConfidence} → <b>${esc(d.alert.status)}</b>.` : ''}</div>`;
  await actions.refreshAll();
}

export function initAlerts() {
  actions.refreshAlerts = refreshAlerts;
  const ex = ['Science Lab e hatu pani!! rickshaw o jacche na', 'ফার্মগেটে মিছিল, রাস্তা বন্ধ', 'Mohakhali te construction er kaj cholche', 'Malibagh e onek jam', 'Shahbagh block, na ekhon clear', 'Science Lab ekhon clear', 'Narnia road e pani'];
  $('#ingest-examples').innerHTML = ex.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join('');
  $$('#ingest-examples .chip').forEach((b) => b.onclick = () => { $('#ingest-in').value = b.textContent; });
  $('#ingest-form').addEventListener('submit', (e) => { e.preventDefault(); ingest($('#ingest-in').value); });
  $('#me').textContent = currentUser();
  $('#new-me').onclick = () => { $('#me').textContent = switchUser(); };
  $('#alert-filter').onchange = refreshAlerts;
}
