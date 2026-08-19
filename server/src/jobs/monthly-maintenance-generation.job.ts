import { prisma } from '../infrastructure/prisma/client';
import { logger } from '../infrastructure/observability';
import { generateMaintenanceRecords } from '../features/maintenance/maintenance-record.service';

const jobLogger = logger.child({ feature: 'maintenance-generation' });

// Runs generation for every society (this MVP only ever has one — CLAUDE.md's scope
// note — but the loop costs nothing and is what "onboard a second society without a
// schema rewrite" actually requires in practice). One society failing (a bad
// tenantRateFactor, a DB hiccup) is logged and doesn't stop the others — a single
// society's cron failure shouldn't silently skip every other society's billing for
// the month.
//
// No period is passed by the cron caller in src/server.ts, so this defaults (via
// generateMaintenanceRecords) to previousPeriod() — arrears billing: run on the 1st,
// generate for the month that just ended, once its occupancy history is fully known.
export async function runMonthlyMaintenanceGeneration(period?: string): Promise<void> {
  const societies = await prisma.society.findMany({ select: { id: true, name: true } });

  for (const society of societies) {
    try {
      const result = await generateMaintenanceRecords(society.id, period);
      jobLogger.info(
        { societyId: society.id, societyName: society.name, created: result.created, skipped: result.skipped },
        'maintenance records generated',
      );
    } catch (err) {
      jobLogger.error(
        { err, societyId: society.id, societyName: society.name },
        'maintenance record generation failed',
      );
    }
  }
}
