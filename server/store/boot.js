// Builds the engine with the seed data, and the app with everything route handlers need in
// app.locals. Used by server/index.js, the tests and (with seedData inlined) the offline preview.
import { seed, config, demoCache } from './seedData.js';
import { createState } from './state.js';
import { createEngine, seedDemo } from '../engine/service.js';
import { registerRoutes } from '../routes/index.js';
import { createApp } from '../http.js';

export function makeEngine({ start, speed, realNow, seedAlerts = true } = {}) {
  const state = createState({ seed, config, start, speed, realNow });
  return createEngine({ state, seedAlerts });
}

// opts: { env, fetchImpl, start, speed, seedAlerts, adminPassword, log, limits, app }
export function makeApp(opts = {}) {
  const engine = makeEngine(opts);
  const state = engine.state;
  const app = opts.app || createApp();
  const env = opts.env || {};
  Object.assign(app.locals, {
    engine, state, sessions: new Map(), demoCache,
    ai: { env, fetchImpl: opts.fetchImpl, status: state.ai, log: opts.log || null, timeoutMs: Number(env.AI_TIMEOUT_MS) || 4000 },
    adminPassword: opts.adminPassword ?? env.ADMIN_PASSWORD ?? null, adminTokens: new Map(),
    reseed: () => { if (opts.seedAlerts !== false) seedDemo(engine); },
  });
  registerRoutes(app, { log: opts.log || null, limits: opts.limits });
  return app;
}
