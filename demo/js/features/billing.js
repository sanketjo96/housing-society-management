import { Fragment, Icon, TODAY, fmtDate, html, inr, periodLabel, personaName, rateFor, uid, useState } from '../core.js';
import { Field, PageHead } from '../ui.js';

/* =============================== Admin: Billing =============================== */
function Billing({ db, update, toast }) {
  const s = db.settings;
  const [base, setBase] = useState(s.baseRate);
  const [mult, setMult] = useState(s.tenantMultiplier);
  const [confirm, setConfirm] = useState(false);
  const dirty = +base !== s.baseRate || +mult !== s.tenantMultiplier;
  const novRun = db.runs.find((r) => r.period === '2026-11');
  const preview = db.flats.reduce((t, f) => t + rateFor(f, s), 0);
  const tenants = db.flats.filter((f) => f.occupancy === 'tenant').length;
  const saveRates = () => { update('saveRates', (d) => { d.settings.baseRate = +base; d.settings.tenantMultiplier = +mult; }); toast('Rates saved. They apply from the next billing run.'); };
  const generate = () => {
    update('generateCharges', (d) => {
      d.flats.forEach((fl) => { if (!d.ledger.some((r) => r.flat === fl.id && r.type === 'SYSTEM' && r.period === '2026-11')) d.ledger.push({ id: uid('sys'), flat: fl.id, date: TODAY, type: 'SYSTEM', amount: rateFor(fl, d.settings), status: 'approved', payer: 'System', period: '2026-11', note: 'Maintenance · Nov 2026' }); });
      d.runs.push({ period: '2026-11', date: TODAY, flats: d.flats.length, total: d.flats.reduce((t, fl) => t + rateFor(fl, d.settings), 0), by: personaName('admin', 'Admin') });
      d.messages.unshift({ id: uid('M'), at: '2026-11-03 10:15', to: `All residents (${d.flats.length})`, template: 'monthly_bill', status: 'sent', count: d.flats.length });
      d.meta.credits -= d.flats.length;
    });
    setConfirm(false); toast(`November charges generated for ${db.flats.length} flats. Bill reminders queued on WhatsApp.`);
  };
  return html`<${Fragment}>
    <${PageHead} eyebrow="Billing" title="Maintenance billing" sub="Set the monthly rate once. Each month the system adds a charge to every flat’s passbook using the rate in force on that day." />
    <div className="split">
      <div className="card">
        <div className="card-head"><div><h2>November 2026 run</h2><span className="muted" style=${{ fontSize: 12.5 }}>Scheduled for the 1st of each month</span></div>${novRun ? html`<span className="pill settled">Generated</span>` : html`<span className="pill pending">Due now</span>`}</div>
        <div className="card-pad" style=${{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <dl className="kv-list" style=${{ margin: 0 }}>
            <dt>Flats</dt><dd className="num">${db.flats.length}</dd>
            <dt>Owner-occupied × ${inr(s.baseRate)}</dt><dd className="num">${db.flats.length - tenants}</dd>
            <dt>Tenant-occupied × ${inr(rateFor({ occupancy: 'tenant' }, s))}</dt><dd className="num">${tenants}</dd>
            <dt style=${{ color: 'var(--ink)', fontWeight: 600 }}>Total to be charged</dt><dd className="num" style=${{ fontSize: 18 }}>${inr(novRun ? novRun.total : preview)}</dd>
          </dl>
          ${novRun ? html`<div className="stage-note"><${Icon} n="check" s=${16} style=${{ color: 'var(--teal)' }} />Generated on ${fmtDate(novRun.date)} by ${novRun.by}. Running it again won’t create duplicates.</div>`
            : confirm ? html`<div style=${{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: 'var(--brass-soft)', padding: 12, borderRadius: 12 }}><span style=${{ flex: 1, minWidth: 200, fontSize: 13 }}>Add ${inr(preview)} across ${db.flats.length} passbooks and send bill reminders?</span><button className="btn sm" onClick=${() => setConfirm(false)}>Cancel</button><button className="btn sm primary" onClick=${generate}>Generate charges</button></div>`
            : html`<button className="btn primary" onClick=${() => setConfirm(true)} style=${{ alignSelf: 'flex-start' }}><${Icon} n="zap" s=${16} />Generate November charges</button>`}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h2>Rates</h2>${dirty && html`<span className="pill pending">Unsaved</span>`}</div>
        <div className="card-pad" style=${{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <${Field} label="Base rate per flat / month"><input id="bill-base" className="input num" type="number" min="0" step="100" value=${base} onInput=${(e) => setBase(e.target.value)} /><//>
          <${Field} label="Tenant multiplier"><input id="bill-mult" className="input num" type="number" min="1" step="0.05" value=${mult} onInput=${(e) => setMult(e.target.value)} /><//>
          <div style=${{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 12, padding: 12, fontSize: 13 }}>
            <div style=${{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Owner-occupied</span><b className="num">${inr(+base || 0)}</b></div>
            <div style=${{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}><span className="muted">Tenant-occupied</span><b className="num">${inr(Math.round((+base || 0) * (+mult || 1)))}</b></div></div>
          <button className="btn primary" disabled=${!dirty} onClick=${saveRates}>Save rates</button>
          <p className="muted" style=${{ fontSize: 12, margin: 0 }}>Past charges and receipts keep the amount they were created with.</p>
        </div>
      </div>
    </div>
    <div className="card">
      <div className="card-head"><h2>Billing runs</h2></div>
      <div className="table-wrap"><table className="t"><thead><tr><th>Period</th><th>Run on</th><th className="r">Flats</th><th className="r">Total charged</th><th>Triggered by</th></tr></thead>
        <tbody>${[...db.runs].reverse().map((r) => html`<tr key=${r.period}><td style=${{ fontWeight: 600 }}>${periodLabel(r.period)}</td><td className="muted">${fmtDate(r.date)}</td><td className="r num">${r.flats}</td><td className="r num">${inr(r.total)}</td><td>${r.by}</td></tr>`)}</tbody></table></div>
    </div>
  <//>`;
}

export { Billing };
