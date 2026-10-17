// Rule-based parser (architecture doc §5: the always-on fallback). Two jobs, no network needed:
//  1. extractAlertRules: messy English / Banglish / Bangla post -> { hubId, type, severity, ... }
//  2. parseRules: commuter message -> the P1 intent schema (+ follow-up fields)
// Both outputs are validated against the hub list exactly like LLM output.
import { buildIndex, findPlaces, normalize } from '../engine/places.js';

const KW = {
  blockade: ['bondho', 'bndho', 'বন্ধ', 'block', 'blocked', 'closed', 'michil', 'michhil', 'মিছিল', 'oborodh', 'aborodh', 'অবরোধ', 'hartal', 'হরতাল', 'protest', 'andolon', 'barricade', 'accident', 'durghotona', 'দুর্ঘটনা'],
  waterlogging: ['pani', 'paani', 'পানি', 'jol', 'jolaboddho', 'jolabaddho', 'জলাবদ্ধ', 'জলাবদ্ধতা', 'waterlog', 'waterlogged', 'waterlogging', 'flood', 'flooded', 'dube', 'dubse', 'jomse', 'jome', 'jomeche', 'জমেছে'],
  construction: ['construction', 'kaj', 'kaaj', 'nirman', 'নির্মাণ', 'khora', 'khuri', 'khuriche', 'digging', 'road work', 'roadwork'],
  gridlock: ['jam', 'jaam', 'জ্যাম', 'traffic', 'joto', 'gridlock', 'atke', 'atka', 'আটকে', 'stuck', 'slow'],
  clear: ['clear', 'khola', 'খোলা', 'normal', 'thik ache', 'cholche', 'চলছে', 'no jam', 'shesh', 'resolved', 'gone', 'nei'],
};
const SEV3 = ['onek', 'khub', 'hatu', 'komor', 'puro', 'totally', 'completely', 'severe', 'অনেক', 'knee deep'];
const SEV1 = ['ektu', 'halka', 'little', 'slight', 'minor', 'একটু'];

function hits(norm, words) {
  const p = ' ' + norm + ' ';
  return words.filter((w) => { const n = normalize(w); return p.includes(' ' + n + ' '); });
}

export function extractAlertRules(net, text) {
  const norm = normalize(text);
  const { mentions } = findPlaces(text, buildIndex(net));
  const found = {};
  for (const k of Object.keys(KW)) found[k] = hits(norm, KW[k]);
  const order = ['blockade', 'waterlogging', 'construction', 'gridlock'];
  const type = order.find((t) => found[t].length) || null;
  const clear = found.clear.length > 0;
  const contradictory = !!type && clear && !(found.clear.length === 1 && found.clear[0] === 'no jam');
  const severity = hits(norm, SEV3).length || /!!/.test(String(text)) ? 3 : hits(norm, SEV1).length ? 1 : 2;
  const hubId = mentions.length ? mentions[0].id : null;
  const missing = [];
  if (!type && !clear) missing.push('what happened (water, jam, blocked, construction)');
  if (!hubId) missing.push('a known hub');
  return {
    ok: missing.length === 0 && !contradictory, hubId, placeName: mentions.length ? mentions[0].name : null,
    type: type || (clear ? 'clear' : null), severity, contradictory,
    confidence_hint: Math.round(Math.min(0.9, 0.3 + 0.15 * (type ? found[type].length : 0) + (hubId ? 0.2 : 0)) * 100) / 100,
    keywords: Object.fromEntries(Object.entries(found).filter(([, v]) => v.length)), missing, source: 'rules',
  };
}

const has = (norm, words) => words.some((w) => (' ' + norm + ' ').includes(' ' + w + ' '));
const W = {
  student: ['student', 'students', 'chatro', 'chhatro', 'chatri', 'ছাত্র', 'ছাত্রী', 'half', 'half pass'],
  alt: ['onno', 'onno route', 'ar kono', 'aro', 'another', 'alternative', 'alternatives', 'other', 'other option', 'option'],
  fair: ['fair', 'ok', 'okay', 'thik', 'right', 'beshi', 'chaise', 'chaiche', 'chacche', 'chaitese', 'asked', 'charged', 'nise', 'nilo', 'nicche', 'demand'],
  rulesQ: ['ki', 'hoy', 'pabo', 'pay', 'applies', 'apply', 'does', 'discount', 'rule', 'rules', 'niyom'],
  reliability: ['still', 'ekhono', 'reliable', 'sotti', 'true', 'trust', 'koto ta', 'confidence', 'valid'],
  alertWord: ['alert', 'ei alert', 'eta', 'ota', 'report ta', 'alert ta'],
  confirm: ['confirm', 'confirmed', 'haan', 'ha', 'hya', 'yes', 'ami dekhsi', 'ami o dekhchi', 'sotti ache', 'still ache', 'ekhono ache'],
  fareQ: ['bhara', 'vara', 'ভাড়া', 'koto', 'koto taka', 'fare', 'cost', 'khoroch', 'breakdown'],
  whyNot: ['why not', 'keno na', 'kno na', 'keno'],
  roadQ: ['rasta kemon', 'rastar obostha', 'road condition', 'road conditions', 'road status', 'obostha kemon', 'jam ache', 'traffic kemon', 'kemon ache', 'how is the road', 'rasta thik ache', 'situation'],
  watch: ['watch', 'notify', 'janaben', 'janio', 'janaio', 'khobor dio', 'khobor diyo', 'track', 'alert dio', 'save trip', 'trip save'],
  congested: ['jam bad diye', 'jam chara', 'jam avoid', 'avoid jam', 'avoid congestion', 'avoid congested', 'congestion chara', 'jam er jayga bad diye', 'bondho jayga bad diye', 'avoid alerts'],
  whatIf: ['what if', 'jodi', 'jdi', 'hole ki hobe', 'hoy jodi', 'simulate', 'suppose'],
  rain: ['rain', 'raining', 'brishti', 'bristi', 'boishti', 'বৃষ্টি', 'flood', 'pani'],
  blockWord: ['bondho', 'block', 'blocked', 'closed', 'michil', 'oborodh'],
  compare: ['compare', 'tulona', 'student vs regular', 'regular vs student', 'vs'],
  fast: ['fast', 'fastest', 'taratari', 'druto', 'quick'], cheap: ['cheap', 'cheapest', 'sasta', 'shosta', 'kom vara', 'kom bhara'],
  bestTime: ['best time', 'best time to leave', 'when should i leave', 'when to leave', 'when should i go', 'when should i start', 'what time should i leave', 'kokhon ber', 'kokhon beroi', 'kokhon berobo', 'kokhon berabo', 'kokhon jabo', 'kokhon jaoa', 'kokhon jawa', 'kokhon rowna', 'kokhon roona', 'kotay ber', 'koyta ber', 'কখন'],
  share: ['share', 'shared', 'sharing', 'vag', 'bhag', 'bhaag', 'vaag', 'split', 'vag kore', 'bhag kore', 'vag korbo', 'share korbo', 'share korte', 'per person', 'jon e', 'keu jabe', 'karo sathe'],
  fewer: ['kom transfer', 'fewest transfers', 'less transfer', 'direct', 'ek gari'],
};
const MODE_WORDS = { metro: ['metro', 'mrt', 'মেট্রো'], bus: ['bus', 'বাস', 'conductor', 'helper'], leguna: ['leguna', 'লেগুনা'], rickshaw: ['rickshaw', 'riksha', 'rikshaw', 'রিকশা'], cng: ['cng', 'সিএনজি', 'auto', 'autorickshaw'], walk: ['walk', 'hete', 'hente'] };
const AVOID_BEFORE = /(avoid|without|except|skip|na giye)\s*$/;
const AVOID_AFTER = /^\s*(bad diye|baad diye|bade|baad e|avoid|chara|charai|chhara|na giye|na niye|skip)/;
// "metro na niye", "bus lagbe na", "no cng", "without metro", "rickshaw chai na"
const AVOID_MODE = (w) => new RegExp(`(no ${w}|without ${w}|except ${w}|avoid ${w}|${w} (chara|charai|chhara|bad|bade|na niye|na nie|na diye|lagbe na|chai na|nibo na|niben na|e na|te na))`);
const RUSH = ['rush', 'rush hour', 'office time', 'office hour', 'peak', 'peak hour', 'peak time', 'jam er somoy', 'office er somoy'];
const SMALLTALK = ['thanks', 'thank you', 'thank', 'thx', 'dhonnobad', 'dhonnobaad', 'ধন্যবাদ', 'shukriya', 'ok thanks', 'hi', 'hello', 'hey', 'salam', 'assalamualaikum', 'bye', 'okay', 'ok', 'accha', 'thik ache'];

// Well-known areas that are not among the 14 hubs -> nearest hubs to suggest (never used silently).
export const NEAR = { gulshan: ['BAD', 'MOH'], banani: ['MOH'], baridhara: ['BAD'], bashundhara: ['BAD'], kuril: ['BAD'], tejgaon: ['FAR', 'MOH'], 'karwan bazar': ['FAR'], kawran: ['FAR'],
  airport: ['UTT'], bimanbondor: ['UTT'], gabtoli: ['MIR'], 'new market': ['SCI'], nilkhet: ['SCI'], kakrail: ['SHA', 'MAL'], rampura: ['MAL', 'BAN'], khilgaon: ['MAL'],
  paltan: ['MOT'], gulistan: ['MOT'], sayedabad: ['JAT'], shyamoli: ['MPR', 'AGA'], kalabagan: ['DHA'], lalmatia: ['MPR', 'DHA'], 'azimpur': ['SCI'], 'old dhaka': ['MOT'], puran: ['MOT'], uttara: [], ramna: ['SHA'] };
const NOT_PLACE = new Set(['ami', 'amra', 'apni', 'tumi', 'ekhan', 'ekhane', 'bari', 'basha', 'bashay', 'office', 'ei', 'oi', 'jabo', 'jete', 'jaite', 'jai', 'chai', 'kivabe', 'kibhabe', 'kemne', 'the', 'my', 'home', 'here', 'there', 'koto', 'bhara', 'vara', 'fare', 'route', 'way', 'go', 'get', 'how', 'what', 'and', 'rickshaw', 'bus', 'metro', 'cng', 'leguna', 'walk', 'student', 'taka', 'tk', 'ajke', 'kal', 'aj', 'now', 'ekhon', 'morning', 'sokal', 'bikal', 'raat', 'please', 'plz', 'cheapest', 'fastest', 'theke', 'from', 'to', 'jabo', 'te', 'e']);
const placeHint = (net, words) => words.map((w) => { const near = (NEAR[w] || []).map((id) => (net.hubs.find((h) => h.id === id) || {}).name).filter(Boolean); return { word: w, near }; });

const BANGLISH = ['dhonnobad', 'dhonnobaad', 'bhai', 'vai', 'apu', 'theke', 'jabo', 'koto', 'bhara', 'vara', 'takar', 'chai', 'chaise', 'hoy', 'onno', 'kemon', 'ache', 'rasta', 'bondho', 'koro', 'hole', 'ki', 'moddhe', 'diye', 'jete', 'jaite', 'kno', 'keno', 'ar', 'naki', 'dorkar', 'amake', 'ami'];
export function detectLang(text) { const n = normalize(text); return /[\u0980-\u09ff]/.test(String(text)) || has(n, BANGLISH) ? 'bn' : 'en'; }

// "8 tay", "8:30 am", "bikal 5 ta" -> "HH:MM" (Asia/Dhaka); returns { departAt, nums } with the time's numbers removed
function parseTime(norm) {
  const m = norm.match(/(?:^| )(\d{1,2})(?: (\d{2}))? ?(am|pm|ta|tay|tar|baje|o clock|টা|টায়|টায়|টার|বাজে)(?= |$)/);
  if (!m) return null;
  let h = Number(m[1]); const mi = m[2] ? Number(m[2]) : 0;
  if (h > 23 || mi > 59) return null;
  const evening = /(^| )(bikal|bikel|bikale|shondha|sondha|sondhay|raat|rat|evening|night|বিকাল|বিকালে|বিকেল|বিকেলে|সন্ধ্যা|সন্ধ্যায়|রাত|রাতে)( |$)/.test(norm);
  const morning = /(^| )(sokal|sokale|morning|সকাল|সকালে)( |$)/.test(norm);
  if (m[3] === 'pm' && h < 12) h += 12;
  else if (m[3] === 'am' && h === 12) h = 0;
  else if (m[3] !== 'am' && m[3] !== 'pm' && h < 12 && (evening || (!morning && h >= 1 && h <= 6))) h += 12;
  return { departAt: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`, used: [Number(m[1]), m[2] ? Number(m[2]) : null].filter((x) => x != null) };
}

// Spec 8.1 schema + a few follow-up fields.
export function parseRules(net, text, session = {}) {
  const norm = normalize(text);
  const { mentions } = findPlaces(text, buildIndex(net));
  const avoidHubs = [], ends = [];
  for (const m of mentions) {
    const before = norm.slice(Math.max(0, m.start - 22), m.start), after = norm.slice(m.end, m.end + 24);
    if (AVOID_BEFORE.test(before) || AVOID_AFTER.test(after)) avoidHubs.push(m.id); else ends.push({ ...m, before, after });
  }
  let origin = null, destination = null;
  const th = ends.find((m) => /^\s*(theke|thke|from|থেকে)/.test(m.after) || /(^| )from\s*$/.test(m.before));
  if (th) { origin = th.id; const o = ends.find((m) => m !== th); destination = o ? o.id : null; }
  else if (ends.length >= 2) { origin = ends[0].id; destination = ends[1].id; }
  else if (ends.length === 1) destination = ends[0].id;

  const placeNums = new Set(mentions.flatMap((m) => (m.alias.match(/\d+/g) || []).map(Number)));
  // "9:50" / "17:05" written with a colon also counts as a departure time (needs the colon, so "Mirpur 10 50 taka" is not a time)
  const clock = !parseTime(norm) && /(?:^|[^\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/.exec(String(text).replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))));
  const time = parseTime(norm) || (clock && parseTime(`${Number(clock[1])} ${clock[2]} ${/\b(pm|am)\b/i.test(text) ? text.match(/\b(pm|am)\b/i)[1].toLowerCase() : 'ta'}`));
  const normNoTime = time ? (clock ? norm.replace(new RegExp(`(?:^| )${Number(clock[1])} ${clock[2]}(?: ?(?:am|pm))?(?= |$)`), ' ') : norm.replace(/(?:^| )(\d{1,2})(?: (\d{2}))? ?(am|pm|ta|tay|tar|baje|o clock|টা|টায়|টায়|টার|বাজে)(?= |$)/, ' ')) : norm;
  const nums = [...normNoTime.matchAll(/(?:^| )(\d{1,4})(?= |$)/g)].map((x) => Number(x[1])).filter((n) => !placeNums.has(n));
  const budgetM = norm.match(/(?:under|below|within|max|budget|less than|upto|up to)\s*(?:tk\s*)?(\d{1,4})/) || norm.match(/(\d{1,4})\s*(?:tk|taka|টাকা)?\s*(?:er|r)?\s*(?:moddhe|modhe|vitore|bhitore|niche)/) || norm.match(/(\d{1,4})\s*takar\s*(?:moddhe|modhe|vitore|niche)/) || norm.match(/(\d{1,4})\s*(?:টাকা|টাকার)\s*(?:মধ্যে|ভিতরে|ভেতরে|নিচে|কমে)/);
  const maxBudget = budgetM ? Number(budgetM[1]) : null;
  const avoidModes = Object.keys(MODE_WORDS).filter((m) => MODE_WORDS[m].some((w) => AVOID_MODE(w).test(norm)));
  let mode = null;
  for (const m of Object.keys(MODE_WORDS)) if (!avoidModes.includes(m) && has(norm, MODE_WORDS[m])) { mode = m; break; }
  const tm = norm.match(/(?:max|at most|maximum)\s*(\d)\s*transfer|(\d)\s*(?:ta|er)?\s*(?:transfer|change)\s*(?:er\s*)?(?:beshi\s*na|max)/);
  const maxTransfers = tm ? Number(tm[1] || tm[2]) : has(norm, W.fewer) ? 0 : null;
  const student = has(norm, W.student) ? true : null;
  const sort = has(norm, W.fast) ? 'time' : has(norm, W.cheap) ? 'fare' : has(norm, W.fewer) ? 'transfers' : null;
  const ex = extractAlertRules(net, text);
  const avoidCongested = has(norm, W.congested);
  // place-like words next to theke / from / to that are not one of the hubs (e.g. "Gulshan theke"): reported, never guessed
  const spans = mentions.map((m) => [m.start, m.end]);
  const inMention = (i) => spans.some(([a, b]) => i >= a && i < b);
  const unknownPlaces = [];
  const consider = (word, at) => { const w = word.trim(); if (w.length >= 3 && !NOT_PLACE.has(w) && !/^\d/.test(w) && !inMention(at) && !unknownPlaces.includes(w)) unknownPlaces.push(w); };
  for (const m of norm.matchAll(/(?:^| )((?:[a-z\u0980-\u09ff]+ )?[a-z\u0980-\u09ff]+) (?:theke|thke|থেকে)(?= |$)/g)) { const two = m[1], one = two.split(' ').pop(); consider(NEAR[two] ? two : one, m.index + m[0].indexOf(one)); }
  for (const m of norm.matchAll(/(?:^| )(?:from|to|theke|thke|থেকে) ([a-z\u0980-\u09ff]+(?: [a-z\u0980-\u09ff]+)?)/g)) { const two = m[1], one = two.split(' ')[0]; consider(NEAR[two] ? two : one, m.index + m[0].lastIndexOf(one)); }
  const rainAt = has(norm, W.rain) && !has(norm, W.whatIf) ? mentions.filter((m) => !avoidHubs.includes(m.id)).map((m) => m.id) : [];
  const base = { origin, destination, student, maxBudget, avoidHubs, avoidModes, maxTransfers, claimedFare: null, alert: null, mode, sort, source: 'rules',
    departAt: time ? time.departAt : null, avoidCongested, lang: detectLang(text), rush: has(norm, RUSH) || null, rainAt,
    unknownPlaces: (origin && destination) ? [] : unknownPlaces, placeHints: (origin && destination) ? [] : placeHint(net, unknownPlaces),
    // the user said where they start ("bari theke", "from home") but it is not a hub: ask, never reuse an older origin
    originUnresolved: !origin && (/(^| )(theke|thke|থেকে)( |$)/.test(norm) || /(^| )from( |$)/.test(norm)) };
  const claimed = nums.find((n) => n !== maxBudget);

  // intent priority
  if (has(norm, W.whatIf)) {
    const near = (m, words) => words.some((w) => (' ' + norm.slice(m.end, m.end + 30) + ' ').includes(' ' + w + ' ') || (' ' + norm.slice(Math.max(0, m.start - 20), m.start) + ' ').includes(' ' + w + ' '));
    const scenario = { rain: mentions.filter((m) => near(m, W.rain)).map((m) => m.id), blocked: mentions.filter((m) => near(m, W.blockWord)).map((m) => m.id), rush: has(norm, ['rush', 'rush hour', 'office time', 'peak']) };
    if (!scenario.rain.length && has(norm, W.rain) && mentions.length) scenario.rain = mentions.map((m) => m.id);
    if (scenario.rain.length || scenario.blocked.length || scenario.rush) return { ...base, origin: null, destination: null, intent: 'simulate', scenario };
  }
  if (has(norm, W.share) && (mode === 'rickshaw' || mode === 'cng' || !mode)) {
    // "Shahbagh theke Science Lab rickshaw share korbo 2 jon" -> split bot; people from "2 jon" / "3 people"
    const pm = norm.match(/(\d)\s*(?:jon|jn|people|persons|person|man|ta lok|friends|jon mile)/) || norm.match(/(?:amra|we are)\s*(\d)/);
    return { ...base, intent: 'ride_share', mode: mode === 'cng' ? 'cng' : 'rickshaw', people: pm ? Number(pm[1]) : null };
  }
  if (has(norm, W.bestTime) && !has(norm, W.whatIf)) return { ...base, intent: 'best_time' };   // "Mirpur theke Motijheel kokhon ber hobo?"
  if (has(norm, W.compare) && session.lastOrigin && !(origin && destination)) return { ...base, intent: 'compare_fares' };
  if (has(norm, W.watch) && !ex.type) return { ...base, intent: 'watch_trip' };
  if (has(norm, W.roadQ) && !(origin && destination)) return { ...base, intent: 'road_status', hub: destination || origin || (ends[0] && ends[0].id) || null };
  if (has(norm, W.whyNot) && mode) return { ...base, intent: 'route_search', followUp: 'why_not', whyMode: mode };
  if (claimed != null && !budgetM && has(norm, W.fair)) return { ...base, intent: 'fare_check', claimedFare: claimed, mode: mode || 'bus' };
  if (student && mode && has(norm, W.rulesQ) && !origin && !destination && claimed == null) return { ...base, intent: 'fare_rules_qa' };
  if ((has(norm, W.alertWord) || has(norm, ['report', 'reports'])) && has(norm, W.reliability)) return { ...base, intent: 'alert_reliability_qa', hub: (ends[0] && ends[0].id) || (mentions[0] && mentions[0].id) || null };
  if (session.lastAlertId && has(norm, W.confirm) && !ex.type && mentions.length === 0) return { ...base, intent: 'confirm_alert' };
  if (has(norm, W.alt)) {
    // "Farmgate bondho, onno route?" -> avoid the hub named as blocked
    if (ex.type && ex.hubId && !avoidHubs.includes(ex.hubId)) { base.avoidHubs = [...avoidHubs, ex.hubId]; if (destination === ex.hubId) base.destination = null; if (origin === ex.hubId) base.origin = null; }
    return { ...base, intent: 'alternatives' };
  }
  if ((ex.type && ex.type !== 'clear') && ex.hubId && !(origin && destination) && !avoidCongested) return { ...base, intent: 'report_alert', alert: { hub: ex.hubId, type: ex.type, severity: ex.severity }, extracted: ex };
  if (ex.type === 'clear' && ex.hubId && !(origin && destination)) return { ...base, intent: 'report_alert', alert: { hub: ex.hubId, type: 'clear', severity: 1 }, extracted: ex };
  if (origin || destination || base.unknownPlaces.length) return { ...base, intent: 'route_search' };
  if (session.lastOrigin && (student || maxBudget != null || avoidHubs.length || avoidModes.length || maxTransfers != null || sort || base.departAt || avoidCongested)) return { ...base, intent: 'route_search', followUp: 'refine' };
  if (session.lastOrigin && has(norm, W.fareQ)) return { ...base, intent: 'route_search', followUp: 'fare' };
  if (has(norm, W.fareQ) && has(norm, W.rulesQ)) return { ...base, intent: 'fare_rules_qa' };
  if (!mentions.length && norm.split(' ').length <= 4 && has(norm, SMALLTALK)) return { ...base, intent: 'smalltalk' };
  return { ...base, intent: 'unknown' };
}

