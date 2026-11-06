import { Fragment, Icon, TODAY, flatSummary, fmtDate, getIntent, html, inr, nowStamp, rateFor, shortDate, uid, unpaidPeriods, useEffect, useState } from '../core.js';
import { Field, FilePick, Modal, PageHead, Receipt, Sheet } from '../ui.js';

/* =============================== Admin: Payment review =============================== */
function ProofShot({ e, db }) {
  const blur = e.status === 'rejected';
  if (e.proofImg) return html`<div className="proof" style=${{ padding: 6 }}><img src=${e.proofImg} alt="Uploaded proof" style=${{ width: '100%', borderRadius: 14 }} /></div>`;
  if (e.type === 'CREDIT') return html`<div className="proof" style=${{ borderRadius: 10, borderWidth: 1, borderColor: '#D9D4C7', background: '#FFFDF6', alignItems: 'stretch', gap: 8 }}>
    <b style=${{ fontSize: 13, textAlign: 'center' }}>${e.id === 'cred-p1' ? 'SHREE PLUMBING WORKS' : 'BILL / INVOICE'}</b><span style=${{ fontSize: 10, textAlign: 'center', color: '#666' }}>${e.ref} · ${fmtDate(e.date)}</span>
    <div className="kv"><span>${e.note}</span><b>₹${e.amount.toLocaleString('en-IN')}</b></div>
    <div className="kv" style=${{ fontSize: 12 }}><span>Total paid</span><b>₹${e.amount.toLocaleString('en-IN')}</b></div><span style=${{ fontSize: 9.5, color: '#888', textAlign: 'center' }}>Paid by ${e.payer}, ${e.flat}</span></div>`;
  return html`<div className=${'proof' + (blur ? ' blur' : '')}>
    <span style=${{ fontSize: 10, color: '#888', alignSelf: 'flex-start' }}>9:41</span>
    <span className="ok"><${Icon} n="check" s=${24} w=${2.6} /></span>
    <span style=${{ fontSize: 12, color: '#1E8E5A', fontWeight: 600 }}>Payment successful</span>
    <span className="amt">₹${e.amount.toLocaleString('en-IN')}</span>
    <span style=${{ fontSize: 10.5, color: '#666' }}>to ${db.society.short}</span>
    <div className="kv" style=${{ marginTop: 6 }}><span>UPI ref</span><b>${e.ref.replace('UTR ', '')}</b></div>
    <div className="kv"><span>From</span><b>${e.payer}</b></div>
    <div className="kv"><span>Date</span><b>${fmtDate(e.date)}</b></div></div>`;
}
function Review({ db, update, toast, openReceipt }) {
  const pending = db.ledger.filter((r) => r.status === 'pending').sort((a, b) => a.date.localeCompare(b.date));
  const reviewed = db.ledger.filter((r) => r.type !== 'SYSTEM' && r.status !== 'pending' && r.reviewedOn).sort((a, b) => b.reviewedOn.localeCompare(a.reviewedOn));
  const [sel, setSel] = useState(pending[0] ? pending[0].id : null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [approve, setApprove] = useState(null);
  const [manual, setManual] = useState(false);
  const cur = pending.find((p) => p.id === sel) || pending[0];
  useEffect(() => { setRejecting(false); setReason(''); }, [sel]);
  const fl = cur && db.flats.find((f) => f.id === cur.flat);
  const sum = cur && flatSummary(db, cur.flat);
  const draftReceipt = (e) => ({ no: db.settings.receiptPrefix + String(db.meta.nextReceipt).padStart(4, '0'), entryId: e.id, flat: e.flat, date: TODAY, amount: e.amount, payer: e.payer, mode: e.mode, ref: e.ref, kind: e.type,
    particulars: e.type === 'CREDIT' ? [{ label: 'Credit · ' + e.note, amount: e.amount }] : [{ label: 'Maintenance charges · ' + e.note.replace(/^Maintenance[\s·]*/i, ''), amount: e.amount }] });
  const confirmApprove = () => {
    const r = approve; const isManual = !!r.manual;
    update('approvePayment', (d) => {
      if (isManual) d.ledger.push({ ...r.entry, status: 'approved', receiptNo: r.receipt.no, reviewedOn: TODAY });
      else { const e = d.ledger.find((x) => x.id === r.entry.id); e.status = 'approved'; e.receiptNo = r.receipt.no; e.reviewedOn = TODAY; }
      d.receipts.push(r.receipt); d.meta.nextReceipt += 1;
      if (d.settings.autoReceipt) { d.messages.unshift({ id: uid('M'), at: '2026-11-03 10:20', to: `${r.entry.payer} · ${r.entry.flat}`, template: 'payment_received', status: 'sent' }); d.meta.credits -= 1; }
    });
    toast(`Approved. Receipt ${r.receipt.no} sent to ${r.entry.payer}.`);
    setApprove(null); setSel(null);
  };
  const reject = () => {
    if (!reason.trim()) return;
    update('rejectPayment', (d) => { const e = d.ledger.find((x) => x.id === cur.id); e.status = 'rejected'; e.rejectReason = reason.trim(); e.reviewedOn = TODAY;
      d.messages.unshift({ id: uid('M'), at: '2026-11-03 10:22', to: `${cur.payer} · ${cur.flat}`, template: 'payment_rejected', status: 'sent' }); d.meta.credits -= 1; });
    toast(`Rejected. ${cur.payer} has been told why.`); setSel(null);
  };
  return html`<${Fragment}>
    <${PageHead} eyebrow="Collections" title="Payment review" sub="Residents upload a payment screenshot or a credit claim. Nothing counts toward a flat’s balance until you approve it.">
      <button className="btn" onClick=${() => setManual(true)}><${Icon} n="cash" s=${16} />Record cash or cheque</button>
    <//>
    ${pending.length ? html`<div className="split" style=${{ gridTemplateColumns: 'minmax(0, 300px) minmax(0, 1fr)' }}>
      <div className="card"><div className="card-head"><h2>Waiting</h2><span className="pill pending">${pending.length}</span></div>
        <div className="queue">${pending.map((p) => html`<button key=${p.id} className="qi" style=${cur && cur.id === p.id ? { background: 'var(--surface-2)', boxShadow: 'inset 3px 0 0 var(--brass-bright)' } : null} onClick=${() => setSel(p.id)}>
          <span className="tx"><b><span className="flatno">${p.flat}</span> · ${p.payer}</b><span><span className=${'tag ' + p.type} style=${{ marginRight: 6 }}>${p.type}</span>${shortDate(p.date)}</span></span><b className="num">${inr(p.amount)}</b></button>`)}</div></div>
      ${cur && html`<div className="card">
        <div className="card-head"><div><h2>${cur.type === 'CREDIT' ? 'Credit claim' : 'Payment proof'} · ${cur.flat}</h2><span className="muted" style=${{ fontSize: 12.5 }}>Submitted ${cur.submittedAt} by ${cur.payer}</span></div><span className=${'tag ' + cur.type}>${cur.type}</span></div>
        <div className="card-pad" style=${{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <${ProofShot} e=${cur} db=${db} />
          <div style=${{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <dl className="kv-list" style=${{ margin: 0 }}>
              <dt>Amount claimed</dt><dd className="num" style=${{ fontSize: 18 }}>${inr(cur.amount)}</dd>
              <dt>${cur.type === 'CREDIT' ? 'Bill reference' : 'UPI reference'}</dt><dd className="num">${cur.ref}</dd>
              <dt>Note from resident</dt><dd>${cur.note}</dd>
              <dt>Paid by</dt><dd>${cur.payer} (${fl.occupancy === 'tenant' && fl.tenant.name === cur.payer ? 'tenant' : 'owner'})</dd>
            </dl>
            <div style=${{ background: 'var(--surface-2)', borderRadius: 12, padding: 12, fontSize: 13, border: '1px solid var(--line-2)' }}>
              <div className="eyebrow" style=${{ marginBottom: 8 }}>Flat ${cur.flat} right now</div>
              <div style=${{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Payable before approval</span><b className="num">${inr(sum.payable)}</b></div>
              <div style=${{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}><span className="muted">Payable after approval</span><b className="num" style=${{ color: 'var(--teal)' }}>${inr(Math.max(0, sum.payable - cur.amount))}</b></div>
              ${cur.amount > sum.payable && html`<div className="muted" style=${{ fontSize: 12, marginTop: 6 }}>${inr(cur.amount - sum.payable)} will carry forward as credit.</div>`}
            </div>
            ${rejecting ? html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <${Field} label="Reason the resident will see"><textarea id="rej-reason" className="input" placeholder="For example: UTR not visible, amount doesn’t match the bank credit" value=${reason} onInput=${(e) => setReason(e.target.value)}></textarea><//>
              <div className="actions"><button className="btn" onClick=${() => setRejecting(false)}>Back</button><button className="btn danger" disabled=${!reason.trim()} onClick=${reject}>Reject and notify</button></div></div>`
            : html`<div className="actions"><button className="btn danger" onClick=${() => setRejecting(true)}><${Icon} n="x" s=${16} />Reject</button><button className="btn primary" onClick=${() => setApprove({ entry: cur, receipt: draftReceipt(cur) })}><${Icon} n="check" s=${16} />Approve</button></div>`}
          </div>
        </div>
      </div>`}
    </div>` : html`<div className="card"><div className="empty"><span style=${{ color: 'var(--teal)' }}><${Icon} n="check" s=${30} /></span><b style=${{ color: 'var(--ink)', fontSize: 16 }}>All caught up</b>No payments or credit claims are waiting for review.</div></div>`}
    ${reviewed.length > 0 && html`<div className="card"><div className="card-head"><h2>Reviewed today</h2></div><div className="table-wrap"><table className="t"><thead><tr><th>Flat</th><th>Payer</th><th>Type</th><th className="r">Amount</th><th>Result</th><th>Receipt</th></tr></thead>
      <tbody>${reviewed.map((r) => html`<tr key=${r.id}><td className="flatno">${r.flat}</td><td>${r.payer}</td><td><span className=${'tag ' + r.type}>${r.type}</span></td><td className="r num">${inr(r.amount)}</td><td><span className=${'pill ' + r.status}>${r.status === 'approved' ? 'Approved' : 'Rejected'}</span></td><td>${r.receiptNo ? html`<button className="btn sm ghost" onClick=${() => openReceipt(r.receiptNo)}><${Icon} n="receipt" s=${14} />${r.receiptNo}</button>` : html`<span className="muted" style=${{ fontSize: 12.5 }}>${r.rejectReason}</span>`}</td></tr>`)}</tbody></table></div></div>`}
    ${approve && html`<${Modal} wide title="Check the receipt before approving" sub="This receipt is issued and sent to the resident once you confirm. Receipt numbers are sequential and can’t be reused." onClose=${() => setApprove(null)}
      foot=${html`<button className="btn" onClick=${() => setApprove(null)}>Cancel</button><button className="btn primary" onClick=${confirmApprove}><${Icon} n="check" s=${16} />Confirm & approve</button>`}>
      <${Receipt} r=${approve.receipt} db=${db} />
    <//>`}
    ${manual && html`<${ManualPayment} db=${db} onClose=${() => setManual(false)} onNext=${(entry) => { setManual(false); setApprove({ manual: true, entry, receipt: draftReceipt(entry) }); }} />`}
  <//>`;
}
function ManualPayment({ db, onClose, onNext }) {
  const [flat, setFlat] = useState(() => (db.flats.some((f) => f.id === 'A-602') ? 'A-602' : db.flats[0].id));
  const fl = db.flats.find((f) => f.id === flat);
  const sum = flatSummary(db, flat);
  const [amount, setAmount] = useState(sum.payable || 3000);
  const [mode, setMode] = useState('Cash');
  const [ref, setRef] = useState('');
  const [payer, setPayer] = useState('owner');
  useEffect(() => { setAmount(flatSummary(db, flat).payable || rateFor(fl, db.settings)); }, [flat]);
  const name = payer === 'tenant' && fl.tenant ? fl.tenant.name : fl.owner.name;
  return html`<${Modal} title="Record a cash or cheque payment" sub="For residents who pay at the society office. A receipt is issued straight away." onClose=${onClose}
    foot=${html`<button className="btn" onClick=${onClose}>Cancel</button><button className="btn primary" disabled=${!(+amount > 0) || (mode === 'Cheque' && !ref.trim())} onClick=${() => onNext({ id: uid('dep'), flat, date: TODAY, type: 'DEPOSIT', amount: +amount, payer: name, mode, ref: mode === 'Cash' ? 'Paid at office' : (mode === 'Cheque' ? 'Chq ' : 'Ref ') + ref, note: 'Maintenance (recorded by admin)', manual: true })}>Preview receipt</button>`}>
    <div className="grid2">
      <${Field} label="Flat"><select id="mp-flat" className="input" value=${flat} onChange=${(e) => setFlat(e.target.value)}>${db.flats.map((f) => html`<option key=${f.id} value=${f.id}>${f.id} · ${f.owner.name}</option>`)}</select><//>
      <${Field} label="Paid by"><select id="mp-payer" className="input" value=${payer} onChange=${(e) => setPayer(e.target.value)}><option value="owner">${fl.owner.name} (owner)</option>${fl.tenant && html`<option value="tenant">${fl.tenant.name} (tenant)</option>`}</select><//>
    </div>
    <div className="grid2">
      <${Field} label="Amount" hint=${'Payable ' + inr(sum.payable)}><input id="mp-amt" className="input num" type="number" value=${amount} onInput=${(e) => setAmount(e.target.value)} /><//>
      <${Field} label="Mode"><select id="mp-mode" className="input" value=${mode} onChange=${(e) => setMode(e.target.value)}><option>Cash</option><option>Cheque</option><option>NEFT</option></select><//>
    </div>
    ${mode !== 'Cash' && html`<${Field} label=${mode === 'Cheque' ? 'Cheque number and bank' : 'Bank reference'}><input id="mp-ref" className="input" placeholder=${mode === 'Cheque' ? '004512 · HDFC Bank' : 'NEFT UTR'} value=${ref} onInput=${(e) => setRef(e.target.value)} /><//>`}
  <//>`;
}

const SAMPLE_SHOT = (amount, payer, payee) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420"><rect width="300" height="420" rx="18" fill="#ffffff"/><text x="20" y="30" font-family="sans-serif" font-size="12" fill="#888">9:41</text><circle cx="150" cy="96" r="32" fill="#1E8E5A"/><path d="M135 96l10 10 20-20" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="150" y="160" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="600" fill="#1E8E5A">Payment successful</text><text x="150" y="205" text-anchor="middle" font-family="sans-serif" font-size="36" font-weight="700" fill="#1A1F1D">₹${amount.toLocaleString('en-IN')}</text><text x="150" y="232" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#666">to ${payee}</text><line x1="24" y1="262" x2="276" y2="262" stroke="#eee"/><text x="24" y="290" font-family="sans-serif" font-size="12" fill="#666">UPI ref</text><text x="276" y="290" text-anchor="end" font-family="monospace" font-size="12" fill="#1A1F1D">6308${Math.floor(10000000 + Math.random() * 89999999)}</text><text x="24" y="320" font-family="sans-serif" font-size="12" fill="#666">From</text><text x="276" y="320" text-anchor="end" font-family="sans-serif" font-size="12" fill="#1A1F1D">${payer}</text><text x="24" y="350" font-family="sans-serif" font-size="12" fill="#666">Date</text><text x="276" y="350" text-anchor="end" font-family="sans-serif" font-size="12" fill="#1A1F1D">03 Nov 2026</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};
const SAMPLE_BILL = (amount, note) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="360" viewBox="0 0 300 360"><rect width="300" height="360" fill="#FFFDF6" stroke="#D9D4C7"/><text x="150" y="40" text-anchor="middle" font-family="serif" font-size="16" font-weight="700" fill="#222">TAX INVOICE</text><text x="150" y="62" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#777">Bill No. 4471 · 02 Nov 2026</text><line x1="20" y1="80" x2="280" y2="80" stroke="#ccc"/><text x="20" y="110" font-family="sans-serif" font-size="12" fill="#333">${note.slice(0, 38)}</text><text x="280" y="140" text-anchor="end" font-family="monospace" font-size="13" fill="#222">₹${amount.toLocaleString('en-IN')}</text><line x1="20" y1="300" x2="280" y2="300" stroke="#ccc"/><text x="20" y="325" font-family="sans-serif" font-size="13" font-weight="700" fill="#222">Total paid</text><text x="280" y="325" text-anchor="end" font-family="monospace" font-size="14" font-weight="700" fill="#222">₹${amount.toLocaleString('en-IN')}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};
function PaySheet({ db, fl, persona, update, toast, onClose }) {
  const sum = flatSummary(db, fl.id);
  const intent = getIntent(db, fl.id);
  const [img, setImg] = useState(null);
  const [utr, setUtr] = useState('');
  const amount = intent ? intent.amount : sum.payable;
  const months = unpaidPeriods(db, fl.id);
  const APPS = [['Google Pay', '#4285F4', 'G'], ['PhonePe', '#5F259F', 'Pe'], ['Paytm', '#00BAF2', 'P'], ['BHIM', '#F37021', 'B']];
  const open = (app) => { update('startPayment', (d) => { d.intents = d.intents.filter((x) => x.id !== fl.id).concat({ id: fl.id, amount, app, by: persona.name, at: nowStamp() }); }); toast(`${app} opened with ${inr(amount)} to ${db.meta.upiId} (simulated)`); };
  const submit = () => {
    update('submitPayment', (d) => {
      d.ledger.push({ id: uid('dep'), flat: fl.id, date: TODAY, type: 'DEPOSIT', amount, status: 'pending', payer: persona.name, mode: 'UPI', ref: 'UTR ' + (utr.trim() || '6308' + Math.floor(10000000 + Math.random() * 89999999)), note: 'Maintenance · ' + (months.join(', ') || 'advance'), submittedAt: nowStamp(), proofImg: img });
      d.intents = d.intents.filter((x) => x.id !== fl.id);
    });
    toast('Proof submitted. The treasurer will verify it and send your receipt.'); onClose();
  };
  const cancel = () => { update('cancelPayment', (d) => { d.intents = d.intents.filter((x) => x.id !== fl.id); }); toast('Payment cancelled'); onClose(); };
  if (!intent) return html`<${Sheet} title="Pay maintenance" sub="The full payable amount is paid in one go." onClose=${onClose}>
    <div className="locked-amt"><div><div className="eyebrow">Amount</div><b className="num">${inr(amount)}</b></div><span className="lock"><${Icon} n="lock" s=${12} /> Fixed</span></div>
    ${months.length > 0 && html`<div style=${{ fontSize: 12.5, color: 'var(--muted)' }}>Covers ${months.join(', ')}${sum.credit ? ` · after ${inr(sum.credit)} credit` : ''}</div>`}
    <div className="eyebrow">Pay with</div>
    <div className="upi">${APPS.map(([n, c, l]) => html`<button key=${n} onClick=${() => open(n)}><i style=${{ background: c }}>${l}</i>${n}</button>`)}</div>
    <div style=${{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
      <span><span className="muted">UPI ID</span><br/><b className="num">${db.meta.upiId}</b></span><button className="btn sm" onClick=${() => { try { navigator.clipboard.writeText(db.meta.upiId).then(() => toast('UPI ID copied'), () => toast('Copy not allowed here')); } catch (e) { toast('Copy not allowed here'); } }}>Copy</button></div>
    <p className="muted" style=${{ fontSize: 12, margin: 0 }}>After paying, come back here and upload the screenshot. Your passbook updates once the treasurer approves it.</p>
  <//>`;
  return html`<${Sheet} title="Upload payment proof" sub=${`Started ${intent.at.slice(11)} in ${intent.app} by ${intent.by}`} onClose=${onClose}
    foot=${html`<button className="btn danger" onClick=${cancel}>Cancel payment</button><button className="btn primary" disabled=${!img} onClick=${submit}>Submit for review</button>`}>
    <div className="locked-amt"><div><div className="eyebrow">Amount paid</div><b className="num">${inr(amount)}</b></div><span className="lock"><${Icon} n="lock" s=${12} /> Locked</span></div>
    <${Field} label="Payment screenshot"><${FilePick} id="pay-file" img=${img} onPick=${setImg} onSample=${() => setImg(SAMPLE_SHOT(amount, persona.name, db.society.short))} label="The confirmation screen from your UPI app" /><//>
    <${Field} label="UPI reference (UTR)" hint="Optional"><input id="pay-utr" className="input num" inputMode="numeric" placeholder="12-digit number" value=${utr} onInput=${(e) => setUtr(e.target.value)} /><//>
  <//>`;
}
function CreditSheet({ fl, persona, update, toast, onClose }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [img, setImg] = useState(null);
  const ok = +amount > 0 && note.trim() && img;
  const submit = () => { update('submitCredit', (d) => d.ledger.push({ id: uid('cred'), flat: fl.id, date: TODAY, type: 'CREDIT', amount: +amount, status: 'pending', payer: persona.name, mode: 'Reimbursement', ref: 'Bill attached', note: note.trim(), submittedAt: nowStamp(), proofImg: img })); toast('Credit claim sent for approval'); onClose(); };
  return html`<${Sheet} title="Add a credit" sub="Paid for something on the society’s behalf? Claim it here. Once approved it reduces what you owe." onClose=${onClose}
    foot=${html`<button className="btn" onClick=${onClose}>Cancel</button><button className="btn primary" disabled=${!ok} onClick=${submit}>Send for approval</button>`}>
    <${Field} label="Amount"><input id="cr-amt" className="input num" type="number" inputMode="numeric" placeholder="₹" value=${amount} onInput=${(e) => setAmount(e.target.value)} /><//>
    <${Field} label="What was it for?"><input id="cr-note" className="input" placeholder="Replaced stair light on 3rd floor" value=${note} onInput=${(e) => setNote(e.target.value)} /><//>
    <${Field} label="Bill or receipt"><${FilePick} id="cr-file" img=${img} onPick=${setImg} onSample=${() => setImg(SAMPLE_BILL(+amount || 850, note || 'Electrical repair'))} label="Photo of the bill you paid" /><//>
  <//>`;
}

export { ProofShot, Review, ManualPayment, SAMPLE_SHOT, SAMPLE_BILL, PaySheet, CreditSheet };
