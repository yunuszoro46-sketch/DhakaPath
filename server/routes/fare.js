// Fare breakdown for given legs, and Fare Truth ("the conductor asked 40, fair?").
import { ok, send, userOf } from './_util.js';
import { fareScriptLLM, providers } from '../ai/llm.js';

export default function fare(app) {
  // the fare chart in force, its version, and recent changes (public; changes are made in Admin)
  app.get('/api/fares', (req, res) => {
    const E = req.app.locals.engine, f = E.net.config.fares;
    ok(res, { fareTable: E.fareTable(), fares: { bus: f.bus, metro: f.metro, rickshaw: f.rickshaw, cng: f.cng }, history: [...(E.store.fareHistory || [])].reverse().slice(0, 10).map(({ by, ...h }) => h), notice: E.DEMO_NOTICE });
  });
  app.post('/api/fare', (req, res) => send(res, req.app.locals.engine.fare(req.body || {})));
  app.post('/api/fare/check', async (req, res) => {
    const { engine: E, ai } = req.app.locals;
    const r = E.fareCheck({ ...req.body, mode: (req.body || {}).mode || 'bus', userId: userOf(req) });
    if (r.ok && providers(ai.env).length) {   // P4: polite sentence for the conductor; numbers checked, template otherwise
      const t = await fareScriptLLM({ from: r.originName, to: r.destName, mode: r.mode, claimed: r.claimedFare, fairLow: r.expected.rangeLow, fairHigh: r.expected.rangeHigh }, r.verdict, ai);
      if (t) { r.script = t; r.scriptBy = 'ai'; }
    }
    send(res, r);
  });
}
