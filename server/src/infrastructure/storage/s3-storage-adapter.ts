import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { SaveFileInput, StorageAdapter } from './types';

// S3-protocol-generic — works against any S3-compatible endpoint (Cloudflare R2 is
// today's provider, via a custom `endpoint` + forcePathStyle on the client; a real
// AWS S3 bucket would work identically with different config). Takes an
// already-built client + bucket rather than raw env, so this class stays trivially
// unit-testable (mockClient(S3Client)) without touching process.env — see
// index.ts's 's3' case for where the client is actually constructed from
// getS3Config().
export class S3StorageAdapter implements StorageAdapter {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  // Same key scheme as LocalStorageAdapter (`<societyId>/<uuid><extension>`) —
  // deliberately byte-identical, not an S3-idiomatic scheme, so a file's key never
  // needs to change when the adapter it's stored under does (see
  // scripts/migrate-uploads-to-r2.ts, which relies on this to move existing local
  // files to R2 under their exact current key with zero DB writes).
  async save(input: SaveFileInput): Promise<{ key: string }> {
    const key = `${input.societyId}/${randomUUID()}${input.extension}`;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: input.buffer }),
    );
    return { key };
  }

  async read(key: string): Promise<Readable> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    // SDK v3 types Body as a StreamingBlobPayloadOutputTypes union (covers browser
    // and Node runtimes); in the Node runtime this app actually runs in, it's always
    // a real Readable — safe to assert rather than the interface's wider type.
    return result.Body as Readable;
  }

  // Unlike LocalStorageAdapter.delete() (which needs `{ force: true }` to make
  // deleting an already-gone file a no-op instead of throwing ENOENT),
  // DeleteObjectCommand is already idempotent — S3/R2 returns success whether or
  // not the key exists, so no special-casing is needed here to satisfy the same
  // "delete of a never-saved key doesn't throw" contract.
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
