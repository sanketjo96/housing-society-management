# Proposal — Saral Society Platform

> **Draft — not yet sent.** Commercials in §5 are the latest figures from
> discussion (90 days at ₹9,000 per day) and are not confirmed. Fill in the
> client name and dates before sending. Feature detail lives in
> [`prd.md`](./prd.md); this document is the client-facing summary.

**Prepared for:** [Client name]
**Prepared by:** Sanket Joshi, Software Development & Product Engineering, Pune
**Date:** [Date]
**Valid until:** [Date + 30 days]

---

## 1. Understanding

You want a society management product for small and mid-sized Indian housing
societies of 10 to 150 flats. These societies are served today either by
platforms built for large gated communities, which are expensive and heavy
for their size, or by spreadsheets, WhatsApp groups and paper receipt books.

The product should give treasurers and committees what they actually need:
transparent dues per flat, easy UPI collection, proper receipts in the
co-operative society format, clean income and expense records, and a simple
way to keep residents informed. Native Android apps follow for residents and
for the security guard at the gate.

## 2. What already exists

- A working web application running in production for a 24-flat society:
  flat onboarding, monthly maintenance billing with owner and tenant rates,
  UPI and bank-transfer payment with proof approval, sequential CHS-format
  receipts with committee signatures, other charges, society income and
  expenses, email notifications, bulk import of a society's history, and
  self-hosted deployment.
- A clickable demo of the complete platform covering all four phases below:
  admin web dashboard, resident app and guard app.

This proposal covers taking that foundation to a complete, sellable product.

## 3. Scope

### Phase 1 — Billing core (web)

- Flats and residents: onboarding, owner and tenant details, occupancy
  history, bulk import and export
- Maintenance billing: base rate and tenant multiplier, automatic monthly
  charges, no duplicates on re-run
- Payments and collections: UPI link or QR, bank-transfer fallback, payment
  of any amount with excess kept as credit, proof upload, admin approve or
  reject with reason, cash and cheque entry
- Receipts: sequential CHS-format receipts with two signatures, preview
  before approval, receipt register, sent automatically on approval
- Admin dashboard: outstanding dues, collection rate, payments awaiting
  review, flat-wise dues table with Excel export, resident adoption

### Phase 2 — Operations layer (web)

- Society income and expenses with an income and expenditure view
- Other charges: joining fee, transfer fee, fines
- Complaints: raised by owners and tenants, upvoting, admin status and
  assignee, resident updates on WhatsApp and email
- Notices: audience targeting, pinning, optional WhatsApp broadcast
- Amenity booking: clubhouse, terrace and guest parking slots with clash
  check and admin confirmation
- Notifications: WhatsApp and email for bills, receipts, rejections,
  overdue reminders and updates; prepaid WhatsApp credits the society tops
  up itself, with a delivery log

### Phase 3 — Guard app (Android)

- Guard login on the gate phone
- Gate pass verification by QR scan or 6-digit code, one use per pass
- Walk-in visitor entry with photo, flat, purpose and vehicle number;
  residents allow or deny from their app
- Visitor log with entry and exit times; flats directory with phone numbers
- Visitor log view for the admin

### Phase 4 — Resident app (Android)

- Passbook with outstanding, credit and payable
- Pay by UPI and upload proof; receipts
- Complaints, notices and amenity booking
- Gate pass creation and sharing; allow or deny walk-in visitors
- Push notifications, PIN or biometric unlock
- Google Play Store release

### Future scope (not in this proposal)

CHS audit-ready export pack, polls and §79A-compliant redevelopment voting,
document vault, rewards for on-time payment, vendor marketplace, custom
receipt templates per society, iOS apps, Marathi and Hindi interface.

## 4. Estimated effort

| Package | Phases | Platform | Effort (person-days) |
|---|---|---|---|
| Web platform | 1 and 2 | Web | 60 |
| Android apps | 3 and 4 | Android | 30 |
| **Total** | | | **90** |

Effort assumes AI-assisted development.

## 5. Commercials

| Package | Contents | Price |
|---|---|---|
| Web platform | Phases 1 and 2 | ₹5,40,000 |
| Android apps | Phases 3 and 4 | ₹2,70,000 |
| **Complete platform** | **Phases 1 to 4** | **₹8,10,000** |

Prices exclude GST, which is added at the applicable rate.

## 6. What is not included

These are paid directly by you to the provider. Figures are approximate.

**One-time**

| Item | Approximate cost |
|---|---|
| Domain registration | ₹1,000 – ₹2,000 |
| Business registration and legal documentation | ₹10,000 – ₹25,000 |
| WhatsApp Business Account setup and verification | Free from Meta; dedicated number and SIM ₹500 – ₹1,000 |
| Payment link account for WhatsApp credit packs (KYC) | Usually free; some providers charge ₹2,000 – ₹5,000 |
| Google Play developer account | About ₹2,100 (US$25, one-time) |
| **Estimated one-time total** | **₹15,000 – ₹35,000** |

**Recurring**

| Item | Approximate cost |
|---|---|
| Server / hosting | ₹1,500 – ₹5,000 per month, scaling with the number of societies |
| Domain and SSL renewal | ₹1,000 – ₹2,000 per year |
| Transactional email | Free tier initially; ₹1,500 – ₹3,000 per month at scale |
| WhatsApp messages | About ₹0.12 per utility message; recovered from societies through prepaid credits |
| Error tracking and analytics | Self-hosted on the same server; no separate fee |
| **Estimated recurring total** | **₹3,000 – ₹10,000 per month**, depending on scale |

Also excluded: iOS apps, content creation, society data entry, resident
onboarding communication, and any hardware such as gate phones.

## 7. Assumptions

- Phases 1 and 2 are a responsive web application; Phases 3 and 4 are
  Android apps using the same backend.
- Resident payments are by UPI link or QR, or bank transfer, with manual
  proof approval. An online payment gateway for resident dues is not
  included.
- Interface language is English.
- Client inputs (decisions, content, test data, third-party account access)
  are provided within three working days of request. Delays extend
  timelines accordingly.
- Third-party approval timelines (Meta WhatsApp templates, Google Play
  review) are outside developer control.

## 8. Support

Thirty days of defect fixing after each package's acceptance is included.
Ongoing support and maintenance is a separate engagement, quoted as a
monthly retainer or an annual arrangement.

## 9. Intellectual property

On full payment of each package, all intellectual property in the delivered
work for that package transfers to you.

## 10. Next steps

1. Review the proposal and the clickable demo.
2. Confirm scope and package.
3. Signed acceptance and commencement payment to begin.

---

*Confidential — prepared solely for the named recipient.*
