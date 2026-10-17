// Ride-share board (bonus 3): pick a hub pair and rickshaw/CNG, see the split bot's per-person cost,
// find or start a share, join / leave. Every taka comes from the server (GET /api/rides/quote,
// /api/rides), which prices the ride with the same engine as the route cards.
import { $, $$, esc, busy, retryable } from './util.js';
import { S, actions } from './store.js';
import { get, post } from './api.js';

export const isShareTab = () => !$('#tab-share').hidden;
const pair = () => ({ from: $('#sh-from').value, to: $('#sh-to').value, mode: $('#sh-mode').value });

async function quote() {
  const p = pair(), bot = $('#sh-bot');
  if (p.from === p.to) { bot.className = 'note warn'; bot.textContent = 'Choose two different hubs.'; return; }
  const r = await get(`/api/rides/quote?from=${encodeURIComponent(p.from)}&to=${encodeURIComponent(p.to)}&mode=${p.mode}&people=${p.mode === 'cng' ? 3 : 2}`);
  bot.className = r.ok ? 'note ok' : 'note warn';
  bot.textContent = r.ok ? `🤖 ${r.data.bot}` : r.error.message;
}

export async function refreshShares() {
  const hub = $('#sh-from').value;
  const r = await get('/api/rides?hub=' + encodeURIComponent(hub));
  const box = $('#sh-list');
  $('#sh-board-title').textContent = `Open shares from ${(S.net.hubs.find((h) => h.id === hub) || {}).name || hub}`;
  if (!r.ok) { box.innerHTML = `<div class="note bad">${esc(r.error.message)}${retryable(r.error) ? ' <button type="button" class="ghost small" id="sh-retry">Retry</button>' : ''}</div>`; const b = $('#sh-retry'); if (b) b.onclick = refreshShares; return; }
  const rides = r.data.rides;
  box.innerHTML = rides.length ? rides.map((x) => `<div class="share-item${x.mine ? ' mine' : ''}">
      <div class="row between"><b>${esc(x.fromName)} → ${esc(x.toName)}</b><span class="mpill ${x.mode}">${x.mode === 'cng' ? 'CNG' : 'Rickshaw'}</span></div>
      <div class="small">${x.riders}/${x.seats} riders${x.mine ? ' (you are in)' : ''} · ${x.status === 'full' ? 'full' : `${x.minutesLeft} min left`}${x.perPerson ? ` · now ৳${x.perPerson.low}–${x.perPerson.high} each${x.ifOneMore ? `, ৳${x.ifOneMore.low}–${x.ifOneMore.high} each if one more joins` : ''}` : ''}</div>
      <div class="small muted">🤖 ${esc(x.bot)}</div>
      <div class="row tight" style="margin-top:5px">${x.mine ? `<button type="button" class="ghost small danger" data-sleave="${x.id}">Leave</button>` : x.status === 'open' ? `<button type="button" class="ghost small" data-sjoin="${x.id}">Join</button>` : ''}</div></div>`).join('')
    : '<p class="muted small">No open shares from this hub. Start one above; others at the hub will see it here.</p>';
  $$('#sh-list [data-sjoin]').forEach((b) => b.onclick = () => act(b, `/api/rides/${b.dataset.sjoin}/join`));
  $$('#sh-list [data-sleave]').forEach((b) => b.onclick = () => act(b, `/api/rides/${b.dataset.sleave}/leave`));
}

async function act(btn, path) {
  const r = await busy(btn, '…', () => post(path, {}));
  if (r && !r.ok) $('#sh-bot').className = 'note warn', $('#sh-bot').textContent = r.error.message;
  refreshShares();
}

// open the tab prefilled (from a rickshaw / CNG leg in the route detail)
export function openShare(from, to, mode) {
  $('#sh-from').value = from; $('#sh-to').value = to; $('#sh-mode').value = mode;
  actions.showTab('share'); quote(); refreshShares();
}

export function initShare() {
  const opts = S.net.hubs.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join('');
  $('#sh-from').innerHTML = opts; $('#sh-to').innerHTML = opts;
  $('#sh-from').value = 'SHA'; $('#sh-to').value = 'SCI';
  for (const id of ['#sh-from', '#sh-to', '#sh-mode']) $(id).addEventListener('change', () => { quote(); refreshShares(); });
  $('#share-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = pair();
    if (p.from === p.to) { quote(); return; }
    const r = await busy($('#sh-start'), 'Posting…', () => post('/api/rides', p));
    if (!r) return;
    const bot = $('#sh-bot');
    bot.className = r.ok ? 'note ok' : 'note warn';
    bot.textContent = r.ok ? `${r.data.joined ? 'Joined an open share going there.' : 'Share posted. Others at the hub can join for the next 20 min.'} 🤖 ${r.data.ride.bot}` : r.error.message;
    refreshShares();
  });
  actions.openShare = openShare; actions.refreshShares = refreshShares;
}
