import { runDatabaseBackup } from '../infrastructure/backup/database-backup.service';
import { logger } from '../infrastructure/observability';

const jobLogger = logger.child({ feature: 'database-backup' });

// Thin wrapper: calls the service, logs the outcome. A missing BACKUP_S3_*
// config (backup bucket not set up yet) surfaces here as a logged failure,
// same as any other cause — it never crashes the process or blocks startup.
export async function runWeeklyDatabaseBackup(): Promise<void> {
  try {
    const { key, bytes } = await runDatabaseBackup();
    jobLogger.info({ key, bytes }, 'database backup uploaded');
  } catch (err) {
    jobLogger.error({ err }, 'database backup failed');
  }
}
