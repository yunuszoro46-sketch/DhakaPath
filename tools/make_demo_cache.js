// Writes server/data/demoCache.json: the expected parsed JSON for the scripted demo inputs
// (Build Spec §13), keyed by normalised text. Used only when a live AI call fails.
import { writeFileSync } from 'node:fs';
import { seed, config } from '../server/store/seedData.js';
import { loadNetwork } from '../server/engine/network.js';
import { normalize } from '../server/engine/places.js';
import { parseRules, extractAlertRules } from '../server/ai/parser.js';

const net = loadNetwork(seed, config);
const session = { lastOrigin: 'DHA', lastDest: 'MOT', lastAlertId: 'A2' };
const chats = ['Dhanmondi theke Motijheel, student', 'Farmgate bondho, onno route?', 'student hole koto?', 'conductor 40 chaise Farmgate theke Motijheel, thik ache?',
  'Mirpur theke Motijheel, student, 40 takar moddhe', 'ei alert ta ki still thik?'];
const posts = ['Science Lab e hatu pani!! rickshaw o jacche na'];
const strip = ({ extracted, ...p }) => p;
const intents = Object.fromEntries(chats.map((t) => [normalize(t), strip(parseRules(net, t, t.startsWith('Dhanmondi') || t.startsWith('Mirpur') || t.startsWith('conductor') ? {} : session))]));
const alerts = Object.fromEntries(posts.map((t) => [normalize(t), { ...extractAlertRules(net, t), isIncident: true }]));
writeFileSync(new URL('../server/data/demoCache.json', import.meta.url), JSON.stringify({ _note: 'Expected parsed JSON for the scripted demo inputs (architecture doc §5). Used only when a live AI call fails. Regenerate: node tools/make_demo_cache.js', intents, alerts }, null, 1));
console.log(Object.keys(intents).length, 'intents,', Object.keys(alerts).length, 'alert');
for (const [k, v] of Object.entries(intents)) console.log(' ', v.intent.padEnd(22), k);
