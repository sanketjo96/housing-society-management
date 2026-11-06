import { Fragment, html, useState } from '../core.js';
import { Modal, PageHead, Toggle } from '../ui.js';

/* =============================== Admin: Notifications =============================== */
const TEMPLATES = {
  monthly_bill: 'Monthly bill', dues_overdue: 'Overdue reminder', payment_received: 'Payment receipt', payment_rejected: 'Payment rejected',
  notice_published: 'Notice', complaint_update: 'Complaint update', complaint_resolved: 'Complaint resolved', booking_confirmed: 'Booking confirmed', booking_declined: 'Booking declined',
};
function Notifications({ db, update, toast }) {
  const s = db.settings;
  const set = (k, v) => update('updateNotificationSetting', (d) => { d.settings[k] = v; });
  const [buy, setBuy] = useState(null);
  const packs = [{ c: 500, p: 299 }, { c: 2000, p: 999 }, { c: 6000, p: 2499 }];
  const used = db.messages.reduce((t, m) => t + (m.status === 'failed' ? 0 : m.count || 1), 0);
  return html`<${Fragment}>
    <${PageHead} eyebrow="Communication" title="Notifications" sub="WhatsApp reminders run on prepaid credits. One message to one resident uses one credit; failed messages are refunded." />
    <div className="split" style=${{ '--cols': 'minmax(0, 1fr) minmax(0, 1fr)' }}>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="metric hero" style=${{ padding: 22 }}><span className="eyebrow">WhatsApp credits</span><span className="val" style=${{ fontSize: 40 }}>${db.meta.credits}</span><span className="sub">About ${Math.floor(db.meta.credits / 30)} months of reminders at your current usage · ${used} used since August</span>
          <div style=${{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>${packs.map((p) => html`<button key=${p.c} className="btn sm" style=${{ background: 'var(--panel-2)', borderColor: 'var(--panel-line)', color: 'var(--panel-fg)' }} onClick=${() => setBuy(p)}>${p.c.toLocaleString('en-IN')} credits · ₹${p.p.toLocaleString('en-IN')}</button>`)}</div></div>
        <div className="card card-pad">
          <h2 style=${{ fontSize: 18, marginBottom: 6 }}>Automatic messages</h2>
          <div className="row-set"><div><b>Monthly bill</b><span>On the ${s.reminderDay}th, to whoever pays for the flat</span></div><${Toggle} on=${s.autoMonthly} label="Monthly bill" onChange=${(v) => set('autoMonthly', v)} /></div>
          <div className="row-set"><div><b>Overdue reminder</b><span>${s.overdueAfter} days after the due date, then weekly</span></div><${Toggle} on=${s.autoOverdue} label="Overdue reminder" onChange=${(v) => set('autoOverdue', v)} /></div>
          <div className="row-set"><div><b>Receipt on approval</b><span>PDF receipt sent as soon as you approve</span></div><${Toggle} on=${s.autoReceipt} label="Receipt on approval" onChange=${(v) => set('autoReceipt', v)} /></div>
          <div className="row-set"><div><b>Email copy</b><span>Also send every message by email (free)</span></div><${Toggle} on=${s.emailCopy} label="Email copy" onChange=${(v) => set('emailCopy', v)} /></div>
          <p className="muted" style=${{ fontSize: 12, margin: '10px 0 0' }}>If credits run out, messages wait in a queue and go out after the next top-up. Nothing is dropped.</p>
        </div>
      </div>
      <div className="card card-pad" style=${{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style=${{ fontSize: 18 }}>Overdue reminder</h2><span className="tag">UTILITY TEMPLATE</span></div>
        <div className="wa"><div className="bubble"><b>${db.society.short}</b><br/>Hello Arjun, maintenance for flat <b>A-302</b> is overdue.<br/><br/>Amount payable: <b>₹9,000</b><br/>Covers: Sep 2026, Oct 2026<br/><br/>Pay by UPI and upload the screenshot in the app.<small>10:00 am</small><div className="btns">Open passbook</div></div></div>
        <p className="muted" style=${{ fontSize: 12.5, margin: 0 }}>Templates are approved by Meta. Name, flat, amount and months are filled in from the passbook for each resident.</p>
      </div>
    </div>
    <div className="card"><div className="card-head"><h2>Delivery log</h2></div>
      <div className="table-wrap"><table className="t"><thead><tr><th>Sent</th><th>To</th><th>Message</th><th className="r">Credits</th><th>Status</th></tr></thead>
        <tbody>${db.messages.map((m) => html`<tr key=${m.id}><td className="num muted" style=${{ fontSize: 12.5 }}>${m.at}</td><td>${m.to}</td><td>${TEMPLATES[m.template]}${m.note && html`<small style=${{ display: 'block', color: 'var(--muted)', fontSize: 11.5 }}>${m.note}</small>`}</td><td className="r num">${m.status === 'failed' ? '0' : m.count || 1}</td><td><span className=${'pill ' + m.status}>${m.status[0].toUpperCase() + m.status.slice(1)}</span></td></tr>`)}</tbody></table></div></div>
    ${buy && html`<${Modal} title="Buy WhatsApp credits" sub="Paid through a Razorpay payment link. Credits are added the moment payment succeeds." onClose=${() => setBuy(null)}
      foot=${html`<button className="btn" onClick=${() => setBuy(null)}>Cancel</button><button className="btn primary" onClick=${() => { update('buyCredits', (d) => { d.meta.credits += buy.c; }); toast(`${buy.c.toLocaleString('en-IN')} credits added`); setBuy(null); }}>Pay ₹${buy.p.toLocaleString('en-IN')} (simulated)</button>`}>
      <dl className="kv-list" style=${{ margin: 0 }}><dt>Pack</dt><dd>${buy.c.toLocaleString('en-IN')} credits</dd><dt>Price</dt><dd className="num">₹${buy.p.toLocaleString('en-IN')} incl. GST</dd><dt>Per message</dt><dd className="num">₹${(buy.p / buy.c).toFixed(2)}</dd><dt>Balance after</dt><dd className="num">${(db.meta.credits + buy.c).toLocaleString('en-IN')}</dd></dl>
    <//>`}
  <//>`;
}

export { TEMPLATES, Notifications };
