# 0005 — Cloudflare R2 for file storage and (planned) backups

**Status**: Accepted for file storage (built, live). Backup job: built and
live (2026-08-27), weekly instead of nightly (see below).

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

## Decision: in-process backup job

The backup job runs as an in-process `node-cron` job inside the `backend`
container (`src/jobs/database-backup.job.ts`, Sundays 02:30 Asia/Kolkata —
see below for why weekly, not nightly), not a host-cron shell script.
Reasons: reuses the same `@aws-sdk/client-s3` already added for live storage
(no second tool like `aws-cli`/`rclone` needed just for uploading); needs no
host-level crontab entry living outside the Docker image — a backup
mechanism that depends on undocumented host state is a weaker guarantee than
one that ships entirely inside `docker compose up`.

Implementation: `pg_dump` (plain SQL, `--no-owner --no-privileges`, so a
restore never fails on GRANT/OWNER statements for a role that doesn't exist
at the restore target), gzipped in-process, pushed to the backups bucket
under a date-stamped key (`postgres/YYYY-MM-DD.sql.gz`) —
`src/infrastructure/backup/`. `pg_dump` itself ships in the runtime image via
`postgresql16-client` (pinned to match `postgres:16-alpine` in
`docker-compose.yml`, not the plain `postgresql-client` package, which pulls
in whatever major Alpine currently defaults to). Retention via R2 lifecycle
rules configured directly in the dashboard (delete after N days), not
hand-rolled deletion code — zero risk of a buggy rotation routine deleting
backups still needed.

**Weekly, not nightly**: the original plan (above) was nightly. Revised to
weekly at the operator's request — deliberate tradeoff for a 24-flat MVP
where financial state changes slowly enough that a week of exposure is
acceptable, in exchange for a simpler operational cadence to watch.

**Uploads not included**: the original plan also called for a
`uploads/YYYY-MM-DD.tar.gz` of `uploads_data`. Dropped once file storage
itself moved to R2 (above) — with `STORAGE_PROVIDER=s3` live, `uploads_data`
no longer holds durable data (new files go straight to R2), so a second copy
of it would just be redundant with R2's own durability. Postgres is the only
thing left that still needs this job.

## Consequences

- Moving live storage to R2 closed half the original gap; the backup job
  closes the other half. Both are now live — proofs/signatures/receipts and
  weekly Postgres dumps are durably off-VPS. `BACKUP_S3_*` is filled in on
  the live deployment, pointing at a second bucket (`smidbbackup`) with its
  own token, confirmed 2026-08-27 with a real manual run
  (`postgres/2026-08-27.sql.gz`, R2-verified).
- One bug found during that verification: `DATABASE_URL` carries Prisma's
  `?schema=public` query param, which `pg_dump`/libpq rejects outright.
  Fixed by stripping the query string before invoking `pg_dump` — safe since
  pg_dump dumps every schema by default and this app only uses `public`.
- Accepted residual limitation: weekly granularity, no continuous
  point-in-time recovery. Deliberate tradeoff at this scale, not an
  oversight.
