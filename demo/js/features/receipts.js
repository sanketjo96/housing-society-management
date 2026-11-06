import { Fragment, Icon, fmtDate, html, inr, useState } from '../core.js';
import { PageHead } from '../ui.js';

/* =============================== Admin: Receipts =============================== */
function Receipts({ db, openReceipt, toast }) {
  const [q, setQ] = useState('');
  const list = [...db.receipts].reverse().filter((r) => !q || (r.no + r.flat + r.payer).toLowerCase().includes(q.toLowerCase()));
  return html`<${Fragment}>
    <${PageHead} eyebrow="Collections" title="Receipts" sub=${`${db.receipts.length} receipts issued this year. Each is rendered once at approval and stored, so it never changes later.`} />
    <div className="card">
      <div className="card-head"><span className="muted" style=${{ fontSize: 13 }}>Next number <b className="num" style=${{ color: 'var(--ink)' }}>${db.settings.receiptPrefix + String(db.meta.nextReceipt).padStart(4, '0')}</b></span>
        <div className="search"><${Icon} n="search" s=${15} /><input id="rc-search" className="input" placeholder="Receipt no., flat or name" value=${q} onInput=${(e) => setQ(e.target.value)} /></div></div>
      <div className="table-wrap"><table className="t"><thead><tr><th>Receipt no.</th><th>Date</th><th>Flat</th><th>Received from</th><th>Mode</th><th className="r">Amount</th><th></th></tr></thead>
        <tbody>${list.slice(0, 40).map((r) => html`<tr key=${r.no} className="click" onClick=${() => openReceipt(r.no)}><td className="num" style=${{ fontWeight: 600 }}>${r.no}</td><td className="muted">${fmtDate(r.date)}</td><td className="flatno">${r.flat}</td><td>${r.payer}</td><td><span className=${'tag ' + r.kind}>${r.mode}</span></td><td className="r num">${inr(r.amount)}</td>
          <td className="r"><button className="btn sm ghost" onClick=${(e) => { e.stopPropagation(); toast(`Receipt ${r.no} resent on WhatsApp to ${r.payer}`); }}><${Icon} n="chat" s=${14} />Resend</button></td></tr>`)}</tbody></table></div>
      ${list.length > 40 && html`<div className="muted" style=${{ padding: '12px 22px', fontSize: 12.5, borderTop: '1px solid var(--line-2)' }}>Showing the latest 40 of ${list.length}</div>`}
    </div>
  <//>`;
}

export { Receipts };
