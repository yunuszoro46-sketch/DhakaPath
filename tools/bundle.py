#!/usr/bin/env python3
"""Build one self-contained HTML preview (no server needed): the server's route files, engine and
AI fallback run inside the page through the built-in Express-compatible app, so the preview answers
exactly like `npm start` (minus AI keys and saved state). Only import/export lines are rewritten.
Usage: python3 tools/bundle.py OUT.html"""
import os, re, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def bundle(entry, root, replace=None, expose=None):
    replace = replace or {}
    order, seen = [], set()
    def resolve(cur, spec): return os.path.normpath(os.path.join(os.path.dirname(cur), spec))
    def visit(path):
        if path in seen: return
        seen.add(path)
        if path in replace: order.append(path); return
        code = open(path, encoding='utf-8').read()
        for m in re.finditer(r"^import .*? from '(\.[^']+\.js)';", code, re.M): visit(resolve(path, m.group(1)))
        order.append(path)
    visit(entry)
    key = lambda p: os.path.relpath(p, root).replace(os.sep, '/')
    def convert(path):
        if path in replace: return f"__m['{key(path)}'] = {replace[path]};\n"
        code = open(path, encoding='utf-8').read()
        names = []
        def imp(m):
            what, spec = m.group(1).strip(), m.group(2)
            ref = f"__m['{key(resolve(path, spec))}']"
            if what.startswith('* as '): return f"const {what[5:].strip()} = {ref};"
            if what.startswith('{'): return f"const {{ {what.strip('{} ').replace(' as ', ': ')} }} = {ref};"
            m2 = re.match(r"^(\w+)$", what)
            if m2: return f"const {m2.group(1)} = {ref}.default;"
            raise SystemExit('unsupported import in %s: %s' % (path, m.group(0)))
        code = re.sub(r"^import (.*?) from '(\.[^']+\.js)';", imp, code, flags=re.M)
        code = re.sub(r"^export default function (\w+)", lambda m: (names.append('default: ' + m.group(1)) or f"function {m.group(1)}"), code, flags=re.M)
        code = re.sub(r"^export ((?:async )?function\*? ([\w$]+)|const ([\w$]+)|let ([\w$]+)|class ([\w$]+))",
                      lambda m: (names.append(m.group(2) or m.group(3) or m.group(4) or m.group(5)) or m.group(1)), code, flags=re.M)
        code = re.sub(r"^export \{([^}]*)\};", lambda m: (names.extend(n.strip() for n in m.group(1).split(',') if n.strip()) or ''), code, flags=re.M)
        if re.search(r"^\s*(import|export)\s", code, re.M): raise SystemExit('leftover import/export in ' + path)
        return f"__m['{key(path)}'] = (() => {{\n{code}\nreturn {{ {', '.join(dict.fromkeys(names))} }};\n}})();\n"
    js = "(function(){\nconst __m = {};\n" + ''.join(convert(p) for p in order)
    if expose: js += expose.replace('__ENTRY__', f"__m['{key(entry)}']")
    return js + "})();\n", [key(p) for p in order]

srv = os.path.join(ROOT, 'server')
read = lambda p: open(os.path.join(srv, p), encoding='utf-8').read()
seed_inline = "{ seed: %s, config: %s, demoCache: %s }" % (read('data/seed.json'), read('config.json'), read('data/demoCache.json'))
server_js, smods = bundle(os.path.join(srv, 'store', 'boot.js'), srv, {os.path.join(srv, 'store', 'seedData.js'): seed_inline}, "window.DhakaPathLocal = __ENTRY__;\n")
pub = os.path.join(ROOT, 'public')
ui_js, umods = bundle(os.path.join(pub, 'js', 'main.js'), os.path.join(pub, 'js'))

html = open(os.path.join(pub, 'index.html'), encoding='utf-8').read()
css = open(os.path.join(pub, 'styles.css'), encoding='utf-8').read()
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
# vendored Leaflet (BSD-2, public/vendor/leaflet/LICENSE) inlined so the preview is one file
lf = lambda n: open(os.path.join(pub, 'vendor', 'leaflet', n), encoding='utf-8').read()
html = html.replace('<link rel="stylesheet" href="vendor/leaflet/leaflet.css">', '<style>\n' + lf('leaflet.css') + '\n</style>')
html = html.replace('<script src="vendor/leaflet/leaflet.js"></script>', '<script>\n' + lf('leaflet.js').replace('</script', '<\\/script') + '\n</script>')
assert 'vendor/leaflet' not in html, 'leaflet not inlined'
safe = lambda s: s.replace('</script', '<\\/script')
html = html.replace('<script type="module" src="js/main.js"></script>', '<script>\n' + safe(server_js) + '</script>\n<script>\n' + safe(ui_js) + '</script>')
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'dhakapath-preview.html')
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
open(out, 'w', encoding='utf-8').write(html)
print('wrote', out, len(html), 'bytes;', len(smods), 'server modules,', len(umods), 'UI modules')
