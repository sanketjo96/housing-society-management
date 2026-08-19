# Other Charges — Scope & Task Breakdown

## In Scope
Fee Types catalog + Other Charges billing, as a fully separate balance track
alongside maintenance dues, integrated into the existing Deposit/Credit
approval queue, receipts, and notifications — per
[`01-requirements.md`](./01-requirements.md) and
[`02-architecture.md`](./02-architecture.md).

## Out of Scope
Bulk billing, tenant-as-payer, charge editing/voiding, Other-Charges Credit,
escalation extension, per-charge due dates, CSV import — see
[`05-future-scope.md`](./05-future-scope.md).

---

## Task Breakdown

### Epic 1: Schema
| Task | Description | Effort |
|---|---|---|
| 1.1 | `FeeType` + `OtherCharge` models, `LedgerCategory` enum, `LedgerEntry`/`PaymentIntent.category` columns, back-relations | 30 min |
| 1.2 | Migration (`add_fee_type_other_charge_and_ledger_category`) — verify existing `LedgerEntry`/`PaymentIntent` rows backfill cleanly to `MAINTENANCE` | 20 min |

**Epic 1 total: ~50 min**

### Epic 2: Backend — Fee Types & Billing
| Task | Description | Effort |
|---|---|---|
| 2.1 | `server/src/features/fee-types/` — service (`listFeeTypes`, `createFeeType`, `updateFeeType`), controller, route, Zod schemas | 45 min |
| 2.2 | `server/src/features/other-charges/` — service (`listOtherCharges`, `billOtherCharge`), controller, route, Zod schemas | 45 min |
| 2.3 | `AuditLog` actions (`CREATE_FEE_TYPE`, `UPDATE_FEE_TYPE`, `BILL_OTHER_CHARGE`) | included above |
| 2.4 | Mount both routers in `app.ts` | 5 min |

**Epic 2 total: ~2 hours**

### Epic 3: Backend — Balance/Settlement Integration
| Task | Description | Effort |
|---|---|---|
| 3.1 | `ledger-shared.ts`: add `category` param to `computeFlatBalances` | 20 min |
| 3.2 | `admin-dashboard.service.ts`: add `category` param to `getBalancesByFlat`; `getDashboardSummary` combines both pools into `otherChargesOutstandingTotal`/`totalOutstandingTotal` | 30 min |
| 3.3 | `resident-ledger-service.ts`: `getLedgerForResident` gains `category` param; new `getResidentBalancesSummary(flatId)` for the Dashboard's 4 cards | 45 min |
| 3.4 | `createOrReplacePaymentIntent`/`createDeposit` gain `category` param; new `IntentAlreadyOpenForOtherCategoryError` (409) for the cross-pool block | 45 min |
| 3.5 | `admin-ledger-service.ts`: `listPendingLedgerEntries` filter gains `category`; `manualDeposit` gains `category` param | 30 min |
| 3.6 | `receipt.service.ts`: `buildPurposeLabel`'s DEPOSIT branch becomes category-aware ("Other charges payment") | 10 min |

**Epic 3 total: ~3 hours**

### Epic 4: Notifications
| Task | Description | Effort |
|---|---|---|
| 4.1 | `OtherChargeBilledEvent` added to `notification.types.ts` | 10 min |
| 4.2 | `notification.service.ts`: `idempotencyKeyFor`/`relatedEntityFor` become a `switch` with a third branch | 15 min |
| 4.3 | `whatsapp.service.ts`: new `buildTemplate` case + `templates/other-charge-billed.ts` (mirrors `maintenance-bill-generated.ts`) — required for the exhaustiveness check to compile | 30 min |

**Epic 4 total: ~1 hour**

### Epic 5: Frontend — Admin
| Task | Description | Effort |
|---|---|---|
| 5.1 | `FeeTypesPage.tsx` (new, `/settings/fee-types`) — list + add/deactivate, `FlatsListPage`-style | 1 hour |
| 5.2 | `OtherChargesPage.tsx` (new, `/other-charges`, sidebar item) — bill form + history list with settlement badges | 1.5 hours |
| 5.3 | `AdminDashboardPage.tsx` — "Outstanding Other Charges" + "Total Outstanding" cards | 20 min |
| 5.4 | `PaymentProofsPage.tsx` — Category column; manual-deposit form gains category selector | 30 min |
| 5.5 | `App.tsx`/`DashboardLayout.tsx` — new routes + nav items | 15 min |

**Epic 5 total: ~3.5 hours**

### Epic 6: Frontend — Resident
| Task | Description | Effort |
|---|---|---|
| 6.1 | `ResidentDashboardOverview.tsx` — relabel "Outstanding" → "Maintenance Outstanding"; add "Other Outstanding" (linked) + "Total Outstanding" cards, fed by `GET /api/me/balances` | 45 min |
| 6.2 | `OtherChargesBookPage.tsx` (new, `/other-charges-book`) — mirrors Maintenance Book; own Pay panel scoped to `category=OTHER_CHARGE`, sharing the one intent query | 1.5 hours |
| 6.3 | Shared intent-state handling: if an intent is open for the *other* pool, show a "finish or cancel that first" notice instead of a Pay button | 30 min |

**Epic 6 total: ~2.75 hours**

### Epic 7: Documentation & Tests
| Task | Description | Effort |
|---|---|---|
| 7.1 | This `docs/other-charges/` folder (already complete) | — |
| 7.2 | Backend tests: `fee-types.service.test.ts`, `other-charges.service.test.ts`, `ledger-shared.test.ts` additions, updated `admin-dashboard.service.test.ts`/`resident-ledger-service.test.ts` for the category-scoped flows and the cross-pool intent block | 2 hours |
| 7.3 | Frontend tests: `FeeTypesPage.test.tsx`, `OtherChargesPage.test.tsx`, `OtherChargesBookPage.test.tsx`, updates to `PaymentProofsPage.test.tsx`/`ResidentDashboardOverview.test.tsx`/`AdminDashboardPage.test.tsx` for the new cards/columns | 2 hours |

**Epic 7 total: ~4 hours (excluding already-complete docs)**

---

## Total Effort Estimate
- Epic 1 (Schema): ~50 min
- Epic 2 (Backend — Fee Types & Billing): ~2 hours
- Epic 3 (Backend — Balance/Settlement): ~3 hours
- Epic 4 (Notifications): ~1 hour
- Epic 5 (Frontend — Admin): ~3.5 hours
- Epic 6 (Frontend — Resident): ~2.75 hours
- Epic 7 (Tests): ~4 hours
- **Total: ~17 hours**, splittable across several sessions — Epics 1–4 (backend) should
  land before Epics 5–6 (frontend), since both admin and resident UI depend on the
  category-aware balance endpoints existing first.

## Acceptance Criteria (per epic)
- **Epic 1 done when**: migration applies cleanly; every pre-existing `LedgerEntry`/
  `PaymentIntent` row backfills to `category: MAINTENANCE` with zero behavior change.
- **Epic 2 done when**: an admin can create a fee type, deactivate it, and bill a
  charge against an active one; billing against an inactive or cross-society fee
  type is rejected.
- **Epic 3 done when**: a billed Other Charge shows up in `GET /api/me/balances`'s
  `otherCharges.outstanding`, is payable via a `category=OTHER_CHARGE` intent capped
  at that figure (not the maintenance figure), and starting a second intent for the
  other pool while one is open returns `409`.
- **Epic 4 done when**: billing a charge produces a `NotificationLog` row with
  `eventType: 'OTHER_CHARGE_BILLED'`; the WhatsApp template renders correctly in
  `WHATSAPP_TEST_MODE`.
- **Epic 5/6 done when**: the four new dashboard cards (2 admin + 2 resident) render
  correct, independent figures; the Other Charges Book page shows settlement badges
  matching Maintenance Book's visual convention; Payment Proofs' Category column
  correctly distinguishes rows created against each pool.
- **Epic 7 done when**: `npm run build`, `npm run lint`, and `npm test` are clean in
  both `server/` and `client/`.
