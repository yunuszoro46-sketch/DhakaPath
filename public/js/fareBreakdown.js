// Selected route: steps with landmark notes (English / Banglish), per-leg fare table (regular vs
// student, baseline vs surge), alerts, trust "why" lines, Watch / read aloud / offline card. Also
// the Fare Truth form.
import { $, $$, esc, rng, taka, ic, MODE_NAME, RANGE } from './util.js';
import { S, actions } from './store.js';
import { post } from './api.js';
import { offlineCard } from './offlineCard.js';
import { checkBestTime } from './bestTime.js';

function sumRange(o, student) {
  return o.legs.reduce((s, l) => { const v = RANGE(l.mode) ? [l.fare.rangeLow, l.fare.rangeHigh] : [student ? l.fare.student : l.fare.regular, student ? l.fare.student : l.fare.regular]; return [s[0] + v[0], s[1] + v[1]]; }, [0, 0]);
}

function fareSources(o, r) {
  const src = r && r.fareTable && r.fareTable.sources; if (!src) return '';
  const modes = [...new Set(o.legs.map((l) => l.mode))].filter((m) => src[m]);
  if (!modes.length) return '';
  const name = { bus: 'Bus', metro: 'MRT-6', leguna: 'Leguna', rickshaw: 'Rickshaw', cng: 'CNG' };
  return `<ul class="fare-src small">${modes.map((m) => { const s = src[m];
    return `<li><span class="badge ${s.official ? 'ok' : 'est'}">${s.official ? 'official source' : 'estimate'}</span> <b>${name[m] || esc(m)}:</b> ${esc(s.short)}${s.url ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener">source</a>` : ''}${s.checked ? ` · checked ${esc(s.checked)}` : ''}</li>`; }).join('')}</ul>`;
}

export function renderDetail() {
  const o = S.sel, d = $('#detail'); if (!o || !d || !S.result || !S.result.ok) return;
  const r = S.result.data;
  const rows = o.legs.map((l) => `<tr><td><span class="mpill ${l.mode}">${MODE_NAME[l.mode]}</span> ${esc(l.line)}<br><span class="small muted">${esc(l.fromName)} → ${esc(l.toName)}</span></td><td class="num">${l.km}</td>
    <td class="num">${l.fare.unknown ? 'unknown' : RANGE(l.mode) ? rng(l.fare.rangeLow, l.fare.rangeHigh) : taka(l.fare.regular)}</td><td class="num">${l.fare.unknown ? 'unknown' : RANGE(l.mode) ? rng(l.fare.rangeLow, l.fare.rangeHigh) : taka(l.fare.student)}</td>
    <td class="small">${l.mode === 'walk' ? '—' : l.fare.studentApplies ? '<span style="color:var(--ok)">student discount applies</span>' : 'does not apply'}${RANGE(l.mode) ? `<br>baseline ${rng(l.fare.baseLow, l.fare.baseHigh)}${l.fare.surge !== 1 ? ` → <b style="color:var(--warn)">surge ×${l.fare.surge}: ${rng(l.fare.rangeLow, l.fare.rangeHigh)}</b>` : ' (no surge now)'}<br><button type="button" class="linkish small" data-share="${l.from}|${l.to}|${l.mode}">${ic('share')} Share this ${l.mode === 'cng' ? 'CNG' : 'rickshaw'} and split the fare</button>` : ''}</td></tr>`).join('');
  const al = (r.alerts || []).filter((a) => o.legs.some((l) => l.stops.includes(a.hubId)));
  const reg = sumRange(o, false), stu = sumRange(o, true);
  d.innerHTML = `<h3>Step by step <span class="langswitch" role="group" aria-label="Directions language"><button type="button" data-lang="en" aria-pressed="${S.lang === 'en'}">English</button><button type="button" data-lang="bn" aria-pressed="${S.lang === 'bn'}">Banglish</button></span></h3>
    <ol class="steps">${o.legs.map((l) => `<li>${esc(S.lang === 'bn' ? l.instructionBn : l.instruction)}
      ${l.landmark ? `<span class="lm">${ic('pin')}<span>${esc(S.lang === 'bn' && l.landmark.note_bn_banglish ? l.landmark.note_bn_banglish : l.landmark.note_en)}${l.landmark.sample ? '<span class="sample">sample note</span>' : ''}</span></span>` : ''}
      ${l.boardingNote ? `<span class="lm">${ic('info')}<span>${esc(l.boardingNote)}</span></span>` : ''}</li>`).join('')}</ol>
    ${o.transferWalkMinutes ? `<p class="muted small">Includes ${o.transferWalkMinutes} min of transfer walking.</p>` : ''}
    ${o.warnings.length ? `<ul class="warnlist">${o.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    <h3>Why this route</h3><ul class="whylist">${(o.why || []).map((w) => `<li class="${w.kind}">${esc(w.text)}</li>`).join('')}</ul>
    <h3>Fare breakdown</h3>
    <div class="table-wrap"><table><thead><tr><th>Leg</th><th class="num">km</th><th class="num">Regular</th><th class="num">Student</th><th>Student discount / surge</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><th colspan="2">Trip total</th><th class="num">${rng(reg[0], reg[1])}</th><th class="num">${rng(stu[0], stu[1])}</th><th></th></tr></tfoot></table></div>
    <p class="muted small">Ranking cost uses the rickshaw/CNG midpoint: regular ≈${taka(o.totalFareRegular)}, student ≈${taka(o.totalFareStudent)}.${S.result && S.result.ok && S.result.data.fareTable ? ` Fare table v${S.result.data.fareTable.version}${S.result.data.fareTable.effectiveFrom ? `, updated ${new Date(S.result.data.fareTable.effectiveFrom).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short' })}` : ' (seed)'}.` : ''}${o.fareUnknown ? ' <b>Part of this route has no fare data; the total is incomplete.</b>' : ''}</p>
    ${fareSources(o, r)}
    ${al.length ? `<h3>Alerts on this route</h3>${al.map((a) => `<div class="small"><span class="status ${a.status}">${a.status}</span> <b>${esc(a.placeName)}</b> ${esc(a.type)} · confidence ${a.effectiveConfidence} · ${a.ageMinutes} min old · ${esc(a.routingEffect)}</div>`).join('')}` : '<div class="note ok">No open alerts on this route.</div>'}
    <div class="actionbar"><button type="button" class="primary" id="watch-btn">${ic('watch')}Watch this trip</button><button type="button" class="ghost" id="bt-btn">${ic('alarm')}Best time to leave</button><button type="button" class="ghost" id="brief-say">${ic('speak')}Read aloud</button><button type="button" class="ghost" id="brief-card">${ic('download')}Offline card (PNG)</button></div>
    <div id="bt-out" class="bt-out" aria-live="polite"></div>
    <p class="muted small" style="margin-top:0">Trip Watch re-checks this trip and warns you, with a detour, when a confirmed alert or rush hour hits it.</p>
    <p class="muted small">${esc(r.notice)}</p>`;
  $('#brief-say').onclick = () => speak(o, r);
  $('#brief-card').onclick = () => offlineCard(o);
  $('#watch-btn').onclick = () => actions.watchTrip();
  $('#bt-btn').onclick = (e) => checkBestTime(e.currentTarget);
  $$('#detail [data-lang]').forEach((b) => b.onclick = () => { S.lang = b.dataset.lang; renderDetail(); });
}

function speak(o, r) {
  if (!('speechSynthesis' in window)) { alert('This browser cannot read aloud. Use the offline card instead.'); return; }
  const text = `${r.originName} to ${r.destName}. About ${o.totalMinutes} minutes, ${o.fareRangeLow === o.fareRangeHigh ? o.fareRangeLow : o.fareRangeLow + ' to ' + o.fareRangeHigh} taka. ` + o.legs.map((l, i) => `Step ${i + 1}. ${S.lang === 'bn' ? l.instructionBn : l.instruction}`).join(' ');
  speechSynthesis.cancel(); speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { rate: 0.95 }));
}

async function fareCheck(ev) {
  ev.preventDefault();
  const r = await post('/api/fare/check', { claimedFare: Number($('#fc-amount').value), origin: $('#origin').value, destination: $('#destination').value, mode: $('#fc-mode').value, student: $('#student').checked, departAt: $('#departAt').value || null });
  if (!r.ok) { $('#fc-out').innerHTML = `<div class="note bad">${esc(r.error.message)}</div>`; return; }
  const d = r.data;
  const cls = { fair: 'ok', below: 'info', slightly_high: 'warn', overcharge: 'bad' }[d.verdict] || 'warn';
  const src = d.fareTable && d.fareTable.sources && d.fareTable.sources[d.mode];
  const basis = src ? (src.official ? `<span class="badge-ok">official rate</span> ${esc(src.short)}${src.url ? ` · <a href="${esc(src.url)}" target="_blank" rel="noopener">source</a>` : ''}` : `<span class="badge-est">team estimate</span> ${esc(src.short)}. The verdict compares against that estimate, not an official chart.`) : '';
  $('#fc-out').innerHTML = `<div class="note ${cls}"><b>${esc({ fair: 'Fair', below: 'Below usual', slightly_high: 'Slightly high', overcharge: 'Overcharge' }[d.verdict] || '')}</b>${src && !src.official ? ' <span class="small">(against the estimated range)</span>' : ''}: ${esc(d.text)} ${esc(d.studentNote)}${d.submission.flags.length ? ' This amount is flagged as unrealistic (S1) and not counted in stats.' : ''}</div>
    <p class="small">${ic('chat')} Say to the conductor: <b>“${esc(d.script)}”</b> ${d.scriptBy === 'ai' ? '<span class="muted">(phrased by AI, numbers checked)</span>' : ''}</p>
    ${basis ? `<p class="small">${basis}</p>` : ''}
    <p class="muted small">Community reports for this trip and mode under the current fare table: ${d.community.reports}${d.community.median != null ? `, median ৳${d.community.median}` : ''}.</p>`;
  actions.refreshAll();
}

export function initFareBreakdown() {
  // "Share this rickshaw / CNG": open the Share tab for that leg
  $('#search-out').addEventListener('click', (e) => { const b = e.target.closest('[data-share]'); if (!b || !actions.openShare) return; const [f, t, m] = b.dataset.share.split('|'); actions.openShare(f, t, m); }); $('#fc-form').addEventListener('submit', fareCheck); actions.renderDetail = renderDetail; }
