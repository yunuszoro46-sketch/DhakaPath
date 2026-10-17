// Simulated clock: +15/+30/+90 buttons make alert decay visible in seconds.
import { ok, send } from './_util.js';
import { advanceClock, setSpeed, audit } from '../store/state.js';

export default function clock(app) {
  app.get('/api/clock', (req, res) => { const s = req.app.locals.state; ok(res, { now: s.now(), speed: s.clock.speed }); });
  app.post('/api/clock/advance', (req, res) => { const s = req.app.locals.state; const r = advanceClock(s, (req.body || {}).minutes); if (r.ok) audit(s, req.userId, 'clock.advance', null, { minutes: Number(req.body.minutes) }); send(res, r); });
  app.post('/api/clock/speed', (req, res) => send(res, setSpeed(req.app.locals.state, (req.body || {}).speed)));
}
