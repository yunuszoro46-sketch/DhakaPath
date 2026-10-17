// POST /api/chat {sessionId, message} -> {reply, data, grounded, aiMode, toolCalls, intent}
import { ok, fail } from './_util.js';
import { chatTurn, newSession } from '../ai/chat.js';

export default function chat(app) {
  app.post('/api/chat', async (req, res) => {
    const { engine: E, sessions, ai, demoCache } = req.app.locals;
    const b = req.body || {};
    const text = String(b.message || '').slice(0, 500);
    if (!text.trim()) return fail(res, 400, 'missing_field', 'message is required');
    const id = String(b.sessionId || req.userId || 'default').slice(0, 64);
    if (!sessions.has(id)) { const s = newSession(); s.userId = req.userId || 'chat-' + id; s.clientId = id; sessions.set(id, s); if (sessions.size > 2000) sessions.delete(sessions.keys().next().value); }
    const r = await chatTurn(E, sessions.get(id), text, ai, demoCache);
    ok(res, r);
  });
}
