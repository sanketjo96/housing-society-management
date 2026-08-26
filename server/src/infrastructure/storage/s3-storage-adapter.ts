import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { SaveFileInput, StorageAdapter } from './types';

// Works against any S3-compatible endpoint. Takes an already-built client + bucket
// rather than raw env, so it's unit-testable with mockClient(S3Client).
export class S3StorageAdapter implements StorageAdapter {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  // Same key scheme as LocalStorageAdapter — `<societyId>/<uuid><extension>` —
  // so a key never changes when the adapter behind it does.
  async save(input: SaveFileInput): Promise<{ key: string }> {
    const key = `${input.societyId}/${randomUUID()}${input.extension}`;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: input.buffer }),
    );
    return { key };
  }

  async read(key: string): Promise<Readable> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    // Body is always a real Readable in Node (SDK types it as a wider union).
    return result.Body as Readable;
  }

  // DeleteObjectCommand is idempotent — succeeds whether or not the key exists.
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
