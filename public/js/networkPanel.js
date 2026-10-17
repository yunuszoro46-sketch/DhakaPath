// Commuter view of the network (problem Part 1): routes with mode, ends, fare, student eligibility,
// estimated time and live state; hubs with status and disruptions.
import { $, $$, esc, ic, MODES, MODE_NAME, dhakaTime } from './util.js';
import { S } from './store.js';
import { get } from './api.js';

const hidden = [];
export async function refreshNetwork() {
  const r = await get('/api/browse'); if (!r.ok) return;
  const b = r.data;
  $('#net-updated').textContent = 'as of ' + dhakaTime(b.now);
  // the network's own size, counted from the data the engine routes on (seed data, not official)
  const n = S.net || {}, modes = new Set((n.lines || []).map((l) => l.mode));
  const tile = (icon, v, k) => `<div class="stat"><span class="stat-ic">${ic(icon)}</span><b>${v}</b><span>${k}</span></div>`;
  $('#net-stats').innerHTML = tile('pin', (n.hubs || []).length, 'hubs') + tile('route', (n.lines || []).length, 'lines') + tile('network', (n.edges || []).length, 'links') + tile('transfer', modes.size, 'modes');
  $('#net-modes').innerHTML = MODES.map((m) => `<button type="button" class="chip mchip ${m}" data-m="${m}" aria-pressed="${!hidden.includes(m)}" title="${!hidden.includes(m) ? 'Shown: tap to hide' : 'Hidden: tap to show'}"><span class="mdot" aria-hidden="true"></span>${MODE_NAME[m]}</button>`).join('');
  $$('#net-modes [data-m]').forEach((x) => x.onclick = () => { const m = x.dataset.m; const i = hidden.indexOf(m); if (i >= 0) hidden.splice(i, 1); else hidden.push(m); refreshNetwork(); });
  const rows = b.lines.filter((l) => !hidden.includes(l.mode)).map((l) => `<tr><td><b>${esc(l.id)}</b><br><span class="small muted">${esc(l.name)}</span></td><td><span class="mpill ${l.mode}">${MODE_NAME[l.mode]}</span></td>
    <td class="small">${esc(l.fromName)} → ${esc(l.toName)}${l.stops.length > 2 ? `<br><span class="muted">via ${esc(l.stopNames.slice(1, -1).join(', '))}</span>` : ''}</td><td class="num">${l.estMinutes} min</td>
    <td class="num">${l.fareRange ? esc(l.fareRange) : l.mode === 'walk' ? 'free' : '৳' + l.fareRegular}${l.studentEligible ? `<br><span class="small" style="color:var(--ok)">student ৳${l.fareStudent}</span>` : ''}</td>
    <td>${l.studentEligible ? '✓' : '—'}</td><td><span class="lstate ${l.state}">${l.state}</span></td></tr>`).join('');
  $('#net-lines').innerHTML = `<table><thead><tr><th>Line</th><th>Mode</th><th>From → To</th><th class="num">Est. time</th><th class="num">Base fare</th><th>Student ½</th><th>Now</th></tr></thead><tbody>${rows}</tbody></table><p class="muted small">Full-line fares and times; ${esc(b.notice)}</p>`;
  $('#net-hubs').innerHTML = b.hubs.map((h) => `<div class="hub-card"><b>${esc(h.name)} <span class="muted small bn bn-echo">${esc(h.bn)}</span> <span class="hstat ${h.status}">${h.status}</span></b>
    ${h.alerts.map((a) => `<div class="small">⚠ ${esc(a.type)} · ${a.status} · ${a.effectiveConfidence} · ${a.ageMinutes} min old</div>`).join('')}
    <div class="small muted">${h.lines.length} line(s) · ${esc(h.zone)}</div>${h.landmarks[0] ? `<div class="small muted lm">${ic('pin')}<span>${esc(h.landmarks[0].note_en)}${h.landmarks[0].sample ? ' <i>(sample)</i>' : ''}</span></div>` : ''}</div>`).join('');
}
export const isNetworkTab = () => !$('#tab-network').hidden;
