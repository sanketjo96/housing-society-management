import type { Readable } from 'node:stream';

export interface SaveFileInput {
  buffer: Buffer;
  societyId: string;
  // Cosmetic only (e.g. '.jpg') — never trusted for correctness. Content-Type
  // always comes from the DB row's own mimeType field.
  extension: string;
}

// `key` is opaque — only the adapter that produced it understands its shape.
// Callers pass it straight back to the same adapter, never parse or construct one.
export interface StorageAdapter {
  save(input: SaveFileInput): Promise<{ key: string }>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
