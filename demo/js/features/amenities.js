import { Fragment, Icon, TODAY, fmtDate, html, inr, uid, useState } from '../core.js';
import { Field, PageHead, Sheet } from '../ui.js';

/* =============================== Admin: Amenities =============================== */
function Amenities({ db, update, toast }) {
  const act = (id, status) => { update('decideBooking', (d) => { const b = d.bookings.find((x) => x.id === id); b.status = status; d.messages.unshift({ id: uid('M'), at: '2026-11-03 10:45', to: `${b.by} · ${b.flat}`, template: status === 'confirmed' ? 'booking_confirmed' : 'booking_declined', status: 'sent' }); d.meta.credits -= 1; });
    const b = db.bookings.find((x) => x.id === id); toast(status === 'confirmed' ? `Booking confirmed for ${b.by}` : `Booking declined. ${b.by} has been told.`); };
  const upcoming = [...db.bookings].sort((a, b) => a.date.localeCompare(b.date));
  return html`<${Fragment}>
    <${PageHead} eyebrow="Operations" title="Amenity booking" sub="Residents request a slot from the app. Overlapping requests are blocked automatically; you confirm the rest." />
    <div className="amen">${db.amenities.map((a) => { const n = db.bookings.filter((b) => b.amenity === a.id && b.status !== 'declined').length; return html`<div key=${a.id} className="card card-pad" style=${{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style=${{ fontSize: 19 }}>${a.name}</h2><span className="ic" style=${{ color: 'var(--teal)' }}><${Icon} n="calendar" s=${18} /></span></div>
      <dl className="kv-list" style=${{ margin: 0 }}><dt>Capacity</dt><dd>${a.cap}</dd><dt>Hours</dt><dd>${a.hours}</dd><dt>Charge</dt><dd className="num">${a.fee ? inr(a.fee) + ' / slot' : 'Free'}</dd><dt>This month</dt><dd>${n} bookings</dd></dl></div>`; })}</div>
    <div className="card"><div className="card-head"><h2>Bookings</h2></div>
      <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Amenity</th><th>Flat</th><th>Purpose</th><th>Status</th><th></th></tr></thead>
      <tbody>${upcoming.map((b) => html`<tr key=${b.id}><td><b style=${{ fontWeight: 600 }}>${fmtDate(b.date)}</b><small style=${{ display: 'block', color: 'var(--muted)', fontSize: 11.5 }}>${b.slot}</small></td><td>${db.amenities.find((a) => a.id === b.amenity).name}</td><td><span className="flatno">${b.flat}</span><small style=${{ display: 'block', color: 'var(--muted)', fontSize: 11.5 }}>${b.by}</small></td><td style=${{ maxWidth: 260 }}>${b.purpose}${b.reason && html`<small style=${{ display: 'block', color: 'var(--coral)', fontSize: 11.5 }}>${b.reason}</small>`}</td>
        <td><span className=${'pill ' + b.status}>${{ requested: 'Requested', confirmed: 'Confirmed', declined: 'Declined' }[b.status]}</span></td>
        <td className="r">${b.status === 'requested' && html`<div className="actions" style=${{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}><button className="btn sm danger" onClick=${() => act(b.id, 'declined')}>Decline</button><button className="btn sm primary" onClick=${() => act(b.id, 'confirmed')}>Confirm</button></div>`}</td></tr>`)}</tbody></table></div></div>
  <//>`;
}

function BookSheet({ db, fl, persona, update, toast, onClose, initial }) {
  const [am, setAm] = useState(initial || 'clubhouse'); const [date, setDate] = useState('2026-11-15'); const [slot, setSlot] = useState(db.amenities.find((x) => x.id === (initial || 'clubhouse')).slots[0]); const [purpose, setPurpose] = useState('');
  const a = db.amenities.find((x) => x.id === am);
  const clash = db.bookings.some((b) => b.amenity === am && b.date === date && b.slot === slot && b.status !== 'declined');
  const submit = () => { update('requestBooking', (d) => d.bookings.push({ id: 'B-' + (45 + d.bookings.length - 5), amenity: am, flat: fl.id, by: persona.name, date, slot, purpose: purpose.trim() || 'Personal use', status: 'requested' })); toast(`${a.name} requested for ${fmtDate(date)}. The committee will confirm.`); onClose(); };
  return html`<${Sheet} title="Book an amenity" onClose=${onClose} foot=${html`<button className="btn" onClick=${onClose}>Cancel</button><button className="btn primary" disabled=${clash || !date} onClick=${submit}>Request booking</button>`}>
    <div className="seg">${db.amenities.map((x) => html`<button key=${x.id} className=${am === x.id ? 'on' : ''} onClick=${() => { setAm(x.id); setSlot(x.slots[0]); }}>${x.name}</button>`)}</div>
    <div style=${{ fontSize: 12.5, color: 'var(--muted)' }}>${a.cap} · ${a.hours} · ${a.fee ? inr(a.fee) + ' per slot, added to your passbook' : 'Free'}</div>
    <${Field} label="Date"><input id="bk-date" className="input" type="date" min=${TODAY} value=${date} onInput=${(e) => setDate(e.target.value)} /><//>
    <${Field} label="Slot"><div className="chips">${a.slots.map((x) => html`<button key=${x} className=${'chip' + (slot === x ? ' on' : '')} onClick=${() => setSlot(x)}>${x}</button>`)}</div><//>
    ${clash && html`<div className="error"><${Icon} n="alert" s=${15} style=${{ flex: 'none', marginTop: 2 }} />That slot is already booked. Pick another slot or date.</div>`}
    <${Field} label="Purpose"><input id="bk-purpose" className="input" placeholder="Birthday party, 25 guests" value=${purpose} onInput=${(e) => setPurpose(e.target.value)} /><//>
  <//>`;
}

export { Amenities, BookSheet };
