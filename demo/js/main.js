/* Saral Society demo app: entry point. Loads data through js/api.js (see API.md)
 * and picks the app for the signed-in persona. Module layout: see README.md. */
import { Fragment, Icon, Logo, PERSONAS, html, on, setFeatures, setPersonas, setToday, useEffect, useRef, useState } from './core.js';
import { AdminApp } from './apps/admin.js';
import { GuardApp } from './apps/guard.js';
import { Login } from './apps/login.js';
import { ResidentApp } from './apps/resident.js';
import { labelsInitial, saveLabels, setPrdOverrides } from './prd.js';
import { clearRoute, parseRoute } from './route.js';

/* =============================== Client presets =============================== */
// ?client=<id> loads clients/<id>.json: branding, which features are on, PRD
// status overrides, and optionally its own data file. See README.md.
const CLIENT_ID = (() => { try { return new URLSearchParams(location.search).get('client'); } catch (e) { return null; } })();
function loadPreset() {
  if (!CLIENT_ID) return Promise.resolve(null);
  if (!/^[a-z0-9-]{1,40}$/.test(CLIENT_ID)) return Promise.reject(new Error(`“${CLIENT_ID}” isn’t a valid client name. Use lowercase letters, digits and dashes.`));
  return fetch(`clients/${CLIENT_ID}.json`, { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(`There’s no client preset called “${CLIENT_ID}” (looked for clients/${CLIENT_ID}.json).`); return r.json(); })
    .then((p) => ({ ...p, id: CLIENT_ID }));
}
// Branding and settings from the preset, laid over freshly loaded data.
function applyPreset(db, preset) {
  if (!preset) return db;
  ['society', 'meta', 'settings'].forEach((k) => { if (preset[k]) db[k] = { ...db[k], ...preset[k] }; });
  return db;
}

/* =============================== App =============================== */
function DataBadge({ mode, base, saved, labels, onLabels, preset }) {
  let host = '';
  try { host = base ? new URL(base, location.href).host : ''; } catch (e) {}
  return html`<div className=${'data-badge ' + mode} title=${mode === 'server' ? 'Reading and writing through the REST API at ' + base : saved ? 'Sample data. Your changes are saved in this browser until you use Reset demo.' : 'Sample data. Changes are lost when you reload.'}>
    <i></i>${preset ? html`<b>${preset.name || preset.id}</b> · ` : null}${mode === 'server' ? 'Live API · ' + host : saved ? 'Sample data · saved in this browser' : 'Sample data · this tab only'}
    <button className=${'lbl-toggle' + (labels ? ' on' : '')} onClick=${onLabels} aria-pressed=${labels} title="Show which PRD section each screen demonstrates, and its status">PRD labels ${labels ? 'on' : 'off'}</button></div>`;
}
function Boot({ state, msg }) {
  return html`<div className="login-wrap"><div style=${{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center', maxWidth: 520 }}>
    <${Logo} s=${44} />
    ${state === 'loading' ? html`<h2 style=${{ fontSize: 24 }}>Loading society data…</h2>`
      : html`<${Fragment}><h2 style=${{ fontSize: 24 }}>Couldn’t load the data</h2>
        ${CLIENT_ID ? null : html`<p className="muted" style=${{ margin: 0 }}>Open the app through a web server rather than as a file. In the app folder run <span className="num">npm start</span>, then open <span className="num">http://localhost:3001</span>.</p>`}
        <p className="muted" style=${{ margin: 0, fontSize: 12.5 }}>${msg}</p><//>`}
  </div></div>`;
}
function App() {
  const [boot, setBoot] = useState({ state: 'loading' });
  const [db, setDb] = useState(null);
  const dbRef = useRef(null);
  const presetRef = useRef(null);
  const [persona, setPersona] = useState(null);
  const [route, setRouteState] = useState(null); // { screen, sub } from the link
  const [labels, setLabels] = useState(labelsInitial);
  const toggleLabels = () => { setLabels((v) => { saveLabels(!v); return !v; }); };
  const [toasts, setToasts] = useState([]);
  const toast = (msg) => { const id = Math.random(); setToasts((t) => [...t, { id, msg }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600); };
  const apply = (d) => { dbRef.current = d; if (d.meta && d.meta.today) setToday(d.meta.today); setPersonas((d.users || []).filter((u) => u.key !== 'guard' || on('gate'))); setDb(d); };
  useEffect(() => {
    loadPreset().then((preset) => {
      presetRef.current = preset;
      setFeatures(preset && preset.features); setPrdOverrides(preset && preset.prd);
      // A preset always runs on sample data in the browser, never on the shared json-server data.
      return SaralApi.init(preset ? { memoryOnly: true, seedUrl: preset.data, storeId: preset.id } : undefined);
    }).then((r) => { apply(applyPreset(r.db, presetRef.current)); openRoute(); setBoot({ state: 'ready', mode: r.mode, base: r.base, saved: !!r.saved }); })
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
  // If the browser stops accepting saves (storage full), say so once and keep going in memory.
  SaralApi.onSaveFailed = () => { setBoot((b) => ({ ...b, saved: false })); toast('This browser won’t store more demo changes. They’ll stay until you reload.'); };
  const reset = () => { SaralApi.reset(dbRef.current).then((d) => { apply(applyPreset(d, presetRef.current)); toast('Demo data restored'); }).catch((e) => { console.error(e); toast('Couldn’t restore the demo data'); }); };
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
  return html`<${Fragment}>${view}<${DataBadge} mode=${boot.mode} base=${boot.base} saved=${boot.saved} labels=${labels} onLabels=${toggleLabels} preset=${presetRef.current} /><div className="toast-zone" aria-live="polite">${toasts.map((t) => html`<div key=${t.id} className="toast"><${Icon} n="check" s=${15} />${t.msg}</div>`)}</div><//>`;
}
ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
