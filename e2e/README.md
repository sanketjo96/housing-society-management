# E2E tests (Playwright)

Real-browser smoke tests, run on demand — there's no CI in this repo, so this
is a manual check you run from the VPS (or your machine) before/after a
change, the same way you'd run `npm test` in `server/` or `client/`.

## Isolation

Runs entirely on its own ports and database — never the docker-compose stack
(the live deployed site on 3000/5173, `smi_dev`):

- backend on `:3901`, `DATABASE_URL` pointed at `smi_test`
- frontend on `:5901`, `VITE_API_BASE_URL` pointed at the test backend

`smi_test` already exists, migrated + seeded (the backend's own Vitest suite
uses it too), so no setup is needed before running.

## Running

```sh
cd e2e
npm install               # first time only
npx playwright install chromium   # first time only
npm test
```

Playwright starts the backend and frontend dev servers itself (see
`playwright.config.ts`'s `webServer`) and tears them down after. If they're
already running on those ports from a previous run, it reuses them instead
of restarting.

Useful variants:

```sh
npm run test:headed   # watch it click through the browser (needs a display/Xvfb)
npx playwright test --reporter=list   # plain terminal output, no HTML report
```

This box has no GUI, so `playwright show-report` (which opens a browser)
won't work directly. To inspect a failure's HTML report after a run:

```sh
npx playwright show-report --host 0.0.0.0 --port 9323
# then from your own machine: ssh -L 9323:localhost:9323 <vps> and open
# http://localhost:9323
```

## Adding tests

Seeded login credentials (from `server/prisma/seed.ts`), all password
`password123`:

- `admin@sunrise.test` — ADMIN
- `alice@sunrise.test` — OWNER
- `dave@sunrise.test` — TENANT

Keep new specs in `tests/`, one file per flow.
