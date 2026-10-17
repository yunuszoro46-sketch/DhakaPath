// Node-only loader for the seed files. The offline preview bundle replaces this module with the
// same JSON inlined, so nothing else needs to know where the data comes from.
import { readFileSync } from 'node:fs';

export const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8'));
export const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
export const demoCache = JSON.parse(readFileSync(new URL('../data/demoCache.json', import.meta.url), 'utf8'));
