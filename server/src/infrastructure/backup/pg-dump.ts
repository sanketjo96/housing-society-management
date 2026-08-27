import { spawn } from 'node:child_process';

// DATABASE_URL (docker-compose.yml) carries Prisma's own `?schema=public` query
// param — a Prisma routing hint, not a libpq connection option. pg_dump rejects
// it outright ("invalid URI query parameter"). Dropping the whole query string
// is safe: pg_dump dumps every schema in the database by default when none is
// given, and this app only ever uses the one `public` schema.
function stripUnsupportedQueryParams(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.search = '';
  return url.toString();
}

// Runs pg_dump against `databaseUrl` (accepted as a libpq connection string,
// not split into flags) and buffers its stdout — plain-SQL format so a restore
// needs nothing but `psql`, no-owner/no-privileges so a restore into a
// differently-named role never fails on GRANT/OWNER statements it can't run.
export function dumpDatabase(databaseUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const connectionString = stripUnsupportedQueryParams(databaseUrl);
    const child = spawn('pg_dump', ['--format=plain', '--no-owner', '--no-privileges', connectionString]);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pg_dump exited with code ${code}: ${Buffer.concat(stderrChunks).toString('utf-8')}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks));
    });
  });
}
