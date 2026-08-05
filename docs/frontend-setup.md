# Frontend setup

The frontend lives in `client/` — React + Vite + TypeScript, scaffolded from Vite's
official `react-ts` template. As of Task 2.7 it has real routing, a real API call
(login), and its first actual page.

## Running locally

```sh
cd client
npm install
npm run dev       # starts the Vite dev server, default http://localhost:5173
```

Other scripts:

- `npm test` — run the Vitest suite once (`npm run test:watch` for watch mode).
- `npm run build` — typecheck (`tsc -b`) and build to `dist/` via Vite.
- `npm run preview` — serve the production build locally.
- `npm run lint` — oxlint over the project.

## Test runner and linter — why they differ from the backend

- **Vitest + React Testing Library**, same as `server/` for the test runner (see
  `CLAUDE.md`'s confirmed decision) — one toolchain shared across both halves of the
  stack. `vite.config.ts` configures the `test` block directly (`environment: 'jsdom'`,
  `setupFiles: ['./src/test/setup.ts']`), so no separate `vitest.config.ts` is needed.
- **Linting uses `oxlint`, not ESLint** — this is what Vite's `react-ts` template ships
  by default (a Rust-based linter, much faster than ESLint for JS/TS). The backend uses
  ESLint because Task 0.1 asked for it explicitly; the frontend task didn't specify a
  linter, so the template default was kept rather than introducing a second linting
  config to maintain for no required reason. Revisit if the team wants one linter across
  both projects.

## Project structure so far

```
client/
  index.html
  src/
    main.tsx          # entry point: mounts <App /> into #root
    App.tsx           # hosts the providers (QueryClientProvider, BrowserRouter) and route table
    App.test.tsx       # asserts "/" redirects to the login page
    vite-env.d.ts      # Vite's client types + our custom VITE_API_BASE_URL typing
    index.css          # minimal global reset (color-scheme, font, margin)
    lib/
      api.ts            # fetch wrapper — credentials: 'include' on every call
      auth-token.ts      # minimal in-memory access-token store (Task 2.8 formalizes into a real context)
    pages/
      LoginPage.tsx       # the actual login form (Task 2.7)
      LoginPage.test.tsx   # component tests: valid login redirects, invalid shows error, client validation
      DashboardPage.tsx    # placeholder landing page after login
    test/
      setup.ts          # jest-dom matchers + explicit RTL cleanup registration (see gotcha below)
  vite.config.ts         # Vite + Vitest config (react plugin, jsdom test environment)
```

Starter-template assets (React/Vite logos, hero image, the "Get started" counter demo,
themed CSS variables) were removed — they aren't part of this app.

## Auth flow, from the frontend's perspective (Task 2.7)

### Where each token lives, and why

| Token | Where it lives | Why |
|---|---|---|
| Access token (15 min) | JS memory only (`src/lib/auth-token.ts`) — a plain module-level variable | Short-lived, needs to be read on every authenticated request. Never written to `localStorage`/`sessionStorage`, so an XSS bug elsewhere in the app can't read it off disk. Lost on page refresh by design — Task 2.8's auth context is what will call `/api/auth/refresh` on app load to silently re-establish it. |
| Refresh token (7 days) | An `httpOnly` cookie, set by the backend | Never touched by frontend JS at all — not read, not stored, not sent explicitly. The browser attaches it automatically to same-path requests because it's a cookie, invisible to any JS running on the page (including an XSS payload). This is why the task's spec says "httpOnly cookie preferred": it's the one storage option immune to token theft via XSS. |

`src/lib/api.ts`'s `apiFetch()` sets `credentials: 'include'` on every request — this
is what makes the browser actually send/receive that cookie, both same-origin
(Docker/nginx) and cross-origin (local dev, frontend on 5173 talking to backend on
3000 directly).

### `src/lib/auth-token.ts` is deliberately minimal

It's just a `let` variable with a getter/setter — not a React context, not exposed via
a hook. That's intentional: **Task 2.8 explicitly owns** "build an auth context/hook
exposing the current user, and a protected route wrapper." Task 2.7's job stops at
"somewhere to put the token after a successful login" so `LoginPage` has something to
call; building the full context now would just mean redoing it when 2.8 lands.

### The actual flow

1. `LoginPage` (`react-hook-form` + a `zod` schema for client-side validation) submits
   via a React Query `useMutation` to `POST /api/auth/login`.
2. On success: `setAccessToken(accessToken)` stores it in memory, then
   `navigate('/dashboard')` (React Router) redirects. The refresh-token cookie was
   already set by the browser automatically — the frontend never sees or handles it.
3. On failure (`res.ok` false): the mutation throws with the backend's error message
   (`"Invalid email or password"`), which renders inline via `mutation.error.message`.
   No redirect happens.

### Real backend contract change this task required

The backend (Tasks 2.2/2.3) originally returned the refresh token in the JSON
response body, since no frontend consumed it yet. Building this page against the
task's explicit "httpOnly cookie preferred" meant reworking those already-tested
endpoints: `login` now sets the refresh token via `res.cookie(...)` and no longer
includes it in the body at all; `refresh`/`logout` now read it from
`req.cookies.refreshToken` instead of the request body. See `docs/auth.md` for the
full detail — the service layer (`login()`, `refreshAccessToken()`, `logout()`)
didn't need to change at all, only the controller's plumbing did, which is exactly
the payoff the route/controller/service split was supposed to provide.

### A real bug found via actual end-to-end testing, not assumed safe

Initially set the cookie's `Secure` attribute from `NODE_ENV === 'production'`. That
looked correct and passed every automated test — until manually testing login →
refresh against the real deployed public IP (not `localhost`, which gets a special
"secure context" exception even over plain HTTP) showed `/api/auth/refresh` failing
with `401 Missing refresh token cookie`. `NODE_ENV` was already `"production"` in the
Docker deployment, but there's no HTTPS yet (Certbot SSL is Task 10.2) — so the
browser (and curl, once tested against the public IP instead of `localhost`) correctly
refused to send a `Secure` cookie back over plain HTTP, silently breaking the entire
refresh flow. Fixed with a dedicated `COOKIE_SECURE` env var (default `false`,
independent of `NODE_ENV`), documented in `.env.example` as something **Task 10.2 must
flip to `true`** once real HTTPS exists. Re-verified against the real public IP after
the fix — `200`, not `401`.

### A second real bug — found by the user testing the actual UI in a real browser

The curl-based checks above all worked, and I said explicitly that no browser-based
visual verification had been done. That gap is exactly where this next bug was hiding:
**logging in through the real UI failed with a network error**, reported directly by
the user.

Root cause: `client/.env` (created for local dev — `VITE_API_BASE_URL=http://localhost:3000`,
so `client/` and `server/` can run as separate processes talking directly to each
other) was never excluded from the frontend's Docker build context —
`client/.dockerignore` was missing a `.env` line that `server/.dockerignore` already
had. Vite bakes `import.meta.env.VITE_API_BASE_URL` into the JS bundle **at build
time**, so the *deployed production bundle* had `http://localhost:3000` compiled
directly into it. Every visitor's browser was then trying to call `localhost:3000` —
**their own machine**, not the server — which fails immediately with a network error,
exactly what was reported. Confirmed directly by grepping the actual served bundle for
the string before fixing anything, not just theorizing.

Fix: added `.env` to `client/.dockerignore`, rebuilt, reconfirmed the new bundle has
no `localhost:3000` string and correctly uses relative `/api/...` paths instead
(resolved by nginx, same-origin, in the deployed stack).

**This class of bug can't be caught by a curl check against a stack that was already
built correctly** — it only exists in the *build step itself*, and nothing in the
automated test suite runs an actual Vite production build. So `scripts/check-stack.sh`
was extended with a permanent check: fetch the deployed bundle, grep for
`localhost:3000`, fail loudly if found. This is a real regression test for exactly
this bug — it would have caught it before deployment, and now always will.

## Gotcha: React Testing Library wasn't cleaning up between tests

Discovered while writing `LoginPage.test.tsx` (the first test file in this project to
render more than once) — subsequent tests failed with spurious "multiple elements
found" errors that had nothing to do with the component. Cause: this project doesn't
use Vitest's `globals` mode (tests import `describe`/`it`/`expect` explicitly, see
`CLAUDE.md`), and RTL's automatic cleanup depends on detecting a global `afterEach`
that only exists in `globals` mode. Fixed by explicitly registering
`afterEach(() => cleanup())` in `src/test/setup.ts` — a latent gap since Task 0.2,
invisible until a test file actually needed it.

## What each config file does

| File | Purpose |
|---|---|
| `vite.config.ts` | Vite build/dev config, plus the `test` block that configures Vitest (jsdom environment, setup file for jest-dom matchers). |
| `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | Vite template's standard split: `tsconfig.json` references the other two — `app` covers `src/` (browser code), `node` covers `vite.config.ts` itself (Node context). Left as generated. |
| `.oxlintrc.json` | oxlint rules, as generated by the Vite template. |
| `.gitignore` | Excludes `node_modules/`, `dist/`, editor/OS files, as generated by the Vite template. |
