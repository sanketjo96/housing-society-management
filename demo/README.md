# Saral Society — clickable demo (Stages 1–3)

A UI-only mockup for showing the product to prospective societies. It is
separate from the real app in `client/` and `server/`: no backend, no
database, all data lives in memory and resets on reload.

Open `index.html` in a browser (it loads React 18.3.1 and htm 3.1.1 from
public CDNs).

## Logins

| Persona | Email | Lands on |
|---|---|---|
| Sanjay Gujarathi, Treasurer | admin@saralsociety.demo | Admin web dashboard |
| Priya Nair, Owner A-302 | resident@saralsociety.demo | Resident app |
| Arjun Mehta, Tenant A-302 | tenant@saralsociety.demo | Resident app |
| Ramesh Patil, Guard | guard@saralsociety.demo | Guard app |

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

## Stage 2 scope

Resident app in an Android phone frame (full screen on a real phone), for
Priya (owner) and Arjun (tenant) of A-302, who share one passbook:

- Home: payable card, pay status banners, quick actions, notices, coming up.
- Pay: full payable only, UPI app picker, payment intent that persists until
  proof is uploaded or cancelled, screenshot upload.
- Add credit, passbook (Outstanding / Credit / Payable, filters, receipts).
- Requests: complaints and amenity bookings, with slot clash check.
- Gate passes with QR and 6-digit code.
- Profile: my details (flat and rate locked; owner, occupancy, tenant editable).

Everything shares live state with the admin view: a payment submitted by a
resident appears in Payment review, and the receipt shows up in the passbook
once approved.

## Stage 3 scope

Guard app for Ramesh at the main gate, in the same phone frame:

- Gate home: inside now, entries today, passes due, waiting approvals.
- Verify pass: 6-digit keypad or simulated QR scan. Clear valid / don't let
  in verdicts (wrong code, already used, cancelled, wrong date).
- Walk-in: photo, name, flat, purpose, vehicle. The flat's residents get an
  Allow / Deny card on their home screen; the guard can also record an
  approval taken on a call.
- Visitor log with mark-exit, and a flats directory with phone numbers.
- Admin: new Visitor log page under Operations.

## Cross-role flows to show

1. Priya pays, Sanjay approves, Arjun sees the receipt.
2. Priya creates a gate pass, Ramesh verifies it, the pass shows as used.
3. Ramesh logs a walk-in for A-302, Priya allows it from her phone.
4. Arjun raises a complaint, Sanjay resolves it, Arjun sees the update.
