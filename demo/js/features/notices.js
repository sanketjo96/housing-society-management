import { Fragment, Icon, TODAY, fmtDate, html, uid, useState } from '../core.js';
import { Field, Modal, PageHead, Toggle } from '../ui.js';

/* =============================== Admin: Notices =============================== */
function Notices({ db, update, toast }) {
  const [compose, setCompose] = useState(false);
  const [n, setN] = useState({ title: '', body: '', audience: 'Everyone', pinned: false, whatsapp: true });
  const recipients = n.audience === 'Everyone' ? db.flats.length : db.flats.filter((f) => (n.audience === 'Tenants' ? f.occupancy === 'tenant' : true)).length;
  const publish = () => {
    update('publishNotice', (d) => { d.notices.unshift({ id: 'N-' + (25 + d.notices.length - 4), ...n, date: TODAY, reads: 0 }); if (n.whatsapp) { d.messages.unshift({ id: uid('M'), at: '2026-11-03 10:40', to: `${n.audience} (${recipients})`, template: 'notice_published', status: 'sent', count: recipients }); d.meta.credits -= recipients; } });
    toast(n.whatsapp ? `Notice published and sent to ${recipients} residents on WhatsApp` : 'Notice published in the app'); setCompose(false); setN({ title: '', body: '', audience: 'Everyone', pinned: false, whatsapp: true });
  };
  const sorted = [...db.notices].sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
  return html`<${Fragment}>
    <${PageHead} eyebrow="Communication" title="Notices" sub="Announcements appear on every resident’s home screen and can go out on WhatsApp.">
      <button className="btn primary" onClick=${() => setCompose(true)}><${Icon} n="plus" s=${16} />New notice</button><//>
    <div style=${{ display: 'flex', flexDirection: 'column', gap: 12 }}>${sorted.map((x) => html`<article key=${x.id} className="card card-pad" style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style=${{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}><h2 style=${{ fontSize: 19, display: 'flex', gap: 8, alignItems: 'center' }}>${x.pinned && html`<span style=${{ color: 'var(--brass)' }}><${Icon} n="pin" s=${16} /></span>`}${x.title}</h2><span className="muted" style=${{ fontSize: 12.5 }}>${fmtDate(x.date)}</span></div>
      <p style=${{ margin: 0, color: 'var(--ink-2)', maxWidth: '70ch' }}>${x.body}</p>
      <div style=${{ display: 'flex', gap: 14, fontSize: 12.5, color: 'var(--muted)', flexWrap: 'wrap', marginTop: 4 }}><span><${Icon} n="user" s=${13} style=${{ verticalAlign: '-2px' }} /> ${x.audience}</span><span><${Icon} n="eye" s=${13} style=${{ verticalAlign: '-2px' }} /> Read by ${x.reads}</span>${x.whatsapp && html`<span><${Icon} n="chat" s=${13} style=${{ verticalAlign: '-2px' }} /> Sent on WhatsApp</span>`}</div>
    </article>`)}</div>
    ${compose && html`<${Modal} title="New notice" onClose=${() => setCompose(false)} foot=${html`<button className="btn" onClick=${() => setCompose(false)}>Cancel</button><button className="btn primary" disabled=${!n.title.trim() || !n.body.trim()} onClick=${publish}>Publish</button>`}>
      <${Field} label="Title"><input id="nt-title" className="input" placeholder="Lift maintenance on Saturday" value=${n.title} onInput=${(e) => setN({ ...n, title: e.target.value })} /><//>
      <${Field} label="Message"><textarea id="nt-body" className="input" rows="4" value=${n.body} onInput=${(e) => setN({ ...n, body: e.target.value })}></textarea><//>
      <${Field} label="Audience"><div className="chips">${['Everyone', 'Owners', 'Tenants'].map((a) => html`<button key=${a} className=${'chip' + (n.audience === a ? ' on' : '')} onClick=${() => setN({ ...n, audience: a })}>${a}</button>`)}</div><//>
      <div className="row-set" style=${{ paddingBottom: 4 }}><div><b>Pin to top</b><span>Stays above newer notices</span></div><${Toggle} on=${n.pinned} label="Pin to top" onChange=${(v) => setN({ ...n, pinned: v })} /></div>
      <div className="row-set" style=${{ paddingTop: 4 }}><div><b>Also send on WhatsApp</b><span>Uses ${recipients} credits · ${db.meta.credits} available</span></div><${Toggle} on=${n.whatsapp} label="Send on WhatsApp" onChange=${(v) => setN({ ...n, whatsapp: v })} /></div>
    <//>`}
  <//>`;
}

export { Notices };
