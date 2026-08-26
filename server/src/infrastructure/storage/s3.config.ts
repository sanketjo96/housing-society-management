import { env, requiredEnv } from '../../config/env';

export interface S3Config {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Read lazily, only from getStorageAdapter()'s 's3' branch — never at server
// startup, so leaving these unset while STORAGE_PROVIDER=local never blocks
// startup. 'auto' is R2's region value; a real AWS bucket sets its actual region.
export function getS3Config(): S3Config {
  return {
    bucket: requiredEnv('S3_BUCKET'),
    endpoint: requiredEnv('S3_ENDPOINT'),
    region: env('S3_REGION', 'auto')!,
    accessKeyId: requiredEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('S3_SECRET_ACCESS_KEY'),
  };
}
