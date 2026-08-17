// Minimal buffers whose leading bytes match a real file signature
// (src/shared/security/file-signature.ts) — enough to pass the Phase 9 content-based upload
// validation (src/middleware/verify-file-signature.ts) without needing a fully
// valid image/PDF structure, since that middleware only sniffs the magic bytes at
// the start of the file, never parses the rest.
export const TINY_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
]);
export const TINY_PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const TINY_WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
export const TINY_PDF_BYTES = Buffer.from('%PDF-1.4\n%fake-pdf-for-tests');
