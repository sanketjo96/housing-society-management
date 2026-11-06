import { Avatar, Fragment, Icon, Logo, PERSONAS, TODAY, firstName, flatSummary, fmtDate, getIntent, html, inr, nowTime, on, personaName, shortDate, useEffect, useRef, useState } from '../core.js';
import { PrdTag, Receipt, ResetButton, Sheet, Toggle } from '../ui.js';
import { setRoute } from '../route.js';
import { BookSheet } from '../features/amenities.js';
import { ComplaintSheet } from '../features/complaints.js';
import { CreditSheet, PaySheet } from '../features/payments.js';
import { MyDetails } from '../features/flats.js';
import { PASS_TYPES, PassSheet, PassView, VPhoto } from '../features/gate.js';

const TAB_LIST = [['home', 'Home', 'grid'], ['passbook', 'Passbook', 'receipt'], ['requests', 'Requests', 'wrench'], ['gate', 'Gate pass', 'shield'], ['profile', 'Profile', 'user']];
// Requests holds complaints and bookings; Gate pass needs the gate feature.
const tabOn = (k) => (k === 'requests' ? on('complaints') || on('amenities') : k === 'gate' ? on('gate') : true);
function ResidentApp({ db, update, persona, onLogout, onReset, toast, onSwitch, screen, sub, seq, labels }) {
  const TABS = TAB_LIST.map(([k]) => k).filter(tabOn);
  const [tab, setTab] = useState(() => (TABS.includes(screen) ? screen : 'home'));
  const [sheet, setSheet] = useState(null);
  const [filter, setFilter] = useState('all');
  const [reqTab, setReqTab] = useState(() => ((screen === 'requests' && sub === 'bookings' && on('amenities')) || !on('complaints') ? 'bookings' : 'complaints'));
  // The URL follows the tab (#owner/passbook), and a changed link moves the tab.
  const bookingsOpen = tab === 'requests' && reqTab === 'bookings';
  useEffect(() => { setRoute(persona.key, tab, bookingsOpen ? 'bookings' : null); }, [tab, bookingsOpen]);
  useEffect(() => { if (TABS.includes(screen) && screen !== tab) setTab(screen); if (screen === 'requests') setReqTab((sub === 'bookings' && on('amenities')) || !on('complaints') ? 'bookings' : 'complaints'); }, [screen, sub, seq]);
  const bodyRef = useRef(null);
  const fl = db.flats.find((f) => f.id === persona.flat);
  useEffect(() => { update('recordLogin', (d) => { const x = d.flats.find((f) => f.id === persona.flat); x.lastLogin = TODAY; }); }, []);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [tab]);
  const sum = flatSummary(db, fl.id);
  const intent = getIntent(db, fl.id);
  const rows = db.ledger.filter((r) => r.flat === fl.id).sort((a, b) => b.date.localeCompare(a.date) || (a.type === 'SYSTEM' ? 1 : -1));
  const pending = rows.filter((r) => r.status === 'pending');
  const lastPay = rows.find((r) => r.type !== 'SYSTEM');
  const reads = (db.noticeReads.find((x) => x.id === persona.key) || { ids: [] }).ids;
  const notices = [...(on('notices') ? db.notices : [])].filter((n) => n.audience === 'Everyone' || (n.audience === 'Owners' && persona.key === 'owner') || (n.audience === 'Tenants' && persona.key === 'tenant')).sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
  const myComplaints = db.complaints.filter((c) => c.flat === fl.id);
  const myBookings = (on('amenities') ? db.bookings : []).filter((b) => b.flat === fl.id).sort((a, b) => a.date.localeCompare(b.date));
  const passes = (on('gate') ? db.gatePasses : []).filter((p) => p.flat === fl.id);
  const first = persona.name.split(' ')[0];
  const close = () => setSheet(null);
  const openNotice = (n) => { setSheet({ kind: 'notice', id: n.id }); if (!reads.includes(n.id)) update('markNoticeRead', (d) => { const nr = d.noticeReads.find((x) => x.id === persona.key); if (nr) nr.ids.push(n.id); else d.noticeReads.push({ id: persona.key, ids: [n.id] }); d.notices.find((x) => x.id === n.id).reads += 1; }); };
  const sp = { db, fl, persona, update, toast, onClose: close };
  const TITLES = { home: null, passbook: 'Passbook', requests: 'Requests', gate: 'Gate passes', profile: 'Profile' };

  const PayCard = html`<div className="pay-card">
    <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}><span className="eyebrow" style=${{ color: 'var(--panel-muted)' }}>Payable now</span><span style=${{ fontSize: 11.5, color: 'var(--panel-muted)' }}>${inr(sum.rate)}/month · ${fl.occupancy === 'tenant' ? 'tenant rate' : 'owner rate'}</span></div>
    <span className="big" style=${{ position: 'relative', zIndex: 1 }}>${inr(sum.payable)}</span>
    <div className="split3" style=${{ position: 'relative', zIndex: 1 }}><span>Outstanding<b>${inr(sum.outstanding)}</b></span><span>Credit<b>${inr(sum.credit)}</b></span>${pending.length > 0 && html`<span>Under review<b>${inr(pending.reduce((s, r) => s + r.amount, 0))}</b></span>`}</div>
    ${intent ? html`<button className="btn brass" style=${{ position: 'relative', zIndex: 1, padding: 12 }} onClick=${() => setSheet({ kind: 'pay' })}><${Icon} n="upload" s=${16} />Upload payment proof</button>`
      : html`<button className="btn brass" style=${{ position: 'relative', zIndex: 1, padding: 12 }} disabled=${!sum.payable} onClick=${() => setSheet({ kind: 'pay' })}>${sum.payable ? 'Pay ' + inr(sum.payable) : 'All settled'}</button>`}
  </div>`;

  const LedgerRow = (r) => { const sys = r.type === 'SYSTEM'; const label = sys ? r.note : r.type === 'CREDIT' ? r.note : 'Payment · ' + r.mode;
    const clickable = r.receiptNo; const Tag = clickable ? 'button' : 'div';
    return html`<${Tag} key=${r.id} className=${'li tint-' + r.type} onClick=${clickable ? () => setSheet({ kind: 'receipt', no: r.receiptNo }) : undefined}>
      <div className="tx"><b>${label}</b><span>${fmtDate(r.date)} · ${r.payer}</span>
        <span style=${{ marginTop: 5, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><span className=${'tag ' + r.type}>${r.type}</span>${!sys && html`<span className=${'pill ' + r.status}>${r.status[0].toUpperCase() + r.status.slice(1)}</span>`}${clickable && html`<span style=${{ color: 'var(--teal)', fontWeight: 600, fontSize: 11.5 }}>Receipt ›</span>`}</span>
        ${r.status === 'rejected' && html`<span style=${{ color: 'var(--coral)', marginTop: 4 }}>${r.rejectReason}</span>`}</div>
      <b className="num" style=${{ fontSize: 14, color: sys ? 'var(--ink)' : r.status === 'approved' ? 'var(--teal)' : 'var(--muted)', textDecoration: r.status === 'rejected' ? 'line-through' : 'none' }}>${sys ? '' : '−'}${inr(r.amount)}</b>
    <//>`; };

  let body;
  if (tab === 'home') body = html`<${Fragment}>
    ${PayCard}
    ${intent && html`<div className="banner warn"><${Icon} n="clock" s=${17} style=${{ flex: 'none', marginTop: 1 }} /><div><b>Payment started in ${intent.app}</b>Upload the screenshot so the treasurer can approve it. ${intent.by !== persona.name ? `Started by ${intent.by}.` : ''}</div></div>`}
    ${(on('gate') ? db.visitors : []).filter((v) => v.flat === fl.id && v.status === 'waiting').map((v) => html`<div key=${v.id} className="visitor-ask">
      <div style=${{ display: 'flex', gap: 10, alignItems: 'center' }}><${VPhoto} v=${v} size=${48} /><div style=${{ flex: 1, minWidth: 0 }}><span className="eyebrow" style=${{ color: 'var(--brass)' }}>At the main gate · ${v.requestedAt}</span><b style=${{ display: 'block', fontSize: 15 }}>${v.name}</b><span className="muted" style=${{ fontSize: 12 }}>${v.type}${v.purpose && v.purpose !== v.type ? ' · ' + v.purpose : ''}${v.vehicle ? ' · ' + v.vehicle : ''}</span></div></div>
      <div style=${{ display: 'flex', gap: 8 }}><button className="btn danger" style=${{ flex: 1 }} onClick=${() => { update('denyVisitor', (d) => { const x = d.visitors.find((y) => y.id === v.id); x.status = 'denied'; x.via = 'Denied by ' + persona.name; }); toast('Guard told not to let them in'); }}>Deny</button>
        <button className="btn primary" style=${{ flex: 1 }} onClick=${() => { update('allowVisitor', (d) => { const x = d.visitors.find((y) => y.id === v.id); x.status = 'inside'; x.inAt = nowTime(); x.via = 'Approved by ' + persona.name; }); toast(`${v.name} allowed in`); }}>Allow</button></div></div>`)}
    ${lastPay && lastPay.status === 'rejected' && html`<div className="banner bad"><${Icon} n="alert" s=${17} style=${{ flex: 'none', marginTop: 1 }} /><div><b>Payment of ${inr(lastPay.amount)} was rejected</b>${lastPay.rejectReason}</div></div>`}
    ${lastPay && lastPay.status === 'approved' && lastPay.reviewedOn === TODAY && html`<button className="banner ok" style=${{ border: 'none', textAlign: 'left', width: '100%' }} onClick=${() => setSheet({ kind: 'receipt', no: lastPay.receiptNo })}><${Icon} n="check" s=${17} style=${{ flex: 'none', marginTop: 1, color: 'var(--teal)' }} /><div><b>Payment approved</b>Receipt ${lastPay.receiptNo} is ready. Tap to view.</div></button>`}
    <div className="tiles">
      <button onClick=${() => setSheet({ kind: 'credit' })}><span className="ti" style=${{ color: 'var(--brass)' }}><${Icon} n="wallet" s=${21} /></span>Add credit${labels && html`<${PrdTag} id="resident/tile/credit" compact />`}</button>
      ${on('complaints') && html`<button onClick=${() => setSheet({ kind: 'complaint' })}><span className="ti" style=${{ color: 'var(--coral)' }}><${Icon} n="wrench" s=${21} /></span>Complaint${labels && html`<${PrdTag} id="resident/tile/complaint" compact />`}</button>`}
      ${on('amenities') && html`<button onClick=${() => setSheet({ kind: 'book' })}><span className="ti" style=${{ color: 'var(--teal)' }}><${Icon} n="calendar" s=${21} /></span>Book${labels && html`<${PrdTag} id="resident/tile/book" compact />`}</button>`}
      ${on('gate') && html`<button onClick=${() => setSheet({ kind: 'newpass' })}><span className="ti" style=${{ color: 'var(--blue)' }}><${Icon} n="shield" s=${21} /></span>Gate pass${labels && html`<${PrdTag} id="resident/tile/newpass" compact />`}</button>`}
    </div>
    ${on('notices') && html`<${Fragment}><div className="sec-title"><b>Notices</b><span className="muted" style=${{ fontSize: 12 }}>${notices.filter((n) => !reads.includes(n.id)).length} unread</span></div>
    <div className="list">${notices.slice(0, 4).map((n) => html`<button key=${n.id} className="li" onClick=${() => openNotice(n)}>${n.pinned ? html`<span style=${{ color: 'var(--brass)' }}><${Icon} n="pin" s=${16} /></span>` : html`<span style=${{ color: 'var(--muted)' }}><${Icon} n="megaphone" s=${16} /></span>`}<div className="tx"><b>${n.title}</b><span>${fmtDate(n.date)}</span></div>${!reads.includes(n.id) && html`<span className="dot" aria-label="Unread"></span>`}</button>`)}</div><//>`}
    ${(myBookings.some((b) => b.date >= TODAY && b.status !== 'declined') || passes.some((p) => p.status === 'active')) && html`<${Fragment}><div className="sec-title"><b>Coming up</b></div>
      <div className="list">
        ${passes.filter((p) => p.status === 'active').slice(0, 2).map((p) => html`<button key=${p.id} className="li" onClick=${() => setSheet({ kind: 'pass', id: p.id })}><span style=${{ color: 'var(--blue)' }}><${Icon} n="shield" s=${16} /></span><div className="tx"><b>${p.visitor}</b><span>Gate pass · ${shortDate(p.date)} · code ${p.code}</span></div><${Icon} n="chev" s=${15} /></button>`)}
        ${myBookings.filter((b) => b.date >= TODAY && b.status !== 'declined').map((b) => html`<button key=${b.id} className="li" onClick=${() => { setTab('requests'); setReqTab('bookings'); }}><span style=${{ color: 'var(--teal)' }}><${Icon} n="calendar" s=${16} /></span><div className="tx"><b>${db.amenities.find((a) => a.id === b.amenity).name}</b><span>${shortDate(b.date)} · ${b.slot}</span></div><span className=${'pill ' + b.status}>${b.status === 'requested' ? 'Requested' : 'Confirmed'}</span></button>`)}
      </div><//>`}
  <//>`;
  else if (tab === 'passbook') {
    const list = rows.filter((r) => filter === 'all' || r.type === filter);
    body = html`<${Fragment}>
      <div className="amt3"><div><span className="eyebrow">Outstanding</span><b>${inr(sum.outstanding)}</b></div><div><span className="eyebrow">Credit</span><b style=${{ color: 'var(--brass)' }}>${inr(sum.credit)}</b></div><div className="hi"><span className="eyebrow">Payable</span><b>${inr(sum.payable)}</b></div></div>
      <div style=${{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style=${{ flex: 1 }} disabled=${!sum.payable && !intent} onClick=${() => setSheet({ kind: 'pay' })}>${intent ? 'Upload proof' : sum.payable ? 'Pay ' + inr(sum.payable) : 'All settled'}</button>
        <button className="btn" style=${{ flex: 1 }} onClick=${() => setSheet({ kind: 'credit' })}><${Icon} n="plus" s=${15} />Add credit</button></div>
      <div className="chips">${[['all', 'All'], ['SYSTEM', 'Charges'], ['DEPOSIT', 'Payments'], ['CREDIT', 'Credits']].map(([k, l]) => html`<button key=${k} className=${'chip' + (filter === k ? ' on' : '')} onClick=${() => setFilter(k)}>${l}</button>`)}</div>
      <div className="list">${list.map(LedgerRow)}</div>
      <p className="muted" style=${{ fontSize: 11.5, margin: 0, textAlign: 'center' }}>Only approved payments and credits count toward your balance. ${fl.occupancy === 'tenant' ? 'Owner and tenant see the same passbook.' : ''}</p>
    <//>`;
  } else if (tab === 'requests') body = html`<${Fragment}>
    ${on('complaints') && on('amenities') && html`<div className="seg"><button className=${reqTab === 'complaints' ? 'on' : ''} onClick=${() => setReqTab('complaints')}>Complaints</button><button className=${reqTab === 'bookings' ? 'on' : ''} onClick=${() => setReqTab('bookings')}>Amenity bookings</button></div>`}
    ${reqTab === 'complaints' ? html`<${Fragment}>
      <button className="btn primary" onClick=${() => setSheet({ kind: 'complaint' })}><${Icon} n="plus" s=${16} />Raise a complaint</button>
      ${myComplaints.length ? html`<div className="list">${myComplaints.map((c) => html`<div key=${c.id} className="li" style=${{ alignItems: 'flex-start' }}><div className="tx"><b>${c.title}</b><span>${c.id} · ${c.category} · ${fmtDate(c.date)}</span>
        ${c.notes.length > 0 && html`<span style=${{ marginTop: 6, color: 'var(--ink-2)', background: 'var(--surface-2)', borderRadius: 8, padding: '6px 9px' }}>${c.notes[c.notes.length - 1]}</span>`}</div>
        <span className=${'pill ' + c.status}>${{ open: 'Open', progress: 'In progress', resolved: 'Resolved' }[c.status]}</span></div>`)}</div>`
      : html`<div className="empty">No complaints from your flat.</div>`}<//>`
    : html`<${Fragment}>
      <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>${db.amenities.map((a) => html`<button key=${a.id} className="card" style=${{ padding: 12, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }} onClick=${() => setSheet({ kind: 'book', amenity: a.id })}><span style=${{ color: 'var(--teal)' }}><${Icon} n="calendar" s=${18} /></span><b style=${{ fontSize: 12.5 }}>${a.name}</b><span className="muted" style=${{ fontSize: 11 }}>${a.fee ? inr(a.fee) : 'Free'}</span></button>`)}</div>
      ${myBookings.length ? html`<div className="list">${myBookings.map((b) => html`<div key=${b.id} className="li"><div className="tx"><b>${db.amenities.find((a) => a.id === b.amenity).name} · ${shortDate(b.date)}</b><span>${b.slot} · ${b.purpose}</span>${b.reason && html`<span style=${{ color: 'var(--coral)' }}>${b.reason}</span>`}</div><span className=${'pill ' + b.status}>${{ requested: 'Requested', confirmed: 'Confirmed', declined: 'Declined' }[b.status]}</span></div>`)}</div>`
      : html`<div className="empty">No bookings yet. Pick an amenity above.</div>`}<//>`}
  <//>`;
  else if (tab === 'gate') body = html`<${Fragment}>
    <button className="btn primary" onClick=${() => setSheet({ kind: 'newpass' })}><${Icon} n="plus" s=${16} />Create gate pass</button>
    ${passes.map((p) => html`<button key=${p.id} className="pass" style=${{ textAlign: 'left', padding: 0, opacity: p.status === 'active' ? 1 : 0.72 }} onClick=${() => setSheet({ kind: 'pass', id: p.id })}>
      <div className="top"><span className="ic" style=${{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--blue-soft)', color: 'var(--blue)', flex: 'none' }}><${Icon} n=${PASS_TYPES[p.type]} s=${18} /></span>
        <div style=${{ flex: 1, minWidth: 0 }}><b style=${{ display: 'block', fontSize: 14 }}>${p.visitor}</b><span className="muted" style=${{ fontSize: 12 }}>${p.type} · ${fmtDate(p.date)}</span></div>
        <span className="num" style=${{ fontSize: 17, fontWeight: 600, letterSpacing: '.12em' }}>${p.code}</span></div>
      <div className="cut"></div>
      <div className="bot"><span>${p.window}</span><span className=${'pill ' + (p.status === 'active' ? 'approved' : p.status === 'used' ? 'sent' : 'rejected')}>${p.status === 'active' ? 'Active' : p.status === 'used' ? 'Used ' + p.usedAt : 'Cancelled'}</span></div>
    </button>`)}
    <p className="muted" style=${{ fontSize: 11.5, margin: 0, textAlign: 'center' }}>The guard verifies passes from the guard app at the main gate.</p>
  <//>`;
  else body = html`<${Fragment}>
    <div style=${{ display: 'flex', gap: 12, alignItems: 'center' }}><${Avatar} name=${persona.name} size=${48} /><div><b style=${{ fontSize: 16 }}>${persona.name}</b><div className="muted" style=${{ fontSize: 12.5 }}>${persona.role}</div></div></div>
    <div className="card card-pad" style=${{ padding: 16 }}><${MyDetails} key=${JSON.stringify(fl.owner) + fl.occupancy} db=${db} fl=${fl} persona=${persona} update=${update} toast=${toast} /></div>
    <div className="card card-pad" style=${{ padding: '4px 16px' }}>
      <div className="row-set"><div><b>WhatsApp updates</b><span>Bills, receipts and complaint updates</span></div><${Toggle} on=${true} label="WhatsApp updates" onChange=${() => toast('Preference saved')} /></div>
      <div className="row-set"><div><b>Email copy</b><span>${persona.key === 'tenant' ? fl.tenant && fl.tenant.email : fl.owner.email}</span></div><${Toggle} on=${true} label="Email copy" onChange=${() => toast('Preference saved')} /></div>
    </div>
    <button className="btn danger" onClick=${onLogout}><${Icon} n="logout" s=${16} />Log out</button>
  <//>`;

  const notice = sheet && sheet.kind === 'notice' && db.notices.find((n) => n.id === sheet.id);
  const rcpt = sheet && sheet.kind === 'receipt' && db.receipts.find((r) => r.no === sheet.no);
  const pass = sheet && sheet.kind === 'pass' && db.gatePasses.find((p) => p.id === sheet.id);
  const others = PERSONAS.filter((p) => p.key !== persona.key);
  return html`<div className="res-stage">
    <div className="res-side">
      <div className="eyebrow">Resident app · Stage 2</div>
      <h1>${persona.name}</h1>
      <p className="muted" style=${{ margin: 0 }}>${persona.role}. ${!fl.tenant ? `${firstName(fl.owner.name)} owns ${fl.id} and lives there.` : persona.key === 'tenant' ? `${firstName(fl.tenant.name)} pays the tenant rate, and sees the same passbook as ${firstName(fl.owner.name)}, the owner.` : `${firstName(fl.owner.name)} owns ${fl.id} and has rented it to ${firstName(fl.tenant.name)}. Both see one passbook.`}</p>
      <div className="card card-pad" style=${{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b style=${{ fontFamily: 'var(--display)', fontWeight: 500, fontSize: 16 }}>Try the full payment loop</b>
        <ol><li>Tap <b>Pay</b>, pick a UPI app, then upload the sample screenshot.</li><li>Switch to ${firstName(personaName('admin', 'the admin'))} and approve it in Payment review.</li><li>Come back: the passbook updates and the receipt is ready.</li></ol>
      </div>
      <div className="eyebrow" style=${{ marginTop: 4 }}>Switch persona</div>
      <div className="switch-list">${others.map((p, i) => html`<button key=${p.key} onClick=${() => onSwitch(p.key)}><${Avatar} name=${p.name} i=${i} /><span style=${{ flex: 1 }}><b style=${{ display: 'block' }}>${p.name}</b><span className="muted" style=${{ fontSize: 11.5 }}>${p.dest}</span></span><${Icon} n="arrow" s=${14} /></button>`)}</div>
      <div className="actions"><button className="btn" onClick=${onLogout}><${Icon} n="logout" s=${16} />Log out</button><${ResetButton} onReset=${onReset} /></div>
    </div>
    <div className="device">
      <div className="statusbar"><span>9:41</span><span className="cam"></span><span style=${{ display: 'flex', gap: 4, alignItems: 'center' }}>5G <svg width="22" height="11" viewBox="0 0 22 11" aria-hidden="true"><rect x=".5" y=".5" width="18" height="10" rx="2.5" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="13" height="7" rx="1.3" fill="currentColor"/><rect x="19.5" y="3.5" width="2" height="4" rx="1" fill="currentColor" opacity=".5"/></svg></span></div>
      <div className="app-head">
        ${TITLES[tab] ? html`<div style=${{ flex: 1 }}><h2>${TITLES[tab]}</h2><div className="sub">Flat ${fl.id} · ${db.society.display || db.society.short}</div></div>`
          : html`<${Logo} s=${32} /><div style=${{ flex: 1, minWidth: 0 }}><h2 style=${{ fontSize: 19 }}>Hi ${first}</h2><div className="sub">Flat ${fl.id} · ${persona.key === 'tenant' ? 'Tenant' : 'Owner'}</div></div>`}
        <button className="icon-btn" aria-label="Profile" onClick=${() => setTab('profile')} style=${{ borderRadius: '50%', padding: 0, border: 'none' }}><${Avatar} name=${persona.name} size=${34} /></button>
      </div>
      <div className="app-body" ref=${bodyRef}>${labels && html`<div className="prd-strip"><${PrdTag} id=${'resident/' + tab + (bookingsOpen ? '/bookings' : '')} /></div>`}${body}</div>
      <nav className="tabbar" style=${TABS.length !== 5 ? { gridTemplateColumns: `repeat(${TABS.length}, 1fr)` } : null} aria-label="Resident">${TAB_LIST.filter(([k]) => tabOn(k)).map(([k, l, ic]) => html`<button key=${k} className=${tab === k ? 'on' : ''} onClick=${() => setTab(k)} aria-current=${tab === k ? 'page' : undefined}><${Icon} n=${ic} s=${20} />${l}</button>`)}</nav>
      ${sheet && sheet.kind === 'pay' && html`<${PaySheet} ...${sp} />`}
      ${sheet && sheet.kind === 'credit' && html`<${CreditSheet} ...${sp} />`}
      ${sheet && sheet.kind === 'complaint' && html`<${ComplaintSheet} ...${sp} />`}
      ${sheet && sheet.kind === 'book' && html`<${BookSheet} ...${sp} initial=${sheet.amenity} />`}
      ${sheet && sheet.kind === 'newpass' && html`<${PassSheet} ...${sp} onCreated=${(id) => { setTab('gate'); setSheet({ kind: 'pass', id }); }} />`}
      ${pass && html`<${PassView} db=${db} p=${pass} update=${update} toast=${toast} onClose=${close} />`}
      ${notice && html`<${Sheet} title=${notice.title} sub=${`${fmtDate(notice.date)} · ${notice.audience}`} onClose=${close}><p style=${{ margin: 0, lineHeight: 1.6 }}>${notice.body}</p><span className="muted" style=${{ fontSize: 12 }}>Posted by the managing committee</span><//>`}
      ${rcpt && html`<${Sheet} title=${'Receipt ' + rcpt.no} onClose=${close} foot=${html`<button className="btn" onClick=${() => toast('Receipt PDF saved (simulated in the demo)')}><${Icon} n="download" s=${15} />Save PDF</button>`}><${Receipt} r=${rcpt} db=${db} compact /><//>`}
    </div>
  </div>`;
}

export { ResidentApp };
