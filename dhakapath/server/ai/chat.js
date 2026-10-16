// Chat (architecture doc §1 request flow): message -> parseIntent (LLM, else demo cache, else rule
// parser) -> dispatcher calls an engine tool -> groundRoute on any route -> explain (LLM or template).
// Response: { reply, data, grounded, aiMode, toolCalls, intent }.
import { hubName } from '../engine/network.js';
import { fmtRange } from '../engine/fare.js';
import { normalize } from '../engine/places.js';
import { parseRules, extractAlertRules } from './parser.js';
import { parseIntent, extractAlert, explain, providers } from './llm.js';
import { callTool } from './tools.js';

export function newSession() { return { lastOrigin: null, lastDest: null, student: null, constraints: {}, lastOptions: [], shown: 0, lastAlertId: null, history: [] }; }

// hubs with an active or unverified alert, except the trip's own ends
export function congestedHubs(engine, origin, dest) {
  return Object.entries(engine.hubStatus()).filter(([h, s]) => s !== 'clear' && h !== origin && h !== dest).map(([h]) => h);
}

const fmtO = (o) => `${o.totalMinutes} min · ${fmtRange(o.fareRangeLow, o.fareRangeHigh)}${o.student ? ' (student)' : ''} · ${o.transfers} transfer${o.transfers === 1 ? '' : 's'}`;
export function describeOption(net, o, lang = 'en') {
  const why = (o.why || []).filter((w) => w.kind !== 'clear').slice(0, 2).map((w) => `   ↳ ${w.text}`).join('\n');
  return `${o.labels && o.labels.length ? `[${o.labels.join(', ')}] ` : ''}${fmtO(o)}\n` + o.legs.map((l, i) => `${i + 1}. ${lang === 'bn' ? l.instructionBn : l.instruction} ${l.mode === 'walk' ? '' : fmtRange(l.fare.rangeLow, l.fare.rangeHigh)}`).join('\n') + (why ? '\n' + why : '');
}

// The dispatcher: switch(intent) -> tool. engine: createEngine(); p: validated intent.
export function handle(engine, session, text, p) {
  const net = engine.net;
  const ctx = { engine, calls: [] };
  const tool = (name, args) => callTool(ctx, name, args);
  const out = (reply, extra = {}) => {
    session.history.push({ user: String(text).slice(0, 200), intent: p.intent }); if (session.history.length > 10) session.history.shift();
    return { intent: p.intent, source: p.source || 'rules', reply, toolCalls: ctx.calls, grounded: extra.grounded ?? null, data: extra.data ?? null, parsed: p };
  };
  const routeQuery = (over = {}) => {
    const fresh = p.origin && p.destination && (p.origin !== session.lastOrigin || p.destination !== session.lastDest);   // a new trip starts from fresh constraints
    const c = fresh ? {} : { ...session.constraints };
    if (p.student != null) c.student = p.student;
    if (p.maxBudget != null) c.maxBudget = p.maxBudget;
    if (p.avoidHubs && p.avoidHubs.length) c.avoidHubs = [...new Set([...(c.avoidHubs || []), ...p.avoidHubs])];
    if (p.avoidModes && p.avoidModes.length) c.avoidModes = [...new Set([...(c.avoidModes || []), ...p.avoidModes])];
    if (p.maxTransfers != null) c.maxTransfers = p.maxTransfers;
    if (p.sort) c.sort = p.sort;
    if (p.departAt) c.departAt = p.departAt;
    if (p.rush) c.rush = true;                                     // "in rush hour" / "office time"
    if (p.rainAt && p.rainAt.length) over = { scenario: { rain: p.rainAt }, ...over };   // "brishti hocche": rain at the hubs named
    if (p.mode && p.intent === 'route_search' && !p.followUp && p.mode !== 'walk') over = { requireMode: p.mode, ...over };   // "CNG e jabo"
    const origin = p.origin || (p.originUnresolved ? null : session.lastOrigin), destination = p.destination || session.lastDest;
    if (p.avoidCongested) c.avoidHubs = [...new Set([...(c.avoidHubs || []), ...congestedHubs(engine, origin, destination)])];
    return { origin, destination, ...c, ...over };
  };
  const runSearch = (q) => {
    const r = tool('findRoutes', q);
    if (r.ok) {
      tool('groundRoute', { options: [...new Set([...r.options, ...r.others, ...(r.backup && r.backup.option ? [r.backup.option] : [])])] });
      session.lastOrigin = r.origin; session.lastDest = r.dest; session.lastOptions = [...r.options, ...r.others]; session.shown = 0;
      const { origin, destination, requireMode, ...c } = q; session.constraints = c;
    }
    return r;
  };
  const hint = p.lang === 'bn' ? 'Bolun "ar kono option?", "student hole?", "why not metro?" ba "ei trip watch koro".' : 'Say "ar kono option?", "student hole?", "why not metro?" or "watch this trip".';

  switch (p.intent) {
    case 'route_search': {
      if (p.unknownPlaces && p.unknownPlaces.length && !(p.origin && p.destination)) {
        // never swap in another place silently: say it isn't a hub and suggest the nearest ones
        const parts = (p.placeHints || p.unknownPlaces.map((w) => ({ word: w, near: [] }))).map((h) => `"${h.word}" isn't one of the 14 hubs in DhakaPath${h.near.length ? `; nearest: ${h.near.join(' or ')}` : ''}`);
        const ex = (p.placeHints || []).find((h) => h.near.length);
        return out(`${parts.join('. ')}. Hubs: ${net.hubs.map((x) => x.name).join(', ')}.${ex ? ` Try "${ex.near[0]} theke ${p.destination ? hubName(net, p.destination) : p.origin ? hubName(net, p.origin) : 'Motijheel'}".` : ''}`);
      }
      if (p.originUnresolved && !p.origin) return out(p.lang === 'bn' ? `Kon hub theke shuru korben? (${net.hubs.map((x) => x.name).join(', ')})` : `Which hub are you starting from? (${net.hubs.map((x) => x.name).join(', ')})`);
      if (p.followUp === 'why_not') {
        if (!session.lastOrigin) return out('Ask for a trip first, e.g. "Mirpur theke Motijheel".');
        const best = session.lastOptions[0];
        const r = tool('findRoutes', routeQuery({ requireMode: p.whyMode }));
        if (!r.ok) return out(`There is no ${p.whyMode} option between ${hubName(net, session.lastOrigin)} and ${hubName(net, session.lastDest)} with your filters.`, { data: r });
        tool('groundRoute', { options: [r.best] });
        const o = r.best;
        return out(`Best option with ${p.whyMode}: ${fmtO(o)} (${o.summary}).${best ? ` The one I suggested first: ${fmtO(best)}. ${o.totalMinutes < best.totalMinutes ? `${p.whyMode} is ${best.totalMinutes - o.totalMinutes} min faster` : `${p.whyMode} is not faster`}${o.fare > best.fare ? ` but costs ৳${Math.round(o.fare - best.fare)} more` : ''}.` : ''}`, { grounded: o.grounded, data: r });
      }
      const q = routeQuery();
      if (!q.origin) return out(`Where are you starting from? (e.g. "Mirpur theke ${q.destination ? hubName(net, q.destination) : 'Motijheel'}")`);
      if (!q.destination) return out('Where do you want to go?');
      const r = runSearch(q);
      if (!r.ok) {
        const maybe = (r.uncertainBudget || [])[0];
        const cob = r.cheapestOverBudget && !(maybe && maybe.summary === r.cheapestOverBudget.summary) ? r.cheapestOverBudget : null;
        return out(r.message + (maybe ? ` Might fit: ${maybe.summary}, typical ~৳${Math.round(maybe.fare)} but up to ৳${maybe.fareRangeHigh}.` : '')
          + (cob ? ` Cheapest open option (over budget): ${fmtRange(cob.fareRangeLow, cob.fareRangeHigh)} (${cob.summary}).` : ''), { data: r });
      }
      if (p.followUp === 'fare') {
        const o = r.options[0];
        const lines = o.legs.filter((l) => l.mode !== 'walk').map((l) => `• ${l.lineName} ${l.fromName}→${l.toName}, ${l.km} km: regular ৳${l.fare.regular}${l.mode === 'rickshaw' || l.mode === 'cng' ? ` (range ${fmtRange(l.fare.rangeLow, l.fare.rangeHigh)})` : ''}, student ৳${l.fare.student} — ${l.fare.studentApplies ? 'student discount applies' : 'no student discount'}`);
        return out(`Fare for ${o.summary}:\n${lines.join('\n')}\nTotal: regular ৳${o.totalFareRegular}, student ৳${o.totalFareStudent}. ${engine.DEMO_NOTICE}`, { grounded: o.grounded, data: r });
      }
      const filt = [q.student && 'student', q.maxBudget != null && `≤ ৳${q.maxBudget}`, (q.avoidHubs || []).length && `avoiding ${q.avoidHubs.map((h) => hubName(net, h)).join(', ')}`, (q.avoidModes || []).length && `no ${q.avoidModes.join('/')}`, q.maxTransfers != null && `≤ ${q.maxTransfers} transfers`].filter(Boolean);
      if (r.conditions.rain && r.conditions.rain.length) filt.push(`rain at ${r.conditions.rain.map((h) => hubName(net, h)).join(', ')}: rickshaw/CNG surge, slower roads`);
      if (r.conditions.rush) { const why = r.conditions.rushSource === 'set' ? (p.lang === 'bn' ? 'apni bolechen' : 'as asked') : r.conditions.departAt; filt.push(p.lang === 'bn' ? `rush hour (${why})` : `rush hour applied (${why})`); }
      else if (r.conditions.departSource === 'chosen') filt.push(`leaving ${r.conditions.departAt}`);
      const al = (r.alerts || []).filter((a) => ['active', 'unverified', 'disputed'].includes(a.status));
      const bk = r.backup && r.backup.option ? r.backup : null, sg = (n) => (n > 0 ? `+${n}` : `${n}`);
      const bkLine = bk ? `\nBackup: ${bk.option.summary} (${bk.option.totalMinutes} min, ${fmtRange(bk.option.fareRangeLow, bk.option.fareRangeHigh)}; ${sg(bk.delta.minutes)} min vs main). ${bk.trigger}` : r.backup && r.backup.reason ? `\nNo backup: ${r.backup.reason}` : '';
      return out(`${r.originName} → ${r.destName}${filt.length ? ` (${filt.join(', ')})` : ''}:\n${r.options.map((o) => describeOption(net, o, p.lang)).join('\n\n')}${bkLine}${al.length ? `\nAlerts: ${al.map((a) => `${a.placeName} ${a.type} (${a.status}, ${a.effectiveConfidence})`).join('; ')}.` : ''}\n${hint}`, { grounded: r.options.every((o) => o.grounded), data: r });
    }
    case 'alternatives': {
      if (!session.lastOrigin && !(p.origin && p.destination)) return out('Tell me the trip first, e.g. "Farmgate theke Motijheel".');
      if (p.avoidHubs.length) {
        const r = runSearch(routeQuery());
        if (!r.ok) return out(r.message, { data: r });
        return out(`Avoiding ${p.avoidHubs.map((h) => hubName(net, h)).join(', ')}: ${r.originName} → ${r.destName}\n${r.options.map((o) => describeOption(net, o, p.lang)).join('\n\n')}`, { grounded: r.options.every((o) => o.grounded), data: r });
      }
      session.shown += 1;
      const o = session.lastOptions[session.shown];
      if (!o) return out('No more options with these filters. Try removing a filter or raising the budget.');
      tool('groundRoute', { options: [o] });
      return out(`Option ${session.shown + 1} of ${session.lastOptions.length}:\n${describeOption(net, o, p.lang)}`, { grounded: o.grounded, data: { ok: true, options: [o], highlight: o.id } });
    }
    case 'compare_fares': {
      const opts = session.lastOptions.slice(0, 4);
      if (!opts.length) return out('Search a trip first, then ask to compare fares.');
      const r = tool('compareFares', { options: opts, student: !!session.constraints.student });
      return out(`Regular vs student for ${hubName(net, session.lastOrigin)} → ${hubName(net, session.lastDest)}:\n${r.rows.map((x) => `• ${x.summary}: regular ${x.regular}, student ${x.student} (${x.minutes} min)`).join('\n')}\nStudent half fare applies to buses only.`, { grounded: opts.every((o) => o.grounded), data: r });
    }
    case 'fare_check': {
      const o = p.origin || session.lastOrigin, d = p.destination || session.lastDest;
      if (!o || !d) return out(`Which trip? e.g. "Farmgate theke Motijheel bus e ${p.claimedFare} chaise, ok?"`);
      const fc = tool('checkClaimedFare', { claimedFare: p.claimedFare, origin: o, destination: d, mode: p.mode || 'bus', student: p.student ?? session.constraints.student ?? false, userId: session.userId || 'chat' });
      if (!fc.ok) return out(fc.message, { data: fc });
      const label = { fair: 'Fair', below: 'Below the usual fare', slightly_high: 'Slightly high', overcharge: 'Overcharge', unknown: '' }[fc.verdict];
      return out(`${label}: ${fc.text} (${fc.mode}, ${fc.originName}→${fc.destName}${fc.student ? ', student' : ''}). ${fc.studentNote}${fc.submission.flags.length ? ' Your amount looks unrealistic, so it is not counted in fare stats.' : ''}\nSay to the conductor: “${fc.script}”`, { grounded: true, data: fc });
    }
    case 'report_alert': {
      const ex = p.extracted || { ok: !!(p.alert && p.alert.hub && p.alert.type), hubId: p.alert && p.alert.hub, placeName: p.alert && hubName(net, p.alert.hub), type: p.alert && p.alert.type, severity: (p.alert && p.alert.severity) || 2, contradictory: false, missing: [] };
      const r = tool(ex.type === 'clear' ? 'resolveAlert' : 'createAlert', { extracted: ex, text, userId: session.userId || 'chat', source: 'user' });
      if (r.action === 'resolve_votes') return out(r.alerts.length ? `Thanks. Counted as a "clear" vote on ${r.alerts.length} alert(s) at ${ex.placeName}.` : `Thanks. There were no open alerts at ${ex.placeName}.`, { data: r });
      if (!r.ok) return out(r.reason || r.message || r.error, { data: r });
      session.lastAlertId = r.alert.id;
      const a = r.alert;
      return out(`${r.merged ? 'Matched an open report: counted as a confirmation' : 'Reported'}: ${a.placeName}, ${a.type} (severity ${a.severity}). Confidence ${a.effectiveConfidence} → ${a.status}. ${a.status === 'active' ? 'Routes now avoid it.' : a.status === 'unverified' ? 'Routes treat it as a soft slowdown until others confirm.' : ''}`, { data: r });
    }
    case 'confirm_alert': {
      const r = tool('confirmAlert', { alertId: session.lastAlertId, userId: session.userId || 'chat' });
      if (!r.ok) return out('That alert is closed now.', { data: r });
      return out(r.ignored ? 'You already reported or confirmed this one, so it counts once.' : `Confirmed. ${r.alert.placeName} ${r.alert.type}: confidence ${r.alert.effectiveConfidence} → ${r.alert.status}.`, { data: r });
    }
    case 'road_status': {
      const hubs = p.hub ? [p.hub] : session.lastOptions.length ? [...new Set(session.lastOptions[0].legs.flatMap((l) => l.stops))] : [];
      const b = tool('roadStatus', { hubs });
      if (!hubs.length) { const bad = b.hubs.filter((h) => h.status !== 'clear'); return out(bad.length ? `Hubs with problems now: ${bad.map((h) => `${h.name} (${h.status})`).join(', ')}.` : 'All hubs are clear right now.', { data: { hubs: bad } }); }
      const lines = hubs.map((id) => b.hubs.find((h) => h.id === id)).map((h) => `${h.name}: ${h.status}${h.alerts.length ? ' — ' + h.alerts.map((a) => `${a.type} (${a.status}, confidence ${a.effectiveConfidence}, ${a.confirmations} report(s))`).join('; ') : ''}`);
      return out(lines.join('\n'), { data: { hubs: hubs.map((id) => b.hubs.find((h) => h.id === id)) } });
    }
    case 'simulate': {
      if (!session.lastOrigin) return out('Search a trip first, then ask "what if Science Lab e brishti hoy?".');
      const s = tool('simulate', { ...routeQuery(), origin: session.lastOrigin, destination: session.lastDest, scenario: { label: 'What if (chat)', ...p.scenario } });
      if (!s.ok) return out(s.message, { data: s });
      return out(`What if: ${s.explanation}`, { grounded: s.afterOption ? s.afterOption.grounded !== false : null, data: s });
    }
    case 'watch_trip': {
      const q = routeQuery();
      if (!q.origin || !q.destination) return out('Search a trip first, then say "watch this trip".');
      const w = tool('watchTrip', { ...q, clientId: session.clientId || session.userId || 'chat' });
      if (!w.ok) return out(w.message, { data: w });
      return out(`${p.lang === 'bn' ? 'Thik ache, ei trip watch korchi' : 'Watching this trip'}: ${w.watch.label}, usual route ${w.watch.usual.summary} (${w.watch.usual.totalMinutes} min). ${p.lang === 'bn' ? 'Confirmed alert ba rush hour route e porle ekhanei janabo, detour soho.' : "I'll warn you here if a confirmed alert or rush hour hits it, with a checked detour."}`, { data: { watch: w.watch } });
    }
    case 'fare_rules_qa': {
      const r = tool('getFareRules', { mode: p.mode });
      return out(r.text, { grounded: true });
    }
    case 'alert_reliability_qa': {
      if (p.hub) {   // "is the Science Lab alert reliable?" -> that hub's open alerts
        const r = tool('getAlertReliability', { label: p.hub, pick: (list) => list.filter((a) => a.hubId === p.hub && ['active', 'unverified', 'disputed', 'fading'].includes(a.status)) });
        if (!r.alerts.length) return out(`No open alert at ${hubName(net, p.hub)} right now, so routes there run normally.`);
        return out(r.alerts.map((a) => `${a.placeName} ${a.type}: ${a.status} — confidence ${a.effectiveConfidence}, reported ${a.ageMinutes} min ago, last verified ${a.minutesSinceVerified} min ago, ${a.confirmations} confirmation(s), ${a.resolvedVotes} "clear" vote(s). Effect: ${a.routingEffect}.`).join('\n'), { data: { alerts: r.alerts } });
      }
      const id = session.lastAlertId;
      const r = tool('getAlertReliability', { label: id || 'route', pick: (list) => (id ? list.filter((a) => a.id === id) : session.lastOptions.length ? list.filter((a) => session.lastOptions[0].legs.some((l) => l.stops.includes(a.hubId))) : list.filter((a) => ['active', 'unverified'].includes(a.status))) });
      if (!r.alerts.length) return out('No alert to check. Report one, or ask after a route search.');
      return out(r.alerts.map((a) => `${a.placeName} ${a.type}: ${a.status} — confidence ${a.effectiveConfidence}, reported ${a.ageMinutes} min ago, last verified ${a.minutesSinceVerified} min ago, ${a.confirmations} confirmation(s), ${a.resolvedVotes} "clear" vote(s). Effect: ${a.routingEffect}.`).join('\n'), { data: { alerts: r.alerts } });
    }
    case 'ride_share': {
      const from = p.origin || session.lastOrigin, to = p.destination || session.lastDest;
      if (!from || !to) return out(p.lang === 'bn' ? 'Kon hub theke kothay share korben? Jemon "Shahbagh theke Science Lab rickshaw share, 2 jon".' : 'Share from which hub to where? e.g. "Shahbagh to Science Lab rickshaw share, 2 people".');
      const seats = p.mode === 'cng' ? 3 : 2;
      const q = tool('splitFare', { from, to, mode: p.mode, people: Math.min(seats, Math.max(1, p.people || 2)) });
      if (!q.ok) return out(q.message);
      const board = tool('rideBoard', { hub: from, userId: session.userId || 'anon' });
      const open = (board.rides || []).filter((r) => r.to === to && r.mode === p.mode);
      return out(`${q.fromName} → ${q.toName} by ${p.mode === 'cng' ? 'CNG' : 'rickshaw'}: ${q.bot}${open.length ? `\n${open.length} open share(s) going there now (${open.map((r) => `${r.riders}/${r.seats} riders, ${r.minutesLeft} min left`).join('; ')}). Join on the Share tab.` : '\nNo open share going there yet: start one on the Share tab.'}`, { data: q });
    }
    case 'smalltalk':
      return out(p.lang === 'bn' ? 'Apnake shagotom! Trip, bhara ba rastar khobor lagle bolun, jemon "Mirpur theke Motijheel, student".' : 'You\'re welcome! Ask me for a trip, a fare or road conditions any time, e.g. "Mirpur theke Motijheel, student".');
    default:
      return out('Try: "Mirpur theke Motijheel, student, 40 takar moddhe", "Science Lab e pani jome gese", "bus e 40 chaise Farmgate theke Motijheel, ok?", or "student half-fare ki metro te hoy?"');
  }
}

// Compact engine facts for the explainer (P3): numbers it may use, nothing else.
function facts(r) {
  const d = r.data || {};
  if (r.intent === 'route_search' && d.options) return { from: d.originName, to: d.destName, options: d.options.map((o) => ({ summary: o.summary, totalMinutes: o.totalMinutes, fareLow: o.fareRangeLow, fareHigh: o.fareRangeHigh, transfers: o.transfers })),
    alerts: (d.alerts || []).filter((a) => ['active', 'unverified'].includes(a.status)).map((a) => ({ place: a.placeName, type: a.type, status: a.status, confidence: a.effectiveConfidence, ageMinutes: a.ageMinutes })) };
  if (r.intent === 'fare_check' && d.expected) return { from: d.originName, to: d.destName, mode: d.mode, claimed: d.claimedFare, fairLow: d.expected.rangeLow, fairHigh: d.expected.rangeHigh, verdict: d.verdict };
  return null;
}

// One chat turn. ai: { env, fetchImpl, status, log }, demoCache: { intents: { normText: parsed } }
export async function chatTurn(engine, session, text, ai = {}, demoCache = null) {
  const live = providers(ai.env || {}).length > 0;
  const rules = parseRules(engine.net, text, session);
  let p = null, aiMode = live ? 'live' : 'off';
  if (live) {
    p = await parseIntent(engine.net, text, { lastOrigin: session.lastOrigin, lastDest: session.lastDest, student: session.constraints.student ?? null, lastAlertId: session.lastAlertId }, session.history, ai);
    if (!p) aiMode = 'fallback';
  }
  if (!p && live && demoCache && demoCache.intents) { const c = demoCache.intents[normalize(text)]; if (c) { p = { ...c, source: 'cache' }; aiMode = 'cache'; } }
  if (!p || p.intent === 'unknown') p = { ...rules, source: rules.source };
  else {
    // places the model got wrong (dropped as unknown IDs) are filled from the rule parser, which only reads the text
    if (!p.origin && rules.origin) p.origin = rules.origin;
    if (!p.destination && rules.destination) p.destination = rules.destination;
    p.lang = rules.lang; p.departAt = p.departAt || rules.departAt;
    // things only the rule parser reads from the text: rush/rain words, extra avoided modes, places that are not hubs
    p.rush = p.rush || rules.rush; p.rainAt = p.rainAt || rules.rainAt; p.originUnresolved = rules.originUnresolved && !p.origin;
    p.avoidModes = [...new Set([...(p.avoidModes || []), ...(rules.avoidModes || [])])];
    if (!(p.origin && p.destination) && rules.unknownPlaces && rules.unknownPlaces.length) { p.unknownPlaces = rules.unknownPlaces; p.placeHints = rules.placeHints; if (p.intent === 'unknown') p.intent = 'route_search'; }
    if (p.intent === 'alert_reliability_qa' && !p.hub) p.hub = rules.hub; p.followUp = p.followUp || rules.followUp; p.whyMode = p.whyMode || rules.whyMode;
    if (p.intent === 'report_alert' && rules.extracted && rules.extracted.hubId === (p.alert && p.alert.hub)) p.extracted = rules.extracted;
  }
  const r = handle(engine, session, text, p);
  r.aiMode = aiMode;
  if (aiMode === 'live') { const f = facts(r); if (f) { const nice = await explain(f, p.lang, ai); if (nice) { r.engineReply = r.reply; r.reply = nice; r.polished = true; } } }
  return r;
}

// Alert paste (architecture doc §1): text -> extractAlert (LLM, else cache, else rules) -> sanity -> create.
export async function ingestTurn(engine, text, userId, ai = {}, demoCache = null) {
  const live = providers(ai.env || {}).length > 0;
  let ex = live ? await extractAlert(engine.net, text, ai) : null;
  let aiMode = live ? (ex ? 'live' : 'fallback') : 'off';
  if (!ex && live && demoCache && demoCache.alerts) { const c = demoCache.alerts[normalize(text)]; if (c) { ex = { ...c, source: 'cache' }; aiMode = 'cache'; } }
  if (!ex) ex = extractAlertRules(engine.net, text);
  const r = engine.ingestExtracted(ex, text, userId, 'ai_ingest');
  return { ...r, aiMode };
}
