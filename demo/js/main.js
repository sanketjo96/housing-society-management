/* Saral Society demo app: entry point. Loads data through js/api.js (see API.md)
 * and picks the app for the signed-in persona. Module layout: see README.md. */
import { Fragment, Icon, Logo, PERSONAS, html, setPersonas, setToday, useEffect, useRef, useState } from './core.js';
import { AdminApp } from './apps/admin.js';
import { GuardApp } from './apps/guard.js';
import { Login } from './apps/login.js';
import { ResidentApp } from './apps/resident.js';

/* =============================== App =============================== */
function DataBadge({ mode, base }) {
  let host = '';
  try { host = base ? new URL(base, location.href).host : ''; } catch (e) {}
  return html`<div className=${'data-badge ' + mode} title=${mode === 'server' ? 'Reading and writing through the REST API at ' + base : 'No API found. Using db.json in this browser; changes are lost on reload.'}>
    <i></i>${mode === 'server' ? 'Live API · ' + host : 'Sample data · this browser only'}</div>`;
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
  const [toasts, setToasts] = useState([]);
  const toast = (msg) => { const id = Math.random(); setToasts((t) => [...t, { id, msg }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600); };
  const apply = (d) => { dbRef.current = d; if (d.meta && d.meta.today) setToday(d.meta.today); setPersonas(d.users || []); setDb(d); };
  useEffect(() => {
    SaralApi.init().then((r) => { apply(r.db); setBoot({ state: 'ready', mode: r.mode, base: r.base }); })
      .catch((e) => setBoot({ state: 'error', msg: e.message }));
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
  const logout = () => { setPersona(null); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} };
  const onSwitch = (k) => { setPersona(PERSONAS.find((p) => p.key === k)); window.scrollTo(0, 0); };
  if (boot.state !== 'ready' || !db) return html`<${Boot} ...${boot} />`;
  let view;
  if (!persona) view = html`<${Login} onLogin=${(p) => { setPersona(p); window.scrollTo(0, 0); }} />`;
  else if (persona.key === 'admin') view = html`<${AdminApp} db=${db} update=${update} persona=${persona} onLogout=${logout} onReset=${reset} toast=${toast} />`;
  else if (persona.key === 'owner' || persona.key === 'tenant') view = html`<${ResidentApp} key=${persona.key} db=${db} update=${update} persona=${persona} onLogout=${logout} onReset=${reset} toast=${toast} onSwitch=${onSwitch} />`;
  else view = html`<${GuardApp} db=${db} update=${update} persona=${persona} onLogout=${logout} onReset=${reset} toast=${toast} onSwitch=${onSwitch} />`;
  return html`<${Fragment}>${view}<${DataBadge} mode=${boot.mode} base=${boot.base} /><div className="toast-zone" aria-live="polite">${toasts.map((t) => html`<div key=${t.id} className="toast"><${Icon} n="check" s=${15} />${t.msg}</div>`)}</div><//>`;
}
ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
