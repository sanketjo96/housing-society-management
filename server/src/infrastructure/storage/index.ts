import { S3Client } from '@aws-sdk/client-s3';
import { LocalStorageAdapter } from './local-storage-adapter';
import { S3StorageAdapter } from './s3-storage-adapter';
import { getS3Config } from './s3.config';
import type { StorageAdapter } from './types';
import { env } from '../../config/env';

export type { SaveFileInput, StorageAdapter } from './types';

// One env var picks the implementation; no other file imports a concrete adapter
// class directly. 'gdrive' is a named-but-unimplemented extension point.
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
        // Path-style addressing (endpoint/bucket/key) — required by R2 and most
        // non-AWS S3-compatible endpoints.
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
