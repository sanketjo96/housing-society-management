// Phase 9 security-audit fix (2026-08-12): multer's `fileFilter` (proof-upload.ts,
// signature-upload.ts) only ever checked the client-*declared* Content-Type on the
// multipart part — never the actual file bytes. That's trivially spoofable (any
// HTTP client can set an arbitrary Content-Type header regardless of what's
// actually in the file), so the MIME allowlist those middlewares enforce was not a
// real content-type guarantee. This is later relevant because uploaded files are
// served back with `Content-Type` set to the very same client-declared value
// (ledger.controller.ts/society-settings.controller.ts's file-viewing handlers) —
// an admin routinely opens residents' uploaded "screenshots" as part of the normal
// payment-proof review workflow, so a spoofed upload is a real delivery vector
// against them, not just a theoretical gap.
//
// Deliberately hand-rolled rather than a third-party sniffing library (`file-type`
// was evaluated and rejected — its current major version is ESM-only, awkward from
// this CommonJS backend, and every version compatible with this codebase carries a
// known moderate-severity infinite-loop DoS in its ASF/WMV parser, a format this
// app has no reason to even recognize). Checking magic bytes for exactly the small,
// fixed set of formats this app actually accepts is a handful of lines and pulls in
// zero additional attack surface.
export type DetectableFileType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, i) => buffer[offset + i] === byte);
}

// Sniffs the actual file signature ("magic bytes") at the start of the buffer.
// Returns null for anything that doesn't match one of the formats this app
// accepts — including a well-formed file of some *other* real type, and garbage/
// truncated/empty input.
export function detectFileType(buffer: Buffer): DetectableFileType | null {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // WEBP is a RIFF container: bytes 0-3 "RIFF", bytes 8-11 "WEBP".
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  // "%PDF-" — the spec allows up to 1KB of leading garbage before this marker in
  // practice, but every real PDF writer emits it at byte 0, and accepting a wider
  // search window would only widen what counts as "a PDF" for no real benefit here.
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}
