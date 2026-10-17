// Small shared helpers. User text is always escaped (esc) or set with textContent.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Whole taka for display (the rickshaw/CNG midpoint can be x.5); never prints NaN.
export const taka = (x) => (Number.isFinite(x) ? `৳${Math.round(x)}` : '৳?');
export const rng = (lo, hi) => (Math.round(lo) === Math.round(hi) ? taka(lo) : `${taka(lo)}–${Number.isFinite(hi) ? Math.round(hi) : '?'}`);
export const MODES = ['metro', 'bus', 'leguna', 'rickshaw', 'cng', 'walk'];
export const MODE_NAME = { metro: 'MRT-6', bus: 'Bus', leguna: 'Leguna', rickshaw: 'Rickshaw', cng: 'CNG', walk: 'Walk' };
export const RANGE = (m) => m === 'rickshaw' || m === 'cng';
export const dhakaTime = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' });
// journey strip: one plate per leg, grown by the leg's wait + ride minutes (the lighter head is the wait)
const legMin = (l) => Math.max(1, (Number(l.rideMinutes) || 0) + (Number(l.wait) || 0));
export const pills = (o) => `<div class="modes" role="list" aria-label="Legs">${o.legs.map((l, i) => { const m = legMin(l), w = Math.round(100 * (Number(l.wait) || 0) / m);
  return `${i ? '<span class="muted" aria-hidden="true">›</span>' : ''}<span class="mpill ${l.mode}" role="listitem" style="flex-grow:${m};--wait:${w}%;--i:${i}" data-min="${m}" title="${esc(MODE_NAME[l.mode])} ${esc(l.line || '')}: ${m} min${l.wait ? ` incl. ${l.wait} min wait` : ''}">${l.mode === 'bus' || l.mode === 'leguna' ? esc(l.line) : MODE_NAME[l.mode]}</span>`; }).join('')}</div>`;
// inline icon from the sprite in index.html (tools/make_icons.py)
export const ic = (name, cls = '') => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
export const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };

// Busy state for a button while a request runs: disabled, aria-busy, temporary label; always restored.
export async function busy(btn, label, fn) {
  if (!btn) return fn();
  if (btn.getAttribute('aria-busy') === 'true') return undefined;     // ignore double clicks
  const prev = btn.innerHTML;
  btn.setAttribute('aria-busy', 'true'); btn.disabled = true; if (label) btn.textContent = label;
  try { return await fn(); } finally { btn.removeAttribute('aria-busy'); btn.disabled = false; btn.innerHTML = prev; }
}
// "latest wins": a slow, older response must not overwrite a newer one
export function latest() { let n = 0; return { next: () => ++n, isCurrent: (k) => k === n }; }
// error card with a Retry button for network/timeout failures
export const retryable = (e) => !!e && ['timeout', 'network', 'bad_response'].includes(e.code);
