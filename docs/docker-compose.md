# Docker Compose

The full stack — Postgres, backend, frontend, nginx — runs with one command from the
repo root:

```sh
docker compose up -d --build
```

Bring it down: `docker compose down` (add `-v` to also wipe named volumes — Postgres
data and the built frontend assets — don't do this in production without meaning to).

Check status: `docker compose ps` (add `-a` to also see the frontend's one-shot build
container, which exits 0 by design — see below). Logs: `docker compose logs -f
<service>`.

## What each service does

| Service | Image | Purpose |
|---|---|---|
| `postgres` | `postgres:16-alpine` | The database. Data persists in the named volume `postgres_data`. Bound to `127.0.0.1:5432` only — never exposed publicly. |
| `backend` | built from `server/Dockerfile` | The Express API. Multi-stage build: compiles TypeScript and generates the Prisma client in a build stage, ships only the compiled `dist/` + production `node_modules` in the final image. Bound to `127.0.0.1:3000` only — reached from outside only through nginx's `/api/*` proxy (Task 0.5). |
| `frontend` | built from `client/Dockerfile` | **Build-only** — not a long-running server. It builds the React app, then its container `CMD` copies the built static files into the shared `frontend_dist` volume and exits (0). `docker compose ps` won't show it as "running" after startup; that's expected — check with `docker compose ps -a` and look for `Exited (0)`. |
| `nginx` | `nginx:1.27-alpine` | The only service exposed publicly (port 80; port 443 gets added in Task 10.2 once Certbot/SSL is wired up). Single entry point: serves the frontend's static files at `/`, reverse-proxies `/api/*` to the backend. See "How requests flow through nginx" below. |

## How requests flow through nginx (Task 0.5)

`nginx/default.conf` has two `location` blocks. nginx picks the most specific (longest)
matching prefix, so `/api/*` requests hit the proxy block even though `/` would also
technically match:

```nginx
location /api/ {
    proxy_pass http://backend:3000;   # no trailing path after the port — see note below
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

- **`GET /`, `GET /flats`, any non-`/api` path** → falls to the second block. `try_files`
  looks for a matching static file first, then falls back to `index.html` — this is the
  standard SPA pattern, since client-side routes like `/flats` don't correspond to real
  files on disk; React Router (once added) needs `index.html` served for any of them.
- **`GET /api/anything`** → matches the first block, forwarded to `backend:3000` (the
  Compose service name, resolved via Docker's internal DNS) over the internal network —
  never touches the filesystem `root` at all.
- **`proxy_pass http://backend:3000;` has no trailing path** — this matters. With a
  trailing slash (`proxy_pass http://backend:3000/;`), nginx would strip the matched
  `/api/` prefix before forwarding, so `/api/health` would arrive at the backend as
  `/health`. Without one, the full original path is preserved, so `/api/health` arrives
  at the backend as `/api/health` — required here, since Express routes are defined
  *with* the `/api/` prefix (e.g. Task 0.6's `GET /api/health`).
- The `proxy_set_header` lines forward the real client IP and original protocol/host to
  the backend, since without them the backend would only ever see nginx's own internal
  address as the "client" — relevant later for Task 9.2's rate limiting, which needs the
  real client IP.

## Gotcha: editing `nginx/default.conf` didn't take effect until the container was recreated

Since `default.conf` is a bind mount (see the earlier section on bind mounts vs named
volumes), editing the file on the host is normally picked up by just reloading nginx
(`docker compose exec nginx nginx -s reload`) — no rebuild needed. Task 0.5 hit an
exception to that: after editing the file, the container kept serving the *old* config
even after a reload.

Cause: some file-writing tools replace a file by writing a new one and renaming it over
the original, rather than editing it in place — which creates a **new inode** at the
same path. A single-file bind mount is attached to the specific inode that existed at
container-creation time, not "whatever file currently has this path" — so once the
original inode is replaced, the running container keeps serving the orphaned old
version indefinitely, and `nginx -s reload` (which only reloads nginx's *process*, not
the container's mounts) can't fix it.

**Fix**: recreate the container so Docker re-resolves the bind mount against the
current file: `docker compose up -d --force-recreate nginx`. Confirmed by writing a
unique marker into the config file, checking it was missing from
`docker compose exec nginx cat /etc/nginx/conf.d/default.conf` (proving the stale-inode
theory), then confirming it appeared after the force-recreate. Worth remembering for
`nginx/default.conf` specifically (and any other single-file bind mount) going forward —
a plain reload is not always enough.

## Why the frontend container "exits" — and why rebuilds still work

Getting a build's output into a container that only ever serves static files (nginx),
without also running a Node process in production, uses a specific pattern:

1. `client/Dockerfile` builds the app in one stage, then in a second minimal stage
   copies the built `dist/` into `/dist` inside that stage's image.
2. The final `CMD` doesn't start a server — it copies `/dist` into `/output`, which
   Compose mounts to the named volume `frontend_dist`, then exits successfully.
3. `nginx` mounts that same volume read-only at `/usr/share/nginx/html`.

The copy step (`rm -rf /output/* && cp -a /dist/. /output/`) runs **every time the
frontend container starts**, not just once — this matters because Docker only
auto-populates a fresh named volume from image content on first creation. Without the
explicit copy, a second `docker compose up -d --build` would rebuild the frontend image
but the old build would silently keep serving from the volume. Verified this by
rebuilding after a content change (the page `<title>`) and confirming nginx served the
new version afterward.

## Env vars

Root-level `.env` (gitignored) holds Postgres credentials, interpolated into
`docker-compose.yml` via `${VAR}` syntax:

```
POSTGRES_USER=smi
POSTGRES_PASSWORD=smi_dev_password
POSTGRES_DB=smi_dev
```

**This is a different file from `server/.env`.** Root `.env` is read by `docker compose`
itself to fill in `${...}` placeholders in `docker-compose.yml` (used for the `postgres`
service's own credentials, and to build `backend`'s `DATABASE_URL`). `server/.env` is
only used when running the backend directly on the host (`npm run dev`, outside Docker).
The two `DATABASE_URL`s point at different hostnames on purpose:

- Inside Docker, `backend` connects to Postgres via the service name: `postgres:5432`
  (Compose's internal DNS resolves service names to container IPs on the shared network).
- On the host (`npm run dev`), it connects via `localhost:5432`, since Postgres's port is
  published to the host's loopback interface.

`.env.example` documenting every var (both files) is Task 0.6's job, once the health
endpoint gives a complete picture of what's needed.

## Ports and firewall

Only `nginx` publishes a host port (80, and 443 once TLS exists). `postgres` and
`backend` publish to `127.0.0.1` only — reachable from the host itself (e.g. `psql
localhost:5432`, `curl localhost:3000`), never from outside. No firewall changes were
needed for this stack — port 80 was already open (see `ufw status`); ports 3000/5432
are loopback-only so a firewall rule wouldn't have mattered either way.

## Healthchecks

- `postgres`: `pg_isready`.
- `backend`: a plain Node script requesting `http://localhost:3000/` and treating *any*
  HTTP response (including today's 404 — there are no routes yet) as healthy, since it's
  only proving the process is alive and listening. **This is a placeholder** — Task 0.6
  adds a real `/api/health` endpoint, and this healthcheck should be updated to hit that
  specifically once it exists.
- `frontend`: none needed — it's expected to exit, not stay running.
- `nginx`: none configured yet; relies on `depends_on` ordering (starts after `frontend`
  and `backend`). Could add one later if needed.

`backend` and `nginx` both use `depends_on`; `backend` additionally waits on `postgres`
being `service_healthy` (not just started) before starting, since it needs a working DB
connection at boot in later phases.

## Verifying the stack

```sh
./scripts/check-stack.sh
```

Checks: `postgres` and `backend` are `running`, `frontend` exited 0, `nginx` is
`running`, and `http://localhost/` responds. This is the acceptance check Task 0.4's
TDD approach asked for — written first against an empty compose file (confirmed it
failed, every service "not found"), then made to pass as the compose file was built up.
