# Deploying to a VPS (Task 10.2)

Covers going from a fresh VPS to a running stack, then (optionally, but recommended)
turning on free HTTPS with no purchased domain. See `docs/docker-compose.md` for how
the stack itself is put together — this doc is only the operational sequence.

## 1. Prerequisites

- A VPS with Docker + Docker Compose installed, ports 80 and 443 open to the internet.
- This repo checked out on it.

## 2. First boot (plain HTTP, no domain needed)

```sh
cp .env.example .env
# fill in POSTGRES_*, JWT_ACCESS_SECRET, PLATFORM_BOOTSTRAP_SECRET (see the comments
# in .env.example for how to generate each) — leave DOMAIN/CERTBOT_EMAIL blank for now
docker compose up -d --build
./scripts/check-stack.sh
```

At this point the app is reachable at `http://<vps-ip>/`. This is a legitimate way to
run the pilot if you've decided the HTTPS step below isn't worth doing yet — nothing
about the stack requires it. The real cost of skipping it: login passwords, session
cookies, and payment-proof screenshots all travel in plaintext over the network, and
`COOKIE_SECURE` must stay `false` (it already is by default).

## 3. Turning on free HTTPS (recommended, no purchased domain required)

Let's Encrypt only needs a real hostname that resolves to this VPS — it does not care
whether that hostname came from a paid registrar or a free dynamic-DNS provider. This
project's `scripts/enable-https.sh` works with either.

**3a. Get a free hostname pointed at this VPS.** Using [DuckDNS](https://www.duckdns.org)
as an example (no cost, no signup beyond an existing Google/GitHub login):

1. Sign in at duckdns.org, pick a subdomain (e.g. `mysociety` → `mysociety.duckdns.org`).
2. Set its IP to this VPS's public IP address, save.
3. Confirm it resolves: `dig +short mysociety.duckdns.org` should print the VPS's IP
   (DNS propagation is usually near-instant for DuckDNS; if it doesn't match yet, wait
   a few minutes and retry).

Any other dynamic-DNS provider (No-IP, etc.) works the same way — the only requirement
is "a hostname whose DNS A record points at this VPS," nothing provider-specific.

**3b. Fill in `.env`:**

```
DOMAIN=mysociety.duckdns.org
CERTBOT_EMAIL=you@example.com
```

(`CERTBOT_EMAIL` is only used by Let's Encrypt for renewal/expiry notices — never
shown to residents.)

**3c. Run the script:**

```sh
./scripts/enable-https.sh
```

This requests the certificate (the stack's nginx is already serving the ACME
HTTP-01 challenge path on port 80 from the first-boot step above, so no separate
bootstrap dance is needed), writes the HTTPS-enabled nginx config, and reloads nginx.

**3d. Finish the switch** (the script prints this reminder, but do it — it won't do
these two for you):

```sh
# in .env:
COOKIE_SECURE=true
APP_BASE_URL=https://mysociety.duckdns.org

docker compose up -d --force-recreate backend
```

Until `APP_BASE_URL` is updated, password-reset emails will keep linking back to the
old `http://<ip>/reset-password` URL even though the site itself has moved to HTTPS.

**3e. Keep renewals actually taking effect.** The `certbot` service in
`docker-compose.yml` renews the certificate automatically in the background (checks
twice daily, renews when within ~30 days of expiry), but it never reloads nginx
itself — a renewed certificate on disk does nothing until nginx re-reads it. Add a
host crontab entry:

```sh
crontab -e
# add:
0 3 * * * cd /path/to/this/repo && docker compose exec nginx nginx -s reload
```

A daily reload is cheap (it's a graceful reload, not a restart — no dropped
connections) and means a renewal is never more than a day from taking effect.

## What this doc does not cover

- **Database backups.** There is currently no backup/restore mechanism anywhere in
  this stack — `postgres_data` is a single Docker volume on this one VPS with no
  copy anywhere else. Losing the disk loses every flat's financial history. Not
  covered by Task 10.1/10.2 as scoped; needs its own task before this is safe to run
  unattended for real money.
- Firewall/VPS hardening beyond "ports 80/443 open" — outside this project's scope.
