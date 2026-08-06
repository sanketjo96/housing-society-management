import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { SaveFileInput, StorageAdapter } from './types';

// Default adapter (STORAGE_PROVIDER=local, or unset): writes to a directory on local
// disk — a Docker volume in production (docker-compose.yml's uploads_data), so files
// survive container restarts/redeploys. No third-party account, credentials, or
// network dependency, matching CLAUDE.md's "low operating cost, self-hosted VPS"
// non-functional requirement. Swap STORAGE_PROVIDER (src/lib/storage/index.ts) for a
// different adapter once a real need for off-box storage (S3, Drive) shows up.
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

  // Keys are always adapter-generated internally (never taken from user input), but
  // this is a cheap, worthwhile guarantee for a function that touches the filesystem
  // directly: refuses to resolve any key that would land outside baseDir (e.g. via a
  // stray '..' segment), rather than trusting the join blindly.
  private resolveSafe(key: string): string {
    const fullPath = path.resolve(this.baseDir, key);
    const base = path.resolve(this.baseDir);
    if (fullPath !== base && !fullPath.startsWith(base + path.sep)) {
      throw new Error(`Refusing to resolve storage key outside base directory: ${key}`);
    }
    return fullPath;
  }
}
