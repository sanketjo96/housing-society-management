import type { NextFunction, Request, Response } from 'express';
import { detectFileType, type DetectableFileType } from '../lib/file-signature';

// Runs *after* multer (proof-upload.ts/signature-upload.ts), never instead of it —
// multer's memoryStorage only populates `req.file.buffer` once the whole file has
// been read, so this can't happen inside multer's own `fileFilter` (that runs
// before the buffer exists). This is the actual content-based check backing up
// multer's client-declared-Content-Type allowlist (see lib/file-signature.ts for
// why that alone isn't trustworthy).
//
// Throws the exact same "Unsupported file type" message shape multer's own
// fileFilter already throws, so error-handler.ts's existing recognizer
// (`err.message.startsWith('Unsupported file type')` → 400) handles both without
// any change there.
export function verifyFileSignature(allowedTypes: DetectableFileType[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.file) {
      // A proof file is optional on some routes (a Deposit's screenshot) — nothing
      // to verify, and "is a file required here" is each handler's own concern.
      next();
      return;
    }

    const detected = detectFileType(req.file.buffer);
    if (!detected || !allowedTypes.includes(detected)) {
      next(new Error(`Unsupported file type: content does not match an allowed image/PDF format.`));
      return;
    }

    // Trust the sniffed type from here on, not whatever Content-Type the client
    // declared — this is what's persisted (LedgerEntry.mimeType,
    // Society.receiptSignatureMimeType) and later echoed back as the `Content-Type`
    // header when the file is served to a viewer, so it needs to be the type this
    // app actually verified, not an attacker-controllable claim.
    req.file.mimetype = detected;
    next();
  };
}
