// "Best time to leave" for the selected route: POST /api/best-time re-runs the same search at later
// departures (now … +90 min, plus the minute rush hour ends) and shows the timeline. Numbers are
// the engine's; this file only draws them.
import { $, esc, busy, retryable , ic } from './util.js';
import { S } from './store.js';
import { post } from './api.js';

const fareText = (x) => (x.fareLow != null && x.fareHigh != null && x.fareLow !== x.fareHigh ? `৳${x.fareLow}–${x.fareHigh}` : `৳${x.fare}`);

export async function checkBestTime(btn) {
  const out = $('#bt-out'), o = S.sel, r = S.result;
  if (!out || !o || !r || !r.ok) return;
  const d = r.data;
  const res = await busy(btn, 'Checking later departures…', () => post('/api/best-time', { ...d.constraints, origin: d.origin, destination: d.dest, departAt: (d.conditions && d.conditions.departAt) || d.constraints.departAt || null, signature: o.signature }));
  if (!res) return;
  if (S.sel !== o) return;                                   // the user picked another route meanwhile
  if (!res.ok) {
    out.innerHTML = `<div class="note bad">${esc(res.error.message)}</div>${retryable(res.error) ? '<button type="button" class="ghost small" id="bt-retry">Retry</button>' : ''}`;
    const rb = $('#bt-retry'); if (rb) rb.onclick = () => checkBestTime(btn);
    return;
  }
  const b = res.data, x = b.options[0];
  if (b.rushFixed || !x) { out.innerHTML = `<div class="note warn">${esc(b.advice)}</div>`; return; }
  const kind = x.worthWaiting ? 'ok' : x.leaveBefore ? 'warn' : 'info';
  out.innerHTML = `<div class="note ${kind}" role="status">${x.worthWaiting ? ic('alarm') + ' ' : x.leaveBefore ? '⚠ ' : '✓ '}${esc(x.advice)}</div>
    <ol class="bt-line" aria-label="Trip time by departure">${x.timeline.map((s) => `<li class="${s === x.best || (s.departAt === x.best.departAt) ? 'best' : ''}${s.rush ? ' rush' : ''}">
      <b>${esc(s.departAt)}</b><span>${s.minutes} min</span><span class="muted">${fareText(s)}</span><span class="muted">arrive ${esc(s.arriveAt)}</span>${s.rush ? '<span class="tag">rush</span>' : ''}</li>`).join('')}</ol>
    <p class="muted small">${esc(b.assumption)} Rush windows: ${(b.rushHours || []).map(([a, z]) => `${a}–${z}`).join(', ')}.</p>`;
}
