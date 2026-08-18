import { Router } from 'express';
import {
  generateMaintenanceRecordsHandler,
  listMaintenanceRecordsHandler,
} from './maintenance-records.controller';
import { requireRole } from '../../middleware/require-role';

export const maintenanceRecordsRouter = Router();

/**
 * @openapi
 * /api/admin/maintenance-records/generate:
 *   post:
 *     tags: [Maintenance Records (Admin)]
 *     summary: Generate this society's monthly maintenance charges
 *     description: >
 *       Idempotent per period — re-running for a period that already has records is a
 *       no-op for those flats, never a duplicate. Defaults to the *previous* calendar
 *       month (arrears billing) if period is omitted — see CLAUDE.md's arrears-billing
 *       addendum for why. Also the job node-cron runs at 00:05 on the 1st of each month.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               period:
 *                 type: string
 *                 pattern: '^\d{4}-(0[1-9]|1[0-2])$'
 *                 example: '2026-08'
 *                 description: Defaults to the previous calendar month if omitted.
 *     responses:
 *       200:
 *         description: OK — includes counts of created vs already-existing records.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period: { type: string, example: '2026-08' }
 *                 created: { type: integer }
 *                 skipped: { type: integer, description: Flats that already had a record for this period. }
 *       400: { description: Invalid period format., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
maintenanceRecordsRouter.post(
  '/api/admin/maintenance-records/generate',
  requireRole(['ADMIN']),
  generateMaintenanceRecordsHandler,
);

/**
 * @openapi
 * /api/admin/maintenance-records:
 *   get:
 *     tags: [Maintenance Records (Admin)]
 *     summary: List maintenance records for the society, optionally filtered
 *     parameters:
 *       - name: period
 *         in: query
 *         required: false
 *         schema: { type: string, pattern: '^\d{4}-(0[1-9]|1[0-2])$', example: '2026-08' }
 *       - name: flatId
 *         in: query
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: '#/components/schemas/MaintenanceRecord' } }
 *       400: { description: Invalid query, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
maintenanceRecordsRouter.get(
  '/api/admin/maintenance-records',
  requireRole(['ADMIN']),
  listMaintenanceRecordsHandler,
);
