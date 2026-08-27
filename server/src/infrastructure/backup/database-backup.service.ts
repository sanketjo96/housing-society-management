import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { requiredEnv } from '../../config/env';
import { getBackupS3Config } from './backup-s3.config';
import { dumpDatabase } from './pg-dump';

const gzipAsync = promisify(gzip);

// UTC, not Asia/Kolkata — a date-stamped key only needs to be unique per run
// (weekly cadence), not calendar-accurate to the operator's timezone.
export function backupKeyFor(date: Date): string {
  return `postgres/${date.toISOString().slice(0, 10)}.sql.gz`;
}

// Config is read before dumpDatabase() runs, so a missing BACKUP_S3_* var fails
// fast without ever shelling out to pg_dump or touching the network.
export async function runDatabaseBackup(): Promise<{ key: string; bytes: number }> {
  const config = getBackupS3Config();
  const databaseUrl = requiredEnv('DATABASE_URL');

  const raw = await dumpDatabase(databaseUrl);
  const compressed = await gzipAsync(raw);

  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  const key = backupKeyFor(new Date());
  await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: compressed }));

  return { key, bytes: compressed.byteLength };
}
