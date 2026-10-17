// Street alerts: list, report, paste-a-post (AI or rule extraction), confirm, "it's clear".
import { ok, fail, send, userOf } from './_util.js';
import { ingestTurn } from '../ai/chat.js';
import { audit } from '../store/state.js';

export default function alerts(app) {
  app.get('/api/alerts', (req, res) => { const E = req.app.locals.engine; ok(res, { alerts: E.alerts(req.query.status), hubStatus: E.hubStatus(), now: E.now() }); });
  app.post('/api/alerts', (req, res) => {
    const { engine: E, state } = req.app.locals;
    const b = req.body || {};
    const r = E.createAlert({ hubId: b.hubId, edgeId: b.edgeId, type: b.type, severity: b.severity, text: b.text, source: 'user', userId: userOf(req) });
    if (r.ok) audit(state, userOf(req), r.merged ? 'alert.confirm' : 'alert.create', r.alert.id);
    send(res, r);
  });
  app.post('/api/alerts/ingest', async (req, res) => {
    const { engine: E, state, ai, demoCache } = req.app.locals;
    const text = String((req.body || {}).text || '').slice(0, 500);
    if (!text.trim()) return fail(res, 400, 'missing_field', 'text is required');
    const r = await ingestTurn(E, text, userOf(req), ai, demoCache);
    if (r.error === 'rate_limited') return send(res, r);
    if (r.alert) audit(state, userOf(req), 'alert.ingest', r.alert.id);
    const { ok: filed, ...rest } = r;
    ok(res, { ...rest, filed: filed !== false });
  });
  const vote = (kind) => (req, res) => {
    const { engine: E, state } = req.app.locals;
    const r = kind === 'confirm' ? E.confirm(req.params.id, userOf(req)) : E.resolve(req.params.id, userOf(req));
    if (r.ok && !r.ignored) audit(state, userOf(req), `alert.${kind}`, req.params.id);
    send(res, r.ok === false && r.error === 'not_found' ? { ...r, message: 'No such alert.' } : r);
  };
  app.post('/api/alerts/:id/confirm', vote('confirm'));
  app.post('/api/alerts/:id/resolve', vote('resolve'));
}
