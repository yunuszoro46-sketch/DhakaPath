// Simulated clock (+15/+30/+90) and the AI badge (live / fallback / off), refreshed by the 3 s poll.
import { $, $$, dhakaTime } from './util.js';
import { S, actions } from './store.js';
import { get, post } from './api.js';

export function setClock(t) { if (!t) return; S.now = t; $('#clock').textContent = dhakaTime(t); }
export function setAi(mode, providers = []) {
  S.aiMode = mode;
  const b = $('#ai-badge');
  b.className = 'chip aichip ' + mode;
  b.textContent = mode === 'live' ? `AI: live (${providers.join(' → ')})` : mode === 'fallback' ? 'AI: fallback (offline parser)' : 'AI: offline parser';
  b.title = mode === 'off' ? 'No AI key configured: the rule-based parser answers. This is a feature, not a failure.' : 'The AI only translates text to JSON and phrases results; the engine decides.';
}
export async function pollHealth() { const h = await get('/api/health'); if (h.ok) { setClock(h.data.now); setAi(h.data.ai, h.data.providers); S.scenario = h.data.scenario; actions.renderScenario(); } }

export function initClock() {
  actions.setClock = setClock; actions.setAi = setAi;
  $$('[data-adv]').forEach((b) => b.onclick = async () => {
    const r = await post('/api/clock/advance', { minutes: Number(b.dataset.adv) });
    if (r.ok) setClock(r.data.now);
    await actions.refreshAll();
    if (S.sim) actions.runSim(S.sim.scenario);
  });
}
