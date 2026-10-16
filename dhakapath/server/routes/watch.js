// Trip Watch: save a trip and get warned when confirmed alerts or rush hour hit it.
import { send, userOf } from './_util.js';
import { audit } from '../store/state.js';

export default function watch(app) {
  app.post('/api/watch', (req, res) => {
    const { engine: E, state } = req.app.locals;
    const r = E.watchCreate({ ...req.body, clientId: (req.body || {}).clientId || userOf(req) });
    if (r.ok) audit(state, userOf(req), 'watch.create', r.watch.id);
    send(res, r);
  });
  app.get('/api/watch', (req, res) => send(res, req.app.locals.engine.watchList(req.query.clientId || userOf(req))));
  app.post('/api/watch/:id/accept', (req, res) => send(res, req.app.locals.engine.watchAccept(req.params.id)));
  app.delete('/api/watch/:id', (req, res) => send(res, req.app.locals.engine.watchDelete(req.params.id)));
}
