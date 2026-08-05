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

**Response**: `200` with `{ accessToken, refreshToken, user }` (`user` excludes `passwordHash`,
built as an explicit field-by-field object in the service rather than a
destructure-and-omit — avoids relying on lint config to catch an accidentally-unused
`passwordHash` variable). `401` for *either* a nonexistent email *or* a wrong
password — deliberately the same status and message (`InvalidCredentialsError`,
"Invalid email or password") for both cases, so the response can't be used to
enumerate which emails have accounts. `400` on invalid input.

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
  `src/services/password-reset.service.ts`) — deliberately much shorter than the
  refresh token's 7 days. A picked default (not a stated requirement), same as the
  refresh token's TTL — reset links are a narrower attack window by convention
  (industry-typical range is 15 minutes–1 hour), so 1 hour errs toward the longer,
  more forgiving end while still being far tighter than a session token.

### Email isn't built yet (Phase 7) — this task explicitly anticipates that

The task's own precheck says: *"if Phase 7 (email) isn't done yet, stub the send and
log the token instead."* `sendResetEmailStub()` in the service does exactly that —
`console.log`s the token with a `TODO(Phase 7)` comment marking where a real
`EmailProvider.send()` call replaces it once Task 7.1 exists. The function signature
(`requestPasswordReset(email): Promise<string | null>`) doesn't need to change when
that happens — only what happens with the returned token inside it.

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
