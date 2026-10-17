// Contrast audit of the colour tokens in public/styles.css, for the text/background pairs the UI
// actually uses, in both themes. WCAG 2.x: 4.5:1 for body text, 3:1 for large text and UI marks.
// Usage: node tools/contrast.mjs   (exits 1 when a pair fails)
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const block = (sel) => { const i = css.indexOf(sel + ' {'); const j = css.indexOf('}', i); return css.slice(i, j); };
const tokens = (b) => Object.fromEntries([...b.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const THEMES = { dark: tokens(block(':root, :root[data-theme="dark"]')), light: { ...tokens(block(':root, :root[data-theme="dark"]')), ...tokens(block(':root[data-theme="light"]')) } };
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// [foreground, background, minimum, where]
const PAIRS = [
  ['ink', 'bg', 4.5, 'body text'], ['ink', 'surface', 4.5, 'panel text'], ['ink', 'surface2', 4.5, 'inputs, tickets'],
  ['ink-2', 'surface', 4.5, 'secondary text'], ['muted', 'surface', 4.5, 'muted text on panels'], ['muted', 'surface2', 4.5, 'muted text on inputs/tickets'], ['muted', 'bg', 4.5, 'muted on page'],
  ['accent-ink', 'accent', 4.5, 'primary buttons'], ['accent', 'surface', 3, 'links, focus marks, selected icons'],
  ['ok', 'surface', 4.5, 'ok text'], ['warn', 'surface', 4.5, 'warn text'], ['bad', 'surface', 4.5, 'bad text'], ['info', 'surface', 4.5, 'info text'],
  ['focus', 'surface', 3, 'focus ring'], ['line-strong', 'surface', 1.5, 'control borders (decorative)'],
];
// fixed route-kind colours (same on the map and on the ticket label) with the text colour each uses
const KIND = [['#03140c', '#16a34a', 'Fastest label'], ['#ffffff', '#2563eb', 'Cheapest label'], ['#ffffff', '#7c3aed', 'Balanced label'], ['#03140c', '#f97316', 'Backup label']];
let fail = 0;
for (const [f, b, where] of KIND) { const r = ratio(f, b); const ok = r >= 4.5; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  both  ${f} on ${b} ${r.toFixed(2).padStart(5)}:1 (min 4.5)  ${where}`); }
for (const [name, t] of Object.entries(THEMES)) {
  for (const [f, b, min, where] of PAIRS) {
    if (!t[f] || !t[b]) continue;
    const r = ratio(t[f], t[b]); const ok = r >= min; if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(5)} ${f.padEnd(11)} on ${b.padEnd(8)} ${r.toFixed(2).padStart(5)}:1 (min ${min})  ${where}`);
  }
}
console.log(fail ? `${fail} pair(s) below the minimum` : 'all pairs pass');
process.exit(fail ? 1 : 0);
