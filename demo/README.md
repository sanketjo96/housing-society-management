# Saral Society — clickable demo (Stage 1)

A UI-only mockup for showing the product to prospective societies. It is
separate from the real app in `client/` and `server/`: no backend, no
database, all data lives in memory and resets on reload.

Open `index.html` in a browser (it loads React 18.3.1 and htm 3.1.1 from
public CDNs).

## Logins

| Persona | Email | Lands on |
|---|---|---|
| Sanjay Gujarathi, Treasurer | admin@saralsociety.demo | Admin web dashboard |
| Priya Nair, Owner A-302 | resident@saralsociety.demo | Resident app (Stage 2) |
| Arjun Mehta, Tenant A-302 | tenant@saralsociety.demo | Resident app (Stage 2) |
| Ramesh Patil, Guard | guard@saralsociety.demo | Guard app (Stage 3) |

Password for all: `demo123`. Persona cards on the login page sign in with one tap.

## Stage 1 scope

Login page plus admin screens: Dashboard, Payment review (receipt check
before approval, reject with reason, cash/cheque entry), Billing, Receipts,
Flats & residents (passbook, details, occupancy history, bulk import),
Expenses, Complaints, Amenity booking, Notices, Notifications (WhatsApp
credits, delivery log), Settings (CHS receipt template, signatures).

Some screens (notices, amenity booking, gate passes) show features that are
out of scope for the current MVP in `CLAUDE.md`; they are here as roadmap
for the sales demo only.

## Next

- Stage 2: resident app in an Android phone frame.
- Stage 3: guard app and cross-role flows.
