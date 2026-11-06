const { useState, useMemo, useEffect, useRef, Fragment } = React;
const html = htm.bind(React.createElement);

/* =============================== Icons =============================== */
const P = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  pin: '<path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
function Icon({ n, s = 18, w = 1.8, style }) {
  return html`<svg width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${w} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style=${style} dangerouslySetInnerHTML=${{ __html: P[n] || '' }}></svg>`;
}
function Logo({ s = 30 }) {
  return html`<svg width=${s} height=${s} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#22302B"/>
    <rect x="7" y="7" width="7.5" height="7.5" rx="1.6" fill="#2F6E64"/><rect x="17.5" y="7" width="7.5" height="7.5" rx="1.6" fill="#2F6E64"/>
    <rect x="7" y="17.5" width="7.5" height="7.5" rx="1.6" fill="#2F6E64"/><rect x="17.5" y="17.5" width="7.5" height="7.5" rx="1.6" fill="#B8863A"/>
    <rect x="16.5" y="16.5" width="9.5" height="9.5" rx="2.4" fill="none" stroke="#F1F4EE" stroke-width="1"/>
  </svg>`;
}

/* =============================== Helpers =============================== */
let TODAY = '2026-11-03'; // set from db.meta.today on load
const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d} ${MONTHS[+m - 1]} ${y}`; };
const shortDate = (iso) => { const [, m, d] = iso.split('-'); return `${+d} ${MONTHS[+m - 1]}`; };
const periodLabel = (p) => { const [y, m] = p.split('-'); return `${MONTHS[+m - 1]} ${y}`; };
const initials = (name) => name.split(' ').map((x) => x[0]).slice(0, 2).join('');
const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
function words(n) {
  n = Math.round(n);
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''));
  const three = (x) => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
  if (n === 0) return 'Zero';
  let s = '';
  const cr = Math.floor(n / 1e7); n %= 1e7; const l = Math.floor(n / 1e5); n %= 1e5; const t = Math.floor(n / 1000); n %= 1000;
  if (cr) s += two(cr) + ' Crore '; if (l) s += two(l) + ' Lakh '; if (t) s += two(t) + ' Thousand '; if (n) s += three(n);
  return s.trim();
}
const AV_TONES = [['var(--teal-soft)', 'var(--teal)'], ['var(--brass-soft)', 'var(--brass)'], ['var(--blue-soft)', 'var(--blue)'], ['var(--coral-soft)', 'var(--coral)']];
function Avatar({ name, i = 0, size }) {
  const t = AV_TONES[(name.charCodeAt(0) + name.length + i) % 4];
  return html`<span className="avatar" style=${{ background: t[0], color: t[1], ...(size ? { width: size, height: size } : {}) }}>${initials(name)}</span>`;
}

/* =============================== Derived =============================== */
function rateFor(fl, settings) { return fl.occupancy === 'tenant' ? Math.round(settings.baseRate * settings.tenantMultiplier) : settings.baseRate; }
const getIntent = (db, flatId) => db.intents.find((x) => x.id === flatId);
function flatSummary(db, flatId) {
  const rows = db.ledger.filter((r) => r.flat === flatId);
  const charged = rows.filter((r) => r.type === 'SYSTEM').reduce((s, r) => s + r.amount, 0);
  const paid = rows.filter((r) => r.type === 'DEPOSIT' && r.status === 'approved').reduce((s, r) => s + r.amount, 0);
  const credit = rows.filter((r) => r.type === 'CREDIT' && r.status === 'approved').reduce((s, r) => s + r.amount, 0);
  const outstanding = Math.max(0, charged - paid);
  const advance = Math.max(0, paid - charged);
  const creditBal = credit + advance;
  const payable = Math.max(0, outstanding - creditBal);
  const pending = rows.filter((r) => r.status === 'pending').length;
  const fl = db.flats.find((f) => f.id === flatId);
  const rate = fl ? rateFor(fl, db.settings) : 3000;
  const status = pending ? 'pending' : payable >= rate * 2 ? 'overdue' : payable > 0 ? 'due' : 'settled';
  return { outstanding, credit: creditBal, payable, pending, status, rate };
}
const STATUS_LABEL = { settled: 'Settled', pending: 'Pending review', overdue: 'Overdue', due: 'Due', none: 'Not billed' };

let PERSONAS = []; // demo users, loaded from the users collection
// TODAY and PERSONAS are reassigned when data loads. Other modules see the new
// values through ES module live bindings but can't assign them, so they use these.
const setToday = (v) => { TODAY = v; };
const setPersonas = (v) => { PERSONAS = v; };
const nowStamp = () => { const d = new Date(); return `${TODAY} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function unpaidPeriods(db, flatId) {
  const rows = db.ledger.filter((r) => r.flat === flatId);
  let cover = rows.filter((r) => (r.type === 'DEPOSIT' || r.type === 'CREDIT') && r.status === 'approved').reduce((s, r) => s + r.amount, 0);
  const out = [];
  rows.filter((r) => r.type === 'SYSTEM').sort((a, b) => a.date.localeCompare(b.date)).forEach((r) => { if (cover >= r.amount) cover -= r.amount; else { out.push(periodLabel(r.period)); cover = 0; } });
  return out;
}
const nowTime = () => { const d = new Date(); let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0'); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${m} ${ap}`; };

export { setToday, setPersonas, useState, useMemo, useEffect, useRef, Fragment, html, P, Icon, Logo, TODAY, inr, MONTHS, fmtDate, shortDate, periodLabel, initials, uid, daysBetween, words, AV_TONES, Avatar, rateFor, getIntent, flatSummary, STATUS_LABEL, PERSONAS, nowStamp, unpaidPeriods, nowTime };
