// Ride-share board (bonus 3): open shares at a hub, start / join / leave, and the split bot's quote.
import { send, userOf } from './_util.js';

const str = (v) => (typeof v === 'string' ? v.slice(0, 100) : undefined);
export default function rides(app) {
  app.get('/api/rides', (req, res) => send(res, req.app.locals.engine.rideList({ hub: str(req.query.hub) || null, userId: userOf(req) })));
  app.get('/api/rides/quote', (req, res) => send(res, req.app.locals.engine.rideQuote({ from: str(req.query.from), to: str(req.query.to), mode: str(req.query.mode) || 'rickshaw', people: Number(req.query.people || 2) })));
  app.post('/api/rides', (req, res) => { const b = req.body || {}; send(res, req.app.locals.engine.rideCreate({ from: str(b.from), to: str(b.to), mode: str(b.mode) || 'rickshaw', userId: userOf(req) })); });
  app.post('/api/rides/:id/join', (req, res) => send(res, req.app.locals.engine.rideJoin(req.params.id, userOf(req))));
  app.post('/api/rides/:id/leave', (req, res) => send(res, req.app.locals.engine.rideLeave(req.params.id, userOf(req))));
}
