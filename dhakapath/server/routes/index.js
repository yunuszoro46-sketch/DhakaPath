// Mounts every route file. Works on the built-in app (server/http.js) and on a real Express app.
import { identify, rateLimit, logger, jsonBody, catchAsync } from '../middleware.js';
import health from './health.js';
import network from './network.js';
import search from './search.js';
import fare from './fare.js';
import simulate from './simulate.js';
import alerts from './alerts.js';
import chat from './chat.js';
import clock from './clock.js';
import watch from './watch.js';
import demo from './demo.js';
import admin from './admin.js';
import rides from './rides.js';

export function registerRoutes(app, { log = null, limits = { chat: 30, alerts: 30 } } = {}) {
  // every handler is wrapped so a rejected promise becomes a clean error response on real Express too
  const real = app, safe = Object.create(real);
  for (const m of ['get', 'post', 'put', 'delete', 'use']) safe[m] = (...args) => real[m](...args.map((a) => catchAsync(a)));
  app = safe;
  app.use('/api', identify);
  app.use('/api', jsonBody);
  if (log) app.use('/api', logger(log));
  app.use('/api/chat', rateLimit({ max: limits.chat, name: 'chat' }));
  app.use('/api/alerts', rateLimit({ max: limits.alerts, name: 'alert' }));
  app.use('/api/rides', rateLimit({ max: limits.rides || 60, name: 'ride-share' }));
  for (const r of [health, network, search, fare, simulate, alerts, chat, clock, watch, demo, admin, rides]) r(app);
}
