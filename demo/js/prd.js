/* Which PRD section each screen demonstrates, and that section's status.
 *
 * Source of truth: docs/product/prd.md §7 (section headings carry the status).
 * When a section's status changes there, change it here too. A client preset
 * (clients/*.json, "prd") can override a section for that client, e.g. mark a
 * feature "requested" while it is being agreed.
 *
 * Screen ids match the URL: #admin/billing → 'admin/billing'. Owner and tenant
 * share the 'resident/…' ids.
 */
const STATUS = {
  built: 'Built',
  partly: 'Partly built',
  designed: 'Designed',
  new: 'New',
  requested: 'Requested',
};

const SECTIONS = {
  '7.2': ['Flats and residents', 'built'],
  '7.3': ['Maintenance billing', 'built'],
  '7.4': ['Passbook and balances', 'built'],
  '7.5': ['Payments and collections', 'built'],
  '7.6': ['Receipts', 'built'],
  '7.7': ['Admin dashboard', 'built'],
  '7.9': ['Society income and expenses', 'built'],
  '7.11': ['Notifications', 'partly'],
  '7.12': ['Complaints', 'designed'],
  '7.13': ['Notices', 'new'],
  '7.14': ['Amenity booking', 'new'],
  '7.15': ['Gate passes and visitor management', 'new'],
};

const SCREENS = {
  'admin/dashboard': '7.7',
  'admin/review': '7.5',
  'admin/billing': '7.3',
  'admin/receipts': '7.6',
  'admin/flats': '7.2',
  'admin/expenses': '7.9',
  'admin/complaints': '7.12',
  'admin/amenities': '7.14',
  'admin/visitors': '7.15',
  'admin/notices': '7.13',
  'admin/notifications': '7.11',
  'admin/settings': '7.6',
  'resident/home': '7.4',
  'resident/passbook': '7.4',
  'resident/requests': '7.12',
  'resident/requests/bookings': '7.14',
  'resident/gate': '7.15',
  'resident/profile': '7.2',
  'resident/tile/credit': '7.5',
  'resident/tile/complaint': '7.12',
  'resident/tile/book': '7.14',
  'resident/tile/newpass': '7.15',
  'guard/gate': '7.15',
  'guard/verify': '7.15',
  'guard/log': '7.15',
  'guard/flats': '7.15',
};

// Per-client overrides: { '7.13': { status: 'requested', note: 'Asked for in the 12 Nov call' } }
let OVERRIDES = {};
const setPrdOverrides = (o) => { OVERRIDES = o || {}; };

// → { section, title, status, label, note } or null if the screen isn't mapped.
function prdFor(screenId) {
  const section = SCREENS[screenId];
  if (!section || !SECTIONS[section]) return null;
  const [title, base] = SECTIONS[section];
  const o = OVERRIDES[section] || {};
  const status = STATUS[o.status] ? o.status : base;
  return { section, title, status, label: STATUS[status], note: o.note || '' };
}

// Labels on/off: ?labels=1 or ?labels=0 in the URL wins and is remembered;
// otherwise the last choice in this browser; otherwise on.
const LABELS_KEY = 'saral-demo:labels';
function labelsInitial() {
  let q = null;
  try { q = new URLSearchParams(location.search).get('labels'); } catch (e) { /* no URL */ }
  if (q === '0' || q === '1') { saveLabels(q === '1'); return q === '1'; }
  try { const v = localStorage.getItem(LABELS_KEY); if (v === '0' || v === '1') return v === '1'; } catch (e) { /* storage blocked */ }
  return true;
}
function saveLabels(on) { try { localStorage.setItem(LABELS_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked */ } }

export { STATUS, SECTIONS, SCREENS, prdFor, setPrdOverrides, labelsInitial, saveLabels };
