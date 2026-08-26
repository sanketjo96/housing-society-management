import { prisma } from '../infrastructure/prisma/client';
import { logger } from '../infrastructure/observability';
import { generateMaintenanceRecords } from '../features/maintenance/maintenance-record.service';

const jobLogger = logger.child({ feature: 'maintenance-generation' });

// Runs generation for every society. One society failing doesn't stop the others.
// No period passed by the cron caller defaults to previousPeriod() (arrears billing).
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
