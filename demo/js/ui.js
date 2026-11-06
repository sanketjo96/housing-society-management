import { Avatar, Fragment, Icon, PERSONAS, STATUS_LABEL, flatSummary, fmtDate, html, useEffect, useState, wingsLabel, words } from './core.js';
import { prdFor } from './prd.js';

/* =============================== Shared UI =============================== */
function Modal({ title, sub, onClose, children, foot, wide }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return html`<div className="scrim" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <div className=${'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label=${title}>
      <div className="modal-head"><div><h2>${title}</h2>${sub && html`<p>${sub}</p>`}</div>
        <button className="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} n="x" s=${16} /></button></div>
      <div className="modal-body">${children}</div>
      ${foot && html`<div className="modal-foot">${foot}</div>`}
    </div></div>`;
}
function Drawer({ title, sub, onClose, children, foot }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return html`<div className="scrim drawer-scrim" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label=${title}>
      <div className="modal-head" style=${{ borderBottom: '1px solid var(--line-2)', paddingBottom: 16 }}><div><h2>${title}</h2>${sub && html`<p>${sub}</p>`}</div>
        <button className="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} n="x" s=${16} /></button></div>
      <div className="modal-body" style=${{ flex: 1, paddingTop: 18 }}>${children}</div>
      ${foot && html`<div className="modal-foot" style=${{ borderRadius: 0 }}>${foot}</div>`}
    </aside></div>`;
}
function Field({ label, hint, children }) {
  return html`<div className="field"><label>${label}${hint && html`<span className="lock">${hint}</span>`}</label>${children}</div>`;
}
const Locked = html`<span className="lock"><${Icon} n="lock" s=${11} /> Locked</span>`;
function Toggle({ on, onChange, label }) {
  return html`<button className=${'toggle' + (on ? ' on' : '')} role="switch" aria-checked=${on} aria-label=${label} onClick=${() => onChange(!on)}></button>`;
}
function PageHead({ eyebrow, title, sub, children }) {
  return html`<div className="page-head"><div>${eyebrow && html`<div className="eyebrow" style=${{ marginBottom: 6 }}>${eyebrow}</div>`}<h1>${title}</h1>${sub && html`<p>${sub}</p>`}</div>${children && html`<div className="actions">${children}</div>`}</div>`;
}
// Floors and units come from the flats; the login page (no data) shows a fixed sample building.
function Facade({ db, onPick, big }) {
  const flats = db ? db.flats : null;
  const floors = flats ? [...new Set(flats.map((f) => f.floor))].sort((a, b) => b - a) : [6, 5, 4, 3, 2, 1];
  const unitsOn = (f) => (flats ? flats.filter((x) => x.floor === f).sort((a, b) => a.unit - b.unit).map((x) => x.id) : [1, 2, 3, 4].map((u) => 'A-' + (f * 100 + u)));
  const cols = flats ? Math.max(1, ...floors.map((f) => unitsOn(f).length)) : 4;
  return html`<div className="facade-wrap">
    <div className="roof"></div>
    <div className="facade" style=${big || cols !== 4 ? { ...(big ? { maxWidth: 'none' } : {}), ...(cols !== 4 ? { gridTemplateColumns: `auto repeat(${cols}, 1fr)` } : {}) } : null}>
      ${floors.map((f) => html`<${Fragment} key=${f}>
        <span className="fl">${f}</span>
        ${unitsOn(f).map((id, i) => {
          const u = i + 1;
          const st = db ? flatSummary(db, id).status : (['settled', 'settled', 'settled', 'settled', 'pending', 'overdue', 'settled', 'due'][(f * 4 + u) % 8]);
          const cls = 'unit ' + st;
          return onPick ? html`<button key=${u} className=${cls} title=${id + ' · ' + STATUS_LABEL[st]} aria-label=${id + ' ' + STATUS_LABEL[st]} onClick=${() => onPick(id)}></button>`
            : html`<span key=${u} className=${cls}></span>`;
        })}
      <//>`)}
    </div>
    <div className="ground">${flats ? wingsLabel(flats).toUpperCase() : 'WING A'}</div>
  </div>`;
}
function Legend() {
  return html`<div className="legend">
    <span><i style=${{ background: '#2F6E64' }}></i>Settled</span><span><i style=${{ background: '#4E7398' }}></i>Due</span>
    <span><i style=${{ background: '#B8863A' }}></i>Pending review</span><span><i style=${{ background: '#C1503D' }}></i>Overdue</span></div>`;
}

/* =============================== Receipt =============================== */
function Receipt({ r, db, flat, compact }) {
  const s = db.settings;
  const fl = flat || db.flats.find((f) => f.id === r.flat);
  const total = r.particulars.reduce((x, p) => x + p.amount, 0);
  return html`<div className=${'receipt' + (compact ? ' compact' : '')}>
    <div className="rh"><b>${db.society.name}</b><span>${db.society.address}</span><span>Regn. No. ${db.society.regNo}</span></div>
    <div className="rmeta"><span>Receipt No. <b>${r.no}</b></span><span>Book No. ${db.society.bookNo}</span><span>A/c ${db.society.accountNo}</span><span>Date ${fmtDate(r.date)}</span></div>
    <div className="rtitle">RECEIPT</div>
    <div className="rline">Received with thanks from Shri/Smt. <span className="fill">${r.payer}</span> of Flat No. <span className="fill">${fl ? fl.id : r.flat}</span>, the sum of Rupees <span className="fill">${words(total)} only</span> by <span className="fill">${r.mode}${r.ref ? ' · ' + r.ref : ''}</span> towards the following:</div>
    <table><thead><tr><th>Particulars</th><th style=${{ textAlign: 'right', width: 110 }}>Amount (₹)</th></tr></thead>
      <tbody>${r.particulars.map((p, i) => html`<tr key=${i}><td>${p.label}</td><td className="r">${p.amount.toLocaleString('en-IN')}.00</td></tr>`)}
      <tr><td style=${{ fontWeight: 600 }}>Total</td><td className="r" style=${{ fontWeight: 700 }}>${total.toLocaleString('en-IN')}.00</td></tr></tbody></table>
    <div style=${{ fontSize: 11, color: '#5C564B', fontFamily: 'var(--body)' }}>${s.footerNote}</div>
    <div className="stamp">${(db.society.stamp || [db.society.short]).map((l, i) => html`<${Fragment} key=${i}>${i ? html`<br/>` : null}${l}<//>`)}</div>
    <div className="sigs">
      <div className="sig"><div className="ink">${s.secretarySig ? html`<img src=${s.secretarySig} alt="Secretary signature" />` : s.secretaryName.split(' ')[0]}</div><div className="ln">${s.secretaryName}<br/>Hon. Secretary</div></div>
      <div className="sig"><div className="ink">${s.treasurerSig ? html`<img src=${s.treasurerSig} alt="Treasurer signature" />` : s.treasurerName.split(' ')[0]}</div><div className="ln">${s.treasurerName}<br/>Hon. Treasurer</div></div>
    </div>
  </div>`;
}

function ResetButton({ onReset }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => { if (!ask) return; const t = setTimeout(() => setAsk(false), 4000); return () => clearTimeout(t); }, [ask]);
  return ask ? html`<span className="reset-confirm"><button className="btn sm danger" onClick=${() => { setAsk(false); onReset(); }}>Reset all demo data</button><button className="btn sm ghost" onClick=${() => setAsk(false)}>Keep</button></span>`
    : html`<button className="btn sm ghost" onClick=${() => setAsk(true)} title="Restore the original demo data"><${Icon} n="reset" s=${15} />Reset demo</button>`;
}
function Sheet({ title, sub, onClose, children, foot }) {
  return html`<div className="sheet-scrim" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <div className="sheet" role="dialog" aria-modal="true" aria-label=${title}><div className="grab"></div>
      <div className="sheet-head"><div><h2>${title}</h2>${sub && html`<p>${sub}</p>`}</div><button className="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} n="x" s=${16} /></button></div>
      <div className="sheet-body">${children}</div>
      ${foot && html`<div className="sheet-foot">${foot}</div>`}
    </div></div>`;
}
function FilePick({ id, img, onPick, onSample, label }) {
  const onFile = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => onPick(r.result); r.readAsDataURL(f); };
  return html`<div className="upload">${img ? html`<img src=${img} alt="Selected file" />` : html`<span style=${{ color: 'var(--teal)' }}><${Icon} n="upload" s=${24} /></span><span>${label}</span>`}
    <div style=${{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
      <label className="btn sm" htmlFor=${id}>${img ? 'Replace' : 'Choose file'}</label><input id=${id} type="file" accept="image/*,application/pdf" style=${{ display: 'none' }} onChange=${onFile} />
      ${!img && html`<button className="btn sm ghost" onClick=${onSample}>Use sample</button>`}</div></div>`;
}
function QR({ code }) {
  const N = 25; let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  const cells = [];
  const finder = (x, y) => (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!finder(x, y) && rnd() > 0.52) cells.push(html`<rect key=${x + '-' + y} x=${x} y=${y} width="1" height="1" />`);
  const F = (x, y) => html`<g key=${'f' + x + y}><rect x=${x} y=${y} width="7" height="7" fill="#111" /><rect x=${x + 1} y=${y + 1} width="5" height="5" fill="#fff" /><rect x=${x + 2} y=${y + 2} width="3" height="3" fill="#111" /></g>`;
  return html`<svg className="qr" viewBox=${`0 0 ${N} ${N}`} shapeRendering="crispEdges" role="img" aria-label=${'QR code for pass ' + code}><rect width=${N} height=${N} fill="#fff" /><g fill="#111">${cells}</g>${F(0, 0)}${F(N - 7, 0)}${F(0, N - 7)}</svg>`;
}

function SidePanel({ persona, eyebrow, blurb, title, steps, onSwitch, onLogout, onReset }) {
  const others = PERSONAS.filter((p) => p.key !== persona.key);
  return html`<div className="res-side">
    <div className="eyebrow">${eyebrow}</div><h1>${persona.name}</h1>
    <p className="muted" style=${{ margin: 0 }}>${blurb}</p>
    <div className="card card-pad" style=${{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <b style=${{ fontFamily: 'var(--display)', fontWeight: 500, fontSize: 16 }}>${title}</b><ol>${steps.map((s, i) => html`<li key=${i}>${s}</li>`)}</ol></div>
    <div className="eyebrow" style=${{ marginTop: 4 }}>Switch persona</div>
    <div className="switch-list">${others.map((p, i) => html`<button key=${p.key} onClick=${() => onSwitch(p.key)}><${Avatar} name=${p.name} i=${i} /><span style=${{ flex: 1 }}><b style=${{ display: 'block' }}>${p.name}</b><span className="muted" style=${{ fontSize: 11.5 }}>${p.dest}</span></span><${Icon} n="arrow" s=${14} /></button>`)}</div>
    <div className="actions"><button className="btn" onClick=${onLogout}><${Icon} n="logout" s=${16} />Log out</button><${ResetButton} onReset=${onReset} /></div>
  </div>`;
}
const StatusBar = html`<div className="statusbar"><span>9:41</span><span className="cam"></span><span style=${{ display: 'flex', gap: 4, alignItems: 'center' }}>5G <svg width="22" height="11" viewBox="0 0 22 11" aria-hidden="true"><rect x=".5" y=".5" width="18" height="10" rx="2.5" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="13" height="7" rx="1.3" fill="currentColor"/><rect x="19.5" y="3.5" width="2" height="4" rx="1" fill="currentColor" opacity=".5"/></svg></span></div>`;

/* =============================== PRD labels =============================== */
// Shows which PRD section a screen demonstrates and how far along it is.
// compact: status only, and nothing for Built (for nav items and tiles).
function PrdTag({ id, compact }) {
  const p = prdFor(id);
  if (!p || (compact && p.status === 'built')) return null;
  const title = `PRD §${p.section} ${p.title} · ${p.label}${p.note ? ' · ' + p.note : ''}`;
  return html`<span className=${'prd-tag t-' + p.status + (compact ? ' compact' : '')} title=${title}>${compact ? p.label : html`<b>§${p.section}</b> ${p.title} · ${p.label}`}</span>`;
}

export { PrdTag, Modal, Drawer, Field, Locked, Toggle, PageHead, Facade, Legend, Receipt, ResetButton, Sheet, FilePick, QR, SidePanel, StatusBar };
