import { Avatar, Icon, Logo, PERSONAS, html, useState } from '../core.js';
import { Facade, Field, Legend } from '../ui.js';

/* =============================== Login =============================== */
function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!email.trim() || !pw) { setErr('Enter your email and password to continue.'); return; }
    const u = PERSONAS.find((p) => p.email === email.trim().toLowerCase());
    if (!u || pw !== u.password) { setErr('That email and password don’t match a demo account. Use a persona below, or password demo123.'); return; }
    onLogin(u);
  };
  return html`<div className="login-wrap">
    <div className="login-card">
      <div className="login-hero">
        <div className="brand"><${Logo} s=${38} /><span className="brand-name">Saral Society</span></div>
        <div className="brand-tag">Maintenance, dues and receipts for every flat, in one passbook.</div>
        <div style=${{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 'auto' }}>
          <${Facade} />
          <${Legend} />
        </div>
      </div>
      <form className="login-form" onSubmit=${submit} noValidate>
        <div><h2 style=${{ fontSize: 28 }}>Log in</h2><p className="muted" style=${{ margin: '6px 0 0' }}>Access your society’s dues, payments and receipts.</p></div>
        ${err && html`<div className="error" role="alert"><${Icon} n="alert" s=${16} style=${{ flex: 'none', marginTop: 2 }} />${err}</div>`}
        <${Field} label="Email"><div className="input-icon"><${Icon} n="mail" s=${16} />
          <input id="login-email" className="input" type="email" autoComplete="username" placeholder="you@example.com" value=${email} onInput=${(e) => { setEmail(e.target.value); setErr(''); }} /></div><//>
        <div className="field"><label htmlFor="login-pw">Password<a href="#" onClick=${(e) => { e.preventDefault(); setErr(''); }} style=${{ color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }} title="Disabled in demo">Forgot password?</a></label>
          <div className="input-icon"><${Icon} n="lock" s=${16} />
          <input id="login-pw" className="input" type=${show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value=${pw} onInput=${(e) => { setPw(e.target.value); setErr(''); }} />
          <button type="button" className="eye" onClick=${() => setShow(!show)} aria-label=${show ? 'Hide password' : 'Show password'}><${Icon} n=${show ? 'eyeoff' : 'eye'} s=${17} /></button></div></div>
        <button className="btn primary" type="submit" style=${{ padding: '12px 16px', fontSize: 14.5 }}>Log in</button>
        <div style=${{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, color: 'var(--muted)' }}>
          Demo accounts: <span className="num" style=${{ color: 'var(--ink)' }}>admin@</span>, <span className="num" style=${{ color: 'var(--ink)' }}>resident@</span>, <span className="num" style=${{ color: 'var(--ink)' }}>tenant@</span> or <span className="num" style=${{ color: 'var(--ink)' }}>guard@saralsociety.demo</span> with password <span className="num" style=${{ color: 'var(--ink)' }}>demo123</span></div>
        <p className="muted" style=${{ fontSize: 12.5, margin: 0, textAlign: 'center' }}>Accounts are created by your society admin.<br/><span style=${{ fontSize: 11.5, opacity: .8 }}>Designed by Sanket Joshi</span></p>
      </form>
    </div>
    <div className="personas">
      <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div><div className="eyebrow">Demo personas</div><div style=${{ fontFamily: 'var(--display)', fontSize: 19, marginTop: 2 }}>Tap a person to step into their view</div></div>
        <span className="muted" style=${{ fontSize: 12.5 }}>Owner and tenant of A-302 share one flat ledger</span></div>
      <div className="persona-row">
        ${PERSONAS.map((p, i) => html`<button key=${p.key} className="persona" onClick=${() => onLogin(p)}>
          <div style=${{ display: 'flex', gap: 10, alignItems: 'center' }}><${Avatar} name=${p.name} i=${i} />
            <div style=${{ minWidth: 0 }}><b style=${{ display: 'block', fontSize: 14 }}>${p.name}</b><span className="muted" style=${{ fontSize: 12 }}>${p.role}</span></div></div>
          <div className="dest"><span style=${{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><${Icon} n=${p.icon} s=${14} />${p.dest}</span><${Icon} n="arrow" s=${14} /></div>
        </button>`)}
      </div>
    </div>
  </div>`;
}

export { Login };
