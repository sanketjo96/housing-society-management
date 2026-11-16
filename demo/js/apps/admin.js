import { Avatar, Fragment, Icon, Logo, fmtDate, html, on, useEffect, useState, wingsLabel } from '../core.js';
import { Modal, PrdTag, Receipt, ResetButton } from '../ui.js';
import { setRoute } from '../route.js';
import { Amenities } from '../features/amenities.js';
import { Billing } from '../features/billing.js';
import { Complaints } from '../features/complaints.js';
import { Dashboard } from '../features/dashboard.js';
import { Expenses } from '../features/expenses.js';
import { FlatDrawer, Flats } from '../features/flats.js';
import { Notices } from '../features/notices.js';
import { Notifications } from '../features/notifications.js';
import { Receipts } from '../features/receipts.js';
import { Review } from '../features/payments.js';
import { Settings } from '../features/settings.js';
import { Visitors } from '../features/gate.js';

/* =============================== Admin shell =============================== */
const NAV = [
  ['Overview', [['dashboard', 'Dashboard', 'grid']]],
  ['Collections', [['review', 'Payment review', 'inbox'], ['billing', 'Billing', 'zap'], ['receipts', 'Receipts', 'receipt'], ['flats', 'Flats & residents', 'building']]],
  ['Operations', [['expenses', 'Expenses', 'wallet'], ['complaints', 'Complaints', 'wrench'], ['amenities', 'Amenity booking', 'calendar'], ['visitors', 'Visitor log', 'shield']]],
  ['Communication', [['notices', 'Notices', 'megaphone'], ['notifications', 'Notifications', 'bell']]],
  ['Society', [['settings', 'Settings', 'sliders']]],
];
const NAV_FLAT = NAV.flatMap(([, items]) => items);
// Pages that belong to a feature a client preset can switch off.
const FEATURE_OF = { complaints: 'complaints', amenities: 'amenities', visitors: 'gate', notices: 'notices', notifications: 'notifications', expenses: 'expenses' };
const navOn = () => NAV.map(([g, items]) => [g, items.filter(([k]) => on(FEATURE_OF[k] || k))]).filter(([, items]) => items.length);
function AdminApp({ db, update, persona, onLogout, onReset, toast, screen, sub, seq, labels }) {
  const nav = navOn();
  const navFlat = nav.flatMap(([, items]) => items);
  const isPage = (p) => navFlat.some((n) => n[0] === p);
  const [page, setPage] = useState(() => (isPage(screen) ? screen : 'dashboard'));
  const [flatOpen, setFlatOpen] = useState(null);
  const [newFlat, setNewFlat] = useState(false);
  const [receiptNo, setReceiptNo] = useState(null);
  const go = (p) => { setPage(p); window.scrollTo(0, 0); };
  // The URL follows the page (#admin/billing), and a changed link moves the page.
  useEffect(() => { setRoute(persona.key, page); }, [page]);
  useEffect(() => { if (isPage(screen) && screen !== page) setPage(screen); }, [screen, seq]);
  const pendingCount = db.ledger.filter((r) => r.status === 'pending').length;
  const openCount = db.complaints.filter((c) => c.status === 'open').length;
  const counts = { review: pendingCount, complaints: openCount, amenities: db.bookings.filter((b) => b.status === 'requested').length };
  // focus: the third part of a link (#admin/review/<entry id>) picks an item on the page.
  const props = { db, update, toast, go, openFlat: setFlatOpen, setNewFlat, openReceipt: setReceiptNo, focus: screen === page ? sub : null, seq };
  const Page = { dashboard: Dashboard, flats: Flats, billing: Billing, review: Review, receipts: Receipts, expenses: Expenses, complaints: Complaints, notices: Notices, amenities: Amenities, notifications: Notifications, settings: Settings, visitors: Visitors }[page];
  const label = navFlat.find((n) => n[0] === page)[1];
  const rcpt = receiptNo && db.receipts.find((r) => r.no === receiptNo);
  return html`<div className="shell">
    <aside className="side">
      <div className="brand"><${Logo} s=${30} /><span className="brand-name">Saral Society</span></div>
      <div className="soc"><b>${db.society.display || db.society.short}</b><span>${wingsLabel(db.flats)} · ${db.flats.length} flats${db.society.locality ? ' · ' + db.society.locality : ''}</span></div>
      <nav className="nav" aria-label="Admin">${nav.map(([g, items]) => html`<${Fragment} key=${g}><div className="nav-group">${g}</div>
        ${items.map(([k, l, ic]) => html`<button key=${k} className=${page === k ? 'on' : ''} onClick=${() => go(k)} aria-current=${page === k ? 'page' : undefined}><${Icon} n=${ic} s=${17} />${l}${labels && html`<${PrdTag} id=${'admin/' + k} compact />`}${counts[k] ? html`<span className="count">${counts[k]}</span>` : null}</button>`)}<//>`)}</nav>
      <div style=${{ marginTop: 'auto', fontSize: 11, color: 'var(--panel-muted)', padding: '0 10px' }}>Demo build · Stages 1–3<br/>Designed by Sanket Joshi</div>
    </aside>
    <div className="main">
      <div className="mobile-nav">${navFlat.map(([k, l, ic]) => html`<button key=${k} className=${page === k ? 'on' : ''} onClick=${() => go(k)}><${Icon} n=${ic} s=${14} />${l}${counts[k] ? ' · ' + counts[k] : ''}</button>`)}</div>
      <header className="topbar">
        <span className="crumb">Admin · <b>${label}</b>${labels && html` <${PrdTag} id=${'admin/' + page} />`}</span>
        <div className="me"><${ResetButton} onReset=${onReset} />
          <div className="who"><b>${persona.name}</b><span>${persona.role}</span></div><${Avatar} name=${persona.name} />
          <button className="icon-btn" onClick=${onLogout} title="Log out" aria-label="Log out"><${Icon} n="logout" s=${16} /></button></div>
      </header>
      <main className="content"><${Page} key=${page} ...${props} /></main>
    </div>
    ${flatOpen && html`<${FlatDrawer} key=${flatOpen} db=${db} flatId=${flatOpen} update=${update} toast=${toast} onClose=${() => setFlatOpen(null)} />`}
    ${newFlat && html`<${FlatDrawer} db=${db} isNew update=${update} toast=${toast} onClose=${() => setNewFlat(false)} />`}
    ${rcpt && html`<${Modal} wide title=${'Receipt ' + rcpt.no} sub=${`Issued ${fmtDate(rcpt.date)} to ${rcpt.payer}, ${rcpt.flat}`} onClose=${() => setReceiptNo(null)}
      foot=${html`<button className="btn" onClick=${() => toast('Receipt PDF downloaded (simulated in the demo)')}><${Icon} n="download" s=${15} />PDF</button><button className="btn primary" onClick=${() => { toast(`Resent to ${rcpt.payer} on WhatsApp`); setReceiptNo(null); }}><${Icon} n="chat" s=${15} />Resend on WhatsApp</button>`}>
      <${Receipt} r=${rcpt} db=${db} /><//>`}
  </div>`;
}

/* =============================== Resident app (Stage 2) =============================== */

export { NAV, NAV_FLAT, AdminApp };
