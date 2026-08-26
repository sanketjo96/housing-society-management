import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../infrastructure/observability';

// Must be mounted last, after every router. Express only recognizes error
// middleware by arity (exactly 4 params) — `next` stays in the signature even
// though it's never called, or Express treats this as regular middleware.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5MB)' : err.message;
    res.status(400).json({ error: message });
    return;
  }
  if (err instanceof Error && err.message.startsWith('Unsupported file type')) {
    res.status(400).json({ error: err.message });
    return;
  }
  logger.child({ feature: 'error-handler' }).error({ err }, 'unhandled error');
  res.status(500).json({ error: 'Internal server error' });
}
