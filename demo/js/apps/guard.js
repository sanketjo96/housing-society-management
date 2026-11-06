import { Fragment, Icon, Logo, TODAY, firstName, fmtDate, html, nowTime, personaBy, personaName, uid, useEffect, useRef, useState } from '../core.js';
import { PrdTag, SidePanel, StatusBar } from '../ui.js';
import { setRoute } from '../route.js';
import { PASS_TYPES, ScanSheet, VPhoto, VSTATUS, WalkInSheet } from '../features/gate.js';

/* =============================== Guard app (Stage 3) =============================== */
const TABS = ['gate', 'verify', 'log', 'flats'];
// Demo script for the side panel, written from whoever and whatever is in the data.
function guardSteps(db) {
  const owner = personaBy('owner');
  const ownerName = owner ? firstName(owner.name) : 'the resident';
  const flat = owner ? owner.flat : db.flats[0].id;
  const live = db.gatePasses.filter((p) => p.status === 'active' && p.date === TODAY);
  const pass = live.find((p) => p.flat === flat) || live[0];
  return [
    pass ? `Verify: scan ${pass.visitor}’s pass (${pass.flat}) and let them in. The pass shows as used in the resident’s app.` : 'Verify: create a gate pass as a resident, then scan it here.',
    `Walk-in: add a delivery for ${flat}, then switch to ${ownerName} and allow it from the home screen.`,
    `Mark visitors out as they leave. ${firstName(personaName('admin', 'The admin'))} sees the whole log on the admin side.`,
  ];
}
function GuardApp({ db, update, persona, onLogout, onReset, toast, onSwitch, screen, seq, labels }) {
  const [tab, setTab] = useState(() => (TABS.includes(screen) ? screen : 'gate'));
  // The URL follows the tab (#guard/verify), and a changed link moves the tab.
  useEffect(() => { setRoute(persona.key, tab); }, [tab]);
  useEffect(() => { if (TABS.includes(screen) && screen !== tab) setTab(screen); }, [screen, seq]);
  const [sheet, setSheet] = useState(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [logFilter, setLogFilter] = useState('all');
  const [q, setQ] = useState('');
  const bodyRef = useRef(null);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [tab]);
  const inside = db.visitors.filter((v) => v.status === 'inside');
  const waiting = db.visitors.filter((v) => v.status === 'waiting');
  const entries = db.visitors.filter((v) => v.status === 'inside' || v.status === 'out').length;
  const expected = db.gatePasses.filter((p) => p.status === 'active' && p.date === TODAY);
  const check = (c) => {
    const p = db.gatePasses.find((x) => x.code === c);
    if (!p) return setResult({ ok: false, msg: `No pass with code ${c}. Check the code, or make a walk-in entry.` });
    if (p.status === 'used') return setResult({ ok: false, p, msg: `Already used at ${p.usedAt}. A pass works once.` });
    if (p.status === 'cancelled') return setResult({ ok: false, p, msg: 'The resident cancelled this pass.' });
    if (p.date !== TODAY) return setResult({ ok: false, p, msg: `This pass is for ${fmtDate(p.date)}, not today.` });
    setResult({ ok: true, p });
  };
  const press = (k) => { setResult(null); const c = k === 'del' ? code.slice(0, -1) : k === 'clr' ? '' : (code + k).slice(0, 6); setCode(c); if (c.length === 6) check(c); };
  const allow = (p) => {
    const t = nowTime();
    update('admitWithPass', (d) => { const x = d.gatePasses.find((y) => y.id === p.id); x.status = 'used'; x.usedAt = t;
      d.visitors.unshift({ id: uid('V'), name: p.visitor, phone: p.phone, type: p.type, flat: p.flat, purpose: p.type, photo: null, status: 'inside', inAt: t, via: 'Gate pass ' + p.code }); });
    toast(`${p.visitor} let in. ${p.createdBy} has been notified.`); setCode(''); setResult(null);
  };
  const exit = (v) => { update('markVisitorExit', (d) => { const x = d.visitors.find((y) => y.id === v.id); x.status = 'out'; x.outAt = nowTime(); }); toast(`${v.name} checked out`); };
  const decide = (v, okd) => { update('recordGuardDecision', (d) => { const x = d.visitors.find((y) => y.id === v.id); x.status = okd ? 'inside' : 'denied'; if (okd) x.inAt = nowTime(); x.via = okd ? 'Approved on call' : 'Turned away by guard'; }); toast(okd ? `${v.name} let in` : `${v.name} turned away`); };

  const VRow = (v, actions) => html`<div key=${v.id} className="li" style=${{ alignItems: 'flex-start' }}><${VPhoto} v=${v} />
    <div className="tx"><b>${v.name}</b><span>${v.type} · <span className="flatno" style=${{ fontSize: 11.5 }}>${v.flat}</span>${v.vehicle ? ' · ' + v.vehicle : ''}</span>
      <span>${v.status === 'waiting' ? 'Asked at ' + v.requestedAt : (v.inAt ? 'In ' + v.inAt : '') + (v.outAt ? ' · Out ' + v.outAt : '')} · ${v.via}</span>
      ${actions}</div>
    <span className=${'pill ' + VSTATUS[v.status][0]}>${VSTATUS[v.status][1]}</span></div>`;

  let body;
  if (tab === 'gate') body = html`<${Fragment}>
    <div className="g-stats"><div><b>${inside.length}</b><span>Inside now</span></div><div><b>${entries}</b><span>Entries today</span></div><div><b>${expected.length}</b><span>Passes due</span></div></div>
    <div className="big-act">
      <button className="primary" onClick=${() => setTab('verify')}><${Icon} n="shield" s=${26} />Verify pass<span>Code or QR</span></button>
      <button onClick=${() => setSheet({ kind: 'walkin' })}><${Icon} n="user" s=${26} />Walk-in<span>Ask the flat</span></button>
    </div>
    ${waiting.length > 0 && html`<${Fragment}><div className="sec-title"><b>Waiting for approval</b><span className="pill pending">${waiting.length}</span></div>
      <div className="list">${waiting.map((v) => VRow(v, html`<div style=${{ display: 'flex', gap: 6, marginTop: 8 }}><button className="btn sm danger" onClick=${() => decide(v, false)}>Turn away</button><button className="btn sm" onClick=${() => decide(v, true)}>Approved on call</button></div>`))}</div><//>`}
    <div className="sec-title"><b>Expected today</b><span className="muted" style=${{ fontSize: 12 }}>${expected.length} passes</span></div>
    ${expected.length ? html`<div className="list">${expected.map((p) => html`<button key=${p.id} className="li" onClick=${() => { setTab('verify'); setCode(p.code); check(p.code); }}><span style=${{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--teal-soft)', color: 'var(--teal)', flex: 'none' }}><${Icon} n=${PASS_TYPES[p.type]} s=${18} /></span><div className="tx"><b>${p.visitor}</b><span>${p.flat} · ${p.window}</span></div><${Icon} n="chev" s=${15} /></button>`)}</div>`
      : html`<div className="empty" style=${{ padding: 20 }}>No passes due today.</div>`}
    <div className="sec-title"><b>Inside now</b><span className="muted" style=${{ fontSize: 12 }}>${inside.length}</span></div>
    ${inside.length ? html`<div className="list">${inside.map((v) => VRow(v, html`<div style=${{ marginTop: 8 }}><button className="btn sm" onClick=${() => exit(v)}><${Icon} n="logout" s=${14} />Mark exit</button></div>`))}</div>` : html`<div className="empty" style=${{ padding: 20 }}>Nobody inside.</div>`}
  <//>`;
  else if (tab === 'verify') body = html`<${Fragment}>
    <button className="btn primary" style=${{ padding: 14, fontSize: 15 }} onClick=${() => setSheet({ kind: 'scan' })}><${Icon} n="grid" s=${18} />Scan QR code</button>
    <div className="muted" style=${{ textAlign: 'center', fontSize: 12.5 }}>or type the 6-digit code</div>
    <div className="code-slots" aria-live="polite">${[0, 1, 2, 3, 4, 5].map((i) => html`<span key=${i} className=${code[i] ? 'f' : ''}>${code[i] || ''}</span>`)}</div>
    ${result && (result.ok ? html`<div className="verdict ok">
        <div style=${{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="vbadge"><${Icon} n="check" s=${22} w=${2.4} /></span><div><b style=${{ fontSize: 16 }}>Valid pass</b><div style=${{ fontSize: 12.5 }}>${result.p.window}</div></div></div>
        <dl className="kv-list" style=${{ margin: 0 }}><dt>Visitor</dt><dd>${result.p.visitor}</dd><dt>Type</dt><dd>${result.p.type}</dd><dt>Flat</dt><dd className="flatno">${result.p.flat}</dd><dt>Created by</dt><dd>${result.p.createdBy}</dd>${result.p.phone && html`<dt>Phone</dt><dd className="num">${result.p.phone}</dd>`}</dl>
        <button className="btn primary" style=${{ padding: 13, fontSize: 15 }} onClick=${() => allow(result.p)}>Let in</button></div>`
      : html`<div className="verdict bad"><div style=${{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="vbadge"><${Icon} n="x" s=${22} w=${2.4} /></span><div><b style=${{ fontSize: 16 }}>Don’t let in</b><div style=${{ fontSize: 12.5 }}>${result.msg}</div></div></div>
        ${result.p && html`<div style=${{ fontSize: 12.5 }}>${result.p.visitor} · ${result.p.flat}</div>`}
        <button className="btn" onClick=${() => { setCode(''); setResult(null); setSheet({ kind: 'walkin' }); }}>Make a walk-in entry instead</button></div>`)}
    <div className="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del'].map((k) => html`<button key=${k} onClick=${() => press(k)} aria-label=${k === 'del' ? 'Delete' : k === 'clr' ? 'Clear' : k}>${k === 'del' ? html`<${Icon} n="arrow" s=${18} style=${{ transform: 'rotate(180deg)' }} />` : k === 'clr' ? html`<span style=${{ fontSize: 13, fontFamily: 'var(--body)', fontWeight: 600 }}>Clear</span>` : k}</button>`)}</div>
  <//>`;
  else if (tab === 'log') { const list = db.visitors.filter((v) => logFilter === 'all' || v.status === logFilter);
    body = html`<${Fragment}>
      <div className="chips">${[['all', 'All'], ['inside', 'Inside'], ['out', 'Left'], ['waiting', 'Waiting'], ['denied', 'Turned away']].map(([k, l]) => html`<button key=${k} className=${'chip' + (logFilter === k ? ' on' : '')} onClick=${() => setLogFilter(k)}>${l}<span className="c">${k === 'all' ? db.visitors.length : db.visitors.filter((v) => v.status === k).length}</span></button>`)}</div>
      ${list.length ? html`<div className="list">${list.map((v) => VRow(v, v.status === 'inside' ? html`<div style=${{ marginTop: 8 }}><button className="btn sm" onClick=${() => exit(v)}><${Icon} n="logout" s=${14} />Mark exit</button></div>` : null))}</div>` : html`<div className="empty">Nothing here.</div>`}
    <//>`; }
  else { const list = db.flats.filter((f) => !q || (f.id + f.owner.name + (f.tenant ? f.tenant.name : '')).toLowerCase().includes(q.toLowerCase()));
    body = html`<${Fragment}>
      <div className="search"><${Icon} n="search" s=${15} /><input id="g-search" className="input" style=${{ width: '100%' }} placeholder="Flat number or name" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <div className="list">${list.map((f) => { const who = f.tenant || f.owner; return html`<div key=${f.id} className="li"><span className="flatno" style=${{ width: 48 }}>${f.id}</span><div className="tx"><b>${who.name}</b><span>${f.tenant ? 'Tenant · owner ' + f.owner.name : 'Owner'}</span></div><span className="num" style=${{ fontSize: 12, userSelect: 'all' }}>${who.phone}</span></div>`; })}</div>
    <//>`; }

  return html`<div className="res-stage">
    <${SidePanel} persona=${persona} eyebrow="Guard app · Stage 3" title="Try the gate flows" onSwitch=${onSwitch} onLogout=${onLogout} onReset=${onReset}
      blurb=${firstName(persona.name) + ' works the main gate on an Android phone. Big buttons, few words, and everything he does reaches the resident straight away.'}
      steps=${guardSteps(db)} />
    <div className="device">
      ${StatusBar}
      <div className="g-head">
        <div style=${{ display: 'flex', alignItems: 'center', gap: 10 }}><${Logo} s=${30} /><div style=${{ flex: 1 }}><b style=${{ fontFamily: 'var(--display)', fontWeight: 500, fontSize: 18 }}>Main gate</b><div style=${{ fontSize: 11.5, color: 'var(--panel-muted)' }}>${db.society.display || db.society.short} · Day shift 8 am – 8 pm</div></div>
          <button className="icon-btn" style=${{ background: 'var(--panel-2)', borderColor: 'var(--panel-line)', color: 'var(--panel-fg)' }} onClick=${onLogout} aria-label="End shift and log out"><${Icon} n="logout" s=${16} /></button></div>
      </div>
      <div className="app-body" ref=${bodyRef}>${labels && html`<div className="prd-strip"><${PrdTag} id=${'guard/' + tab} /></div>`}${body}</div>
      <nav className="tabbar" style=${{ gridTemplateColumns: 'repeat(4, 1fr)' }} aria-label="Guard">${[['gate', 'Gate', 'grid'], ['verify', 'Verify', 'shield'], ['log', 'Visitor log', 'file'], ['flats', 'Flats', 'building']].map(([k, l, ic]) => html`<button key=${k} className=${tab === k ? 'on' : ''} onClick=${() => setTab(k)} aria-current=${tab === k ? 'page' : undefined}><${Icon} n=${ic} s=${20} />${l}${k === 'gate' && waiting.length ? ' · ' + waiting.length : ''}</button>`)}</nav>
      ${sheet && sheet.kind === 'walkin' && html`<${WalkInSheet} db=${db} update=${update} toast=${toast} onClose=${() => setSheet(null)} />`}
      ${sheet && sheet.kind === 'scan' && html`<${ScanSheet} db=${db} onClose=${() => setSheet(null)} onScan=${(c) => { setSheet(null); setTab('verify'); setCode(c); check(c); }} />`}
    </div>
  </div>`;
}

export { GuardApp };
