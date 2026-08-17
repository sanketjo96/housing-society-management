import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requireRole } from '../../../src/middleware/require-role';

function signToken(payload: object, opts: jwt.SignOptions = { expiresIn: '15m' }) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, opts);
}

function mockReqRes(headers: Record<string, string> = {}) {
  const req = { headers } as Request;
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  const next = vi.fn();
  return { req, res, next };
}

describe('requireRole middleware', () => {
  it('rejects a request with no Authorization header (401)', () => {
    const { req, res, next } = mockReqRes();
    requireRole(['ADMIN'])(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a malformed Authorization header (401)', () => {
    const { req, res, next } = mockReqRes({ authorization: 'NotBearer sometoken' });
    requireRole(['ADMIN'])(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token with an invalid signature (401)', () => {
    const bogusToken = jwt.sign({ sub: 'x', role: 'ADMIN', societyId: 'y' }, 'wrong-secret');
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${bogusToken}` });
    requireRole(['ADMIN'])(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an expired token (401)', () => {
    const expired = signToken({ sub: 'x', role: 'ADMIN', societyId: 'y' }, { expiresIn: -10 });
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${expired}` });
    requireRole(['ADMIN'])(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a valid token whose role is not in the allowed list (403)', () => {
    const token = signToken({ sub: 'x', role: 'OWNER', societyId: 'y' });
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${token}` });
    requireRole(['ADMIN'])(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and attaches req.user for an allowed role', () => {
    const token = signToken({ sub: 'user-123', role: 'ADMIN', societyId: 'society-456' });
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${token}` });
    requireRole(['ADMIN'])(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toEqual({ id: 'user-123', role: 'ADMIN', societyId: 'society-456' });
  });

  it('accepts any role in a multi-role allow-list', () => {
    const token = signToken({ sub: 'x', role: 'TENANT', societyId: 'y' });
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${token}` });
    requireRole(['ADMIN', 'OWNER', 'TENANT'])(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
