import { Fragment, Icon, TODAY, html, personaBy, useState } from '../core.js';
import { Field, Locked, PageHead, Receipt } from '../ui.js';

/* =============================== Admin: Settings =============================== */
function Settings({ db, update, toast }) {
  const [d, setD] = useState(() => ({ ...db.settings }));
  const dirty = JSON.stringify(d) !== JSON.stringify(db.settings);
  const sampleFlat = db.flats.find((f) => f.id === (personaBy('owner') || {}).flat) || db.flats[0];
  const sample = { no: d.receiptPrefix + String(db.meta.nextReceipt).padStart(4, '0'), flat: sampleFlat.id, date: TODAY, payer: sampleFlat.tenant ? sampleFlat.tenant.name : sampleFlat.owner.name, mode: 'UPI', ref: 'UTR 630611842207', particulars: [{ label: 'Maintenance charges · Sep 2026', amount: 4500 }, { label: 'Maintenance charges · Oct 2026', amount: 4500 }] };
  const onSig = (key) => (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => setD((x) => ({ ...x, [key]: r.result })); r.readAsDataURL(file); };
  return html`<${Fragment}>
    <${PageHead} eyebrow="Society" title="Settings" sub="Society details and the receipt every resident receives. Receipts follow the standard CHS format.">
      ${dirty && html`<button className="btn" onClick=${() => setD({ ...db.settings })}>Discard</button>`}
      <button className="btn primary" disabled=${!dirty} onClick=${() => { update('saveSettings', (x) => { x.settings = { ...d }; }); toast('Saved. New receipts use this template.'); }}>${dirty ? 'Save changes' : 'Saved'}</button>
    <//>
    <div className="split" style=${{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)' }}>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="card card-pad" style=${{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style=${{ fontSize: 18 }}>Society</h2>
          <${Field} label="Registered name" hint=${Locked}><input id="st-name" className="input" value=${db.society.name} disabled /><//>
          <${Field} label="Address" hint=${Locked}><input id="st-addr" className="input" value=${db.society.address} disabled /><//>
          <div className="grid2"><${Field} label="Bank account" hint=${Locked}><input id="st-acc" className="input" value=${db.society.accountNo} disabled /><//><${Field} label="Book no." hint=${Locked}><input id="st-book" className="input" value=${db.society.bookNo} disabled /><//></div>
          <p className="muted" style=${{ fontSize: 12, margin: 0 }}>Registered details are set during onboarding and changed only on request, so receipts stay consistent for the audit.</p>
        </div>
        <div className="card card-pad" style=${{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style=${{ fontSize: 18 }}>Receipt</h2>
          <div className="grid2"><${Field} label="Number prefix"><input id="st-prefix" className="input num" value=${d.receiptPrefix} onInput=${(e) => setD({ ...d, receiptPrefix: e.target.value })} /><//><${Field} label="Next number" hint=${Locked}><input id="st-next" className="input num" value=${String(db.meta.nextReceipt).padStart(4, '0')} disabled /><//></div>
          <${Field} label="Footer note"><input id="st-foot" className="input" value=${d.footerNote} onInput=${(e) => setD({ ...d, footerNote: e.target.value })} /><//>
          ${[['secretary', 'Hon. Secretary'], ['treasurer', 'Hon. Treasurer']].map(([k, l]) => html`<div key=${k} className="grid2" style=${{ alignItems: 'end' }}>
            <${Field} label=${l}><input id=${'st-' + k} className="input" value=${d[k + 'Name']} onInput=${(e) => setD({ ...d, [k + 'Name']: e.target.value })} /><//>
            <div className="field"><label htmlFor=${'st-sig-' + k}>Signature</label><div style=${{ display: 'flex', gap: 8 }}>
              <label className="btn" style=${{ flex: 1 }}><${Icon} n="upload" s=${15} />${d[k + 'Sig'] ? 'Replace' : 'Upload'}<input id=${'st-sig-' + k} type="file" accept="image/png,image/jpeg" style=${{ display: 'none' }} onChange=${onSig(k + 'Sig')} /></label>
              ${d[k + 'Sig'] && html`<button className="btn danger" onClick=${() => setD({ ...d, [k + 'Sig']: null })} aria-label="Remove signature"><${Icon} n="x" s=${15} /></button>`}</div></div></div>`)}
          <p className="muted" style=${{ fontSize: 12, margin: 0 }}>Upload a PNG on a white or transparent background. Without one, the receipt prints the name in script.</p>
        </div>
      </div>
      <div style=${{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="eyebrow">Live preview · sample receipt</div>
        <${Receipt} r=${sample} db=${{ ...db, settings: d }} />
      </div>
    </div>
  <//>`;
}

export { Settings };
