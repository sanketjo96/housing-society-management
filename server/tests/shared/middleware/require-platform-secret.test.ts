import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requirePlatformSecret } from '../../../src/middleware/require-platform-secret';

function mockReqRes(headers: Record<string, string> = {}) {
  const req = { headers } as Request;
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  const next = vi.fn();
  return { req, res, next };
}

// Unit-level (no HTTP, no shared app) so mutating process.env.PLATFORM_BOOTSTRAP_SECRET
// can never race with a concurrently-running test file that hits the real route —
// tests/setup.ts sets a fixed value for every other test in the suite; this file is
// the one place that deliberately overrides it, always restored in afterEach.
describe('requirePlatformSecret middleware', () => {
  const original = process.env.PLATFORM_BOOTSTRAP_SECRET;

  afterEach(() => {
    process.env.PLATFORM_BOOTSTRAP_SECRET = original;
  });

  it('responds 503 when PLATFORM_BOOTSTRAP_SECRET is not configured', () => {
    delete process.env.PLATFORM_BOOTSTRAP_SECRET;
    const { req, res, next } = mockReqRes({ 'x-platform-bootstrap-secret': 'anything' });
    requirePlatformSecret(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a request with no secret header (403)', () => {
    process.env.PLATFORM_BOOTSTRAP_SECRET = 'configured-secret';
    const { req, res, next } = mockReqRes();
    requirePlatformSecret(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong secret (403)', () => {
    process.env.PLATFORM_BOOTSTRAP_SECRET = 'configured-secret';
    const { req, res, next } = mockReqRes({ 'x-platform-bootstrap-secret': 'wrong-secret' });
    requirePlatformSecret(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a secret of different length without throwing', () => {
    process.env.PLATFORM_BOOTSTRAP_SECRET = 'configured-secret';
    const { req, res, next } = mockReqRes({ 'x-platform-bootstrap-secret': 'short' });
    expect(() => requirePlatformSecret(req, res, next)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for the correct secret', () => {
    process.env.PLATFORM_BOOTSTRAP_SECRET = 'configured-secret';
    const { req, res, next } = mockReqRes({ 'x-platform-bootstrap-secret': 'configured-secret' });
    requirePlatformSecret(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
