import 'dotenv/config';
import cron from 'node-cron';
import { app } from './app';
import { runMonthlyMaintenanceGeneration } from './jobs/monthly-maintenance-generation.job';

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Task 4.4 — 00:05 on the 1st of every month (a few minutes past midnight, not exactly
// on it, to sidestep any timezone-rollover edge case at the boundary). Asia/Kolkata
// explicitly, not the host's local time — this app's currency, phone formats, and
// every seeded example are India-specific, and "the 1st of the month" needs to mean
// the same wall-clock moment regardless of which timezone the VPS host happens to run
// in. Task 4.3's manual-trigger endpoint exists precisely so a missed/delayed run
// (server down at 00:05) can be caught up by hand — see docs/maintenance-records.md.
//
// Arrears billing: no period is passed here, so each run generates for the month that
// just ended (previousPeriod()), not the one just starting — see
// maintenance-record.service.ts's previousPeriod() for why.
cron.schedule(
  '5 0 1 * *',
  () => {
    void runMonthlyMaintenanceGeneration();
  },
  { timezone: 'Asia/Kolkata' },
);
