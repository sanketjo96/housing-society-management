import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { S3StorageAdapter } from '../../../src/infrastructure/storage/s3-storage-adapter';

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk as Buffer));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Command-level mocking (aws-sdk-client-mock), not a real endpoint — this is the
// first mocking-framework dependency in this codebase (everything else
// integration-tests against a real local resource, e.g. local-storage-adapter.test.ts
// against real disk), justified because there's no free, ephemeral S3-compatible
// endpoint to integration-test against in CI the way tests/setup.ts provides for
// Postgres. These tests prove the adapter's own logic (key shape, which command with
// which params, idempotent delete) — not that real R2 credentials/endpoint work,
// which is a one-time manual smoke-check during initial setup instead.
describe('S3StorageAdapter', () => {
  const s3Mock = mockClient(S3Client);
  const bucket = 'test-bucket';
  const adapter = new S3StorageAdapter(new S3Client({ region: 'auto' }), bucket);

  beforeEach(() => {
    s3Mock.reset();
  });

  it('saves a buffer and returns a key scoped under the society id', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const { key } = await adapter.save({
      buffer: Buffer.from('hello world'),
      societyId: 'society-1',
      extension: '.jpg',
    });

    expect(key.startsWith('society-1/')).toBe(true);
    expect(key.endsWith('.jpg')).toBe(true);

    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input).toMatchObject({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from('hello world'),
    });
  });

  it('round-trips: what is read back matches what was saved', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const original = Buffer.from('proof-bytes-12345');
    const { key } = await adapter.save({
      buffer: original,
      societyId: 'society-2',
      extension: '.png',
    });

    s3Mock.on(GetObjectCommand, { Bucket: bucket, Key: key }).resolves({
      Body: Readable.from(original) as never,
    });

    const stream = await adapter.read(key);
    const read = await streamToBuffer(stream);
    expect(read.equals(original)).toBe(true);
  });

  it('two saves for the same society produce different keys (never overwrite each other)', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const first = await adapter.save({ buffer: Buffer.from('a'), societyId: 'society-3', extension: '.pdf' });
    const second = await adapter.save({ buffer: Buffer.from('b'), societyId: 'society-3', extension: '.pdf' });

    expect(first.key).not.toBe(second.key);
    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls.map((c) => c.args[0].input.Key)).toEqual([first.key, second.key]);
  });

  // Unlike LocalStorageAdapter, delete() needs no force-flag/no-op special-casing —
  // DeleteObjectCommand already succeeds whether or not the key exists, so both
  // "delete a saved file" and "delete a never-saved key" are the exact same call
  // from this adapter's point of view; asserting the command was sent is sufficient
  // for both cases (there's no local filesystem to independently verify against, the
  // way local-storage-adapter.test.ts uses existsSync).
  it('deletes a key by sending DeleteObjectCommand, whether or not it was ever saved', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});

    await adapter.delete('society-4/never-existed.jpg');

    const calls = s3Mock.commandCalls(DeleteObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input).toMatchObject({ Bucket: bucket, Key: 'society-4/never-existed.jpg' });
  });

  // No path-traversal test here, unlike local-storage-adapter.test.ts — S3/R2 keys
  // aren't filesystem paths, there's no base directory to escape, and keys are
  // always adapter-generated (save()) or DB-stored opaque values (read()/delete()),
  // never taken from unsanitized user input either way.
});
