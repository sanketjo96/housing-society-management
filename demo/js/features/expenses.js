import { Fragment, Icon, TODAY, fmtDate, html, inr, uid, useState } from '../core.js';
import { Field, Modal, PageHead } from '../ui.js';

/* =============================== Admin: Expenses =============================== */
const CATS = ['Security agency', 'Housekeeping', 'Electricity (common)', 'Lift AMC', 'Repairs', 'Water tanker', 'Garden upkeep', 'Other'];
function Expenses({ db, update, toast }) {
  const [add, setAdd] = useState(false);
  const [form, setForm] = useState({ date: TODAY, category: 'Repairs', vendor: '', amount: '', mode: 'UPI' });
  const income = db.ledger.filter((r) => r.type === 'DEPOSIT' && r.status === 'approved').reduce((s, r) => s + r.amount, 0);
  const spent = db.expenses.reduce((s, e) => s + e.amount, 0);
  const byCat = CATS.map((c) => ({ c, v: db.expenses.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter((x) => x.v).sort((a, b) => b.v - a.v);
  const max = byCat[0] ? byCat[0].v : 1;
  const save = () => { update('addExpense', (d) => d.expenses.unshift({ id: uid('exp'), ...form, amount: +form.amount })); setAdd(false); toast(`Expense of ${inr(form.amount)} recorded`); setForm({ date: TODAY, category: 'Repairs', vendor: '', amount: '', mode: 'UPI' }); };
  return html`<${Fragment}>
    <${PageHead} eyebrow="Accounts" title="Expenses" sub="Every rupee the society spends, with an income and expenditure view ready for the auditor.">
      <button className="btn" onClick=${() => toast('Exported income-expenditure-Aug-Nov-2026.xlsx (download is simulated in the demo)')}><${Icon} n="download" s=${16} />I&E statement</button>
      <button className="btn primary" onClick=${() => setAdd(true)}><${Icon} n="plus" s=${16} />Add expense</button>
    <//>
    <div className="metrics" style=${{ '--cols': 'repeat(3, minmax(0, 1fr))' }}>
      <div className="metric"><span className="eyebrow">Income · Aug–Nov</span><span className="val">${inr(income)}</span><span className="sub">Approved maintenance deposits</span></div>
      <div className="metric"><span className="eyebrow">Expenditure · Aug–Nov</span><span className="val">${inr(spent)}</span><span className="sub">${db.expenses.length} entries</span></div>
      <div className="metric hero"><span className="eyebrow">Surplus</span><span className="val">${inr(income - spent)}</span><span className="sub">Carried to the sinking and repair funds</span></div>
    </div>
    <div className="split" style=${{ '--cols': 'minmax(0, 1fr) 360px' }}>
      <div className="card"><div className="card-head"><h2>Ledger</h2></div><div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Category</th><th>Paid to</th><th>Mode</th><th className="r">Amount</th></tr></thead>
        <tbody>${db.expenses.map((e) => html`<tr key=${e.id}><td className="muted num" style=${{ fontSize: 12.5 }}>${fmtDate(e.date)}</td><td>${e.category}</td><td>${e.vendor}</td><td><span className="tag">${e.mode}</span></td><td className="r num">${inr(e.amount)}</td></tr>`)}</tbody></table></div></div>
      <div className="card"><div className="card-head"><h2>Where it went</h2></div>
        <div className="card-pad" style=${{ display: 'flex', flexDirection: 'column', gap: 14 }}>${byCat.map((x) => html`<div key=${x.c}><div style=${{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span>${x.c}</span><b className="num">${inr(x.v)}</b></div><div className="bar"><i style=${{ width: (x.v / max) * 100 + '%', background: x.c.startsWith('Security') ? 'var(--teal)' : 'color-mix(in srgb, var(--teal) 55%, var(--sunken))' }}></i></div></div>`)}</div></div>
    </div>
    ${add && html`<${Modal} title="Add expense" onClose=${() => setAdd(false)} foot=${html`<button className="btn" onClick=${() => setAdd(false)}>Cancel</button><button className="btn primary" disabled=${!form.vendor || !(+form.amount > 0)} onClick=${save}>Save expense</button>`}>
      <div className="grid2"><${Field} label="Date"><input id="ex-date" className="input" type="date" value=${form.date} onInput=${(e) => setForm({ ...form, date: e.target.value })} /><//>
        <${Field} label="Category"><select id="ex-cat" className="input" value=${form.category} onChange=${(e) => setForm({ ...form, category: e.target.value })}>${CATS.map((c) => html`<option key=${c}>${c}</option>`)}</select><//></div>
      <${Field} label="Paid to"><input id="ex-vendor" className="input" placeholder="Vendor or person" value=${form.vendor} onInput=${(e) => setForm({ ...form, vendor: e.target.value })} /><//>
      <div className="grid2"><${Field} label="Amount"><input id="ex-amt" className="input num" type="number" value=${form.amount} onInput=${(e) => setForm({ ...form, amount: e.target.value })} /><//>
        <${Field} label="Mode"><select id="ex-mode" className="input" value=${form.mode} onChange=${(e) => setForm({ ...form, mode: e.target.value })}>${['UPI', 'NEFT', 'Cheque', 'Cash', 'Online'].map((m) => html`<option key=${m}>${m}</option>`)}</select><//></div>
      <${Field} label="Bill or invoice"><div className="dropzone" style=${{ padding: 16 }}><span className="muted" style=${{ fontSize: 13 }}>Attach a photo or PDF of the bill</span></div><//>
    <//>`}
  <//>`;
}

export { CATS, Expenses };
