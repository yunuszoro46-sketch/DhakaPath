// Demo helper (architecture doc §13): "simulate 2 other users confirm" the given or latest unverified alert.
import { send } from './_util.js';
import { audit } from '../store/state.js';

export default function demo(app) {
  app.post('/api/demo/seed-users', (req, res) => {
    const { engine: E, state } = req.app.locals;
    const r = E.seedUsers((req.body || {}).alertId);
    if (r.ok) audit(state, req.userId, 'demo.seedUsers', r.alert.id);
    send(res, r);
  });
}
