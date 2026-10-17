// Cross-cutting middleware (architecture doc §9–10): anonymous user ids, admin token gate,
// rate limits, request logging. Express-compatible signatures (req, res, next).
import { touchUser } from './store/state.js';
import { fail } from './routes/_util.js';

// Commuters: no login. The browser sends a random id in X-User-Id; it is used only to de-duplicate
// confirmations and to rate-limit. Anything odd is replaced by an ip-based id.
export function identify(req, res, next) {
  const raw = String(req.get('x-user-id') || '').trim();
  req.userId = /^[A-Za-z0-9_-]{4,64}$/.test(raw) ? raw : `anon-${String(req.ip || 'local').replace(/[^A-Za-z0-9]/g, '').slice(-12) || 'local'}`;
  touchUser(req.app.locals.state, req.userId);
  next();
}

// Admin: shared password from .env -> random bearer token kept in memory (expires on restart).
export function requireAdmin(req, res, next) {
  const tokens = req.app.locals.adminTokens;
  const h = String(req.get('authorization') || '');
  const tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!tok || !tokens.has(tok)) return fail(res, 401, 'unauthorized', 'Admin login required.');
  req.admin = tokens.get(tok);
  next();
}

// Fixed-window limiter per user id (what express-rate-limit would do here).
export function rateLimit({ windowMs = 60000, max = 30, name = 'api' } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.userId || req.ip || 'anon';
    const t = Date.now();
    const h = hits.get(key);
    if (!h || t - h.start >= windowMs) hits.set(key, { start: t, n: 1 });
    else if (++h.n > max) { res.set('retry-after', String(Math.ceil((h.start + windowMs - t) / 1000))); return fail(res, 429, 'rate_limited', `Too many ${name} requests. Try again in a minute.`); }
    if (hits.size > 5000) hits.clear();
    next();
  };
}

// Request body guard for POST/PUT/PATCH on /api: the body must be a JSON object (an absent body is
// treated as {}). Arrays, strings, numbers and null get a clean 400. Keys that could pollute object
// prototypes (__proto__, constructor, prototype) are removed at every depth, and nesting is capped.
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export function scrub(v, depth = 0) {
  if (depth > 8) return undefined;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => scrub(x, depth + 1));
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) if (!BAD_KEYS.has(k)) out[k] = scrub(v[k], depth + 1);
    return out;
  }
  return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') : v;
}
export function jsonBody(req, res, next) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  const b = req.body;
  if (b === undefined || b === '' || (b && typeof b === 'object' && !Array.isArray(b) && !Object.keys(b).length)) { req.body = {}; return next(); }
  if (b === null || typeof b !== 'object' || Array.isArray(b)) return fail(res, 400, 'invalid_body', 'Request body must be a JSON object, e.g. {"origin": "Mirpur", "destination": "Motijheel"}.');
  req.body = scrub(b);
  next();
}

// Express-only: body-parser errors and anything thrown become the {ok, data, error} envelope (the
// built-in router does this itself in server/http.js).
export function errorEnvelope(log) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    const status = err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 : err.status >= 400 && err.status < 500 ? err.status : 500;
    const code = status === 400 && err.type === 'entity.parse.failed' ? 'invalid_json' : status === 413 ? 'body_too_large' : status === 500 ? 'server_error' : err.code || 'invalid_request';
    if (status === 500 && log) log(`ERROR ${req.method} ${req.path}: ${err.stack || err}`);
    if (res.headersSent) return;
    fail(res, status, code, status === 500 ? 'Something went wrong.' : code === 'invalid_json' ? 'Body is not valid JSON.' : code === 'body_too_large' ? 'Request body is too large.' : String(err.message || code).slice(0, 200));
  };
}

// Express 4 does not catch rejected promises from async handlers; wrap them so they reach next(err).
export function catchAsync(fn) {
  if (typeof fn !== 'function' || fn.length === 4) return fn;
  return (req, res, next) => { try { const r = fn(req, res, next); if (r && typeof r.catch === 'function') r.catch(next); } catch (e) { next(e); } };
}

export function logger(log) {
  return (req, res, next) => {
    const t0 = Date.now();
    const json = res.json.bind(res);
    res.json = (body) => { log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t0}ms${req.userId ? ' ' + req.userId : ''}`); return json(body); };
    next();
  };
}
