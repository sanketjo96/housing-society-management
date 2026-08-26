# 0006 — HTTPS via a free dynamic-DNS hostname, not a purchased domain

**Status**: Accepted, live

## Context

Pre-revenue pilot, no purchased domain. The app carries login passwords,
session cookies, and payment-proof screenshots (often showing UPI IDs/bank
details) — plaintext HTTP on a bare IP is a real exposure, not theoretical.
A self-signed certificate was considered and rejected: it trains residents to
click through a browser trust warning, no better than plaintext for a first
impression.

## Decision

Let's Encrypt only requires a resolvable FQDN pointing at the VPS — a free
dynamic-DNS hostname (DuckDNS, No-IP, etc.) satisfies that identically to a
paid domain, at zero cost.

## Consequences

- `nginx`'s config mount is a directory, not a single file, so a script can
  swap in the HTTPS server block once a certificate exists, without an image
  rebuild. A `certbot` service auto-renews in the background.
- Staying on plain HTTP remains fully supported — leaving `DOMAIN`/
  `CERTBOT_EMAIL` blank changes nothing; nothing in the stack forces a cert
  to exist. See `DEPLOY.md`.
