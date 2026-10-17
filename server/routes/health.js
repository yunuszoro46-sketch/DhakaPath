// GET /api/health: is the AI live, falling back, or off? (the UI shows "AI: live" / "AI: fallback")
import { ok } from './_util.js';
import { providers } from '../ai/llm.js';

export default function health(app) {
  app.get('/api/health', (req, res) => {
    const { state, ai } = req.app.locals;
    const list = providers(ai.env).map((p) => p.name);
    const s = state.ai;
    const mode = !list.length ? 'off' : s.mode === 'fallback' ? 'fallback' : 'live';
    ok(res, { ai: mode, providers: list, lastCall: s.calls ? { provider: s.lastProvider, ms: s.lastMs, ok: s.lastOk } : null, calls: s.calls, fallbacks: s.fallbacks,
      now: state.now(), clock: { speed: state.clock.speed }, scenario: state.scenario, version: '1.0.0',
      dataWarnings: (state.net.configWarnings || []).slice(0, 50) });   // config/seed values that were unusable and replaced
  });
}
