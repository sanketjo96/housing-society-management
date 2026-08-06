import { existsSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LocalStorageAdapter } from '../../../src/lib/storage/local-storage-adapter';

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk as Buffer));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('LocalStorageAdapter', () => {
  const baseDir = path.join(process.cwd(), 'test-uploads', `adapter-test-${Date.now()}`);
  const adapter = new LocalStorageAdapter(baseDir);

  afterAll(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('saves a buffer and returns a key scoped under the society id', async () => {
    const { key } = await adapter.save({
      buffer: Buffer.from('hello world'),
      societyId: 'society-1',
      extension: '.jpg',
    });

    expect(key.startsWith('society-1/')).toBe(true);
    expect(key.endsWith('.jpg')).toBe(true);
    expect(existsSync(path.join(baseDir, key))).toBe(true);
  });

  it('round-trips: what is read back matches what was saved', async () => {
    const original = Buffer.from('proof-bytes-12345');
    const { key } = await adapter.save({ buffer: original, societyId: 'society-2', extension: '.png' });

    const stream = await adapter.read(key);
    const read = await streamToBuffer(stream);
    expect(read.equals(original)).toBe(true);
  });

  it('two saves for the same society produce different keys (never overwrite each other)', async () => {
    const first = await adapter.save({ buffer: Buffer.from('a'), societyId: 'society-3', extension: '.pdf' });
    const second = await adapter.save({ buffer: Buffer.from('b'), societyId: 'society-3', extension: '.pdf' });
    expect(first.key).not.toBe(second.key);

    const files = await readdir(path.join(baseDir, 'society-3'));
    expect(files.length).toBe(2);
  });

  it('deletes a saved file', async () => {
    const { key } = await adapter.save({ buffer: Buffer.from('to-delete'), societyId: 'society-4', extension: '.jpg' });
    expect(existsSync(path.join(baseDir, key))).toBe(true);

    await adapter.delete(key);
    expect(existsSync(path.join(baseDir, key))).toBe(false);
  });

  it('delete is a no-op (does not throw) for a key that was never saved', async () => {
    await expect(adapter.delete('society-5/never-existed.jpg')).resolves.toBeUndefined();
  });

  it('refuses to read a key that would resolve outside the base directory', async () => {
    await expect(adapter.read('../../etc/passwd')).rejects.toThrow(/outside base directory/);
  });

  it('actually persists bytes readable by a fresh fs.readFile, not just via the adapter', async () => {
    const { key } = await adapter.save({ buffer: Buffer.from('cross-check'), societyId: 'society-6', extension: '.jpg' });
    const contents = await readFile(path.join(baseDir, key));
    expect(contents.toString()).toBe('cross-check');
  });
});
