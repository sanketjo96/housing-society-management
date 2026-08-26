# 0005 — Cloudflare R2 for file storage and (planned) backups

**Status**: Accepted for file storage (built, live). Backup job: planned, not
yet built.

## Context

Local disk storage (`uploads_data`, `postgres_data` — both single Docker
volumes on one VPS) meant losing the disk loses every flat's financial
history: payment proofs, signatures, receipts, and the database itself.

## Decision: R2 over Backblaze B2

Both offer a free tier (10GB storage) that comfortably covers this app's
scale for years. R2 was chosen specifically for **zero egress fees, with no
cap** — B2's free egress is capped at 3× average monthly storage; R2 has no
such ceiling. Since a restore is exactly the scenario where egress volume is
hardest to predict in advance, an uncapped guarantee is worth more than a
generous-but-bounded one. Both are S3-API-compatible, so the actual adapter
code is provider-agnostic (`server/src/infrastructure/storage/`,
`docs/features/file-storage.md`).

## Decision: two buckets, two credentials

Live files and backups use **separate buckets and separate API tokens**, not
one bucket with two prefixes under a shared credential. The live-file
adapter's credential needs delete access (a real, exercised code path) — if
that same credential could also touch backups, a bug or compromised key
could destroy both the live files and their disaster-recovery copies in one
stroke.

## Decision: in-process backup job (planned)

When built, the nightly backup job runs as an in-process `node-cron` job
inside the `backend` container, not a host-cron shell script. Reasons:
reuses the same S3 client already added for live storage (no second tool
like `aws-cli`/`rclone` needed just for uploading); needs no host-level
crontab entry living outside the Docker image — a backup mechanism that
depends on undocumented host state is a weaker guarantee than one that ships
entirely inside `docker compose up`.

Plan: nightly `pg_dump` (plain SQL, gzipped) plus a tar of whatever's still
on `uploads_data`, both pushed to the backups bucket under a date-stamped key
(`postgres/YYYY-MM-DD.sql.gz`, `uploads/YYYY-MM-DD.tar.gz`). Retention via R2
lifecycle rules configured directly in the dashboard (delete after N days),
not hand-rolled deletion code — zero risk of a buggy rotation routine
deleting backups still needed.

## Consequences

- Moving live storage to R2 already closes half the original gap for free —
  proofs/signatures/receipts are durably off-VPS now. Postgres itself still
  has no backup until the job above is built.
- Accepted residual limitation once the backup job exists: nightly
  granularity, no continuous point-in-time recovery. Deliberate tradeoff at
  this scale, not an oversight.
