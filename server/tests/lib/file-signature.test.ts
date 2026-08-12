import { describe, expect, it } from 'vitest';
import { detectFileType } from '../../src/lib/file-signature';
import {
  TINY_JPEG_BYTES,
  TINY_PDF_BYTES,
  TINY_PNG_BYTES,
  TINY_WEBP_BYTES,
} from '../fixtures/tiny-files';

describe('detectFileType', () => {
  it('detects a PNG by its magic bytes', () => {
    expect(detectFileType(TINY_PNG_BYTES)).toBe('image/png');
  });

  it('detects a JPEG by its magic bytes', () => {
    expect(detectFileType(TINY_JPEG_BYTES)).toBe('image/jpeg');
  });

  it('detects a WEBP by its RIFF/WEBP container markers', () => {
    expect(detectFileType(TINY_WEBP_BYTES)).toBe('image/webp');
  });

  it('detects a PDF by its %PDF- marker', () => {
    expect(detectFileType(TINY_PDF_BYTES)).toBe('application/pdf');
  });

  it('returns null for content with no recognized signature — the whole point of this check', () => {
    expect(detectFileType(Buffer.from('fake-jpeg-bytes'))).toBeNull();
    expect(detectFileType(Buffer.from('just some plain text'))).toBeNull();
  });

  it('returns null for a WEBP-like RIFF container missing the WEBP marker at byte 8', () => {
    expect(detectFileType(Buffer.from('RIFF\0\0\0\0AVI '))).toBeNull();
  });

  it('returns null for empty or truncated input, without throwing', () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
    expect(detectFileType(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});
