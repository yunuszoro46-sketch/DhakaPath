// A tiny Express-compatible app (zero dependencies). Route files use the Express API subset:
// app.use / app.get / app.post / app.put / app.delete, req.params, req.query, req.body, req.get(),
// res.status().json(), next(). With Express installed, set USE_EXPRESS=1 and server/index.js mounts
// the same route files on a real Express app instead.
//
// It also runs in the browser (offline preview): app.handle() takes a plain request object.

export function createApp() {
  const stack = [];   // { method|null, path|null, parts|null, prefix, fn }
  const app = { locals: {} };
  const compile = (path) => path.split('/').filter(Boolean);
  const add = (method) => (path, ...fns) => { for (const fn of fns) stack.push({ method, path, parts: compile(path), fn }); return app; };
  app.use = (a, ...fns) => {
    if (typeof a === 'function') stack.push({ method: null, prefix: '', fn: a });
    else for (const fn of fns) stack.push({ method: null, prefix: a, fn });
    return app;
  };
  app.get = add('GET'); app.post = add('POST'); app.put = add('PUT'); app.delete = add('DELETE');

  function match(layer, method, path) {
    if (layer.method === null) return path === layer.prefix || path.startsWith(layer.prefix.endsWith('/') ? layer.prefix : layer.prefix + '/') || layer.prefix === '' ? {} : null;
    if (layer.method !== method) return null;
    const segs = path.split('/').filter(Boolean);
    if (segs.length !== layer.parts.length) return null;
    const params = {};
    for (let i = 0; i < segs.length; i++) {
      const p = layer.parts[i];
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
      else if (p !== segs[i]) return null;
    }
    return params;
  }

  // r: { method, path, query (object), body, headers (lower-case keys), ip }
  app.handle = (r) => new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {}, headersSent: false,
      status(c) { this.statusCode = c; return this; },
      set(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
      json(obj) { if (this.headersSent) return this; this.headersSent = true; resolve({ status: this.statusCode, headers: this.headers, body: obj }); return this; },
    };
    const req = { method: r.method, path: r.path, url: r.path, query: r.query || {}, body: r.body === undefined ? {} : r.body, headers: r.headers || {}, ip: r.ip || 'local', params: {}, app,
      get(name) { return this.headers[String(name).toLowerCase()]; } };
    let i = 0;
    const next = async (err) => {
      if (res.headersSent) return;
      if (err) return res.status(err.status || 500).json({ ok: false, data: null, error: { code: err.code || 'server_error', message: err.expose ? err.message : 'Something went wrong.' } });
      while (i < stack.length) {
        const layer = stack[i++];
        const params = match(layer, r.method, r.path);
        if (!params) continue;
        req.params = params;
        try { await layer.fn(req, res, next); } catch (e) { return next(e); }
        return;
      }
      res.status(404).json({ ok: false, data: null, error: { code: 'not_found', message: `No route for ${r.method} ${r.path}` } });
    };
    next();
  });
  return app;
}

// Node adapter: JSON body (size-limited), static files, then app.handle().
export function nodeListener(app, { staticDir, bodyLimit = 10 * 1024, readFile, path }) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
  return async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const sendJson = (status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
    if (u.pathname.startsWith('/api/')) {
      let body = {};
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        const chunks = []; let size = 0; let tooBig = false;
        for await (const c of req) { size += c.length; if (size > bodyLimit) { tooBig = true; break; } chunks.push(c); }
        if (tooBig) return sendJson(413, { ok: false, data: null, error: { code: 'body_too_large', message: `Request body over ${bodyLimit} bytes.` } });
        if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return sendJson(400, { ok: false, data: null, error: { code: 'invalid_json', message: 'Body is not valid JSON.' } }); } }
      }
      const headers = {}; for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = v;
      const r = await app.handle({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body, headers, ip: req.socket.remoteAddress });
      return sendJson(r.status, r.body, r.headers);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(staticDir, rel));
    if (!file.startsWith(staticDir + path.sep)) { res.writeHead(403); return res.end(); }
    const serve = async (f) => {
      const data = await readFile(f);
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    };
    try { await serve(file); } catch { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); }
  };
}
