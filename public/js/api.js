// One function per endpoint family. Sends the anonymous user id (X-User-Id) and, for admin calls,
// the bearer token. Unwraps {ok, data, error}. With no server (offline preview) the same route
// files run in the page through window.DhakaPathLocal.
import { store } from './util.js';
import { S } from './store.js';

const params = new URLSearchParams(location.search);
let base = store('dp-user');
if (!base) base = store('dp-user', 'u-' + (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID().slice(0, 13) : Math.random().toString(36).slice(2, 14)));
// ?demoUser=2 lets you "be" a second or third commuter without another browser (architecture doc §9)
let userId = params.get('demoUser') ? `${base}-demo${params.get('demoUser').replace(/\W/g, '').slice(0, 4)}` : base;
export const currentUser = () => userId;
export function switchUser() { userId = `${base}-x${Math.random().toString(36).slice(2, 6)}`; return userId; }

let local = null;
export async function connect() {
  if (location.protocol.startsWith('http') && !window.DhakaPathLocal) {
    try { const r = await fetch('/api/health', { cache: 'no-store', headers: { 'x-user-id': userId } }); const j = await r.json(); if (j && j.ok) return { where: 'Server', health: j.data }; } catch {}
  }
  if (window.DhakaPathLocal) {
    local = window.DhakaPathLocal.makeApp({ env: {}, adminPassword: 'demo', start: Date.now(), speed: 1 });
    const h = await call('GET', '/api/health');
    return { where: 'In-page engine', health: h.data, adminHint: 'Preview admin password: demo' };
  }
  return { where: 'Offline', health: { ai: 'off' } };
}

// Connection health: every remote call reports success/failure; main.js shows a banner after a failure
// and hides it on the next success.
const listeners = new Set();
export const onConnection = (fn) => listeners.add(fn);
const report = (up) => listeners.forEach((fn) => { try { fn(up); } catch {} });

// GETs time out sooner and are retried once (idempotent); writes are never retried automatically,
// so a slow "confirm alert" can't be sent twice.
export const TIMEOUT_MS = { GET: 8000, OTHER: 15000 };
const ERR = {
  timeout: 'DhakaPath took too long to answer. Your last results are still shown; try again.',
  network: 'Could not reach DhakaPath. Check the connection and try again.',
  bad_response: 'DhakaPath sent an unexpected answer (the server may be restarting). Try again in a moment.',
};
async function fetchJson(path, opts, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ac ? setTimeout(() => ac.abort(), ms) : null;
  try {
    const res = await fetch(path, { ...opts, signal: ac ? ac.signal : undefined });
    let json = null; try { json = await res.json(); } catch { json = null; }
    if (!json || typeof json.ok !== 'boolean') return { status: res.status, ok: false, data: null, error: { code: 'bad_response', message: ERR.bad_response } };
    return { status: res.status, ok: json.ok, data: json.data, error: json.error };
  } catch (e) {
    const code = e && e.name === 'AbortError' ? 'timeout' : 'network';
    return { status: 0, ok: false, data: null, error: { code, message: ERR[code] } };
  } finally { if (t) clearTimeout(t); }
}

export async function call(method, path, body, { admin = false, timeoutMs } = {}) {
  const headers = { 'x-user-id': userId };
  if (admin && S.adminToken) headers.authorization = 'Bearer ' + S.adminToken;
  if (!local) {
    if (body) headers['content-type'] = 'application/json';
    const opts = { method, headers, body: body ? JSON.stringify(body) : undefined };
    const ms = timeoutMs || (method === 'GET' ? TIMEOUT_MS.GET : TIMEOUT_MS.OTHER);
    let r = await fetchJson(path, opts, ms);
    if (method === 'GET' && r.status === 0) { await new Promise((ok) => setTimeout(ok, 600)); r = await fetchJson(path, opts, ms); }
    report(r.status !== 0 && r.error?.code !== 'bad_response');
    return r;
  }
  try {
    let status, json;
    {
      const u = new URL(path, 'http://x');
      const r = await local.handle({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: JSON.parse(JSON.stringify(body || {})), headers });
      status = r.status; json = JSON.parse(JSON.stringify(r.body));
    }
    return { status, ok: !!json.ok, data: json.data, error: json.error };
  } catch (e) {
    return { status: 0, ok: false, data: null, error: { code: 'network', message: 'Could not reach DhakaPath. Check the connection and try again.' } };
  }
}
export const get = (p, o) => call('GET', p, undefined, o);
export const post = (p, b, o) => call('POST', p, b || {}, o);
export const put = (p, b, o) => call('PUT', p, b || {}, o);
export const del = (p, o) => call('DELETE', p, undefined, o);
