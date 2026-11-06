import { Fragment, Icon, TODAY, firstName, fmtDate, html, nowTime, personaBy, personaName, uid, useState } from '../core.js';
import { Field, FilePick, PageHead, QR, Sheet } from '../ui.js';

const PASS_TYPES = { Guest: 'user', Delivery: 'inbox', Cab: 'arrow', Service: 'wrench' };
function PassSheet({ fl, persona, update, toast, onClose, onCreated }) {
  const [type, setType] = useState('Guest'); const [visitor, setVisitor] = useState(''); const [phone, setPhone] = useState(''); const [date, setDate] = useState(TODAY); const [win, setWin] = useState('Evening · 4 pm – 9 pm');
  const submit = () => { const id = uid('GP'); const code = String(100000 + Math.floor(Math.random() * 899999));
    update('createGatePass', (d) => d.gatePasses.unshift({ id, flat: fl.id, code, visitor: visitor.trim() || (type === 'Delivery' ? 'Delivery' : type), phone: phone.trim(), type, date, window: win, status: 'active', createdBy: persona.name }));
    toast('Gate pass created'); onCreated(id); };
  return html`<${Sheet} title="New gate pass" sub="The guard scans the QR or enters the code. No calls to your flat." onClose=${onClose} foot=${html`<button className="btn" onClick=${onClose}>Cancel</button><button className="btn primary" disabled=${type === 'Guest' && !visitor.trim()} onClick=${submit}>Create pass</button>`}>
    <div className="seg">${Object.keys(PASS_TYPES).map((t) => html`<button key=${t} className=${type === t ? 'on' : ''} onClick=${() => setType(t)}>${t}</button>`)}</div>
    <${Field} label=${type === 'Guest' ? 'Visitor name' : type === 'Delivery' ? 'Company' : type === 'Cab' ? 'Cab service' : 'Service provider'}><input id="gp-name" className="input" placeholder=${{ Guest: 'Meena Nair', Delivery: 'Swiggy, Amazon…', Cab: 'Uber, Ola…', Service: 'Electrician, plumber…' }[type]} value=${visitor} onInput=${(e) => setVisitor(e.target.value)} /><//>
    <${Field} label="Phone" hint="Optional"><input id="gp-phone" className="input" inputMode="tel" placeholder="+91" value=${phone} onInput=${(e) => setPhone(e.target.value)} /><//>
    <${Field} label="Date"><input id="gp-date" className="input" type="date" min=${TODAY} value=${date} onInput=${(e) => setDate(e.target.value)} /><//>
    <${Field} label="Valid"><div className="chips">${['Morning · 9 am – 1 pm', 'Afternoon · 1 pm – 5 pm', 'Evening · 4 pm – 9 pm', 'All day'].map((w) => html`<button key=${w} className=${'chip' + (win === w ? ' on' : '')} onClick=${() => setWin(w)}>${w}</button>`)}</div><//>
  <//>`;
}
function PassView({ db, p, update, toast, onClose }) {
  const share = () => { const t = `Gate pass for ${p.visitor} · ${db.society.display || db.society.short}, flat ${p.flat}. Code ${p.code}, valid ${fmtDate(p.date)}, ${p.window}.`; try { navigator.clipboard.writeText(t).then(() => toast('Pass details copied. Paste them in WhatsApp.'), () => toast('Copy not allowed here')); } catch (e) { toast('Copy not allowed here'); } };
  return html`<${Sheet} title=${p.visitor} sub=${`${p.type} · ${fmtDate(p.date)} · ${p.window}`} onClose=${onClose}
    foot=${p.status === 'active' ? html`<button className="btn danger" onClick=${() => { update('cancelGatePass', (d) => { d.gatePasses.find((x) => x.id === p.id).status = 'cancelled'; }); toast('Pass cancelled'); onClose(); }}>Cancel pass</button><button className="btn primary" onClick=${share}><${Icon} n="chat" s=${16} />Share</button>` : null}>
    <div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      <div style=${{ opacity: p.status === 'active' ? 1 : 0.3 }}><${QR} code=${p.code} /></div>
      <span className="code">${p.code}</span>
      <span className=${'pill ' + (p.status === 'active' ? 'approved' : p.status === 'used' ? 'sent' : 'rejected')}>${p.status === 'active' ? 'Active' : p.status === 'used' ? 'Used at ' + p.usedAt : 'Cancelled'}</span>
    </div>
    <dl className="kv-list" style=${{ margin: 0 }}><dt>Flat</dt><dd>${p.flat}</dd>${p.phone && html`<dt>Phone</dt><dd className="num">${p.phone}</dd>`}<dt>Created by</dt><dd>${p.createdBy}</dd></dl>
  <//>`;
}
const VIS_TYPES = { Guest: 'user', Delivery: 'inbox', Cab: 'arrow', Service: 'wrench', Staff: 'building' };
const PHOTO_TONES = ['#2F6E64', '#35577D', '#B8863A', '#8A5A44', '#5B6B3A'];
const samplePhoto = (name) => {
  const c = PHOTO_TONES[name.length % PHOTO_TONES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="${c}"/><circle cx="60" cy="48" r="22" fill="#F1E3CF"/><path d="M20 120c4-26 20-38 40-38s36 12 40 38z" fill="#F1E3CF"/><rect x="0" y="100" width="120" height="20" fill="rgba(0,0,0,.35)"/><text x="60" y="114" text-anchor="middle" font-family="monospace" font-size="10" fill="#fff">GATE CAM · ${new Date().toTimeString().slice(0, 5)}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};
function VPhoto({ v, size = 40 }) {
  return v.photo ? html`<img src=${v.photo} alt="" style=${{ width: size, height: size, borderRadius: 12, objectFit: 'cover', flex: 'none' }} />`
    : html`<span style=${{ width: size, height: size, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--blue-soft)', color: 'var(--blue)', flex: 'none' }}><${Icon} n=${VIS_TYPES[v.type] || 'user'} s=${18} /></span>`;
}
const VSTATUS = { inside: ['approved', 'Inside'], out: ['sent', 'Left'], waiting: ['pending', 'Waiting'], denied: ['rejected', 'Turned away'] };
function residentsOf(fl) { return fl.tenant ? [fl.tenant.name + ' (tenant)', fl.owner.name + ' (owner)'] : [fl.owner.name]; }

function WalkInSheet({ db, update, toast, onClose }) {
  const [type, setType] = useState('Delivery'); const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [flat, setFlat] = useState(() => { const o = personaBy('owner'); return o && db.flats.some((f) => f.id === o.flat) ? o.flat : db.flats[0].id; }); const [purpose, setPurpose] = useState(''); const [vehicle, setVehicle] = useState(''); const [photo, setPhoto] = useState(null);
  const fl = db.flats.find((f) => f.id === flat);
  const submit = () => {
    update('logWalkIn', (d) => d.visitors.unshift({ id: uid('V'), name: name.trim(), phone: phone.trim(), type, flat, purpose: purpose.trim() || type, vehicle: vehicle.trim(), photo, status: 'waiting', requestedAt: nowTime(), via: 'Walk-in' }));
    toast(`Approval request sent to ${fl.id}. They can allow it from the app.`); onClose();
  };
  return html`<${Sheet} title="Walk-in visitor" sub="No gate pass? Ask the flat to approve from their app." onClose=${onClose}
    foot=${html`<button className="btn" onClick=${onClose}>Cancel</button><button className="btn primary" disabled=${!name.trim() || !photo} onClick=${submit}>Ask ${flat} to approve</button>`}>
    <div className="seg">${['Guest', 'Delivery', 'Cab', 'Service'].map((t) => html`<button key=${t} className=${type === t ? 'on' : ''} onClick=${() => setType(t)}>${t}</button>`)}</div>
    <${Field} label="Visitor photo"><${FilePick} id="wi-photo" img=${photo} onPick=${setPhoto} onSample=${() => setPhoto(samplePhoto(name || 'Visitor'))} label="Take a photo at the gate" /><//>
    <${Field} label=${type === 'Delivery' ? 'Name and company' : 'Name'}><input id="wi-name" className="input" placeholder=${type === 'Delivery' ? 'Ravi · Amazon' : 'Full name'} value=${name} onInput=${(e) => setName(e.target.value)} /><//>
    <div className="grid2" style=${{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
      <${Field} label="Going to flat"><select id="wi-flat" className="input" value=${flat} onChange=${(e) => setFlat(e.target.value)}>${db.flats.map((f) => html`<option key=${f.id} value=${f.id}>${f.id}</option>`)}</select><//>
      <${Field} label="Phone" hint="Optional"><input id="wi-phone" className="input" inputMode="tel" value=${phone} onInput=${(e) => setPhone(e.target.value)} /><//></div>
    <div className="muted" style=${{ fontSize: 12 }}>${residentsOf(fl).join(' · ')}</div>
    <div className="grid2" style=${{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
      <${Field} label="Purpose" hint="Optional"><input id="wi-purpose" className="input" placeholder="Parcel" value=${purpose} onInput=${(e) => setPurpose(e.target.value)} /><//>
      <${Field} label="Vehicle no." hint="Optional"><input id="wi-vehicle" className="input" placeholder="MH12 AB 1234" value=${vehicle} onInput=${(e) => setVehicle(e.target.value.toUpperCase())} /><//></div>
  <//>`;
}
function ScanSheet({ db, onClose, onScan }) {
  const today = db.gatePasses.filter((p) => p.status === 'active');
  return html`<${Sheet} title="Scan gate pass" sub="Point the camera at the visitor’s QR code." onClose=${onClose}>
    <div className="viewfinder"><span className="vf tl"></span><span className="vf tr"></span><span className="vf bl"></span><span className="vf br"></span><span className="scanline"></span><span style=${{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', fontSize: 11.5, color: '#94A099' }}>Camera preview (simulated)</span></div>
    <div className="eyebrow">Demo: tap a pass to simulate scanning it</div>
    ${today.length ? html`<div className="list">${today.map((p) => html`<button key=${p.id} className="li" onClick=${() => onScan(p.code)}><${QR} code=${p.code} /><div className="tx"><b>${p.visitor}</b><span>${p.flat} · ${fmtDate(p.date)}</span></div><span className="num" style=${{ fontWeight: 600 }}>${p.code}</span></button>`)}</div>`
      : html`<div className="empty">No active passes. Create one as ${[personaName('owner'), personaName('tenant')].filter(Boolean).map(firstName).join(' or ') || 'a resident'}.</div>`}
  <//>`;
}


/* =============================== Admin: Visitor log =============================== */
function Visitors({ db }) {
  const [f, setF] = useState('all');
  const list = db.visitors.filter((v) => f === 'all' || v.status === f);
  const passes = db.gatePasses;
  return html`<${Fragment}>
    <${PageHead} eyebrow="Operations" title="Visitor log" sub="Every entry at the main gate today, from gate passes, walk-ins approved by residents, and daily staff." />
    <div className="metrics">
      <div className="metric"><span className="eyebrow">Inside now</span><span className="val">${db.visitors.filter((v) => v.status === 'inside').length}</span></div>
      <div className="metric"><span className="eyebrow">Entries today</span><span className="val">${db.visitors.filter((v) => v.inAt).length}</span></div>
      <div className="metric"><span className="eyebrow">Waiting at gate</span><span className="val" style=${{ color: 'var(--brass)' }}>${db.visitors.filter((v) => v.status === 'waiting').length}</span></div>
      <div className="metric"><span className="eyebrow">Active gate passes</span><span className="val">${passes.filter((p) => p.status === 'active').length}</span><span className="sub">${passes.filter((p) => p.status === 'used').length} used</span></div>
    </div>
    <div className="card"><div className="card-head"><div className="chips">${[['all', 'All'], ['inside', 'Inside'], ['out', 'Left'], ['waiting', 'Waiting'], ['denied', 'Turned away']].map(([k, l]) => html`<button key=${k} className=${'chip' + (f === k ? ' on' : '')} onClick=${() => setF(k)}>${l}</button>`)}</div><span className="muted" style=${{ fontSize: 12.5 }}>Guard on duty: ${personaName('guard', '—')}</span></div>
      <div className="table-wrap"><table className="t"><thead><tr><th>Visitor</th><th>Flat</th><th>In</th><th>Out</th><th>Entry by</th><th>Status</th></tr></thead>
        <tbody>${list.map((v) => html`<tr key=${v.id}><td><div className="person"><${VPhoto} v=${v} size=${32} /><div>${v.name}<small>${v.type}${v.vehicle ? ' · ' + v.vehicle : ''}</small></div></div></td><td className="flatno">${v.flat}</td><td className="num">${v.inAt || '—'}</td><td className="num">${v.outAt || '—'}</td><td style=${{ fontSize: 12.5 }}>${v.via}</td><td><span className=${'pill ' + VSTATUS[v.status][0]}>${VSTATUS[v.status][1]}</span></td></tr>`)}</tbody></table></div></div>
  <//>`;
}

export { PASS_TYPES, PassSheet, PassView, VIS_TYPES, PHOTO_TONES, samplePhoto, VPhoto, VSTATUS, residentsOf, WalkInSheet, ScanSheet, Visitors };
