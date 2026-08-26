import { env, requiredEnv } from '../../config/env';

export interface S3Config {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Same shape/precedent as whatsapp.config.ts's getWhatsAppConfig(): read at call
// time via env()/requiredEnv() (never cached at module load), and called only from
// inside getStorageAdapter()'s 's3' branch (index.ts) — never at server startup —
// so leaving these unset while STORAGE_PROVIDER=local (the default) never blocks
// docker compose up. 'auto' is R2's documented region value; a real AWS S3 bucket
// would set S3_REGION to its actual region instead.
export function getS3Config(): S3Config {
  return {
    bucket: requiredEnv('S3_BUCKET'),
    endpoint: requiredEnv('S3_ENDPOINT'),
    region: env('S3_REGION', 'auto')!,
    accessKeyId: requiredEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('S3_SECRET_ACCESS_KEY'),
  };
}
