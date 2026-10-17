// Response shape everywhere: { ok, data, error } (architecture doc §3). Never leak stack traces.
const STATUS = { not_found: 404, rate_limited: 429, unauthorized: 401, forbidden: 403 };

export function ok(res, data, status = 200) { return res.status(status).json({ ok: true, data, error: null }); }
export function fail(res, status, code, message, details) { return res.status(status).json({ ok: false, data: null, error: { code, message, ...(details ? { details } : {}) } }); }

// Engine results carry ok:false + error code on failure; turn either into the envelope.
export function send(res, r) {
  if (r && r.ok === false) {
    const { ok: _ok, error, message, reason, errors, ...rest } = r;
    const code = typeof error === 'string' ? error : 'invalid_request';
    return res.status(STATUS[code] || 400).json({ ok: false, data: Object.keys(rest).length ? rest : null, error: { code, message: message || reason || code, ...(errors ? { details: errors } : {}) } });
  }
  const { ok: _ok, ...data } = r || {};
  return ok(res, data);
}

export const userOf = (req) => req.userId || 'anon';
