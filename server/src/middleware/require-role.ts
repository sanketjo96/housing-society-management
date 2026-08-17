import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '../infrastructure/prisma/generated/client';

export interface AuthenticatedUser {
  id: string;
  role: Role;
  societyId: string;
}

// Declaration merging: lets every controller read req.user without a cast, once this
// middleware (or any future one that sets it) has run.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// requireRole(['ADMIN']) both authenticates (is there a valid access token at all?)
// and authorizes (is this role allowed here?) — they can't be split into separate
// middlewares cleanly, since you can't check a role without first decoding a valid
// token. 401 means "who are you" (missing/malformed/invalid/expired token); 403 means
// "I know who you are, you're not allowed" (valid token, disallowed role).
export function requireRole(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or malformed Authorization header' });
      return;
    }

    const token = authHeader.slice('Bearer '.length);
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not set');
    }

    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    } catch {
      res.status(401).json({ error: 'Invalid or expired access token' });
      return;
    }

    const { sub, role, societyId } = decoded;
    if (typeof sub !== 'string' || typeof role !== 'string' || typeof societyId !== 'string') {
      res.status(401).json({ error: 'Invalid or expired access token' });
      return;
    }

    if (!allowedRoles.includes(role as Role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    req.user = { id: sub, role: role as Role, societyId };
    next();
  };
}
