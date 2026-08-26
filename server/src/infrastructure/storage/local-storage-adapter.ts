import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { SaveFileInput, StorageAdapter } from './types';

// Default adapter: writes to a directory on local disk — a Docker volume in
// production, so files survive container restarts/redeploys.
export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly baseDir: string) {}

  async save(input: SaveFileInput): Promise<{ key: string }> {
    const key = path.posix.join(input.societyId, `${randomUUID()}${input.extension}`);
    const fullPath = this.resolveSafe(key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, input.buffer);
    return { key };
  }

  async read(key: string): Promise<Readable> {
    return createReadStream(this.resolveSafe(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveSafe(key), { force: true });
  }

  // Refuses to resolve a key outside baseDir (e.g. via a stray '..' segment).
  private resolveSafe(key: string): string {
    const fullPath = path.resolve(this.baseDir, key);
    const base = path.resolve(this.baseDir);
    if (fullPath !== base && !fullPath.startsWith(base + path.sep)) {
      throw new Error(`Refusing to resolve storage key outside base directory: ${key}`);
    }
    return fullPath;
  }
}
