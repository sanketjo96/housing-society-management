import { Avatar, Fragment, Icon, TODAY, flatSummary, fmtDate, html, inr, rateFor, shortDate, useState } from '../core.js';
import { Drawer, Field, Locked, Modal, PageHead } from '../ui.js';

/* =============================== Admin: Flat drawer =============================== */
function FlatDrawer({ db, flatId, onClose, update, toast, isNew }) {
  const orig = isNew ? { id: '', wing: 'A', number: '', owner: { name: '', email: '', phone: '' }, occupancy: 'owner', tenant: null, history: [] } : db.flats.find((f) => f.id === flatId);
  const [tab, setTab] = useState(isNew ? 'details' : 'ledger');
  const [f, setF] = useState(() => JSON.parse(JSON.stringify(orig)));
  const sum = isNew ? null : flatSummary(db, flatId);
  const rows = isNew ? [] : db.ledger.filter((r) => r.flat === flatId).sort((a, b) => b.date.localeCompare(a.date) || (a.type === 'SYSTEM' ? 1 : -1));
  const setO = (k, v) => setF({ ...f, owner: { ...f.owner, [k]: v } });
  const save = () => {
    if (!f.number || !f.owner.name) { toast('Flat number and owner name are required'); return; }
    const newId = f.wing + '-' + f.number;
    update('saveFlat', (d) => {
      if (isNew) d.flats.push({ ...f, id: newId, floor: +String(f.number)[0] || 0, unit: 0, lastLogin: null, history: [{ date: TODAY, text: 'Flat onboarded by admin' }] });
      else { const i = d.flats.findIndex((x) => x.id === flatId); d.flats[i] = { ...d.flats[i], wing: f.wing, number: f.number, owner: f.owner }; }
    });
    toast(isNew ? `Flat ${newId} added` : `Saved changes to ${flatId}`); onClose();
  };
  const rate = rateFor(f, db.settings);
  return html`<${Drawer} title=${isNew ? 'Onboard a flat' : 'Flat ' + flatId} sub=${isNew ? 'Owner details now; tenant details are added by the resident' : (f.occupancy === 'tenant' ? 'Tenant-occupied' : 'Owner-occupied') + ' · ' + inr(rate) + ' per month'} onClose=${onClose}
    foot=${tab === 'details' ? html`<button className="btn" onClick=${onClose}>Cancel</button><button className="btn primary" onClick=${save}>${isNew ? 'Add flat' : 'Save changes'}</button>` : html`<button className="btn" onClick=${() => setTab('details')}><${Icon} n="edit" s=${15} />Edit details</button>`}>
    ${!isNew && html`<div className="grid3">
      <div className="metric" style=${{ padding: 14 }}><span className="eyebrow">Outstanding</span><span className="val num" style=${{ fontSize: 20, fontFamily: 'var(--mono)' }}>${inr(sum.outstanding)}</span></div>
      <div className="metric" style=${{ padding: 14 }}><span className="eyebrow">Credit</span><span className="val num" style=${{ fontSize: 20, fontFamily: 'var(--mono)', color: 'var(--brass)' }}>${inr(sum.credit)}</span></div>
      <div className="metric hero" style=${{ padding: 14 }}><span className="eyebrow">Payable</span><span className="val num" style=${{ fontSize: 20, fontFamily: 'var(--mono)' }}>${inr(sum.payable)}</span></div></div>
    <div className="chips">${[['ledger', 'Passbook'], ['details', 'Details'], ['history', 'Occupancy history']].map(([k, l]) => html`<button key=${k} className=${'chip' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}>${l}</button>`)}</div>`}
    ${tab === 'ledger' && html`<div className="card table-wrap"><table className="t"><thead><tr><th>Date</th><th>Payer</th><th>Type</th><th className="r">Amount</th><th>Status</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr key=${r.id} className=${'tint-' + r.type}><td className="num" style=${{ fontSize: 12.5, whiteSpace: 'nowrap' }}>${shortDate(r.date)}</td><td style=${{ fontSize: 13 }}>${r.payer}${r.type !== 'SYSTEM' && html`<small style=${{ display: 'block', color: 'var(--muted)', fontSize: 11.5 }}>${r.note}</small>`}</td><td><span className=${'tag ' + r.type}>${r.type}</span></td><td className="r num">${r.type === 'SYSTEM' ? '' : '−'}${inr(r.amount)}</td><td>${r.type === 'SYSTEM' ? html`<span className="muted" style=${{ fontSize: 12 }}>Auto</span>` : html`<span className=${'pill ' + r.status}>${r.status[0].toUpperCase() + r.status.slice(1)}</span>`}</td></tr>`)}</tbody></table></div>`}
    ${tab === 'details' && html`<${Fragment}>
      <div className="eyebrow">Flat</div>
      <div className="grid3"><${Field} label="Wing / block"><input id="fd-wing" className="input" value=${f.wing} onInput=${(e) => setF({ ...f, wing: e.target.value.toUpperCase() })} /><//>
        <${Field} label="Flat number"><input id="fd-num" className="input" value=${f.number} onInput=${(e) => setF({ ...f, number: e.target.value })} /><//>
        <${Field} label="Monthly rate" hint=${Locked}><input id="fd-rate" className="input" value=${inr(rate)} disabled /><//></div>
      <div className="eyebrow" style=${{ marginTop: 6 }}>Owner</div>
      <${Field} label="Full name"><input id="fd-oname" className="input" value=${f.owner.name} onInput=${(e) => setO('name', e.target.value)} /><//>
      <div className="grid2"><${Field} label="Email"><input id="fd-oemail" className="input" value=${f.owner.email} onInput=${(e) => setO('email', e.target.value)} /><//>
        <${Field} label="Phone (WhatsApp)"><input id="fd-ophone" className="input" value=${f.owner.phone} onInput=${(e) => setO('phone', e.target.value)} /><//></div>
      <div className="eyebrow" style=${{ marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>Occupancy<span className="lock" style=${{ textTransform: 'none', letterSpacing: 0 }}><${Icon} n="lock" s=${11} /> Managed by the resident</span></div>
      <div className="grid2"><${Field} label="Occupied by"><input id="fd-occ" className="input" value=${f.occupancy === 'tenant' ? 'Tenant' : 'Owner'} disabled /><//>
        <${Field} label="Tenant since"><input id="fd-since" className="input" value=${f.tenant ? fmtDate(f.tenant.since) : '—'} disabled /><//></div>
      ${f.tenant && html`<div className="grid2"><${Field} label="Tenant name"><input id="fd-tname" className="input" value=${f.tenant.name} disabled /><//><${Field} label="Tenant phone"><input id="fd-tphone" className="input" value=${f.tenant.phone} disabled /><//></div>`}
      <p className="muted" style=${{ fontSize: 12.5, margin: 0 }}>The rate is set in Billing and follows occupancy. Owners update tenant details from the resident app; the admin can’t change them.</p>
    <//>`}
    ${tab === 'history' && html`<div style=${{ display: 'flex', flexDirection: 'column' }}>${[...f.history].reverse().map((h, i) => html`<div key=${i} style=${{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--line-2)' }}><span className="num muted" style=${{ width: 92, fontSize: 12.5, flex: 'none' }}>${fmtDate(h.date)}</span><span>${h.text}</span></div>`)}</div>`}
  <//>`;
}

/* =============================== Admin: Flats =============================== */
function Flats({ db, update, toast, openFlat, setNewFlat }) {
  const [q, setQ] = useState('');
  const [occ, setOcc] = useState('all');
  const [imp, setImp] = useState(0);
  const list = db.flats.filter((f) => (occ === 'all' || f.occupancy === occ) && (!q || (f.id + f.owner.name + (f.tenant ? f.tenant.name : '')).toLowerCase().includes(q.toLowerCase())));
  const doImport = () => {
    update('importFlats', (d) => db.importSample.filter((r) => r.ok).forEach((r) => d.flats.push({ id: r.wing + '-' + r.number, wing: r.wing, number: r.number, floor: 1, unit: 0, owner: { name: r.owner, email: r.email, phone: '' }, occupancy: 'owner', tenant: null, lastLogin: null, history: [{ date: TODAY, text: 'Imported from CSV' }] })));
    setImp(0); toast('Imported 3 flats into Wing B. 2 rows skipped.');
  };
  return html`<${Fragment}>
    <${PageHead} eyebrow="Directory" title="Flats & residents" sub="Owners, tenants and who pays for each flat. Admins edit owner and flat details; residents keep their occupancy and tenant details current.">
      <button className="btn" onClick=${() => toast('Exported flats-directory.xlsx (download is simulated in the demo)')}><${Icon} n="download" s=${16} />Export</button>
      <button className="btn" onClick=${() => setImp(1)}><${Icon} n="upload" s=${16} />Bulk import</button>
      <button className="btn primary" onClick=${() => setNewFlat(true)}><${Icon} n="plus" s=${16} />Add flat</button>
    <//>
    <div className="card">
      <div className="card-head">
        <div className="chips">${[['all', 'All', db.flats.length], ['owner', 'Owner-occupied', db.flats.filter((f) => f.occupancy === 'owner').length], ['tenant', 'Tenant-occupied', db.flats.filter((f) => f.occupancy === 'tenant').length]].map(([k, l, c]) => html`<button key=${k} className=${'chip' + (occ === k ? ' on' : '')} onClick=${() => setOcc(k)}>${l}<span className="c">${c}</span></button>`)}</div>
        <div className="search"><${Icon} n="search" s=${15} /><input id="flat-search" className="input" placeholder="Search flat, owner or tenant" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="table-wrap"><table className="t">
        <thead><tr><th>Flat</th><th>Owner</th><th>Occupancy</th><th>Tenant</th><th className="r">Rate / mo</th><th>Last active</th><th></th></tr></thead>
        <tbody>${list.map((f) => html`<tr key=${f.id} className="click" onClick=${() => openFlat(f.id)}>
          <td className="flatno">${f.id}</td>
          <td><div className="person"><${Avatar} name=${f.owner.name} /><div style=${{ minWidth: 0 }}>${f.owner.name}<small>${f.owner.email}</small></div></div></td>
          <td><span className="tag">${f.occupancy === 'tenant' ? 'TENANT' : 'OWNER'}</span></td>
          <td>${f.tenant ? html`<div>${f.tenant.name}<small style=${{ display: 'block', color: 'var(--muted)', fontSize: 11.5 }}>since ${fmtDate(f.tenant.since)}</small></div>` : html`<span className="muted">—</span>`}</td>
          <td className="r num">${inr(rateFor(f, db.settings))}</td>
          <td className="muted" style=${{ fontSize: 12.5 }}>${f.lastLogin ? fmtDate(f.lastLogin) : 'Never logged in'}</td>
          <td className="r"><button className="btn sm ghost" onClick=${(e) => { e.stopPropagation(); openFlat(f.id); }}><${Icon} n="edit" s=${14} />Edit</button></td></tr>`)}</tbody>
      </table></div>
    </div>
    ${imp > 0 && html`<${Modal} title="Bulk import flats" sub="Upload a CSV with wing, flat number, owner name and owner email." onClose=${() => setImp(0)} wide
      foot=${imp === 1 ? html`<button className="btn" onClick=${() => toast('Sample CSV shown in the next step (download simulated)')}><${Icon} n="download" s=${15} />Sample CSV</button><button className="btn primary" onClick=${() => setImp(2)}>Use sample file</button>`
        : html`<button className="btn" onClick=${() => setImp(1)}>Back</button><button className="btn primary" onClick=${doImport}>Import 3 valid rows</button>`}>
      ${imp === 1 ? html`<div className="dropzone"><span className="ic" style=${{ color: 'var(--teal)' }}><${Icon} n="upload" s=${28} /></span><b>Drop flats.csv here</b><span className="muted" style=${{ fontSize: 13 }}>Columns: wing, flatNumber, ownerName, ownerEmail. Up to 500 rows.</span></div>
        <p className="muted" style=${{ margin: 0, fontSize: 12.5 }}>Rows are checked before anything is saved. Duplicate flats and invalid emails are skipped and listed so you can fix them.</p>`
      : html`<div style=${{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><span className="pill settled">3 ready to import</span><span className="pill rejected">2 need attention</span></div>
        <div className="card table-wrap"><table className="t"><thead><tr><th>Row</th><th>Flat</th><th>Owner</th><th>Email</th><th>Check</th></tr></thead>
        <tbody>${db.importSample.map((r, i) => html`<tr key=${i}><td className="num muted">${i + 2}</td><td className="flatno">${r.wing}-${r.number}</td><td>${r.owner}</td><td style=${{ fontSize: 12.5 }}>${r.email}</td><td>${r.ok ? html`<span className="pill settled">Valid</span>` : html`<span style=${{ color: 'var(--coral)', fontSize: 12.5 }}>${r.err}</span>`}</td></tr>`)}</tbody></table></div>`}
    <//>`}
  <//>`;
}

function MyDetails({ db, fl, persona, update, toast }) {
  const [f, setF] = useState(() => JSON.parse(JSON.stringify({ owner: fl.owner, occupancy: fl.occupancy, tenant: fl.tenant || { name: '', email: '', phone: '', since: TODAY } })));
  const dirty = JSON.stringify(f) !== JSON.stringify({ owner: fl.owner, occupancy: fl.occupancy, tenant: fl.tenant || { name: '', email: '', phone: '', since: TODAY } });
  const newRate = rateFor({ occupancy: f.occupancy }, db.settings);
  const save = () => {
    if (f.occupancy === 'tenant' && !f.tenant.name.trim()) { toast('Add the tenant’s name'); return; }
    update('saveMyDetails', (d) => { const x = d.flats.find((y) => y.id === fl.id);
      if (x.occupancy !== f.occupancy) x.history.push({ date: TODAY, text: f.occupancy === 'tenant' ? `Tenant ${f.tenant.name} moved in (updated by ${persona.name})` : `Tenant moved out, owner-occupied (updated by ${persona.name})` });
      x.owner = f.owner; x.occupancy = f.occupancy; x.tenant = f.occupancy === 'tenant' ? f.tenant : null; });
    toast(f.occupancy !== fl.occupancy ? `Saved. Next month’s charge will be ${inr(newRate)}.` : 'Details saved');
  };
  const so = (k, v) => setF({ ...f, owner: { ...f.owner, [k]: v } }); const st = (k, v) => setF({ ...f, tenant: { ...f.tenant, [k]: v } });
  return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div className="eyebrow">Flat</div>
    <div className="grid3" style=${{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}><${Field} label="Wing"><input id="md-wing" className="input" value=${fl.wing} disabled /><//><${Field} label="Flat"><input id="md-num" className="input" value=${fl.number} disabled /><//><${Field} label="Rate"><input id="md-rate" className="input" value=${inr(rateFor(fl, db.settings))} disabled /><//></div>
    <div className="eyebrow" style=${{ marginTop: 4 }}>Owner</div>
    <${Field} label="Full name"><input id="md-oname" className="input" value=${f.owner.name} onInput=${(e) => so('name', e.target.value)} /><//>
    <${Field} label="Email"><input id="md-oemail" className="input" value=${f.owner.email} onInput=${(e) => so('email', e.target.value)} /><//>
    <${Field} label="Phone (WhatsApp)"><input id="md-ophone" className="input" value=${f.owner.phone} onInput=${(e) => so('phone', e.target.value)} /><//>
    <div className="eyebrow" style=${{ marginTop: 4 }}>Occupancy</div>
    <div className="seg"><button className=${f.occupancy === 'owner' ? 'on' : ''} onClick=${() => setF({ ...f, occupancy: 'owner' })}>Owner lives here</button><button className=${f.occupancy === 'tenant' ? 'on' : ''} onClick=${() => setF({ ...f, occupancy: 'tenant' })}>Rented out</button></div>
    ${f.occupancy === 'tenant' && html`<${Fragment}>
      <${Field} label="Tenant name"><input id="md-tname" className="input" value=${f.tenant.name} onInput=${(e) => st('name', e.target.value)} /><//>
      <${Field} label="Tenant email"><input id="md-temail" className="input" value=${f.tenant.email} onInput=${(e) => st('email', e.target.value)} /><//>
      <div className="grid2" style=${{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}><${Field} label="Tenant phone"><input id="md-tphone" className="input" value=${f.tenant.phone} onInput=${(e) => st('phone', e.target.value)} /><//><${Field} label="Moved in"><input id="md-tsince" className="input" type="date" value=${f.tenant.since} onInput=${(e) => st('since', e.target.value)} /><//></div><//>`}
    ${f.occupancy !== fl.occupancy && html`<div className="banner warn"><${Icon} n="alert" s=${16} style=${{ flex: 'none' }} /><span>The monthly charge changes to <b style=${{ display: 'inline' }}>${inr(newRate)}</b> from the next billing run. Past charges don’t change.</span></div>`}
    <button className="btn primary" disabled=${!dirty} onClick=${save}>${dirty ? 'Save details' : 'Saved'}</button>
  </div>`;
}

export { FlatDrawer, Flats, MyDetails };
