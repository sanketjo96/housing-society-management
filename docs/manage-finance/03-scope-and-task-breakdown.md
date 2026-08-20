# Manage Finance — Scope & Task Breakdown

## In Scope
`SocietyLedgerCategory`/`SocietyLedgerEntry` schema, `finance-categories`/
`society-ledger` backend modules, `FinanceCategoriesPage.tsx`/
`ManageFinancePage.tsx` frontend, Society Finance dashboard cards — per
[`01-requirements.md`](./01-requirements.md) and
[`02-architecture.md`](./02-architecture.md).

## Out of Scope
Two-person approval workflow, category rename, admin-configurable opening
balance, CSV export, recurring/scheduled expenses — see
[`05-future-scope.md`](./05-future-scope.md).

---

## Task Breakdown

### Epic 1: Schema
| Task | Description | Effort |
|---|---|---|
| 1.1 | `SocietyLedgerDirection`, `SocietyLedgerPaymentMethod` enums; `SocietyLedgerCategory`, `SocietyLedgerEntry` models; `Society`/`User` back-relations | 30 min |
| 1.2 | Migration (`add_society_ledger_entry_and_finance_category`) — purely additive, no backfill needed | 10 min |

**Epic 1 total: ~40 min**

### Epic 2: Backend — Finance Categories & Society Ledger
| Task | Description | Effort |
|---|---|---|
| 2.1 | `server/src/features/finance-categories/` — service, controller, route, Zod schemas, openapi | 45 min |
| 2.2 | `server/src/features/society-ledger/` — service, controller, route (incl. file-serving endpoint + multer + `verifyFileSignature`), Zod schemas, openapi | 1.5 hours |
| 2.3 | `AuditLog` actions (`CREATE_FINANCE_CATEGORY`, `UPDATE_FINANCE_CATEGORY`, `RECORD_SOCIETY_LEDGER_ENTRY`) | included above |
| 2.4 | Mount both routers in `server/src/app.ts` | 5 min |

**Epic 2 total: ~2.5 hours**

### Epic 3: Backend — Dashboard Integration
| Task | Description | Effort |
|---|---|---|
| 3.1 | `admin-dashboard.service.ts`: `getSocietyLedgerTotals` call, extend `DashboardSummary` with `societyTotalIncome`/`societyTotalExpense`/`societyNetPosition` | 20 min |
| 3.2 | Confirm zero changes needed to `ledger-shared.ts` | 5 min |

**Epic 3 total: ~25 min**

### Epic 4: Frontend — Admin
| Task | Description | Effort |
|---|---|---|
| 4.1 | `FinanceCategoriesPage.tsx` (new, `/settings/finance-categories`) — list + create + toggle-active, plus a Direction field/column | 1 hour |
| 4.2 | `ManageFinancePage.tsx` (new, `/manage-finance`, sidebar item) — direction toggle, direction-filtered category select, amount/date/payment-method/bank-reference/file/note form, history list with file-download action | 2.5 hours |
| 4.3 | `AdminDashboardPage.tsx` — local `DashboardSummary` fields + "Society Finance" `CardGroup` | 30 min |
| 4.4 | `DashboardLayout.tsx`/`App.tsx` — nav entries + routes | 15 min |

**Epic 4 total: ~4.25 hours**

### Epic 5: Documentation & Tests
| Task | Description | Effort |
|---|---|---|
| 5.1 | This `docs/manage-finance/` folder (already complete) | — |
| 5.2 | Backend tests: `finance-categories.service.test.ts`, `society-ledger.service.test.ts` (direction-mismatch, bank-reference-required-unless-cash, missing-file rejection), `admin-dashboard.service.test.ts` additions | 2.5 hours |
| 5.3 | Frontend tests: `FinanceCategoriesPage.test.tsx`, `ManageFinancePage.test.tsx`, `AdminDashboardPage.test.tsx` additions | 1.5 hours |

**Epic 5 total: ~4 hours (excluding already-complete docs)**

---

## Total Effort Estimate
- Epic 1 (Schema): ~40 min
- Epic 2 (Backend — modules): ~2.5 hours
- Epic 3 (Backend — dashboard): ~25 min
- Epic 4 (Frontend — admin): ~4.25 hours
- Epic 5 (Docs & Tests): ~4 hours
- **Total: ~12 hours.** Epics 1–3 (backend + schema) should land before Epic 4
  (frontend), since the form's category-by-direction filtering and the
  dashboard cards both depend on the backend endpoints existing first.

## Acceptance Criteria (per epic)
- **Epic 1 done when**: migration applies cleanly; both new models/enums are
  visible in Prisma Studio with correct relations to `Society`/`User`.
- **Epic 2 done when**: an admin can create an Income and an Expense category,
  deactivate either; recording an entry against an inactive/missing/cross-
  society category is rejected (400); recording INCOME against an EXPENSE
  category (or vice versa) is rejected (400); recording with
  `paymentMethod=BANK_TRANSFER` and no `bankReference` is rejected (400), the
  same request with `paymentMethod=CASH` succeeds; recording with no file
  attached is rejected (400); the file is retrievable only by an admin via
  `GET /api/admin/society-ledger/:id/file`.
- **Epic 3 done when**: `GET /api/admin/dashboard/summary` includes correct
  `societyTotalIncome`/`societyTotalExpense`/`societyNetPosition`, computed
  purely from `SocietyLedgerEntry` rows, with zero effect on any existing
  `DashboardSummary` field.
- **Epic 4 done when**: the "Manage Finance" sidebar item and "Finance
  categories" settings sub-item both render and route correctly; the entry
  form's category dropdown re-filters when the direction toggle changes; the
  "Society Finance" dashboard card group shows Total Income/Total Expense/Net
  with the correct accent colors and the "recorded since tracking began" note.
- **Epic 5 done when**: `npm run build`, `npm run lint`, and `npm test` are
  clean in both `server/` and `client/`.
