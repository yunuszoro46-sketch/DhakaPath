// npm run reset: delete the saved state so the next start loads seed.json plus the demo alerts.
import { rmSync, existsSync } from 'node:fs';
const file = process.env.STATE_FILE || new URL('../data/state.json', import.meta.url).pathname;
if (existsSync(file)) { rmSync(file); console.log('Removed', file, '- next start uses the seed data.'); } else console.log('No saved state at', file, '- already on seed data.');
