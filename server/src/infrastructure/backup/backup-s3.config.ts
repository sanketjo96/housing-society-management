import { env, requiredEnv } from '../../config/env';

export interface BackupS3Config {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Deliberately separate env vars (and, in practice, a separate R2 bucket +
// credential) from S3_* (src/infrastructure/storage/s3.config.ts) — see
// docs/decisions/0005-storage-provider-r2.md's "two buckets, two credentials"
// decision. The live-file credential has delete access; a bug or compromised
// key there must never be able to reach backup copies too. Read lazily, only
// from inside runDatabaseBackup(), so leaving these unset never blocks
// `docker compose up` while the backup job is simply not configured yet.
export function getBackupS3Config(): BackupS3Config {
  return {
    bucket: requiredEnv('BACKUP_S3_BUCKET'),
    endpoint: requiredEnv('BACKUP_S3_ENDPOINT'),
    region: env('BACKUP_S3_REGION', 'auto')!,
    accessKeyId: requiredEnv('BACKUP_S3_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('BACKUP_S3_SECRET_ACCESS_KEY'),
  };
}
