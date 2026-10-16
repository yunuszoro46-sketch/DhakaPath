// Trip search: { query } in natural language, or structured constraints. Also the offline-card
// data and the "Test AI hallucination" demo.
import { ok, fail, send } from './_util.js';
import { parseRules } from '../ai/parser.js';
import { parseIntent, providers } from '../ai/llm.js';
import { congestedHubs } from '../ai/chat.js';

export default function search(app) {
  app.post('/api/search', async (req, res) => {
    const { engine: E, ai } = req.app.locals;
    const b = req.body || {};
    if (typeof b.query === 'string' && b.query.trim() && !b.origin) {
      const text = b.query.slice(0, 500);
      let p = providers(ai.env).length ? await parseIntent(E.net, text, {}, [], ai) : null;
      const rules = parseRules(E.net, text);
      if (!p || p.intent === 'unknown') p = rules;
      else { p.origin = p.origin || rules.origin; p.destination = p.destination || rules.destination; p.departAt = rules.departAt; }
      // a place that is not a hub is reported with the nearest hubs, never replaced silently
      if (rules.unknownPlaces && rules.unknownPlaces.length && !(p.origin && p.destination)) {
        const hint = rules.placeHints.map((h) => `"${h.word}" isn't one of the 14 hubs${h.near.length ? ` (nearest: ${h.near.join(' or ')})` : ''}`).join('; ');
        return fail(res, 400, 'unknown_hub', `${hint}. Hubs: ${E.net.hubs.map((h) => h.name).join(', ')}.`);
      }
      const avoid = [...(p.avoidHubs || []), ...(p.avoidCongested ? congestedHubs(E, p.origin, p.destination) : [])];
      const r = E.search({ origin: p.origin, destination: p.destination, student: b.student ?? p.student ?? false, maxBudget: p.maxBudget, avoidHubs: avoid, avoidModes: p.avoidModes,
        maxTransfers: p.maxTransfers, sort: b.sort || p.sort, departAt: b.departAt || p.departAt,
        ...(p.mode && p.mode !== 'walk' && p.intent === 'route_search' && !(p.avoidModes || []).includes(p.mode) ? { requireMode: p.mode } : {}),   // "CNG e jabo", same as chat
        ...(rules.rush ? { rush: true } : {}), ...(rules.rainAt && rules.rainAt.length ? { scenario: { rain: rules.rainAt } } : {}) });
      return send(res, { ...r, parsed: { intent: p.intent, source: p.source, origin: p.origin, destination: p.destination } });
    }
    if (!b.origin || !b.destination) return fail(res, 400, 'missing_field', 'Give {query} or {origin, destination}.');
    send(res, E.search(b));
  });
  app.get('/api/card/:optionId', (req, res) => send(res, req.app.locals.engine.card(req.params.optionId)));
  app.post('/api/ground-test', (req, res) => ok(res, req.app.locals.engine.groundTest()));
}
