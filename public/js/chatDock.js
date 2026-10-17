// Chat dock (persistent across tabs): messages, Verified badge, tool-call chips, AI mode.
import { $, $$, esc, ic } from './util.js';
import { S, actions } from './store.js';
import { post, currentUser } from './api.js';

// a message: the words go in .reply (kept as written in either language); meta chips are appended after it
const add = (who, text, { ui = false } = {}) => { const d = document.createElement('div'); d.className = 'msg ' + who; const r = document.createElement('span'); if (!ui) r.className = 'reply'; r.textContent = text; d.appendChild(r); $('#chat-log').appendChild(d); $('#chat-log').scrollTop = 1e9; return d; };
const say = (m, text) => { m.querySelector('span').textContent = text; };
export const addMsg = add;

export async function sendChat(text) {
  if (!text.trim()) return;
  add('user', text); $('#chat-in').value = '';
  const m = add('bot', '…');
  const r = await post('/api/chat', { message: text, sessionId: currentUser() });
  if (!r.ok) { say(m, r.error.message); return; }
  const d = r.data;
  say(m, d.reply);
  const meta = document.createElement('span'); meta.className = 'tools';
  meta.innerHTML = `${d.grounded === true ? '<span class="badge-ok">Verified ✓</span> ' : d.grounded === false ? '<span class="badge-bad">Not verified</span> ' : ''}<span class="aichip ${esc(d.aiMode)}">AI: ${esc(d.aiMode === 'off' ? 'rules' : d.aiMode)}</span> intent: ${esc(d.intent)}${d.polished ? ' · wording by AI, numbers checked' : ''}` +
    d.toolCalls.map((t) => `<span class="toolchip">tool: ${esc(t)}</span>`).join('');
  m.appendChild(meta);
  const data = d.data;
  const route = data && data.options && data.options.length ? data : data && data.afterOption ? null : null;
  if (route) {
    const b = document.createElement('button'); b.className = 'ghost small'; b.textContent = 'Show on map'; b.style.marginTop = '6px';
    b.onclick = () => { if (route.origin) { S.result = { ok: true, data: route }; S.sel = route.options[0]; actions.syncForm(route); actions.renderSearch(); } else S.sel = route.options[0]; S.sim = null; actions.drawMap(); actions.showTab('search'); };
    m.appendChild(document.createElement('br')); m.appendChild(b);
  }
  if (['report_alert', 'confirm_alert', 'fare_check'].includes(d.intent)) actions.refreshAll();
  if (d.intent === 'watch_trip') actions.refreshWatches();
}

export function openChat(open) { $('#chat-dock').hidden = !open; $('#chat-toggle').setAttribute('aria-expanded', String(open)); $('#chat-toggle').innerHTML = `${ic(open ? 'close' : 'chat')}<span class="tl">${open ? 'Close chat' : 'Chat'}</span>`; $('#chat-toggle').setAttribute('aria-label', open ? 'Close chat' : 'Open chat'); if (open) $('#chat-in').focus(); }

export function initChat() {
  actions.openChat = openChat; actions.addMsg = add;
  $('#chat-toggle').onclick = () => openChat($('#chat-dock').hidden);
  $('#chat-close').onclick = () => openChat(false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#chat-dock').hidden) { openChat(false); $('#chat-toggle').focus(); } });
  $('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); sendChat($('#chat-in').value); });
  const sugg = ['Dhanmondi theke Motijheel, student', 'ar kono option?', 'why not metro?', 'student hole?', 'Farmgate bondho, onno route?', 'what if Science Lab e brishti hoy?', 'conductor 40 chaise Farmgate theke Motijheel, thik ache?', 'Science Lab e pani jome gese', 'ei alert ta ki still thik?', 'student half-fare ki metro te hoy?', 'ei trip watch koro'];
  $('#chat-suggest').innerHTML = sugg.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join('');
  $$('#chat-suggest .chip').forEach((b) => b.onclick = () => sendChat(b.textContent));
  add('bot', 'Assalamualaikum! Ask a trip in English, Banglish or Bangla. The AI only reads your message; routes and fares come from the network graph, and every route answer is checked against it.', { ui: true });
  $('#ground-test').onclick = async () => {
    const r = await post('/api/ground-test', {});
    openChat(true);
    add('user', `[test] AI claims: “${r.data.claim}”`);
    const m = add('bot', `${r.data.verdict}.\n${r.data.errors.map((e) => '• ' + e).join('\n')}\nThe answer is replaced by the engine's own route.`);
    const meta = document.createElement('span'); meta.className = 'tools'; meta.innerHTML = '<span class="badge-bad">Rejected: not in network</span><span class="toolchip">tool: groundRoute(plan) ✗</span>'; m.appendChild(meta);
  };
}
