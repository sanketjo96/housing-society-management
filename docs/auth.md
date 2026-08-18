# Auth

Reference for authentication and account management, built up through Phase 2.

## Route prefix: everything is under `/api/`

Every backend route in this doc — and every one from here on — is mounted under
`/api/`, even though the task tracker's route path text (`POST /admin/users`, etc.)
doesn't include that prefix. This isn't a style choice: `nginx/default.conf` (Task
0.5) only reverse-proxies `/api/*` to the backend; anything outside that prefix falls
through to the frontend's static-file/SPA-fallback location block and never reaches
Express at all. Task 0.6's health endpoint (`GET /api/health`) already established
this prefix; the tracker's later phases just didn't repeat it in the shorthand route
descriptions. So: `POST /admin/users` in the tracker means `POST /api/admin/users` in
the actual implementation, and the same applies to every future route.

## Account creation — `POST /api/admin/users`

Split across three files (see `CLAUDE.md`'s "Backend architecture" section for why):

- `src/routes/admin-users.route.ts` — wires the path to the controller, nothing else.
- `src/controllers/admin-users.controller.ts` — Zod-validates the request body, calls
  the service, maps its result/errors to an HTTP response.
- `src/services/admin-users.service.ts` — `createUser()`, the actual logic: hashes the
  password, calls Prisma, throws `DuplicateFieldError` on a unique-constraint conflict.
  No Express types — testable directly (see
  `tests/services/admin-users.service.test.ts`), not just through HTTP.

Creates a single user (owner or tenant, or another admin) with a bcrypt-hashed
password. No public self-signup exists in this MVP — accounts only ever get created
this way, by an admin.

**Request body** (validated with Zod):

```json
{
  "name": "string, required",
  "email": "string, required, valid email format",
  "phone": "string, optional",
  "password": "string, required, min 8 chars — plaintext, hashed server-side",
  "role": "ADMIN | OWNER | TENANT",
  "societyId": "string, required"
}
```

**Response**: `201` with the created user, `passwordHash` excluded from the response
(the Prisma `select` explicitly whitelists safe fields — the hash is never echoed back,
even though it's already irreversible). `409` if the email or phone is already in use,
**naming which field** (`"email already in use"` vs `"phone already in use"`) — the
service throws a `DuplicateFieldError` carrying the specific field name(s), which the
controller maps to the message. `400` on invalid input (Zod validation failure,
response includes `details` from `error.flatten()`).

**Gotcha this surfaced**: getting the specific field name required digging into
Prisma's actual P2002 error shape, which is *not* what Prisma's docs describe.
`err.meta.target` (the classic documented shape) doesn't exist with Prisma 7 +
`@prisma/adapter-pg` — the real field list is at
`err.meta.driverAdapterError.cause.constraint.fields`, confirmed by deliberately
triggering a duplicate-key error and inspecting it directly rather than trusting docs.
Handled once, generically, in `src/lib/prisma-errors.ts` — any future service needing
this should use `getUniqueConstraintFields()`, not re-derive it.

**Not yet admin-enforced.** This route has no auth/role-guard middleware protecting it
yet — that's Task 2.5, not built. There's a `TODO` comment directly in
`admin-users.route.ts` marking exactly where `requireRole(['ADMIN'])` needs to be
applied once it exists. Right now, anyone who can reach the API can call this endpoint.
This is expected at this point in the build (the tracker sequences it this way — write
the endpoint, layer auth on top of it in 2.5), not an oversight to be alarmed by, but
it means **this endpoint must not be exposed beyond local dev/testing until Task 2.5
lands**.

**Bootstrapping note**: this endpoint can't create the *very first* admin account for
a new society — it takes `societyId` as a plain request field with no auth context
(like a logged-in admin's JWT) to derive it from instead. The first admin for a
society comes from `prisma/seed.ts` (local dev) or a manual DB action (real
deployment, whenever that's decided) — this endpoint is for creating *additional*
accounts once at least one admin and one society already exist.

**Why the password is never partially validated beyond length here**: this endpoint
intentionally keeps validation minimal (min 8 chars) — it's not the place for
password-strength policy, which isn't a stated requirement anywhere in scope. Zod
schema lives in `admin-users.controller.ts`; if a stricter policy is ever wanted,
that's where it would go.

## Login — `POST /api/auth/login`

Same three-file split: `src/routes/auth.route.ts`, `src/controllers/auth.controller.ts`
(Zod: `email`, `password`), `src/services/auth.service.ts` (`login()` — the actual
credential check and token issuance).

**Request body**: `{ "email": "...", "password": "..." }`.

**Response**: `200` with `{ accessToken, user }` in the JSON body (`user` excludes
`passwordHash`, built as an explicit field-by-field object in the service rather than
a destructure-and-omit — avoids relying on lint config to catch an
accidentally-unused `passwordHash` variable) — **plus the refresh token, set as an
`httpOnly` cookie, never in the JSON body at all** (changed in Task 2.7; see below).
`401` for *either* a nonexistent email *or* a wrong password — deliberately the same
status and message (`InvalidCredentialsError`, "Invalid email or password") for both
cases, so the response can't be used to enumerate which emails have accounts. `400` on
invalid input.

> **Transport changed in Task 2.7.** The `login()`/`refreshAccessToken()`/`logout()`
> *service* functions (`src/services/auth.service.ts`) are unchanged from Tasks
> 2.2/2.3 — they still just take/return a plain token string, no knowledge of
> HTTP. Only the *controller* (`src/controllers/auth.controller.ts`) changed: it now
> sets the refresh token via `res.cookie('refreshToken', ..., { httpOnly: true, ... })`
> instead of including it in the JSON body, and `refresh`/`logout` now read it from
> `req.cookies.refreshToken` instead of `req.body.refreshToken`. This is the concrete
> payoff of the route/controller/service split (`CLAUDE.md`) — the business logic
> didn't need touching at all, only the HTTP-facing plumbing around it. Full reasoning
> (why httpOnly, why this was worth reworking already-tested endpoints, and a real bug
> this surfaced) is in `docs/frontend-setup.md`'s "Auth flow, from the frontend's
> perspective" section — this doc stays focused on the backend contract itself.

**Token format**: HS256 JWT, signed with `JWT_ACCESS_SECRET` (env var — see
`.env.example` for both the root and `server/` copies; `docker-compose.yml` passes it
through to the backend container). Expires in **15 minutes** (`expiresIn: '15m'`).
Payload:

```json
{
  "sub": "<user id>",
  "role": "ADMIN | OWNER | TENANT",
  "societyId": "<society id>",
  "iat": 1234567890,
  "exp": 1234568790
}
```

`role` and `societyId` are embedded directly in the token — Task 2.5's role-guard and
Task 2.6's tenant-scoping middleware can read them straight off the verified token
without a database round-trip on every request.

**Manually verified** against the real running stack (not just the test suite) with
the seeded admin account:

```sh
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sunrise.test","password":"password123"}'
```

Returned a real token that decodes with `role: "ADMIN"` and the seeded society's id —
confirms the whole path (nginx → backend → Postgres → JWT signing) works end to end,
not just in isolation under Vitest.

## Refresh token and logout — `POST /api/auth/refresh`, `POST /api/auth/logout`

### Why refresh tokens are opaque random values, not JWTs

A signed JWT can't be revoked before it naturally expires — there's no way to "un-sign"
one. But "clean logout" (this task's explicit requirement) means a token must become
unusable *immediately* on logout, not just eventually. So refresh tokens work
completely differently from the access token: a random 32-byte value
(`crypto.randomBytes(32).toString('hex')`), checked against a `RefreshToken` row in
Postgres on every use — not a signature to verify, a database lookup to perform. This
is what actually makes revocation possible.

`RefreshToken` (added this task — Phase 1 didn't anticipate auth-mechanism tables,
which is expected; they get added when the auth flow they support is actually built):

```prisma
model RefreshToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
}
```

- **`tokenHash`, not the raw token.** Same principle as `passwordHash` — if the
  database were ever compromised, stored refresh tokens shouldn't be directly usable.
  Uses a fast SHA-256 hash (`crypto.createHash`), not bcrypt — appropriate here because
  the token is already high-entropy (32 random bytes), unlike a low-entropy
  user-chosen password that needs deliberately slow hashing to resist brute force.
- **`revokedAt`, not a deleted row, on logout.** Keeps a record that this specific
  token was explicitly invalidated (vs. merely expired naturally) — cheap to keep,
  and there's no requirement to purge it (no NFR calling for that at this MVP scale).
- **Expires in 7 days** (`REFRESH_TOKEN_TTL_DAYS = 7`, `src/services/auth.service.ts`)
  — a default, not a value specified anywhere in the requirements; picked as a
  reasonable session length for a resident checking dues/paying maintenance
  periodically, not a business rule to treat as locked.
- **No rotation.** Each call to `/api/auth/refresh` reuses the same refresh token
  (validates it, issues a new access token) rather than issuing a new refresh token
  and invalidating the old one. Rotation is a real security improvement (limits how
  long a stolen refresh token stays useful) but adds real complexity (token-family
  tracking, handling concurrent refresh races) that isn't a stated requirement for
  this MVP — noted here as a deliberate scope decision, not an oversight, in case
  it's revisited later.

### `POST /api/auth/refresh`

**Request**: `{ "refreshToken": "..." }`. **Response**: `200` with `{ accessToken }`
(a fresh 15-minute access token) if the refresh token exists, isn't revoked, and
hasn't expired; `401` (`InvalidRefreshTokenError`) otherwise — the same error for
"never existed," "expired," and "revoked," so the response can't be used to
distinguish those cases either.

### `POST /api/auth/logout`

**Request**: `{ "refreshToken": "..." }`. **Response**: always `200` — **logout is
idempotent by design**. Logging out twice, or logging out with an already-expired or
unknown token, is a no-op each time rather than an error: the caller's intent ("I
don't want to be logged in") is already satisfied regardless, and there's no reason to
leak whether a given token was ever valid via a different status code.

After logout, the *same* refresh token immediately fails on `/api/auth/refresh` with
`401` — verified directly in both the service-level and route-level test suites (login
→ logout → attempt refresh → expect rejection), not just tested independently.

## Password reset — `POST /api/auth/request-reset`, `POST /api/auth/reset`

Third and last token type in the auth system, and the same underlying pattern as
`RefreshToken` (Task 2.3) for the same reason: a reset link has to be single-use and
revocable, which a signed JWT can't do on its own.

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
}
```

- **`usedAt`, not deleted, on use.** This task's explicit requirement is "an expired
  *or reused* token is rejected" — reuse can only be detected if the used token is
  still there to check against, so consuming a token marks it, it doesn't remove it.
- **Expires in 1 hour** (`RESET_TOKEN_TTL_MINUTES = 60`,
  `src/features/auth/auth.service.ts`) — deliberately much shorter than the
  refresh token's 7 days. A picked default (not a stated requirement), same as the
  refresh token's TTL — reset links are a narrower attack window by convention
  (industry-typical range is 15 minutes–1 hour), so 1 hour errs toward the longer,
  more forgiving end while still being far tighter than a session token.

### Email (Phase 7, now built): swappable `EmailProvider`, Resend by default

The task's own precheck originally said: *"if Phase 7 (email) isn't done yet, stub the
send and log the token instead."* That stub (`sendResetEmailStub()`, a bare
`console.log`) has been replaced with a real send through `src/lib/email`'s
`EmailProvider` interface — the same "one env var picks the implementation" shape
`src/lib/storage`'s `StorageAdapter` already established for payment proofs.
`getEmailProvider()` (`src/lib/email/index.ts`) switches on `EMAIL_PROVIDER`:

- **`console`** (default, unset also falls here) — logs instead of sending. What
  `sendResetEmailStub` used to do inline; kept as the dev/test default so `npm test`
  and local `npm run dev` never need a real API key. `tests/setup.ts` relies on this
  default — it never sets `EMAIL_PROVIDER`.
- **`resend`** — real send via the [Resend](https://resend.com) API (free tier: 3,000
  emails/month, 100/day, one verified domain — comfortably covers this MVP's volume).
  Requires `RESEND_API_KEY` (from resend.com/api-keys) and `EMAIL_FROM` (must be on a
  domain verified in that Resend account — the sandbox default `onboarding@resend.dev`
  only delivers to the account owner's own email, not real residents).
- **`sendgrid`** — named as the documented alternative (`CLAUDE.md`'s tech-stack
  table) but not implemented; throws a clear error pointing at where to add it.

`auth.service.ts`'s `requestPasswordReset(email): Promise<string | null>`
signature didn't change — only what happens with the token inside it did. It now
builds the actual link the resident clicks via `buildResetUrl()`: `APP_BASE_URL` (the
public URL the frontend is reachable at) + the client's `/reset-password?token=...`
route (`ResetPasswordPage.tsx`), and sends it through whichever `EmailProvider` is
configured. `APP_BASE_URL` defaults to `http://localhost` — update it once this
deployment has a real domain (`CLAUDE.md`'s Task 10.2, still pending, adds HTTPS).

**Critically, the raw token is never returned over HTTP** — `requestResetHandler`
calls the service but discards its return value, always responding with the same
generic message regardless of whether the email existed (same non-enumeration
principle as login, Task 2.2, and as the reused/expired token check on `/reset`).
This does mean our own route-level tests can't get the token by inspecting an HTTP
response — they call `requestPasswordReset()` directly (`tests/routes/password-reset.test.ts`),
which is the equivalent of a real user reading the token out of their email.

### `POST /api/auth/request-reset`

**Request**: `{ "email": "..." }`. **Response**: always `200`, always the same body,
whether or not the email exists.

### `POST /api/auth/reset`

**Request**: `{ "token": "...", "newPassword": "..." }` (min 8 chars, same policy as
account creation). **Response**: `200` on success. `401`
(`InvalidResetTokenError`) if the token is unknown, expired, or already used — one
error for all three cases, consistent with how `/refresh` treats an invalid refresh
token. `400` on invalid input.

**On success, three things happen atomically** (`prisma.$transaction`) — the user's
`passwordHash` updates, the reset token is marked `usedAt`, and:

- **every existing refresh token for that user is revoked.** Not an explicit
  requirement of this task, but a direct extension of *why* `RefreshToken` supports
  revocation at all (Task 2.3) — a password reset is exactly the kind of event (forgot
  password, or account possibly compromised) where leaving old sessions alive would
  undermine the point. Verified with a dedicated test: log in (real refresh token
  issued) → reset password again → assert no unrevoked refresh token remains for that
  user.

## Role-guard middleware — `requireRole([...roles])`

`src/middleware/require-role.ts`. This is what finally enforces the `TODO` that's
been sitting in `admin-users.route.ts` since Task 2.1 — that route had zero
server-side protection until this task.

### How to protect a new route

```ts
import { requireRole } from '../middleware/require-role';

router.post('/api/some/admin/thing', requireRole(['ADMIN']), someHandler);
router.get('/api/some/shared/thing', requireRole(['ADMIN', 'OWNER', 'TENANT']), otherHandler);
```

Pass the middleware *before* the controller handler, with the list of roles allowed to
reach it. Multiple roles are fine — pass everyone who should be let through.

### What it actually does, in order

1. **No `Authorization` header, or not in `Bearer <token>` form → `401`.** Can't even
   attempt to know who's asking.
2. **Token doesn't verify against `JWT_ACCESS_SECRET`, or has expired → `401`.**
   `jwt.verify` throws for both cases (bad signature and expiry are the same failure
   mode from the caller's perspective) — deliberately mapped to the same status/error,
   not distinguished, since there's no legitimate reason a client needs to tell those
   apart.
3. **Token is valid, but decoded `role` isn't in the allowed list → `403`.** This is
   the one case that's genuinely different from step 2 — we know *exactly* who this
   is, they're just not allowed here. That distinction (401 vs 403) is why this can't
   be a single "isAuthenticated" check — role has to be evaluated per-route.
4. **Token is valid and the role is allowed → `req.user = { id, role, societyId }` is
   set, then `next()`.** Every downstream controller can read `req.user` directly
   (TypeScript knows about this field via a `declare global` block augmenting
   Express's `Request` interface, right in `require-role.ts` — no casting needed
   anywhere it's used).

### Why one function does both authentication and authorization

They're normally separate concerns, but here they can't be split into two
middlewares cleanly: you cannot evaluate a role without first successfully decoding a
valid token, so "verify the token" and "check the role" are inherently sequential
steps of one operation, not two independent ones that happen to run back-to-back.

### Why `req.user` matters beyond this task

`societyId` on `req.user` is exactly what Task 2.6's tenant-scoping middleware will
read to enforce "every query is scoped to the requester's own society" — this task
is what makes that possible, by putting a verified `societyId` somewhere every later
handler can trust.

### Verified two ways, not just unit-tested

- `tests/middleware/require-role.test.ts` — the middleware in isolation (mocked
  req/res/next, hand-crafted JWTs for each case: missing header, malformed header,
  bad signature, expired, wrong role, correct role, multi-role allow-list). No HTTP,
  no database.
- `tests/routes/admin-users.test.ts` — updated to actually log in as a real seeded
  admin and a real seeded owner, using the genuine tokens those logins produce, then
  asserting the full request cycle through the real route: no token → `401`, owner
  token → `403`, admin token → `201`. Applying `requireRole` broke these tests
  immediately (they previously sent no `Authorization` header at all) — expected,
  and fixed by adding real login-derived tokens, not by weakening the middleware.
- Also checked directly against the live Docker stack (not just Vitest): a raw
  `curl` with no token against `/api/admin/users` returns `401`; the same request
  with the seeded admin's real token returns `201`.

## Resident self-service (Task 3.7) — `/api/me`, `/api/me/flat`, `/api/me/flat/tenant`

Built per `CLAUDE.md`'s "Addition (2026-08-06)". Handlers live in
`src/controllers/me.controller.ts`, routed from `src/routes/me.route.ts`; the
profile-update logic is `src/services/me.service.ts`'s `updateOwnProfile()`, while the
flat/tenant logic reuses `src/services/flats.service.ts` (`getMyFlat()`,
`upsertOwnTenant()`, `removeOwnTenant()` — see `docs/flats.md` for those).

### `PATCH /api/me` — own profile update, any role

Any authenticated user updates their own `name`/`phone`/`email` directly, no admin
involvement. `req.user.id` (from `requireRole`) identifies which row to update — no
`:id` param or `societyId` body field, since a user can only ever update themselves.
**Request body**: any subset of `name`, `phone`, `email` (at least one required).
**Response**: `200` with the updated user (no `passwordHash`). `409`
(`DuplicateFieldError`) if the new email/phone is already in use by someone else.

### `GET /api/me/flat` — `OWNER`/`TENANT` only

Returns the caller's own flat: for an `OWNER`, the flat they own; for a `TENANT`, the
flat they currently occupy (via `Flat.currentTenantId`), plus `occupancyEffectiveFrom`
(the open `OccupancyChange`'s `effectiveStart`, if any). `403` for an `ADMIN` (route is
`requireRole(['OWNER', 'TENANT'])` — admins aren't residents). `404` if the caller has
no associated flat yet (e.g. a `TENANT` before any owner has assigned them).

### `PUT`/`DELETE /api/me/flat/tenant` — `OWNER` only

The resident-facing equivalent of `docs/flats.md`'s admin `PATCH /api/admin/flats/:id`
`occupancy` field, scoped to `req.user.id === flat.ownerId` instead of `requireRole
(['ADMIN'])`. `PUT` upserts: updates the existing tenant's contact info in place if the
flat already has one (**not** the id-based admin `assignTenant`'s reject-on-existing
behavior — see `docs/flats.md`), or creates a new `TENANT` account if none exists yet.
`DELETE` closes the open `OccupancyChange` and clears `currentTenantId`, returning
`409` (`NoCurrentTenantError`) if the flat is already owner-occupied.

**How a self-service-created tenant gets a working login without the owner ever
entering a password for them**: the backend creates the `TENANT` `User` with a random,
unusable password, then calls the *same* `requestPasswordReset()` this task already
built (§ "Password reset" above) — which now sends a real email via Resend (or logs
the link, in `console` mode). The tenant follows that link to set their own real
password and logs in normally — reuses this task's existing token/email mechanics
rather than building a separate invite-token system. The identical
`findOrCreateUserByEmail()` pattern was later reused by Task 3.1/3.2's redesigned
admin flat-onboarding endpoints too (`docs/flats.md`).
