import type { Readable } from 'node:stream';

export interface SaveFileInput {
  buffer: Buffer;
  societyId: string;
  // Cosmetic only (e.g. '.jpg', '.pdf') — helps a human browsing the raw store (a
  // local disk directory, an S3 console, a Drive folder) recognize files at a glance.
  // Never trusted for anything security- or correctness-relevant: Content-Type when
  // serving a proof back always comes from PaymentProof.mimeType, the one source of
  // truth every adapter is relieved of tracking itself.
  extension: string;
}

// Task 6.2/6.3's swappable proof-storage backend — the same "one interface, pluggable
// implementation" shape CLAUDE.md's tech-stack table already promises for
// EmailProvider (Phase 7), built here first since Phase 6 needs it now. `key` is an
// opaque string only the adapter that produced it understands (a relative disk path,
// an S3 object key, a Drive file id...); callers pass it straight back to the same
// adapter and never parse or construct one themselves. Every method deals in raw
// bytes only — no adapter needs to track mimeType, filenames, or any other metadata,
// all of which lives in the PaymentProof row instead (see schema.prisma).
export interface StorageAdapter {
  save(input: SaveFileInput): Promise<{ key: string }>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
