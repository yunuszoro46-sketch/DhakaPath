// Admin (password from .env -> bearer token): routes/edges/fare chart/landmark CRUD, moderation
// queue, audit log, reset.
import { ok, fail, send } from './_util.js';
import { requireAdmin } from '../middleware.js';
import { audit, resetState } from '../store/state.js';

function randomToken() {
  const a = new Uint8Array(24); globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function admin(app) {
  app.post('/api/admin/login', (req, res) => {
    const { adminPassword, adminTokens, state } = req.app.locals;
    const pw = String((req.body || {}).password || '');
    if (!adminPassword || pw !== adminPassword) { audit(state, req.userId, 'admin.login.failed'); return fail(res, 401, 'unauthorized', 'Wrong admin password.'); }
    const token = randomToken();
    adminTokens.set(token, { userId: req.userId, at: state.now() });
    audit(state, req.userId, 'admin.login');
    ok(res, { token });
  });
  const crud = (method) => (req, res) => {
    const { engine: E, state } = req.app.locals;
    const id = req.params.id || (req.body || {}).id;
    const r = E.adminRoutes(method, { ...(req.body || {}), _by: req.userId }, id);
    if (r.ok) audit(state, req.userId, `admin.${(req.body || {}).kind || (method === 'DELETE' ? 'delete' : 'line')}.${method.toLowerCase()}`, id || (r.line && r.line.id) || null);
    send(res, r);
  };
  app.post('/api/admin/routes', requireAdmin, crud('POST'));
  app.put('/api/admin/routes', requireAdmin, crud('PUT'));
  app.put('/api/admin/routes/:id', requireAdmin, crud('PUT'));
  app.delete('/api/admin/routes/:id', requireAdmin, crud('DELETE'));
  app.post('/api/admin/alerts/:id/moderate', requireAdmin, (req, res) => {
    const { engine: E, state } = req.app.locals;
    const r = E.moderate(req.params.id, (req.body || {}).action);
    if (r.ok) audit(state, req.userId, `admin.moderate.${req.body.action}`, req.params.id);
    send(res, r.ok === false && r.error === 'bad_action' ? { ...r, message: 'action must be approve, remove or clear_flag' } : r);
  });
  app.get('/api/admin/queue', requireAdmin, (req, res) => ok(res, { queue: req.app.locals.engine.queue(), now: req.app.locals.state.now() }));
  app.get('/api/admin/audit', requireAdmin, (req, res) => ok(res, { audit: [...req.app.locals.state.auditLog].reverse().slice(0, 200) }));
  app.post('/api/admin/reset', requireAdmin, (req, res) => {
    const { state, sessions, reseed } = req.app.locals;
    resetState(state); sessions.clear(); reseed(); req.app.locals.engine.invalidate();
    audit(state, req.userId, 'admin.reset');
    ok(res, { reset: true });
  });
}
