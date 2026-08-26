import type { NextFunction, Request, Response } from 'express';
import { detectFileType, type DetectableFileType } from '../shared/security/file-signature';

// Runs after multer, not inside its fileFilter — the buffer only exists once
// multer's memoryStorage has finished reading the whole file. Content-based check
// backing up multer's client-declared-Content-Type allowlist. Throws the same
// "Unsupported file type" message shape multer's own fileFilter throws, so
// error-handler.ts's existing recognizer handles both.
export function verifyFileSignature(allowedTypes: DetectableFileType[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.file) {
      // Whether a file is required here is each handler's own concern.
      next();
      return;
    }

    const detected = detectFileType(req.file.buffer);
    if (!detected || !allowedTypes.includes(detected)) {
      next(new Error(`Unsupported file type: content does not match an allowed image/PDF format.`));
      return;
    }

    // Persist the sniffed type, not the client-declared one.
    req.file.mimetype = detected;
    next();
  };
}
