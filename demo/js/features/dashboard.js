import { Avatar, Fragment, Icon, STATUS_LABEL, TODAY, daysBetween, flatSummary, html, inr, shortDate, useMemo, useState } from '../core.js';
import { Facade, Legend, PageHead } from '../ui.js';

/* =============================== Admin: Dashboard =============================== */
function TrendChart({ db }) {
  const billedNov = db.ledger.filter((r) => r.type === 'SYSTEM' && r.period === '2026-11').reduce((s, r) => s + r.amount, 0);
  const collected = (p) => db.ledger.filter((r) => r.type === 'DEPOSIT' && r.status === 'approved' && r.period === p).reduce((s, r) => s + r.amount, 0);
  const data = [
    { m: 'Jun', b: 78000, c: 78000 }, { m: 'Jul', b: 78000, c: 76500 },
    { m: 'Aug', b: 78000, c: collected('2026-08') }, { m: 'Sep', b: 78000, c: collected('2026-09') },
    { m: 'Oct', b: 78000, c: collected('2026-10') + db.ledger.filter((r) => r.type === 'DEPOSIT' && r.status === 'approved' && !r.period && r.date >= '2026-11-01').reduce((s, r) => s + r.amount, 0) },
    { m: 'Nov', b: billedNov, c: 0, now: true },
  ];
  const W = 520, H = 190, padL = 40, padB = 24, top = 10, max = 90000;
  const y = (v) => top + (H - padB - top) * (1 - v / max);
  const bw = (W - padL) / data.length;
  return html`<svg className="chart" viewBox=${`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Billed versus collected by month">
    ${[0, 30000, 60000, 90000].map((v) => html`<g key=${v}><line className="grid" x1=${padL} x2=${W} y1=${y(v)} y2=${y(v)} /><text x=${padL - 6} y=${y(v) + 3} textAnchor="end">${v ? v / 1000 + 'k' : '0'}</text></g>`)}
    ${data.map((d, i) => { const x = padL + i * bw + bw * 0.2; const w = bw * 0.6; return html`<g key=${d.m}>
      ${d.b > 0 && html`<rect className="billed" x=${x} y=${y(d.b)} width=${w} height=${y(0) - y(d.b)} rx="4" />`}
      ${d.c > 0 && html`<rect className=${'coll' + (d.now ? ' now' : '')} x=${x + w * 0.18} y=${y(d.c)} width=${w * 0.64} height=${y(0) - y(d.c)} rx="3" />`}
      <text x=${x + w / 2} y=${H - 6} textAnchor="middle">${d.m}</text>
      ${d.b > 0 && html`<text x=${x + w / 2} y=${y(Math.max(d.b, d.c)) - 5} textAnchor="middle" style=${{ fill: 'var(--ink-2)' }}>${Math.round((d.c / d.b) * 100)}%</text>`}
      ${d.now && d.b === 0 && html`<text x=${x + w / 2} y=${y(0) - 8} textAnchor="middle">not billed</text>`}
    </g>`; })}
  </svg>`;
}
function Dashboard({ db, go, openFlat, toast }) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ k: 'payable', d: -1 });
  const [q, setQ] = useState('');
  const rows = useMemo(() => db.flats.map((fl) => ({ fl, ...flatSummary(db, fl.id), occupant: fl.occupancy === 'tenant' ? fl.tenant.name : fl.owner.name })), [db]);
  const total = rows.reduce((s, r) => s + r.payable, 0);
  const counts = { all: rows.length, overdue: rows.filter((r) => r.status === 'overdue').length, due: rows.filter((r) => r.status === 'due').length, pending: rows.filter((r) => r.status === 'pending').length, settled: rows.filter((r) => r.status === 'settled').length };
  const pendingRows = db.ledger.filter((r) => r.status === 'pending');
  const octBilled = db.ledger.filter((r) => r.type === 'SYSTEM' && r.period === '2026-10').reduce((s, r) => s + r.amount, 0);
  const octPaid = db.ledger.filter((r) => r.type === 'DEPOSIT' && r.status === 'approved' && r.period === '2026-10').reduce((s, r) => s + r.amount, 0);
  const novRun = db.runs.find((r) => r.period === '2026-11');
  const openComplaints = db.complaints.filter((c) => c.status !== 'resolved');
  const reqBookings = db.bookings.filter((b) => b.status === 'requested');
  const active = db.flats.filter((f) => f.lastLogin).length;
  let list = rows.filter((r) => (filter === 'all' || r.status === filter) && (!q || (r.fl.id + r.occupant + r.fl.owner.name).toLowerCase().includes(q.toLowerCase())));
  list = [...list].sort((a, b) => { const av = sort.k === 'flat' ? a.fl.id : a[sort.k]; const bv = sort.k === 'flat' ? b.fl.id : b[sort.k]; return (av > bv ? 1 : av < bv ? -1 : 0) * sort.d; });
  const SH = ({ k, label, r }) => html`<th className=${r ? 'r' : ''}><button className=${sort.k === k ? 'on' : ''} onClick=${() => setSort({ k, d: sort.k === k ? -sort.d : -1 })}>${label}${sort.k === k && html`<${Icon} n=${sort.d < 0 ? 'down' : 'up'} s=${12} />`}</button></th>`;
  return html`<${Fragment}>
    <${PageHead} eyebrow="Tuesday, 3 November 2026" title="Good morning, Sanjay" sub=${`Here is where ${db.society.short} stands today. ${counts.overdue} flats are overdue and ${pendingRows.length} payments are waiting for your review.`}>
      <button className="btn" onClick=${() => toast('Exported dues-2026-11-03.xlsx (download is simulated in the demo)')}><${Icon} n="download" s=${16} />Export dues</button>
      <button className="btn primary" onClick=${() => go('review')}><${Icon} n="inbox" s=${16} />Review payments</button>
    <//>
    <div className="metrics">
      <div className="metric hero"><span className="eyebrow">Total receivable</span><span className="val">${inr(total)}</span><span className="sub">${counts.overdue + counts.due + counts.pending} of 24 flats have a balance</span></div>
      <div className="metric"><span className="eyebrow">October collection</span><span className="val">${Math.round((octPaid / octBilled) * 100)}%</span><div className="bar"><i style=${{ width: (octPaid / octBilled) * 100 + '%' }}></i></div><span className="sub">${inr(octPaid)} of ${inr(octBilled)} billed</span></div>
      <div className="metric"><span className="eyebrow">Awaiting review</span><span className="val" style=${{ color: 'var(--brass)' }}>${pendingRows.length}</span><span className="sub">${inr(pendingRows.reduce((s, r) => s + r.amount, 0))} in proofs and credits</span></div>
      <div className="metric"><span className="eyebrow">Resident adoption</span><span className="val">${active}<span style=${{ fontSize: 18, color: 'var(--muted)' }}> / 24</span></span><span className="sub">flats logged in during the last 30 days</span></div>
    </div>
    <div className="split">
      <div className="card">
        <div className="card-head"><div><h2>Billed vs collected</h2><span className="muted" style=${{ fontSize: 12.5 }}>Monthly maintenance, Wing A</span></div>
          <div className="legend" style=${{ color: 'var(--muted)' }}><span><i style=${{ background: 'var(--sunken)', border: '1px solid var(--line)' }}></i>Billed</span><span><i style=${{ background: 'var(--teal)' }}></i>Collected</span></div></div>
        <div className="card-pad" style=${{ paddingTop: 12 }}><${TrendChart} db=${db} /></div>
      </div>
      <div className="facade-card">
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2>Building at a glance</h2><span style=${{ fontSize: 11.5, color: 'var(--panel-muted)' }}>Tap a flat</span></div>
        <${Facade} db=${db} onPick=${openFlat} big />
        <${Legend} />
      </div>
    </div>
    <div className="split">
      <div className="card" style=${{ minWidth: 0 }}>
        <div className="card-head">
          <div className="chips">${[['all', 'All flats'], ['overdue', 'Overdue'], ['due', 'Due'], ['pending', 'Pending review'], ['settled', 'Settled']].map(([k, l]) => html`<button key=${k} className=${'chip' + (filter === k ? ' on' : '')} onClick=${() => setFilter(k)}>${l}<span className="c">${counts[k]}</span></button>`)}</div>
          <div className="search"><${Icon} n="search" s=${15} /><input id="dash-search" className="input" placeholder="Search flat or name" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="table-wrap"><table className="t">
          <thead><tr><${SH} k="flat" label="Flat" /><th>Occupant</th><${SH} k="outstanding" label="Outstanding" r /><${SH} k="credit" label="Credit" r /><${SH} k="payable" label="Payable" r /><th>Status</th></tr></thead>
          <tbody>${list.map((r) => html`<tr key=${r.fl.id} className="click" onClick=${() => openFlat(r.fl.id)}>
            <td className="flatno">${r.fl.id}</td>
            <td><div className="person"><${Avatar} name=${r.occupant} /><div style=${{ minWidth: 0 }}>${r.occupant}<small>${r.fl.occupancy === 'tenant' ? 'Tenant' : 'Owner'}</small></div></div></td>
            <td className="r num">${r.outstanding ? inr(r.outstanding) : '—'}</td>
            <td className="r num" style=${{ color: r.credit ? 'var(--brass)' : 'var(--muted)' }}>${r.credit ? inr(r.credit) : '—'}</td>
            <td className="r num" style=${{ fontWeight: 600 }}>${r.payable ? inr(r.payable) : '—'}</td>
            <td><span className=${'pill ' + r.status}>${STATUS_LABEL[r.status]}</span></td></tr>`)}
          ${!list.length && html`<tr><td colSpan="6"><div className="empty">No flats match this filter.</div></td></tr>`}</tbody>
        </table></div>
      </div>
      <div className="card">
        <div className="card-head"><h2>Needs your attention</h2></div>
        <div className="queue">
          ${!novRun && html`<button className="qi" onClick=${() => go('billing')}><span className="ic" style=${{ background: 'var(--blue-soft)', color: 'var(--blue)' }}><${Icon} n="zap" s=${17} /></span><span className="tx"><b>Generate November charges</b><span>24 flats · scheduled run is due</span></span><${Icon} n="chev" s=${16} /></button>`}
          ${pendingRows.map((r) => html`<button key=${r.id} className="qi" onClick=${() => go('review')}><span className="ic" style=${{ background: 'var(--brass-soft)', color: 'var(--brass)' }}><${Icon} n=${r.type === 'CREDIT' ? 'wallet' : 'inbox'} s=${17} /></span><span className="tx"><b>${r.type === 'CREDIT' ? 'Credit claim' : 'Payment proof'} · ${r.flat}</b><span>${r.payer} · ${inr(r.amount)}</span></span><${Icon} n="chev" s=${16} /></button>`)}
          ${openComplaints.slice(0, 2).map((c) => html`<button key=${c.id} className="qi" onClick=${() => go('complaints')}><span className="ic" style=${{ background: 'var(--coral-soft)', color: 'var(--coral)' }}><${Icon} n="wrench" s=${17} /></span><span className="tx"><b>${c.title}</b><span>${c.flat} · ${c.status === 'open' ? 'Open' : 'In progress'} · ${daysBetween(c.date, TODAY)}d</span></span><${Icon} n="chev" s=${16} /></button>`)}
          ${reqBookings.map((b) => html`<button key=${b.id} className="qi" onClick=${() => go('amenities')}><span className="ic" style=${{ background: 'var(--teal-soft)', color: 'var(--teal)' }}><${Icon} n="calendar" s=${17} /></span><span className="tx"><b>Booking request · ${db.amenities.find((a) => a.id === b.amenity).name}</b><span>${b.flat} · ${shortDate(b.date)}, ${b.slot}</span></span><${Icon} n="chev" s=${16} /></button>`)}
        </div>
      </div>
    </div>
  <//>`;
}

export { TrendChart, Dashboard };
