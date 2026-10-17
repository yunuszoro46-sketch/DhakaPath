// "What if" simulation (before/after/broken/delta) and the global scenario (the fake weather the
// whole app runs under until cleared).
import { send } from './_util.js';
import { setScenario, clearScenario, audit } from '../store/state.js';

export default function simulate(app) {
  app.post('/api/simulate', (req, res) => send(res, req.app.locals.engine.simulate(req.body || {})));
  app.get('/api/scenario', (req, res) => send(res, { ok: true, scenario: req.app.locals.state.scenario }));
  app.put('/api/scenario', (req, res) => {
    const { engine: E, state } = req.app.locals;
    const sc = E.expandZones(req.body || {});
    const r = setScenario(state, sc);
    if (r.ok) audit(state, req.userId, 'scenario.set', null, state.scenario);
    send(res, r);
  });
  app.delete('/api/scenario', (req, res) => { audit(req.app.locals.state, req.userId, 'scenario.clear'); send(res, clearScenario(req.app.locals.state)); });
}
