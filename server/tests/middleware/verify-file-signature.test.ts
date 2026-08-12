import express from 'express';
import multer from 'multer';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { verifyFileSignature } from '../../src/middleware/verify-file-signature';
import { TINY_PDF_BYTES, TINY_PNG_BYTES } from '../fixtures/tiny-files';

// A minimal standalone app — multer (client-declared Content-Type only, no real
// validation) followed by verifyFileSignature — mirrors exactly how
// proof-upload.ts/signature-upload.ts are wired into the real routes
// (ledger.route.ts, society-settings.route.ts), but isolated so this test doesn't
// need a database.
function buildTestApp(allowedTypes: Parameters<typeof verifyFileSignature>[0]) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage() });
  app.post('/upload', upload.single('file'), verifyFileSignature(allowedTypes), (req, res) => {
    res.status(200).json({ mimetype: req.file?.mimetype });
  });
  // Express only recognizes error-handling middleware by arity (exactly 4 params) —
  // next must stay in the signature even though it's never called here, same as
  // src/middleware/error-handler.ts.
  app.use(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(400).json({ error: err instanceof Error ? err.message : 'error' });
    },
  );
  return app;
}

describe('verifyFileSignature', () => {
  it('rejects a file whose declared Content-Type does not match its actual bytes — the core spoofing case', async () => {
    const app = buildTestApp(['image/png', 'image/jpeg', 'image/webp']);
    // Declares image/png (would pass a naive Content-Type-only filter) but the
    // bytes are plain text — exactly the attack this middleware exists to catch.
    const res = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('not actually a png'), {
        filename: 'evil.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unsupported file type');
  });

  it('accepts a file whose bytes genuinely match an allowed type', async () => {
    const app = buildTestApp(['image/png', 'image/jpeg', 'image/webp']);
    const res = await request(app)
      .post('/upload')
      .attach('file', TINY_PNG_BYTES, { filename: 'real.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBe('image/png');
  });

  it("rejects a real file of a type that is not in this route's allowlist (e.g. a real PDF where only images are allowed)", async () => {
    const app = buildTestApp(['image/png', 'image/jpeg', 'image/webp']);
    const res = await request(app)
      .post('/upload')
      .attach('file', TINY_PDF_BYTES, { filename: 'real.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  it('overwrites req.file.mimetype with the sniffed type, not whatever the client declared', async () => {
    const app = buildTestApp(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
    // Client lies and declares image/png; bytes are actually a real PDF.
    const res = await request(app)
      .post('/upload')
      .attach('file', TINY_PDF_BYTES, { filename: 'sneaky.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBe('application/pdf');
  });

  it('passes through untouched when no file is attached — some routes accept an optional proof', async () => {
    const app = buildTestApp(['image/png']);
    const res = await request(app).post('/upload');
    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBeUndefined();
  });
});
