/* Saral Society demo app: entry point. Loads data through js/api.js (see API.md)
 * and picks the app for the signed-in persona. Module layout: see README.md. */
import { Fragment, Icon, Logo, PERSONAS, html, setPersonas, setToday, useEffect, useRef, useState } from './core.js';
import { AdminApp } from './apps/admin.js';
import { GuardApp } from './apps/guard.js';
import { Login } from './apps/login.js';
import { ResidentApp } from './apps/resident.js';
import { labelsInitial, saveLabels } from './prd.js';
import { clearRoute, parseRoute } from './route.js';

/* =============================== App =============================== */
function DataBadge({ mode, base, labels, onLabels }) {
  let host = '';
  try { host = base ? new URL(base, location.href).host : ''; } catch (e) {}
  return html`<div className=${'data-badge ' + mode} title=${mode === 'server' ? 'Reading and writing through the REST API at ' + base : 'No API found. Using db.json in this browser; changes are lost on reload.'}>
    <i></i>${mode === 'server' ? 'Live API · ' + host : 'Sample data · this browser only'}
    <button className=${'lbl-toggle' + (labels ? ' on' : '')} onClick=${onLabels} aria-pressed=${labels} title="Show which PRD section each screen demonstrates, and its status">PRD labels ${labels ? 'on' : 'off'}</button></div>`;
}
function Boot({ state, msg }) {
  return html`<div className="login-wrap"><div style=${{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center', maxWidth: 520 }}>
    <${Logo} s=${44} />
    ${state === 'loading' ? html`<h2 style=${{ fontSize: 24 }}>Loading society data…</h2>`
      : html`<${Fragment}><h2 style=${{ fontSize: 24 }}>Couldn’t load the data</h2>
        <p className="muted" style=${{ margin: 0 }}>Open the app through a web server rather than as a file. In the app folder run <span className="num">npm start</span>, then open <span className="num">http://localhost:3001</span>.</p>
        <p className="muted" style=${{ margin: 0, fontSize: 12.5 }}>${msg}</p><//>`}
  </div></div>`;
}
function App() {
  const [boot, setBoot] = useState({ state: 'loading' });
  const [db, setDb] = useState(null);
  const dbRef = useRef(null);
  const [persona, setPersona] = useState(null);
  const [route, setRouteState] = useState(null); // { screen, sub } from the link
  const [labels, setLabels] = useState(labelsInitial);
  const toggleLabels = () => { setLabels((v) => { saveLabels(!v); return !v; }); };
  const [toasts, setToasts] = useState([]);
  const toast = (msg) => { const id = Math.random(); setToasts((t) => [...t, { id, msg }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600); };
  const apply = (d) => { dbRef.current = d; if (d.meta && d.meta.today) setToday(d.meta.today); setPersonas(d.users || []); setDb(d); };
  useEffect(() => {
    SaralApi.init().then((r) => { apply(r.db); openRoute(); setBoot({ state: 'ready', mode: r.mode, base: r.base }); })
      .catch((e) => setBoot({ state: 'error', msg: e.message }));
    window.addEventListener('hashchange', openRoute);
    return () => window.removeEventListener('hashchange', openRoute);
  }, []);
  // Every write: change a copy, show it straight away, then send it to the API.
  const update = (action, fn) => {
    const before = dbRef.current;
    const after = JSON.parse(JSON.stringify(before));
    fn(after); SaralApi.stamp(after);
    apply(after);
    SaralApi.sync(action, before, after).catch((e) => {
      console.error(e);
      toast('Couldn’t save that change to the API. Showing the latest saved data.');
      SaralApi.reload().then(apply).catch(() => {});
    });
  };
  const reset = () => { SaralApi.reset(dbRef.current).then((d) => { apply(d); toast('Demo data restored'); }).catch((e) => { console.error(e); toast('Couldn’t restore the demo data'); }); };
  // A link (#owner/passbook) signs in as that persona and opens that screen.
  function openRoute() {
    const r = parseRoute(location.hash, PERSONAS.map((p) => p.key));
    const p = r && PERSONAS.find((x) => x.key === r.persona);
    if (!p) return;
    setPersona((cur) => (cur && cur.key === p.key ? cur : p));
    setRouteState((cur) => ({ screen: r.screen, sub: r.sub, seq: ((cur && cur.seq) || 0) + 1 }));
  }
  const logout = () => { setPersona(null); setRouteState(null); clearRoute(); };
  const onSwitch = (k) => { setPersona(PERSONAS.find((p) => p.key === k)); setRouteState(null); window.scrollTo(0, 0); };
  if (boot.state !== 'ready' || !db) return html`<${Boot} ...${boot} />`;
  const nav = { screen: route && route.screen, sub: route && route.sub, seq: route ? route.seq : 0, labels };
  let view;
  if (!persona) view = html`<${Login} onLogin=${(p) => { setPersona(p); setRouteState(null); window.scrollTo(0, 0); }} />`;
  else if (persona.key === 'admin') view = html`<${AdminApp} ...${nav} db=${db} update=${update} persona=${persona} onLogout=${logout} onReset=${reset} toast=${toast} />`;
  else if (persona.key === 'owner' || persona.key === 'tenant') view = html`<${ResidentApp} key=${persona.key} ...${nav} db=${db} update=${update} persona=${persona} onLogout=${logout} onReset=${reset} toast=${toast} onSwitch=${onSwitch} />`;
  else view = html`<${GuardApp} ...${nav} db=${db} update=${update} persona=${persona} onLogout=${logout} onReset=${reset} toast=${toast} onSwitch=${onSwitch} />`;
  return html`<${Fragment}>${view}<${DataBadge} mode=${boot.mode} base=${boot.base} labels=${labels} onLabels=${toggleLabels} /><div className="toast-zone" aria-live="polite">${toasts.map((t) => html`<div key=${t.id} className="toast"><${Icon} n="check" s=${15} />${t.msg}</div>`)}</div><//>`;
}
ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
