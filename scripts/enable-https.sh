#!/usr/bin/env bash
# Task 10.2: one-time switch from plain HTTP to Let's Encrypt HTTPS, once DOMAIN (a
# free dynamic-DNS hostname is enough — see DEPLOY.md) actually resolves to this VPS.
#
# Why this is safe to run without a dummy-certificate bootstrap dance (the usual
# nginx+certbot recipe): nginx/conf.d/default.conf already serves the ACME HTTP-01
# challenge path on plain port 80 before any cert exists, so certbot can obtain the
# first certificate against the stack exactly as it's already running — no need to
# fake a self-signed cert just to get nginx to start with an SSL block first.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env in repo root — copy .env.example first." >&2
  exit 1
fi

# Deliberately not `source .env` — this file is a docker-compose env-file (loose
# KEY=VALUE pairs), not valid shell script. A value like EMAIL_FROM's
# "Acme <onboarding@resend.dev>" parses fine for docker compose but is a redirect
# operator to bash, so sourcing it can hard-fail on lines that have nothing to do
# with the two variables actually needed here. Pull just those two out instead.
DOMAIN="$(grep -E '^DOMAIN=' .env | tail -1 | cut -d= -f2-)"
CERTBOT_EMAIL="$(grep -E '^CERTBOT_EMAIL=' .env | tail -1 | cut -d= -f2-)"

if [ -z "${DOMAIN:-}" ] || [ -z "${CERTBOT_EMAIL:-}" ]; then
  echo "Set DOMAIN and CERTBOT_EMAIL in .env first (see DEPLOY.md)." >&2
  exit 1
fi

echo "### Confirming $DOMAIN resolves to this host before asking Let's Encrypt..."
resolved="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
public_ip="$(curl -s https://api.ipify.org || true)"
if [ -z "$resolved" ]; then
  echo "FAIL: $DOMAIN does not resolve to any IP yet. Fix DNS and re-run." >&2
  exit 1
fi
if [ -n "$public_ip" ] && [ "$resolved" != "$public_ip" ]; then
  echo "WARNING: $DOMAIN resolves to $resolved, but this host's public IP looks like $public_ip."
  echo "Let's Encrypt will fail the HTTP-01 challenge if these don't actually match — continuing anyway in case ipify is wrong."
fi

echo "### Bringing up the stack (HTTP-only nginx config, if not already up)..."
docker compose up -d

echo "### Requesting the certificate for $DOMAIN..."
# --entrypoint certbot is required here: the `certbot` service's own entrypoint
# (docker-compose.yml) is a "while true; do certbot renew; sleep 12h; done" loop for
# the background auto-renewal container, and `docker compose run <service> <args>`
# passes <args> to that entrypoint as extra positional params rather than replacing
# it — without this override, "certonly --webroot ..." silently gets swallowed as
# unused arguments to the infinite loop instead of ever running (confirmed the hard
# way: it hung for 7+ minutes doing nothing before this was caught).
docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --email "$CERTBOT_EMAIL" -d "$DOMAIN" \
  --rsa-key-size 2048 --agree-tos --no-eff-email --non-interactive

echo "### Writing the HTTPS nginx config..."
sed "s/__DOMAIN__/$DOMAIN/g" nginx/https.conf.template > nginx/conf.d/default.conf

echo "### Reloading nginx..."
if ! docker compose exec nginx nginx -s reload; then
  echo "Reload didn't pick it up — force-recreating nginx instead (known bind-mount gotcha, docs/docker-compose.md)."
  docker compose up -d --force-recreate nginx
fi

cat <<EOF

Done. https://$DOMAIN should now serve the app.

Two things this script deliberately does NOT do for you — finish these manually:
  1. In .env, set COOKIE_SECURE=true and APP_BASE_URL=https://$DOMAIN, then:
       docker compose up -d --force-recreate backend
  2. Add a host crontab entry so renewed certs (the certbot service renews
     automatically, but never reloads nginx itself) actually take effect:
       0 3 * * * cd $(pwd) && docker compose exec nginx nginx -s reload
EOF
