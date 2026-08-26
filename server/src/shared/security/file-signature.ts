// Verifies actual file bytes, not just the client-declared Content-Type (which
// any HTTP client can spoof). Hand-rolled rather than a sniffing library — a
// handful of magic-byte checks for the small fixed set of formats this app
// accepts, no extra dependency/attack surface.
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
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // "%PDF-"
  return null;
}
