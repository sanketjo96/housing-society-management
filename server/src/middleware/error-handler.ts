import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

// First error-handling middleware in the app (added alongside Task 6.2's file upload).
// multer's fileFilter/limits violations reach here via Express's standard synchronous
// next(err) mechanism (multer itself isn't async, so this works correctly even though
// this codebase's async controllers generally handle their own errors via try/catch
// rather than relying on a catch-all — see CLAUDE.md's "Backend architecture"). Must
// be mounted last, after every router (Express's 4-arg-signature convention for error
// middleware).
// Express only recognizes error-handling middleware by arity (exactly 4 params) — next
// must stay in the signature even though it's never called here, or Express would treat
// this as regular middleware and never invoke it for an error.
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
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
