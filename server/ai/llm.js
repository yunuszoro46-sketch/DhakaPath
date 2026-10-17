// callLLM (architecture doc §5): temperature 0, JSON mode, 4 s timeout, Gemini first and Groq as
// the one retry (or the reverse if only Groq has a key), then null so the caller falls back to the
// demo cache / rule parser. Every output is validated before use; the model never decides anything.
import { MODES } from '../engine/network.js';
import { TYPES } from '../engine/alerts.js';
import { P1_INTENT, P2_ALERT, P3_EXPLAIN, P4_FARE_SCRIPT, fill, hubList } from './prompts.js';

export function providers(env = {}) {
  const out = [];
  if (env.GEMINI_API_KEY) out.push({ name: 'gemini', model: env.GEMINI_MODEL || 'gemini-2.0-flash' });
  if (env.GROQ_API_KEY) out.push({ name: 'groq', model: env.GROQ_MODEL || 'llama-3.1-8b-instant' });
  return out;
}

async function callOne(p, prompt, { env, fetchImpl, timeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let text;
    if (p.name === 'groq') {
      const res = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: p.model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }) });
      if (!res.ok) throw new Error('groq http ' + res.status);
      text = (await res.json()).choices[0].message.content;
    } else {
      const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, { method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }) });
      if (!res.ok) throw new Error('gemini http ' + res.status);
      text = (await res.json()).candidates[0].content.parts[0].text;
    }
    return JSON.parse(text);
  } finally { clearTimeout(timer); }
}

// ai: { env, fetchImpl, timeoutMs, status (state.ai), log } -> parsed JSON or null
export async function callLLM(prompt, ai) {
  const list = providers(ai.env || {});
  if (!list.length) { if (ai.status) ai.status.mode = 'off'; return null; }
  for (const p of list) {
    const t0 = Date.now();
    try {
      const json = await callOne(p, prompt, { env: ai.env, fetchImpl: ai.fetchImpl || globalThis.fetch, timeoutMs: ai.timeoutMs || 4000 });
      record(ai, { provider: p.name, ms: Date.now() - t0, ok: true });
      return json;
    } catch (e) {
      record(ai, { provider: p.name, ms: Date.now() - t0, ok: false, error: e.name === 'AbortError' ? 'timeout' : String(e.message || e) });
    }
  }
  return null;
}

function record(ai, call) {
  if (ai.status) {
    Object.assign(ai.status, { lastProvider: call.provider, lastMs: call.ms, lastOk: call.ok, mode: call.ok ? 'live' : 'fallback' });
    ai.status.calls++; if (!call.ok) ai.status.fallbacks++;
  }
  if (ai.log) ai.log(`llm ${call.provider} ${call.ms}ms ${call.ok ? 'ok' : 'FAILED ' + call.error + ' -> fallback'}`);
}

const INTENTS = ['route_search', 'fare_check', 'report_alert', 'alternatives', 'fare_rules_qa', 'alert_reliability_qa', 'confirm_alert', 'unknown'];

// P1
export async function parseIntent(net, text, context, history, ai) {
  const raw = await callLLM(fill(P1_INTENT, { HUBS: hubList(net), SESSION_CONTEXT: context || {}, HISTORY: (history || []).slice(-6), TEXT: String(text).slice(0, 500) }), ai);
  return raw ? validateIntent(net, raw) : null;
}

// Keep only values the network knows; invalid hub IDs are dropped, unknown intent becomes unknown.
export function validateIntent(net, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ids = new Set(net.hubs.map((h) => h.id));
  const h = (x) => (typeof x === 'string' && ids.has(x.toUpperCase()) ? x.toUpperCase() : null);
  const num = (x) => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
  const dropped = [raw.origin, raw.destination, ...(Array.isArray(raw.avoidHubs) ? raw.avoidHubs : [])].filter((x) => x && !h(x));
  const alert = raw.alert && h(raw.alert.hub) && TYPES.includes(raw.alert.type) ? { hub: h(raw.alert.hub), type: raw.alert.type, severity: [1, 2, 3].includes(Number(raw.alert.severity)) ? Number(raw.alert.severity) : 2 } : null;
  const intent = INTENTS.includes(raw.intent) ? raw.intent : 'unknown';
  return {
    intent: intent === 'report_alert' && !alert ? 'unknown' : intent, origin: h(raw.origin), destination: h(raw.destination),
    student: typeof raw.student === 'boolean' ? raw.student : null, maxBudget: num(raw.maxBudget),
    avoidHubs: (Array.isArray(raw.avoidHubs) ? raw.avoidHubs : []).map(h).filter(Boolean),
    avoidModes: (Array.isArray(raw.avoidModes) ? raw.avoidModes : []).filter((m) => MODES.includes(m)),
    maxTransfers: num(raw.maxTransfers), claimedFare: num(raw.claimedFare), mode: MODES.includes(raw.mode) ? raw.mode : null,
    alert, sort: null, source: 'llm', dropped,
  };
}

// P2. The post is wrapped in <post> tags and labelled as data (prompt-injection guard); output validated.
export async function extractAlert(net, text, ai) {
  const raw = await callLLM(fill(P2_ALERT, { HUBS: hubList(net), TEXT: String(text).slice(0, 500).replace(/<\/?post>/gi, '') }), ai);
  return raw ? validateAlert(net, raw) : null;
}
export function validateAlert(net, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ids = new Set(net.hubs.map((h) => h.id));
  const hubId = typeof raw.hubId === 'string' && ids.has(raw.hubId.toUpperCase()) ? raw.hubId.toUpperCase() : null;
  const type = TYPES.includes(raw.type) ? raw.type : null;
  const isIncident = raw.isIncident !== false;
  const missing = [!type && 'what happened', !hubId && 'a known hub'].filter(Boolean);
  return { ok: isIncident && !missing.length, isIncident, hubId, placeName: hubId ? net.hubs.find((x) => x.id === hubId).name : null, type,
    severity: [1, 2, 3].includes(Number(raw.severity)) ? Number(raw.severity) : 2, contradictory: false, reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 200) : '', missing, source: 'llm' };
}

// P3 / P4: phrasing only. Rejected if the text contains any number that is not in the engine JSON.
export async function phrase(template, vars, engineJson, ai) {
  const raw = await callLLM(fill(template, { ...vars, ENGINE_JSON: engineJson }), ai);
  const t = raw && typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!t) return null;
  const allowed = new Set(JSON.stringify(engineJson).match(/\d+(?:\.\d+)?/g) || []);
  return (t.match(/\d+(?:\.\d+)?/g) || []).every((n) => allowed.has(n)) ? t : null;
}
export const explain = (engineJson, style, ai) => phrase(P3_EXPLAIN, { STYLE: style === 'bn' ? 'BANGLISH' : 'ENGLISH' }, engineJson, ai);
export const fareScriptLLM = (engineJson, verdict, ai) => phrase(P4_FARE_SCRIPT, { VERDICT: verdict }, engineJson, ai);
