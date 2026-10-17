// Place recognition (English, Banglish, Bangla) for search, chat and alert ingestion.
const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => BN_DIGITS[d])
    .replace(/[৳]/g, ' tk ')
    .replace(/[^a-z0-9ঀ-৿]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildIndex(net) {
  const entries = [];
  for (const h of net.hubs) {
    const aliases = new Set([h.name, h.bn, ...(h.aliases || [])]);   // not the short ids: "far", "bad", "mot" are ordinary words
    for (const a of aliases) if (a) entries.push({ alias: normalize(a), id: h.id, name: h.name });
  }
  entries.sort((x, y) => y.alias.length - x.alias.length);
  return entries;
}

// Non-overlapping hub mentions in reading order; the longest alias wins. A Bangla/Banglish
// suffix glued to a name ("Farmgate-e", "ফার্মগেটে") is accepted.
export function findPlaces(text, index) {
  const norm = ' ' + normalize(text) + ' ';
  const taken = new Array(norm.length).fill(false);
  const found = [];
  for (const e of index) {
    if (!e.alias) continue;
    let from = 0;
    for (;;) {
      const at = norm.indexOf(' ' + e.alias, from);
      if (at < 0) break;
      const s = at + 1, end = s + e.alias.length;
      const rest = norm.slice(end);
      const suffix = rest.match(/^(e|er|te|r|ে|ের|তে|এ)?(?= )/);
      if (suffix) {
        let free = true;
        for (let i = s; i < end; i++) if (taken[i]) { free = false; break; }
        if (free) {
          for (let i = s; i < end + suffix[0].length; i++) taken[i] = true;
          found.push({ id: e.id, name: e.name, start: s - 1, end: end - 1 + suffix[0].length, alias: e.alias });
        }
      }
      from = at + 1;
    }
  }
  found.sort((a, b) => a.start - b.start);
  return { norm: norm.trim(), mentions: found };
}

export function resolveHub(net, text, index = buildIndex(net)) {
  if (!text || typeof text !== 'string' || text.length > 100) return null;
  const t = String(text).trim();
  const direct = net.hubs.find((h) => h.id === t.toUpperCase() || h.id === t);
  if (direct) return direct.id;
  const n = normalize(t);
  const hit = index.find((e) => e.alias === n);
  if (hit) return hit.id;
  const m = findPlaces(t, index).mentions[0];
  return m ? m.id : null;
}
