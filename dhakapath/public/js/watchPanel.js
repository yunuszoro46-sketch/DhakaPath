// Trip Watch: saved trips re-checked on every poll; a change is announced once as a toast with the
// cause and a grounded detour (Show detour / Switch to it / read aloud).
import { $, $$, esc } from './util.js';
import { S, actions } from './store.js';
import { get, post, del, currentUser } from './api.js';

const LABEL = { ok: 'clear', slower: 'slower', better_route: 'faster route', reroute: 'reroute', no_route: 'no route' };

export async function watchTrip() {
  const r = S.result; if (!r || !r.ok) return;
  const d = r.data;
  const res = await post('/api/watch', { ...d.constraints, origin: d.origin, destination: d.dest, clientId: currentUser() });
  if (!res.ok) { toast('warn', res.error.message); return; }
  S.watchSeen[res.data.watch.id] = res.data.watch.status;
  await refreshWatches();
  toast('ok', `Watching ${res.data.watch.label}. You'll be warned here if a confirmed alert or rush hour hits it.`);
}

export async function refreshWatches() {
  const r = await get('/api/watch?clientId=' + encodeURIComponent(currentUser()));
  if (!r.ok) return;
  const ws = r.data.watches;
  $('#watch-panel').hidden = !ws.length;
  $('#watch-list').innerHTML = ws.map((w) => `<div class="watch-item"><div><span class="wstatus ${w.status}">${LABEL[w.status]}</span> <b>${esc(w.label)}</b> <span class="muted small">usual: ${esc(w.usual.summary)}</span></div>
    <div class="small">${esc(w.message)}</div>
    <div class="row tight" style="margin-top:5px">${w.suggestion ? `<button class="ghost small" data-wshow="${w.id}">Show detour</button><button class="ghost small" data-waccept="${w.id}">Switch to it</button>` : ''}<button class="ghost small" data-wsay="${w.id}" aria-label="Read aloud">🔊</button><button class="ghost small danger" data-wdel="${w.id}">Stop watching</button></div></div>`).join('');
  const byId = Object.fromEntries(ws.map((w) => [w.id, w]));
  $$('[data-wshow]').forEach((b) => b.onclick = () => showSuggestion(byId[b.dataset.wshow]));
  $$('[data-waccept]').forEach((b) => b.onclick = async () => { await post(`/api/watch/${b.dataset.waccept}/accept`, {}); S.watchSeen[b.dataset.waccept] = 'ok'; hideToast(); refreshWatches(); });
  $$('[data-wdel]').forEach((b) => b.onclick = async () => { await del('/api/watch/' + b.dataset.wdel); refreshWatches(); });
  $$('[data-wsay]').forEach((b) => b.onclick = () => sayWatch(byId[b.dataset.wsay]));
  for (const w of ws) {
    const prev = S.watchSeen[w.id];
    if (prev !== w.status) {
      S.watchSeen[w.id] = w.status;
      if (prev !== undefined && w.status !== 'ok') toast(w.status === 'reroute' || w.status === 'no_route' ? 'bad' : 'warn', `${w.label}: ${w.message}`, w);
      else if (prev !== undefined) toast('ok', `${w.label}: clear again. ${w.message}`);
    }
  }
}

async function showSuggestion(w) {
  if (!w || !w.suggestion) return;
  $('#origin').value = w.query.origin; $('#destination').value = w.query.destination;
  await actions.search({ ...w.query });
  const d = S.result && S.result.ok ? S.result.data : null;
  const all = d ? [...d.options, ...d.others] : [];
  S.sel = all.find((o) => o.signature === w.suggestion.signature) || w.suggestion;
  actions.renderSearch(); actions.drawMap(); actions.showTab('search');
}
function sayWatch(w) {
  if (!w || !('speechSynthesis' in window)) return;
  const steps = w.suggestion ? ' New route. ' + w.suggestion.legs.map((l, i) => `Step ${i + 1}. ${S.lang === 'bn' ? l.instructionBn : l.instruction}`).join(' ') : '';
  speechSynthesis.cancel(); speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(`${w.label}. ${w.message}${steps}`.replace(/৳/g, '')), { rate: 0.95 }));
}

let timer = null;
export function toast(kind, text, w) {
  const t = $('#toast');
  t.className = 'toast' + (kind === 'warn' ? ' warn' : '');
  t.style.borderColor = kind === 'ok' ? 'var(--ok)' : '';
  t.innerHTML = `<div>${kind === 'bad' ? '⚠️ ' : kind === 'ok' ? '👁 ' : '⏱ '}${esc(text)}</div><div class="row">${w && w.suggestion ? '<button class="primary small" id="t-show">Show detour</button>' : ''}${w ? '<button class="ghost small" id="t-say">🔊 Read aloud</button>' : ''}<button class="ghost small" id="t-close">Dismiss</button></div>`;
  t.hidden = false;
  if ($('#t-show')) $('#t-show').onclick = () => { showSuggestion(w); hideToast(); };
  if ($('#t-say')) $('#t-say').onclick = () => sayWatch(w);
  $('#t-close').onclick = hideToast;
  clearTimeout(timer); if (kind === 'ok') timer = setTimeout(hideToast, 5000);
}
export function hideToast() { $('#toast').hidden = true; }

export function initWatch() { actions.watchTrip = watchTrip; actions.refreshWatches = refreshWatches; actions.toast = toast; }
