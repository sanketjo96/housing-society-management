/* Links to screens: #<persona>/<screen>[/<sub>]
 *
 *   #admin/billing          admin web, Billing page
 *   #owner/passbook         Priya's resident app, Passbook tab
 *   #tenant/requests/bookings
 *   #guard/verify
 *
 * The persona is the user's `key` in db.json (admin, owner, tenant, guard).
 * Opening a link signs in as that persona (it's a demo). Old admin links
 * without a persona (#billing) still open the admin page. An unknown screen
 * falls back to that app's first screen.
 */
function parseRoute(hash, personaKeys) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return null;
  if (!personaKeys.includes(parts[0])) return parts.length === 1 ? { persona: 'admin', screen: parts[0], sub: null } : null;
  return { persona: parts[0], screen: parts[1] || null, sub: parts[2] || null };
}

// Replace (not push) so moving between screens doesn't fill the back button.
// replaceState fires no event, so 'saral:route' tells anything outside the
// app that shows where you are (the pitch-mode guide) that the screen changed.
const routed = () => window.dispatchEvent(new CustomEvent('saral:route'));
function setRoute(persona, screen, sub) {
  const h = '#' + [persona, screen, sub].filter(Boolean).map(encodeURIComponent).join('/');
  if (location.hash === h) return;
  try { history.replaceState(null, '', location.pathname + location.search + h); } catch (e) { /* sandboxed */ }
  routed();
}

function clearRoute() {
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* sandboxed */ }
  routed();
}

export { parseRoute, setRoute, clearRoute };
