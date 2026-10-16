// Offline route card (bonus 2): drawn on a canvas from the engine's own data, shown in a dialog with a PNG download.
import { $, rng } from './util.js';
import { S, hubName } from './store.js';
import { get } from './api.js';

function wrapText(x, t, px, py, maxW) { let s = t; while (x.measureText(s).width > maxW && s.length > 10) s = s.slice(0, -2); x.fillText(s === t ? t : s + '…', px, py); }

export async function offlineCard(o) {
  const r = await get('/api/card/' + o.id);
  if (!r.ok) return;
  const c = r.data;
  const W = 720, pad = 32, lineH = 26, lines = [];
  c.option.legs.forEach((l, i) => { lines.push([`${i + 1}. ${S.lang === 'bn' ? l.instructionBn : l.instruction}`, '#111']); if (l.mode !== 'walk') lines.push([`    ${l.line} · ${l.km} km · ${l.mode === 'rickshaw' || l.mode === 'cng' ? rng(l.fare.rangeLow, l.fare.rangeHigh) : '৳' + (o.student ? l.fare.student : l.fare.regular)}`, '#555']); });
  const al = c.alerts.filter((a) => ['active', 'unverified'].includes(a.status));
  if (al.length) { lines.push(['Alerts:', '#b91c1c']); al.forEach((a) => lines.push([`  ${a.placeName}: ${a.type} (${a.status}, ${a.effectiveConfidence})`, '#b91c1c'])); }
  const H = 150 + lines.length * lineH + 70;
  const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
  const x = cv.getContext('2d'); x.scale(2, 2);
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = '#10a37f'; x.fillRect(0, 0, W, 8);
  x.fillStyle = '#111'; x.font = 'bold 26px system-ui, sans-serif'; x.fillText(`${hubName(c.query.origin)} → ${hubName(c.query.destination)}`, pad, 52);
  x.font = 'bold 20px system-ui, sans-serif'; x.fillText(`${o.totalMinutes} min · ${rng(o.fareRangeLow, o.fareRangeHigh)}${o.student ? ' (student)' : ''} · ${o.transfers} transfer(s)`, pad, 88);
  x.font = '15px system-ui, sans-serif'; x.fillStyle = '#555'; x.fillText(`DhakaPath offline card · ${new Date(c.generatedAt).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}`, pad, 116);
  x.font = '16px system-ui, sans-serif';
  lines.forEach(([t, col], i) => { x.fillStyle = col; wrapText(x, t, pad, 150 + i * lineH, W - pad * 2); });
  x.fillStyle = '#92400e'; x.font = '13px system-ui, sans-serif'; x.fillText('Seed data, not official. Check fares on the spot.', pad, H - 28);
  const url = cv.toDataURL('image/png');
  $('#card-img').src = url; $('#card-dl').href = url; $('#card-dialog').showModal();
}
