# Features Index

Every feature area in this app, one line each. For build/scope/pending
detail per feature, see [`_status.md`](./_status.md).

| Feature | Doc | What it does |
|---|---|---|
| Auth & Access Control | [`auth.md`](./auth.md) | Login, JWT access/refresh, password reset, role + tenant-scoping guards |
| Flats & Residents | [`flats-and-residents.md`](./flats-and-residents.md) | Admin flat onboarding, owner/tenant contact management, resident self-service |
| Maintenance Records | [`maintenance-records.md`](./maintenance-records.md) | Monthly maintenance accrual, occupancy-based rate calculation |
| Payments | [`payments.md`](./payments.md) | Deposit ledger, Outstanding/Available Credit, UPI QR + bank-transfer payment intents |
| Receipts | [`receipts.md`](./receipts.md) | Receipt generation, approval-preview modal, Receipt Book register |
| Committee & Signatures | [`committee-and-signatures.md`](./committee-and-signatures.md) | Chairman/Secretary/Treasurer roles, signature uploads, receipt signing |
| Other Charges | [`other-charges/`](./other-charges/) | Ad-hoc one-off billing ("Other Charges"/"Custom Fees"), separate from maintenance |
| Manage Finance | [`manage-finance/`](./manage-finance/) | Society-level income/expense tracking, independent of resident billing |
| Admin Dashboard | [`admin-dashboard.md`](./admin-dashboard.md) | Collection summary, flat-wise dues, escalation/flagged-flats |
| Notifications | [`notifications/`](./notifications/) | Event-driven Email + WhatsApp notification pipeline |
| Society Onboarding | [`society-onboarding/`](./society-onboarding/) | Bootstrap a brand-new society; bulk CSV import (residents, charges, finance history) |
| File Storage | [`file-storage.md`](./file-storage.md) | Where proofs/signatures/receipts live — local disk or S3-compatible (R2) |
| Security & Hardening Audit | [`security-audit.md`](./security-audit.md) | One-time cross-cutting audit: tenant isolation, rate limiting, upload validation |
| Observability | [`observability/`](./observability/) | Structured logging; further stages (metrics, tracing) designed, not built |
| Bank Reference Capture | [`bank-reference/`](./bank-reference/) | Designed, not built — OCR-assisted UPI/bank transaction reference capture |
| Vehicle Finder | [`vehicle-finder/`](./vehicle-finder/) | Resident vehicle registration ("My Details" → Vehicle Info) + a manual plate-number lookup page (flat, occupant name, tap-to-call phone), open to every role — camera/OCR scan-assist was tried and rolled back |
| Production Deployment | [`../../DEPLOY.md`](../../DEPLOY.md) | Docker Compose, HTTPS via free dynamic-DNS, operator runbook |
