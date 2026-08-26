import { S3Client } from '@aws-sdk/client-s3';
import { LocalStorageAdapter } from './local-storage-adapter';
import { S3StorageAdapter } from './s3-storage-adapter';
import { getS3Config } from './s3.config';
import type { StorageAdapter } from './types';
import { env } from '../../config/env';

export type { SaveFileInput, StorageAdapter } from './types';

// Task 6.2/6.3's provider switch: one env var picks the implementation; nothing else
// in the codebase imports a concrete adapter class directly (every service/controller
// goes through this factory). 'local' (this MVP's original single-VPS deployment
// target) and 's3' (2026-08-26 — Cloudflare R2, or any S3-compatible endpoint) are
// both implemented; 'gdrive' remains a named-but-unfilled extension point: implement
// StorageAdapter (./types.ts) and add a case below, no other file in the codebase
// needs to change.
export function getStorageAdapter(): StorageAdapter {
  const provider = env('STORAGE_PROVIDER', 'local');
  switch (provider) {
    case 'local':
      return new LocalStorageAdapter(env('LOCAL_STORAGE_DIR', './uploads')!);
    case 's3': {
      const config = getS3Config();
      const client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        // R2 (and most non-AWS S3-compatible endpoints) need path-style addressing
        // (https://endpoint/bucket/key) rather than AWS's default virtual-hosted
        // style (https://bucket.endpoint/key).
        forcePathStyle: true,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      });
      return new S3StorageAdapter(client, config.bucket);
    }
    case 'gdrive':
      throw new Error(
        `STORAGE_PROVIDER=${provider} is a recognized extension point but has no adapter ` +
          'implemented yet — implement StorageAdapter (src/infrastructure/storage/types.ts) and add a case here.',
      );
    default:
      throw new Error(`Unknown STORAGE_PROVIDER: ${provider}`);
  }
}
