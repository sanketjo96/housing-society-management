/* Pitch mode: ?pitch=1
 *
 * For showing the demo to investors, or sending a link to someone who will
 * click through on their own (often on a phone, where the side panel with
 * the "Try the full payment loop" steps is hidden):
 *   - PRD labels are off for this visit (the saved labels choice is untouched);
 *   - a small guide walks through the payment loop:
 *       1. the owner pays,  2. the admin approves,  3. the receipt is ready.
 *
 * The step comes from the data, not from clicks, so it survives switching
 * persona, reloading and Reset demo: a pending payment from the owner's
 * flat means "approve"; that payment approved means "done"; otherwise "pay".
 */
import { html, useState, Icon, inr, firstName, personaBy } from './core.js';

let PITCH = false;
try { PITCH = new URLSearchParams(location.search).get('pitch') === '1'; } catch (e) { /* no URL */ }

function tourStep(db) {
  const owner = personaBy('owner'); const admin = personaBy('admin');
  if (!owner || !admin || !owner.flat) return null;
  const mine = (db.ledger || []).filter((r) => r.flat === owner.flat && r.type === 'DEPOSIT' && r.submittedAt);
  const pending = mine.find((r) => r.status === 'pending');
  const approved = mine.filter((r) => r.status === 'approved' && r.receiptNo).pop();
  const o = firstName(owner.name), a = firstName(admin.name);
  if (pending) return { n: 2, title: `${a} approves it`, body: `${o}'s ${inr(pending.amount)} for ${owner.flat} is waiting in ${a}'s Payment review, with the screenshot. Check it and tap Approve.`, go: '#admin/review/' + pending.id, cta: `Open ${o}'s payment`, hint: `Check ${o}'s payment (${owner.flat}) and tap Approve.` };
  if (approved) return { n: 3, title: 'Receipt issued', body: `${o}'s balance is updated and receipt ${approved.receiptNo} is ready in ${o}'s passbook. No cash, no register, no chasing.`, go: '#owner/passbook', cta: `See ${o}'s passbook`, done: true };
  return { n: 1, title: `${o} pays maintenance`, body: `${o} owns ${owner.flat}. Tap Pay, pick a UPI app, then use the sample screenshot and submit.`, go: '#owner/home', cta: `Open ${o}'s app`, hint: `Tap Pay, then submit the sample screenshot.` };
}

function Tour({ db, onReset }) {
  const [open, setOpen] = useState(true);
  const s = tourStep(db);
  if (!s) return null;
  // Already on the step's screen: no need for the button (and on a phone the guide gets smaller).
  const here = !!location.hash && s.go.startsWith(location.hash);
  const go = () => { if (location.hash === s.go) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = s.go; };
  if (!open) return html`<button className="tour-pill" onClick=${() => setOpen(true)}><${Icon} n="arrow" s=${14} />Guide · step ${s.n} of 3</button>`;
  return html`<aside className=${'tour' + (here ? ' here' : '')} aria-label="Guide">
    <div className="tour-head"><span className="eyebrow">Step ${s.n} of 3</span>
      <button className="icon-btn" onClick=${() => setOpen(false)} aria-label="Hide guide" title="Hide guide"><${Icon} n="x" s=${14} /></button></div>
    <b>${s.title}</b><p className="long">${s.body}</p>${s.hint && html`<p className="short">${s.hint}</p>`}
    <div className="tour-dots">${[1, 2, 3].map((i) => html`<i key=${i} className=${i <= s.n ? 'on' : ''}></i>`)}</div>
    ${(!here || s.done) && html`<div className="actions">${!here && html`<button className="btn sm primary" onClick=${go}>${s.cta}</button>`}
      ${s.done && html`<button className="btn sm ghost" onClick=${onReset}>Start again</button>`}</div>`}
  </aside>`;
}

export { PITCH, Tour, tourStep };
