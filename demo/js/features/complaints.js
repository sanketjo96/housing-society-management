import { Fragment, Icon, TODAY, daysBetween, fmtDate, html, shortDate, uid, useState } from '../core.js';
import { Field, Modal, PageHead, Sheet } from '../ui.js';

/* =============================== Admin: Complaints =============================== */
const PRIO = { high: 'var(--coral)', medium: 'var(--brass-bright)', low: 'var(--line)' };
function Complaints({ db, update, toast }) {
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState('');
  const c = open && db.complaints.find((x) => x.id === open);
  const move = (status) => {
    update('updateComplaint', (d) => { const x = d.complaints.find((y) => y.id === open); x.status = status; if (assignee) x.assignee = assignee; if (note.trim()) x.notes.push(note.trim()); if (status === 'resolved') x.resolvedOn = TODAY;
      d.messages.unshift({ id: uid('M'), at: '2026-11-03 10:30', to: `${x.by} · ${x.flat}`, template: status === 'resolved' ? 'complaint_resolved' : 'complaint_update', status: 'sent' }); d.meta.credits -= 1; });
    toast(status === 'resolved' ? `${open} marked resolved. ${c.by} has been notified.` : `${open} moved to In progress`); setOpen(null); setNote(''); setAssignee('');
  };
  const cols = [['open', 'Open'], ['progress', 'In progress'], ['resolved', 'Resolved']];
  return html`<${Fragment}>
    <${PageHead} eyebrow="Operations" title="Complaints" sub="Raised by residents from the app. Each update reaches the resident on WhatsApp." />
    <div className="board">${cols.map(([k, l]) => { const items = db.complaints.filter((x) => x.status === k); return html`<div key=${k} className="col">
      <div className="col-head"><b>${l}</b><span className=${'pill ' + k}>${items.length}</span></div>
      ${items.map((x) => html`<button key=${x.id} className="ticket" onClick=${() => { setOpen(x.id); setAssignee(x.assignee || ''); }}>
        <div style=${{ display: 'flex', gap: 10 }}><span className="sev" style=${{ background: PRIO[x.priority] }}></span><div style=${{ minWidth: 0 }}><b style=${{ fontSize: 13.5, fontWeight: 600 }}>${x.title}</b>
        <div className="meta" style=${{ marginTop: 6 }}><span className="num">${x.id}</span><span>·</span><span className="flatno" style=${{ fontSize: 11.5 }}>${x.flat}</span><span>·</span><span>${x.category}</span></div></div></div>
        <div className="meta" style=${{ justifyContent: 'space-between' }}><span>${x.by}</span><span>${x.status === 'resolved' ? 'Closed ' + shortDate(x.resolvedOn) : daysBetween(x.date, TODAY) + ' days open'}</span></div>
      </button>`)}</div>`; })}</div>
    ${c && html`<${Modal} title=${c.title} sub=${`${c.id} · ${c.flat} · raised by ${c.by} on ${fmtDate(c.date)}`} onClose=${() => setOpen(null)}
      foot=${c.status === 'resolved' ? html`<button className="btn" onClick=${() => setOpen(null)}>Close</button>` : html`<button className="btn" onClick=${() => setOpen(null)}>Cancel</button>${c.status === 'open' && html`<button className="btn" onClick=${() => move('progress')}>Start work</button>`}<button className="btn primary" onClick=${() => move('resolved')}><${Icon} n="check" s=${16} />Mark resolved</button>`}>
      <div style=${{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><span className=${'pill ' + c.status}>${cols.find((x) => x[0] === c.status)[1]}</span><span className="tag">${c.category.toUpperCase()}</span><span className="tag" style=${{ color: PRIO[c.priority] === 'var(--line)' ? 'var(--muted)' : PRIO[c.priority] }}>${c.priority.toUpperCase()} PRIORITY</span></div>
      ${c.notes.length > 0 && html`<div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>${c.notes.map((n, i) => html`<div key=${i} style=${{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 12px', fontSize: 13, border: '1px solid var(--line-2)' }}>${n}</div>`)}</div>`}
      ${c.status !== 'resolved' && html`<${Fragment}><${Field} label="Assigned to"><input id="cp-assign" className="input" placeholder="Vendor or committee member" value=${assignee} onInput=${(e) => setAssignee(e.target.value)} /><//>
      <${Field} label="Update for the resident"><textarea id="cp-note" className="input" placeholder="What happens next" value=${note} onInput=${(e) => setNote(e.target.value)}></textarea><//><//>`}
    <//>`}
  <//>`;
}

function ComplaintSheet({ db, fl, persona, update, toast, onClose }) {
  const [cat, setCat] = useState('Plumbing'); const [title, setTitle] = useState(''); const [body, setBody] = useState('');
  const submit = () => { const id = 'C-' + (119 + db.complaints.filter((c) => +c.id.slice(2) >= 119).length);
    update('raiseComplaint', (d) => d.complaints.unshift({ id, flat: fl.id, by: persona.name, title: title.trim(), category: cat, priority: 'medium', status: 'open', date: TODAY, notes: body.trim() ? ['Resident: ' + body.trim()] : [] }));
    toast(`Complaint ${id} raised. You’ll get updates on WhatsApp.`); onClose(); };
  return html`<${Sheet} title="Raise a complaint" onClose=${onClose} foot=${html`<button className="btn" onClick=${onClose}>Cancel</button><button className="btn primary" disabled=${!title.trim()} onClick=${submit}>Submit</button>`}>
    <${Field} label="Category"><div className="chips">${['Plumbing', 'Electrical', 'Lift', 'Housekeeping', 'Security', 'Other'].map((c) => html`<button key=${c} className=${'chip' + (cat === c ? ' on' : '')} onClick=${() => setCat(c)}>${c}</button>`)}</div><//>
    <${Field} label="What’s the problem?"><input id="cm-title" className="input" placeholder="Water leaking from kitchen ceiling" value=${title} onInput=${(e) => setTitle(e.target.value)} /><//>
    <${Field} label="Details" hint="Optional"><textarea id="cm-body" className="input" rows="3" placeholder="Since when, where exactly" value=${body} onInput=${(e) => setBody(e.target.value)}></textarea><//>
  <//>`;
}

export { PRIO, Complaints, ComplaintSheet };
