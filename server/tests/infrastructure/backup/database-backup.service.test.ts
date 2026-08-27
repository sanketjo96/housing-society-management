import { gunzipSync } from 'node:zlib';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/backup/pg-dump', () => ({
  dumpDatabase: vi.fn(),
}));

import { dumpDatabase } from '../../../src/infrastructure/backup/pg-dump';
import { backupKeyFor, runDatabaseBackup } from '../../../src/infrastructure/backup/database-backup.service';

describe('backupKeyFor', () => {
  it('formats a UTC date as postgres/YYYY-MM-DD.sql.gz', () => {
    expect(backupKeyFor(new Date('2026-08-27T18:30:00Z'))).toBe('postgres/2026-08-27.sql.gz');
  });
});

describe('runDatabaseBackup', () => {
  const s3Mock = mockClient(S3Client);
  const env = { ...process.env };

  beforeEach(() => {
    s3Mock.reset();
    vi.mocked(dumpDatabase).mockReset();
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.BACKUP_S3_BUCKET = 'smi-backups';
    process.env.BACKUP_S3_ENDPOINT = 'https://example.r2.cloudflarestorage.com';
    process.env.BACKUP_S3_REGION = 'auto';
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'key-id';
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secret';
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('gzips the dump and uploads it to the backup bucket under a date-stamped key', async () => {
    vi.mocked(dumpDatabase).mockResolvedValue(Buffer.from('-- sql dump'));
    s3Mock.on(PutObjectCommand).resolves({});

    const { key, bytes } = await runDatabaseBackup();

    expect(key).toMatch(/^postgres\/\d{4}-\d{2}-\d{2}\.sql\.gz$/);
    expect(dumpDatabase).toHaveBeenCalledWith('postgresql://user:pass@host:5432/db');

    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Bucket).toBe('smi-backups');
    expect(calls[0].args[0].input.Key).toBe(key);

    const uploadedBody = calls[0].args[0].input.Body as Buffer;
    expect(gunzipSync(uploadedBody).toString('utf-8')).toBe('-- sql dump');
    expect(bytes).toBe(uploadedBody.byteLength);
  });

  it('never touches S3 when BACKUP_S3_BUCKET is unset — fails before dumping or uploading', async () => {
    delete process.env.BACKUP_S3_BUCKET;

    await expect(runDatabaseBackup()).rejects.toThrow(/BACKUP_S3_BUCKET/);

    expect(dumpDatabase).not.toHaveBeenCalled();
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });
});
