import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '../infrastructure/prisma/generated/client';

export interface AuthenticatedUser {
  id: string;
  role: Role;
  societyId: string;
}

// Lets every controller read req.user without a cast, once this middleware has run.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Authenticates and authorizes together. 401 = no valid token; 403 = valid
// token, disallowed role.
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
