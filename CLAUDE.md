# CLAUDE.md — Housing Society Management

Persistent project rules and orientation. Read in full before starting work.
For anything beyond this file's scope, see the Documentation map below —
especially `docs/features/_index.md`, the entry point for every feature.

## Project overview

Web app for a single residential housing society's committee: flat
onboarding, monthly maintenance billing, UPI/bank-transfer payment
collection with proof verification and receipt issuance, an ad-hoc charges
pool, society-level income/expense tracking, and email/WhatsApp
notifications.

- Personas: **Admin** (committee member — onboards flats, reviews payments,
  monitors dues), **Owner** (pays dues, manages their own contact info and
  their flat's tenant), **Tenant** (same as owner, billed at a higher rate
  while occupying).
- Scale: one society, ~24 flats. Schema supports onboarding a second society
  later; multi-society admin UX (switching, cross-society views) is out of
  scope.
- Deployment: self-hosted VPS via Docker Compose, HTTPS via a free
  dynamic-DNS hostname. See `DEPLOY.md`.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma, `@prisma/adapter-pg` driver |
| Database | PostgreSQL |
| Frontend | React + Vite + TypeScript |
| Data fetching | React Query |
| Data tables | TanStack Table v8, headless (`client/src/components/DataTable.tsx`) |
| Forms/validation | React Hook Form + Zod |
| Auth | JWT (access + refresh), bcrypt |
| Scheduling | node-cron, in-process (`server/src/jobs/`) |
| Email | Resend, behind a swappable `EmailProvider` interface |
| WhatsApp | Meta Cloud API, behind the same notification pipeline as Email |
| QR generation | `qrcode` (no external API) |
| File storage | Swappable `StorageAdapter` — local disk or S3-compatible (Cloudflare R2). See `docs/features/file-storage.md` |
| File upload parsing | `multer` (memory storage), content verified against a magic-byte sniff, not just declared Content-Type |
| Error handling | `express-async-errors` |
| Rate limiting | `express-rate-limit`, on login + password-reset only |
| Test runner | Vitest (backend and frontend) |
| API docs | `swagger-jsdoc` + `swagger-ui-express`, served at `/api/docs` |
| Deployment | Docker Compose, Nginx reverse proxy, Certbot |

## Architecture

```
server/   Express + TypeScript backend
client/   React + Vite + TypeScript frontend
nginx/    reverse proxy config
scripts/  operational shell scripts (HTTPS setup, stack checks)
docs/     documentation — see Documentation map below
prisma/   schema, migrations, seed (inside server/)
```

```
server/src/
  features/<name>/    One folder per business domain. Admin- and
                       resident-facing endpoints for the same domain split
                       into admin/ and resident/ subfolders.
    <name>.route.ts        HTTP wiring only.
    <name>.controller.ts   Parses/validates, calls the service, maps result
                            or thrown domain error to HTTP.
    <name>.service.ts      Business logic. No Express types. Throws typed
                            domain errors, never HTTP status codes.
    <name>.schemas.ts      Zod schemas.
    <name>.openapi.ts      @openapi JSDoc blocks.
  infrastructure/      Prisma client, storage adapters, email providers,
                        logging, OpenAPI assembly.
  shared/               Cross-feature helpers: error classes, tenant
                        scoping, file-signature sniffing, billing math.
  jobs/                 node-cron job definitions — thin wrappers around a
                        feature's own service.
  middleware/           Auth, role checks, rate limiting.
  config/               env()/requiredEnv().
```

**Data flow**: request → route → controller (validates, reads
`req.user.societyId`) → service (scopes every query via `scopedWhere()`,
throws domain errors) → controller maps error to HTTP status. A service is
often callable from more than one entry point (e.g. a cron job and a
manual-trigger endpoint) — never assume HTTP-only.

Full depth: `docs/architecture/backend-structure.md` (route/controller/service
pattern, Prisma gotchas) and `docs/architecture/multi-tenancy.md` (society
isolation mechanism and why it's a plain function, not middleware).

## Documentation map

- **`docs/features/_index.md`** — every feature, one line each. Start here.
- **`docs/product/prd.md`** — product requirements for the whole platform
  (built + planned phases), and the open decisions between the demo and the
  built app.
- **`product` branch** — the clickable demo (`demo/`), product docs
  (`docs/product/`) and marketing site (`website/`) live together here. The
  demo is a front-end-only prototype for trying features with clients; once
  agreed, a feature goes into the PRD and is then built in `client/` +
  `server/` on `main`. `website/build.sh` + `.github/workflows/publish-site.yml`
  publish `website/` and `demo/` to `gh-pages` — never edit `gh-pages` by hand.
  Client requests are logged in `docs/product/requests.md`; the steps from
  request to built feature are in `demo/README.md`. Build from the PRD, not
  from demo code: the demo's data model and `demo/API.md` are a prototype,
  not the backend contract. When a PRD §7 status changes, update
  `demo/js/prd.js` to match.
- **`docs/features/_status.md`** — detailed build/scope/pending status per
  feature.
- **`docs/architecture/`** — cross-cutting technical design (backend
  structure, multi-tenancy).
- **`docs/decisions/`** — why a significant design reversal happened, kept
  out of the feature docs so those stay current-state-only.
- **`docs/task-status.md`** — phase-by-phase build checklist.
- **`docs/data-model.md`** — schema reference.
- **`docs/requirements.md`** — original intake doc; historical, `CLAUDE.md`
  and the feature docs are authoritative where they disagree.
- **`docs/backend-setup.md`**, **`docs/frontend-setup.md`**,
  **`docs/database-setup.md`**, **`docs/docker-compose.md`** — local setup.
- **`DEPLOY.md`** (repo root) — production deployment runbook.

## Commands

```sh
# Backend (server/)
npm run dev              # tsx watch, local dev server
npm test                 # vitest run
npm run test:watch       # vitest watch mode
npm run lint              # eslint .
npm run build              # tsc -p tsconfig.json
npx prisma migrate dev    # create + apply a migration
npx prisma generate       # regenerate the Prisma client

# Frontend (client/)
npm run dev              # vite dev server
npm test                 # vitest run
npm run lint               # oxlint
npm run build              # tsc -b && vite build

# Deploy (repo root)
docker compose up -d --build            # build + start/recreate all services
docker compose up -d --build backend    # rebuild just the backend
docker compose up -d --build frontend   # rebuild just the frontend (required after any client/ change)
docker compose logs -f backend          # tail backend logs
./scripts/enable-https.sh               # one-time: request a Let's Encrypt cert
```

`server/.env` and `client/.env` are for running each side directly on the
host; the deployed Docker stack reads the root `.env` instead — see
`docs/docker-compose.md`.

## Conventions & patterns

- **TDD**: failing test first, confirm it fails, then implement.
- **Route/controller/service split**, one feature folder per domain — see
  Architecture above. Services never import Express types.
- **Domain errors, not HTTP codes, from services.** A service throws a typed
  error class (e.g. `DuplicateFieldError`); the controller decides what HTTP
  status that means.
- **Env config is lazy.** No central startup validation. A swappable
  integration (email, WhatsApp, S3) gets its own `getXConfig()` called only
  from inside that integration's own code path — an unconfigured optional
  integration never blocks `docker compose up`.
- **Balances and settlement status are derived, never stored.** A resident's
  Outstanding/Available Credit and each record's paid/partial/unpaid status
  are computed fresh on every read from the underlying rows — not cached or
  mutated columns. See `docs/features/payments.md`.
- **Audit logging** for every state-changing financial action
  (`AuditLog`, distinct action names per operation type).
- **Society-scoped queries everywhere** via `scopedWhere()` — see
  `docs/architecture/multi-tenancy.md`.

## Constraints & gotchas

- **Correctness over scale.** 24-flat MVP — don't over-engineer for
  multi-tenant scale, concurrency, or data volume.
- **Idempotency is mandatory** for the monthly maintenance-generation job —
  re-running for the same period must never duplicate records.
- **Financial data isolation** — proof files and billing data must never be
  reachable cross-society or by the wrong resident.
- **Low operating cost** — self-hosted VPS, no fixed third-party costs
  beyond email and (as of 2026-08-26) R2's free tier.
- **Prisma 7 + `@prisma/adapter-pg` unique-constraint errors** don't use the
  documented shape — see `docs/architecture/backend-structure.md`. Use
  `getUniqueConstraintFields()`, don't re-derive it.
- **No `Invoice`, `PaymentProof`, or `Credit` models.** Each was tried and
  removed. Don't reintroduce any of them without reading the relevant record
  in `docs/decisions/` first.

## Current focus / active work

- **WhatsApp notifications are switched off** (`WHATSAPP_ENABLED=false`) —
  the configured access token expired. Email notifications are unaffected
  and fully live. Re-enabling needs a new token plus Meta template approval;
  see `docs/features/notifications/`.

## Do not touch / out of scope

- Public self-signup (accounts are always admin- or owner-provisioned).
- Payment gateway integration (Razorpay etc.) — UPI deep-link + manual proof
  verification only.
- Notices/announcements, gate/visitor management — until a client agrees to
  them: the demo prototypes both (PRD §7.13, §7.15), and they come into scope
  only when marked *Agreed* in `docs/product/requests.md`. See
  `docs/decisions/0009-demo-features-enter-scope-through-requests.md`.
- Per-square-foot billing (flat-rate only).
- Facility booking (same gate as above, PRD §7.14), formal expense-report
  generation, polls, document vault.
- Multi-society admin UX (society switching, cross-society views) — a
  society can be onboarded at the platform level, but there's no UI to
  manage more than one from a single admin session.
