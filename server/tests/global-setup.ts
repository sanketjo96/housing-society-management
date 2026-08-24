import 'dotenv/config';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../src/config/env';

// Vitest's `globalSetup` (vitest.config.ts) — distinct from `setupFiles`
// (./setup.ts), which reruns once per test file/worker under parallel execution.
// This runs exactly once, in its own process, before any test file starts — the
// only safe place to reset *shared* state (a directory, a whole table) without
// racing a still-running file in another worker.
//
// 2026-08-24 addition: two confirmed-real accumulation problems, found while
// investigating disk usage — test-uploads/ had 780 leftover directories (21MB,
// going back 18 days, since nothing ever cleaned up LocalStorageAdapter's real
// file writes), and smi_test's AuditLog/NotificationLog tables had 886/749 rows
// (every other table stays small because most test files already do scoped
// per-test cleanup on the specific rows they create — these two accumulate
// because they're incidental side effects of things like maintenance generation
// or notify(), which the test that triggers them doesn't think of itself as
// "owning"). Reset *before* the suite runs, not after — an after-only cleanup is
// vulnerable to the exact "process got killed mid-run" failure mode that caused
// the original smi_dev stray-row incident (see CLAUDE.md's 2026-08-21 addendum);
// before-cleanup self-heals regardless of how the previous run ended.
export default async function globalSetup(): Promise<void> {
  await rm(path.join(process.cwd(), 'test-uploads'), { recursive: true, force: true });

  const databaseUrl = env('DATABASE_URL') ?? '';
  // Deliberate unscoped deleteMany() — the project convention elsewhere (see
  // CLAUDE.md) is that business/runtime code never does this; this is test
  // infrastructure operating on the test database specifically, the same
  // category as `prisma migrate reset`, not a business-logic shortcut. The guard
  // below is what actually keeps it safe: refuse to run against anything that
  // isn't obviously the test database, so a misconfigured DATABASE_URL can never
  // wipe real data the way the 2026-08-21 incident almost did.
  if (!databaseUrl.includes('smi_test')) {
    throw new Error(
      `global-setup.ts refuses to truncate AuditLog/NotificationLog: DATABASE_URL does not ` +
        `look like the test database (expected "smi_test" in the connection string). ` +
        `Got: ${databaseUrl.replace(/:[^:@]+@/, ':***@')}`,
    );
  }

  const { prisma } = await import('../src/infrastructure/prisma/client');
  await prisma.notificationLog.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.$disconnect();
}
