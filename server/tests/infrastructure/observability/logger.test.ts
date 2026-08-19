import { afterEach, describe, expect, it, vi } from 'vitest';

describe('resolveTransport', () => {
  it('returns undefined in production (raw JSON, no pretty transport)', async () => {
    const { resolveTransport } = await import('../../../src/infrastructure/observability/logger');
    expect(resolveTransport(true)).toBeUndefined();
  });

  it('returns a pino-pretty transport config outside production', async () => {
    const { resolveTransport } = await import('../../../src/infrastructure/observability/logger');
    expect(resolveTransport(false)).toEqual({
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    });
  });
});

describe('logger', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('stamps every line with the configured service name (R2)', async () => {
    process.env.SERVICE_NAME = 'test-service';
    vi.resetModules();
    const { logger } = await import('../../../src/infrastructure/observability/logger');
    expect(logger.bindings()).toMatchObject({ service: 'test-service' });
  });

  it('defaults to smi-server when SERVICE_NAME is unset', async () => {
    delete process.env.SERVICE_NAME;
    vi.resetModules();
    const { logger } = await import('../../../src/infrastructure/observability/logger');
    expect(logger.bindings()).toMatchObject({ service: 'smi-server' });
  });

  it('a feature-scoped child carries both service and feature bindings', async () => {
    process.env.SERVICE_NAME = 'test-service';
    vi.resetModules();
    const { logger } = await import('../../../src/infrastructure/observability/logger');
    const child = logger.child({ feature: 'ledger' });
    expect(child.bindings()).toMatchObject({ service: 'test-service', feature: 'ledger' });
  });

  it('honors LOG_LEVEL from the environment', async () => {
    process.env.LOG_LEVEL = 'debug';
    vi.resetModules();
    const { logger } = await import('../../../src/infrastructure/observability/logger');
    expect(logger.level).toBe('debug');
  });

  it('defaults to info when LOG_LEVEL is unset', async () => {
    delete process.env.LOG_LEVEL;
    vi.resetModules();
    const { logger } = await import('../../../src/infrastructure/observability/logger');
    expect(logger.level).toBe('info');
  });
});
