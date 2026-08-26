# File Storage

Where payment-proof screenshots, signature images, and generated receipt PDFs
live: `server/src/infrastructure/storage/`.

## `StorageAdapter`

`types.ts` defines the interface every backend implements:

```ts
export interface StorageAdapter {
  save(input: SaveFileInput): Promise<{ key: string }>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
```

`key` is opaque — only the adapter that produced it understands its shape.
Callers save a buffer, get a key back, store the key in a DB column
(`LedgerEntry.fileUrl`, `Society.chairmanSignatureFileKey`, `Receipt.fileKey`),
and later hand that same key back to `read()`/`delete()`. Nothing above the
adapter layer constructs or parses a key.

`getStorageAdapter()` (`index.ts`) is the single factory every service goes
through — no service imports a concrete adapter class directly. Switches on
`STORAGE_PROVIDER`:

| `STORAGE_PROVIDER` | Class |
|---|---|
| `local` (default) | `LocalStorageAdapter` |
| `s3` | `S3StorageAdapter` |
| `gdrive` | Not implemented — throws a clear error |

## `LocalStorageAdapter`

Writes to a directory on local disk — the `uploads_data` Docker volume in
production, so files survive restarts/redeploys. Key shape:
`<societyId>/<uuid><extension>`. `resolveSafe()` refuses to resolve a key
outside its base directory.

## `S3StorageAdapter`

S3-protocol-generic — works against any S3-compatible endpoint. Currently
configured against Cloudflare R2. Same key scheme as `LocalStorageAdapter`,
byte-identical, so a file's key never changes when the adapter behind it does.
`save()` → `PutObjectCommand`; `read()` → `GetObjectCommand`; `delete()` →
`DeleteObjectCommand` (idempotent by default — no special-casing needed for
deleting a key that was never saved).

Config (`s3.config.ts`, `getS3Config()`) is read lazily, only inside
`getStorageAdapter()`'s `'s3'` branch — never at server startup, so leaving it
unset while `STORAGE_PROVIDER=local` never blocks `docker compose up`.

Env vars: `S3_BUCKET`, `S3_ENDPOINT` (R2: `https://<account_id>.r2.cloudflarestorage.com`),
`S3_REGION` (default `auto`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. See
`server/.env.example` and `docker-compose.yml`'s `backend.environment` block.

## Migrating local files to R2

`server/scripts/migrate-uploads-to-r2.ts` — one-time script. Walks
`LOCAL_STORAGE_DIR` and uploads each file to R2 using its existing relative
path as the R2 key, verbatim (bypassing `S3StorageAdapter.save()`, which mints
a fresh random key on every call). Same key scheme on both adapters means
every existing `fileKey`/`fileUrl` DB column keeps resolving correctly once
`STORAGE_PROVIDER` flips to `s3` — zero DB writes needed. Safe to re-run
(overwrite-by-key). Run: `npx tsx scripts/migrate-uploads-to-r2.ts`.

The production runtime image only ships compiled `dist/` + prod deps (no
`tsx`, no `scripts/`) — to run this against a live deployment's volume, build
the backend's build stage as its own image and run the script in a throwaway
container mounting the real volume:

```sh
docker build --target build -t smi-backend-build ./server
docker run --rm -v smi_uploads_data:/app/uploads \
  --env-file server/.env -e LOCAL_STORAGE_DIR=/app/uploads -w /app \
  smi-backend-build npx tsx scripts/migrate-uploads-to-r2.ts
```

Verify object count and a byte-for-byte read-back match before flipping
`STORAGE_PROVIDER=s3` on the live `backend` service.

## Not yet built

A nightly backup job (Postgres dump + a copy of anything still on
`uploads_data`) pushed to a separate R2 bucket. No automated database backup
mechanism exists yet — see `docs/decisions/0005-storage-provider-r2.md`.
