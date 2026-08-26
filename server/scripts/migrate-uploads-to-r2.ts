// ONE-TIME cutover script — not a recurring job, not imported by any app code.
// Run once when switching STORAGE_PROVIDER from 'local' to 's3': copies every file
// already on local disk (LOCAL_STORAGE_DIR) into the S3/R2 bucket, preserving each
// file's existing relative path *exactly* as its new R2 key.
//
// Why exact-path preservation matters: every DB column that stores a file reference
// (LedgerEntry.fileUrl, Society.chairmanSignatureFileKey, Receipt.fileKey, etc.)
// holds an opaque adapter-generated key — for LocalStorageAdapter, that key IS the
// relative path under LOCAL_STORAGE_DIR (see local-storage-adapter.ts's `save()`).
// Reusing that same string as the R2 object key means every existing DB row keeps
// resolving correctly once STORAGE_PROVIDER flips to 's3', with zero DB writes.
//
// Deliberately does NOT go through S3StorageAdapter.save() — that method mints a
// fresh random UUID key on every call, which would silently orphan every existing
// DB reference. This script talks to the S3 client directly instead.
//
// Safe to re-run: PutObjectCommand overwrites by key, so a partial/interrupted prior
// run just re-uploads unchanged files on the next run.
//
// Usage: npx tsx scripts/migrate-uploads-to-r2.ts
// Reads LOCAL_STORAGE_DIR (default './uploads') and the same S3_* env vars the app
// itself uses (see s3.config.ts) — run this from wherever those are set: inside the
// deployed container (`docker compose exec backend npx tsx scripts/migrate-uploads-to-r2.ts`)
// against the real uploads_data volume, or on the host against a local copy.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../src/config/env';
import { getS3Config } from '../src/infrastructure/storage/s3.config';

async function walk(dir: string, baseDir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath, baseDir)));
    } else if (entry.isFile()) {
      files.push(path.relative(baseDir, fullPath).split(path.sep).join('/'));
    }
  }
  return files;
}

async function main() {
  const baseDir = path.resolve(env('LOCAL_STORAGE_DIR', './uploads')!);
  const config = getS3Config();
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  let baseDirExists = true;
  try {
    await stat(baseDir);
  } catch {
    baseDirExists = false;
  }
  if (!baseDirExists) {
    console.log(`Nothing to migrate — ${baseDir} does not exist.`);
    return;
  }

  const relativeKeys = await walk(baseDir, baseDir);
  console.log(`Found ${relativeKeys.length} file(s) under ${baseDir}. Uploading to bucket "${config.bucket}"...`);

  let uploaded = 0;
  let failed = 0;
  for (const key of relativeKeys) {
    try {
      const buffer = await readFile(path.join(baseDir, key));
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: buffer }));
      uploaded++;
      console.log(`  uploaded: ${key} (${buffer.length} bytes)`);
    } catch (err) {
      failed++;
      console.error(`  FAILED: ${key} —`, err);
    }
  }

  console.log(`\nDone. ${uploaded} uploaded, ${failed} failed, ${relativeKeys.length} total.`);
  if (failed > 0) {
    console.error('One or more files failed to migrate — re-run this script to retry (safe, overwrite-by-key).');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Migration script crashed:', err);
  process.exitCode = 1;
});
