# Saral Society demo — API contract

The front end talks to its data only through `js/api.js`. Today that is
[json-server](https://github.com/typicode/json-server) 0.17.4 serving
`db.json`. Any backend that answers the same REST calls works with the
front end unchanged.

## How writes work

Screens never call `fetch`. Each write in `js/app.js` is a named action:

```js
update('approvePayment', (d) => { /* change a copy of the data */ });
```

The data layer compares the data before and after, shows the change
straight away, then sends one REST call per changed record, in order. Each
call carries the action name in an `X-Saral-Action` header so a backend can
log or route on it. If a call fails, the app shows a message and reloads the
latest data from the API.

## Endpoints a backend must provide

All bodies are JSON. Ids are strings.

| Call | Used for |
|---|---|
| `GET /<singleton>` | Load `meta`, `society`, `settings` (one object each) |
| `PUT /<singleton>` | Replace `meta` or `settings` |
| `GET /<collection>` | Load every record of a collection (array) |
| `POST /<collection>` | Create a record; the body includes its `id` |
| `PUT /<collection>/<id>` | Replace a record |
| `DELETE /<collection>/<id>` | Delete a record |

Startup check: the app calls `GET /meta` and treats the API as present when
the response is an object with a `today` field. Without one it falls back
to `db.json` in memory.

## Singletons

| Resource | Fields |
|---|---|
| `meta` | `today` (demo date, `YYYY-MM-DD`), `nextReceipt` (next receipt serial), `credits` (WhatsApp credit balance), `upiId` |
| `society` | `name`, `short`, `address`, `regNo`, `accountNo`, `bookNo` (read-only in the app) |
| `settings` | `baseRate`, `tenantMultiplier`, `receiptPrefix`, `footerNote`, `secretaryName`, `treasurerName`, `secretarySig`, `treasurerSig` (data URLs), `reminderDay`, `overdueAfter`, `autoMonthly`, `autoOverdue`, `autoReceipt`, `emailCopy` |

## Collections

| Collection | Fields |
|---|---|
| `users` | `id`, `key` (`admin`/`owner`/`tenant`/`guard`), `name`, `role`, `flat`, `dest`, `email`, `password`, `icon` |
| `flats` | `id` (`A-302`), `wing`, `number`, `floor`, `unit`, `owner {name,email,phone}`, `occupancy` (`owner`/`tenant`), `tenant {name,email,phone,since}` or null, `areaSqft`, `lastLogin`, `history [{date,text}]` |
| `ledger` | `id`, `flat`, `date`, `type` (`SYSTEM`/`DEPOSIT`/`CREDIT`), `amount`, `status` (`approved`/`pending`/`rejected`), `payer`, `period`, `note`, `mode`, `ref`, `receiptNo`, `submittedAt`, `rejectReason`, `reviewedOn`, `proofImg` |
| `receipts` | `id` (receipt number with `/` replaced by `-`), `no`, `entryId`, `flat`, `date`, `amount`, `payer`, `mode`, `ref`, `particulars [{label,amount}]`, `kind` |
| `expenses` | `id`, `date`, `category`, `vendor`, `amount`, `mode`, `ts` |
| `complaints` | `id`, `flat`, `by`, `title`, `category`, `priority`, `status` (`open`/`progress`/`resolved`), `date`, `notes []`, `assignee`, `resolvedOn`, `ts` |
| `notices` | `id`, `title`, `body`, `audience`, `date`, `pinned`, `whatsapp`, `reads`, `ts` |
| `amenities` | `id`, `name`, `cap`, `fee`, `hours`, `slots []` |
| `bookings` | `id`, `amenity`, `flat`, `by`, `date`, `slot`, `purpose`, `status` (`requested`/`confirmed`/`declined`), `reason` |
| `messages` | WhatsApp delivery log: `id`, `at`, `to`, `template`, `status`, `count`, `note`, `ts` |
| `runs` | Billing runs: `id` (= `period`), `period`, `date`, `flats`, `total`, `by` |
| `gatePasses` | `id`, `flat`, `code`, `visitor`, `phone`, `type`, `date`, `window`, `status` (`active`/`used`/`cancelled`), `createdBy`, `usedAt`, `ts` |
| `visitors` | `id`, `name`, `phone`, `type`, `flat`, `purpose`, `status` (`waiting`/`inside`/`out`/`denied`), `inAt`, `outAt`, `requestedAt`, `via`, `vehicle`, `photo`, `ts` |
| `intents` | Open payment per flat: `id` (= flat id), `amount`, `app`, `by`, `at` |
| `noticeReads` | `id` (= user key), `ids []` (notice ids read) |
| `importSample` | Sample CSV rows for the bulk-import screen |

`ts` is a created-at time in milliseconds. The app uses it to show those
collections newest first, because json-server adds new records at the end.

## Actions

Every write the app makes, the records it changes, and the domain endpoint a
real backend would normally expose for it. Until such endpoints exist, the
generic calls above carry these writes.

| Action | Who | Changes | Suggested domain endpoint |
|---|---|---|---|
| `saveFlat` | Admin | `flats` create or update | `POST /flats`, `PATCH /flats/:id` |
| `importFlats` | Admin | `flats` create (valid rows) | `POST /flats/import` |
| `saveRates` | Admin | `settings` | `PATCH /settings/billing` |
| `generateCharges` | Admin | `ledger` SYSTEM rows, `runs`, `messages`, `meta.credits` | `POST /billing-runs` (idempotent per period) |
| `approvePayment` | Admin | `ledger` status, `receipts` create, `meta.nextReceipt`, `messages`, `meta.credits` | `POST /payments/:id/approve` |
| `rejectPayment` | Admin | `ledger` status and reason, `messages`, `meta.credits` | `POST /payments/:id/reject` |
| `addExpense` | Admin | `expenses` create | `POST /expenses` |
| `updateComplaint` | Admin | `complaints` status, assignee, notes; `messages` | `PATCH /complaints/:id` |
| `publishNotice` | Admin | `notices` create, `messages`, `meta.credits` | `POST /notices` |
| `decideBooking` | Admin | `bookings` status, `messages` | `POST /bookings/:id/confirm`, `/decline` |
| `updateNotificationSetting` | Admin | `settings` | `PATCH /settings/notifications` |
| `buyCredits` | Admin | `meta.credits` | `POST /credit-purchases` (after payment) |
| `saveSettings` | Admin | `settings` | `PATCH /settings` |
| `startPayment` | Resident | `intents` create | `POST /me/payment-intents` |
| `submitPayment` | Resident | `ledger` pending DEPOSIT, `intents` delete | `POST /me/payments` |
| `cancelPayment` | Resident | `intents` delete | `DELETE /me/payment-intents/current` |
| `submitCredit` | Resident | `ledger` pending CREDIT | `POST /me/payments` with expense flag (see PRD §11 #1) |
| `raiseComplaint` | Resident | `complaints` create | `POST /complaints` |
| `requestBooking` | Resident | `bookings` create | `POST /bookings` |
| `createGatePass` | Resident | `gatePasses` create | `POST /gate-passes` |
| `cancelGatePass` | Resident | `gatePasses` status | `POST /gate-passes/:id/cancel` |
| `saveMyDetails` | Resident | `flats` owner, occupancy, tenant, history | `PUT /me/flat` |
| `recordLogin` | Resident | `flats.lastLogin` | set by the backend on login |
| `markNoticeRead` | Resident | `noticeReads`, `notices.reads` | `POST /notices/:id/read` |
| `allowVisitor` / `denyVisitor` | Resident | `visitors` status | `POST /visitors/:id/allow`, `/deny` |
| `logWalkIn` | Guard | `visitors` create (waiting) | `POST /visitors` |
| `admitWithPass` | Guard | `gatePasses` used, `visitors` create | `POST /gate-passes/verify` |
| `markVisitorExit` | Guard | `visitors` status and out time | `POST /visitors/:id/exit` |
| `recordGuardDecision` | Guard | `visitors` status | `POST /visitors/:id/decision` |
| `resetDemo` | Anyone | Everything back to `db.seed.json` | demo only |

## What json-server cannot do (and a real backend must)

json-server stores whatever it is sent, so for now the business rules run in
the browser. This is fine for a demo and not safe for real money. When
building the real backend, move these to the server:

- **Login and permissions.** `users` holds plain demo passwords and there is
  no auth. A real backend needs JWT login and per-role access, and must not
  return passwords or other flats' data.
- **Receipt numbers.** The browser reads `meta.nextReceipt` and writes it
  back, so two admins approving at the same moment could get the same
  number. Issue numbers on the server inside a transaction.
- **Multi-record writes.** An action such as `approvePayment` is several
  REST calls. If one fails halfway, records can disagree. A domain endpoint
  should do the whole action in one transaction.
- **Balances.** Outstanding, credit and payable are computed in the browser
  from `ledger`. Keep them derived, but compute them on the server too
  before approving anything.
- **Idempotent billing.** `generateCharges` skips flats already billed for
  the period in the browser. The server must enforce one charge per flat per
  period.
- **Files.** Payment proofs and signatures are stored inline as data URLs.
  A real backend should store files separately and serve them only to
  people allowed to see them.

The real app in `client/` and `server/` on `main` already does these for
billing and payments; see `docs/features/`.
