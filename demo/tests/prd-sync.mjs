// Checks that the demo's PRD labels (js/prd.js) agree with docs/product/prd.md,
// so a status changed in one place can't silently drift from the other.
// No browser needed.  Usage: node prd-sync.mjs
import fs from 'node:fs';
import { STATUS, SECTIONS, SCREENS } from '../js/prd.js';

const repo = new URL('../../', import.meta.url);
const prd = fs.readFileSync(new URL('docs/product/prd.md', repo), 'utf8');
const results = [];
const check = (name, ok, extra = '') => results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));

// "### 7.12 Complaints — Designed, with 2026-11-03 changes" → { title, status text }
const headings = {};
for (const m of prd.matchAll(/^### (7\.\d+) (.+?) — (.+)$/gm)) headings[m[1]] = { title: m[2].trim(), status: m[3].trim() };
check('PRD has §7 headings', Object.keys(headings).length > 0);

// Longest label first, so "Partly built" isn't read as "Built".
const labels = Object.entries(STATUS).sort((a, b) => b[1].length - a[1].length);
const statusOf = (text) => (labels.find(([, l]) => text.toLowerCase().startsWith(l.toLowerCase())) || [])[0];

for (const [id, [title, status]] of Object.entries(SECTIONS)) {
  const h = headings[id];
  if (!h) { check(`§${id} exists in the PRD`, false, `prd.js has "${title}"`); continue; }
  check(`§${id} title matches`, h.title === title, `PRD "${h.title}" · prd.js "${title}"`);
  check(`§${id} status matches`, statusOf(h.status) === status, `PRD "${h.status}" · prd.js "${STATUS[status]}"`);
}
for (const [screen, id] of Object.entries(SCREENS)) if (!SECTIONS[id]) check(`screen ${screen} points at a known section`, false, `§${id}`);

// Demo links in the PRD (…/demo/#owner/passbook) must open a screen the demo knows.
const persona = { admin: 'admin', owner: 'resident', tenant: 'resident', guard: 'guard' };
const links = [...prd.matchAll(/\/demo\/(?:\?[^#)\s]*)?#([a-z]+)\/([a-z]+)(?:\/([a-z]+))?/g)];
check('PRD links to demo screens', links.length > 0);
for (const [, who, screen, sub] of links) {
  const id = persona[who] && [persona[who], screen, sub].filter(Boolean).join('/');
  check(`PRD link #${[who, screen, sub].filter(Boolean).join('/')} opens a known screen`, !!(id && SCREENS[id]));
}

// Client presets may only override sections and statuses that exist.
const dir = new URL('../clients/', import.meta.url);
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  const preset = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
  for (const [id, o] of Object.entries(preset.prd || {})) check(`${f}: override §${id} is valid`, !!SECTIONS[id] && !!STATUS[o.status], `status "${o.status}"`);
}

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(failed.length ? failed.join('\n') : `PASS ${results.length} checks: prd.js matches docs/product/prd.md`);
process.exit(failed.length ? 1 : 0);
