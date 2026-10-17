// Admin (password gate -> bearer token): moderation queue, lines CRUD, fare chart, landmark notes,
// audit log, reset.
import { $, $$, esc, MODE_NAME, dhakaTime, busy } from './util.js';
import { S, actions, hub, hubName } from './store.js';
import { get, post, put, del } from './api.js';

const A = { admin: true };
const locked = () => { $('#admin-login').hidden = !!S.adminToken; $('#admin-body').hidden = !S.adminToken; };

async function login(ev) {
  ev.preventDefault();
  const r = await post('/api/admin/login', { password: $('#admin-pw').value });
  if (!r.ok) { $('#admin-login-err').textContent = r.error.message; return; }
  S.adminToken = r.data.token; $('#admin-pw').value = ''; $('#admin-login-err').textContent = '';
  locked(); refreshAdmin();
}

export async function refreshAdmin() {
  if (!S.adminToken) { locked(); return; }
  const [q, au] = await Promise.all([get('/api/admin/queue', A), get('/api/admin/audit', A)]);
  if (q.status === 401) { S.adminToken = null; locked(); return; }
  $('#queue-count').textContent = q.ok && q.data.queue.length ? String(q.data.queue.length) : '';
  $('#queue').innerHTML = q.ok && q.data.queue.length ? q.data.queue.map((x) => `<div class="alert-item"><span class="status ${x.kind === 'alert' ? (x.alert || {}).status : 'rejected'}">${esc(x.kind.replace('_', ' '))}</span> ${x.alert ? `<b>${esc(x.alert.placeName)}</b> ${esc(x.alert.type)} · ` : ''}<span class="small">${esc(x.reason)}</span>${x.text ? `<div class="small muted">“${esc(x.text)}” · ${esc(x.userId || '')}</div>` : ''}
    ${x.alertId ? `<div class="row tight" style="margin-top:5px"><button class="ghost small" data-mod="approve" data-id="${x.alertId}">Approve</button><button class="ghost small" data-mod="clear_flag" data-id="${x.alertId}">Clear flag</button><button class="ghost small danger" data-mod="remove" data-id="${x.alertId}">Remove</button></div>` : ''}</div>`).join('') : '<p class="empty">Nothing flagged.</p>';
  $$('#queue [data-mod]').forEach((b) => b.onclick = async () => { await post(`/api/admin/alerts/${b.dataset.id}/moderate`, { action: b.dataset.mod }, A); await actions.refreshAll(); });
  $('#audit').innerHTML = au.ok ? au.data.audit.slice(0, 40).map((a) => `<div class="small"><span class="muted">${dhakaTime(a.at)}</span> <b>${esc(a.action)}</b> ${a.targetId ? esc(a.targetId) : ''} <span class="muted">${esc(a.actor)}</span></div>`).join('') || '<p class="empty">No actions yet.</p>' : '';
}

export function renderLines() {
  const rows = S.net.lines.map((l) => { const es = S.net.edges.filter((e) => e.line === l.id);
    return `<tr><td><b>${esc(l.id)}</b><br><span class="small muted">${esc(l.name)}</span></td><td><span class="mpill ${l.mode}">${MODE_NAME[l.mode]}</span></td><td class="small">${l.stops.map(hubName).map(esc).join(' → ')}</td>
      <td class="num">${es.reduce((s, e) => s + e.km, 0).toFixed(1)}</td><td>${l.mode === 'bus' ? '✓' : '—'}</td><td><button class="ghost small danger" data-del="${esc(l.id)}">Delete</button></td></tr>`; }).join('');
  $('#line-table').innerHTML = `<table><thead><tr><th>Line</th><th>Mode</th><th>Stops</th><th class="num">km</th><th>Student ½</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  $$('#line-table [data-del]').forEach((b) => b.onclick = async () => { if (!confirm(`Delete line ${b.dataset.del}?`)) return; await del('/api/admin/routes/' + encodeURIComponent(b.dataset.del), A); await actions.loadNetwork(); });
  const f = S.net.fares;
  for (const [m, keys] of Object.entries({ bus: ['perKm', 'minimum'], metro: ['perKm', 'minimum', 'maximum'], rickshaw: ['lowPerKm', 'highPerKm', 'minimum'], cng: ['lowPerKm', 'highPerKm', 'minimum'] })) for (const k of keys) $(`#f-${m}-${k}`).value = f[m][k];
  $('#f-adjust').value = ''; $('#f-note').value = '';
  get('/api/fares').then((r) => { if (!r.ok) return; const t = r.data.fareTable, h = r.data.history;
    $('#fare-version').innerHTML = `Fare table <b>v${t.version}</b>${t.effectiveFrom ? ` · effective ${esc(new Date(t.effectiveFrom).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' }))}` : ''} · ${esc(t.source)}${h.length ? `<br>Recent changes: ${h.slice(0, 3).map((x) => `v${x.version}: ${x.changes.map((c) => `${esc(c.path)} ${c.from}→${c.to}`).join(', ')}${x.note ? ` (${esc(x.note)})` : ''}`).join("; ")}` : ''}`; });
  const v = $('#hb-id').value; $('#hb-id').innerHTML = S.net.hubs.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join(''); $('#hb-id').value = v || 'DHA'; fillHubForm();
}
function fillHubForm() { const h = hub($('#hb-id').value); if (!h) return; $('#hb-en').value = h.landmarks[0] ? h.landmarks[0].note_en : ''; $('#hb-bn').value = h.landmarks[0] ? h.landmarks[0].note_bn_banglish : ''; }
const errs = (r) => 'Not saved:<br>' + ((r.error.details || [r.error.message]).map(esc).join('<br>'));

async function addLine(ev) {
  ev.preventDefault();
  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const body = { id: $('#ln-id').value.trim(), name: $('#ln-name').value.trim(), mode: $('#ln-mode').value, stops: list($('#ln-stops').value), km: list($('#ln-km').value).map(Number), boardingNote: $('#ln-note').value.trim() };
  if ($('#ln-flat').value) body.flatFare = Number($('#ln-flat').value);
  const r = await post('/api/admin/routes', body, A);
  if (!r.ok) { $('#ln-errors').innerHTML = errs(r); return; }
  $('#ln-errors').innerHTML = ''; $('#line-form').reset(); await actions.loadNetwork(); actions.researchIfAny(); refreshAdmin();
}
async function saveFares(ev) {
  ev.preventDefault();
  const v = (id) => Number($(id).value);
  const adj = $('#f-adjust').value === '' ? 0 : Number($('#f-adjust').value);
  const fares = adj ? { adjustPercent: adj, metro: { minimum: v('#f-metro-minimum'), maximum: v('#f-metro-maximum') } }   // % applies to the current per-km rates
    : { bus: { perKm: v('#f-bus-perKm'), minimum: v('#f-bus-minimum') }, metro: { perKm: v('#f-metro-perKm'), minimum: v('#f-metro-minimum'), maximum: v('#f-metro-maximum') },
      rickshaw: { lowPerKm: v('#f-rickshaw-lowPerKm'), highPerKm: v('#f-rickshaw-highPerKm'), minimum: v('#f-rickshaw-minimum') }, cng: { lowPerKm: v('#f-cng-lowPerKm'), highPerKm: v('#f-cng-highPerKm'), minimum: v('#f-cng-minimum') } };
  const r = await busy(ev.submitter || $('#fare-form button[type=submit]'), 'Saving…', () => put('/api/admin/routes', { kind: 'fares', fares, note: $('#f-note').value.trim() }, A));
  if (!r) return;
  $('#fare-errors').innerHTML = r.ok ? `<span style="color:var(--ok)">Saved as fare table v${r.data.version} (${r.data.changes.length} change(s)). Fares recomputed.</span>` : errs(r);
  if (r.ok) { await actions.loadNetwork(); actions.researchIfAny(); refreshAdmin(); }
}
async function saveHub(ev) {
  ev.preventDefault();
  const r = await put('/api/admin/routes', { kind: 'hub', id: $('#hb-id').value, landmarks: [{ note_en: $('#hb-en').value, note_bn_banglish: $('#hb-bn').value }] }, A);
  $('#hb-errors').innerHTML = r.ok ? '<span style="color:var(--ok)">Saved. New searches use this note.</span>' : errs(r);
  if (r.ok) { await actions.loadNetwork(); actions.researchIfAny(); refreshAdmin(); }
}
async function reset() {
  if (!confirm('Reset network, fares and alerts to the seed?')) return;
  const r = await post('/api/admin/reset', {}, A);
  if (r.ok) { await actions.loadNetwork(); await actions.refreshAll(); actions.search(); refreshAdmin(); }
}

export function initAdmin(hint) {
  actions.refreshAdmin = refreshAdmin; actions.renderLines = renderLines;
  if (hint) $('#admin-hint').textContent = hint;
  locked();
  $('#admin-login').addEventListener('submit', login);
  $('#admin-logout').onclick = () => { S.adminToken = null; locked(); };
  $('#line-form').addEventListener('submit', addLine);
  $('#fare-form').addEventListener('submit', saveFares);
  $('#hub-form').addEventListener('submit', saveHub);
  $('#hb-id').onchange = fillHubForm;
  $('#reset').onclick = reset;
}
