import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { dumpDatabase } from '../../../src/infrastructure/backup/pg-dump';

// spawn() is mocked at module level (not via a real pg_dump binary) — same
// justification as s3-storage-adapter.test.ts's use of mockClient: there's no
// free, ephemeral Postgres+pg_dump environment to integration-test against here,
// and these tests exist to prove this wrapper's own contract (args passed, stdout
// buffered, non-zero exit surfaced) rather than that a real pg_dump binary works.
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

describe('dumpDatabase', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('resolves with pg_dump\'s stdout as a Buffer on a clean exit', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const promise = dumpDatabase('postgresql://user:pass@host:5432/db');
    child.stdout.end('-- sql dump contents');
    child.emit('close', 0);

    const result = await promise;
    expect(result.toString('utf-8')).toBe('-- sql dump contents');
  });

  it('passes the connection string as a plain-format, no-owner/no-privileges dump', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    void dumpDatabase('postgresql://user:pass@host:5432/db');

    expect(spawnMock).toHaveBeenCalledWith(
      'pg_dump',
      expect.arrayContaining(['--format=plain', '--no-owner', '--no-privileges', 'postgresql://user:pass@host:5432/db']),
    );
  });

  // DATABASE_URL (docker-compose.yml) carries Prisma's own `?schema=public`
  // query param — a Prisma routing hint, not a libpq connection option. Passed
  // through verbatim, pg_dump rejects it outright ("invalid URI query
  // parameter"). Stripping the query string is safe: pg_dump dumps every
  // schema in the database by default when none is given, and this app only
  // ever uses the one `public` schema (no Prisma multiSchema).
  it('strips unrecognized query params (e.g. Prisma\'s ?schema=) before invoking pg_dump', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    void dumpDatabase('postgresql://user:pass@host:5432/db?schema=public');

    expect(spawnMock).toHaveBeenCalledWith(
      'pg_dump',
      expect.arrayContaining(['postgresql://user:pass@host:5432/db']),
    );
    expect(spawnMock.mock.calls[0][1]).not.toContain('postgresql://user:pass@host:5432/db?schema=public');
  });

  it('rejects with pg_dump\'s stderr when it exits non-zero', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const promise = dumpDatabase('postgresql://user:pass@host:5432/db');
    child.stderr.end('connection refused');
    child.emit('close', 1);

    await expect(promise).rejects.toThrow(/connection refused/);
  });

  it('rejects when the pg_dump binary itself fails to spawn', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const promise = dumpDatabase('postgresql://user:pass@host:5432/db');
    child.emit('error', new Error('ENOENT'));

    await expect(promise).rejects.toThrow('ENOENT');
  });
});
