// Transit network for the map, and the commuter browse view (problem Part 1).
import { ok, send } from './_util.js';

export default function network(app) {
  app.get('/api/network', (req, res) => {
    const E = req.app.locals.engine;
    ok(res, { hubs: E.net.hubs, lines: E.net.lines, edges: E.net.edges, fares: E.net.config.fares, rushHours: E.net.config.rushHours, hubStatus: E.hubStatus(), presets: E.PRESETS, notice: E.DEMO_NOTICE, now: E.now() });
  });
  app.get('/api/browse', (req, res) => send(res, req.app.locals.engine.browse()));
}
