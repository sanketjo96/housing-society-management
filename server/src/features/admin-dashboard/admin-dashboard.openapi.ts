// OpenAPI docs for admin-dashboard.route.ts — see auth/auth.openapi.ts's header
// comment for why these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/admin/dashboard/summary:
 *   get:
 *     tags: [Dashboard (Admin)]
 *     summary: Society-wide, all-time collection summary
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalBilled: { type: number, description: Sum of every MaintenanceRecord.amount ever generated. }
 *                 totalPaid: { type: number, description: Sum of approved Deposits + approved Credits, society-wide. }
 *                 outstandingTotal: { type: number, description: Sum of each flat's own Outstanding. }
 *                 pendingReviewTotal: { type: number, description: Sum of amounts on still-PENDING Deposits. }
 *                 collectionRatePercent: { type: number, description: 'round(approvedDeposits-only / totalBilled * 100) — Credit deliberately excluded, see CLAUDE.md.' }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/admin/dashboard/flat-dues:
 *   get:
 *     tags: [Dashboard (Admin)]
 *     summary: Per-flat maintenance dues table, every flat, sorted by highest Outstanding first
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   flat:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       wing: { type: string }
 *                       flatNumber: { type: string }
 *                   owner: { $ref: '#/components/schemas/ContactSummary' }
 *                   currentTenant:
 *                     allOf: [{ $ref: '#/components/schemas/ContactSummary' }]
 *                     nullable: true
 *                   paidTotal: { type: number, description: This flat's approved Deposits + approved Credits, cumulative. }
 *                   outstandingTotal: { type: number }
 *                   creditTotal: { type: number, description: This flat's Available Credit. }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/admin/dashboard/resident-ledger:
 *   get:
 *     tags: [Dashboard (Admin)]
 *     summary: >
 *       Comprehensive per-flat ledger overview (Manage Resident Ledger) — every
 *       flat, both pools (Maintenance + Other Charges) in one row, sorted by wing
 *       then flat number. Unlike /flat-dues and /other-charges-dues (both filtered
 *       to only what's currently owed), this lists every flat regardless of
 *       balance — a directory to browse, not a "what needs attention" list.
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   flat:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       wing: { type: string }
 *                       flatNumber: { type: string }
 *                   owner: { $ref: '#/components/schemas/ContactSummary' }
 *                   currentTenant:
 *                     allOf: [{ $ref: '#/components/schemas/ContactSummary' }]
 *                     nullable: true
 *                   outstandingMaintenance: { type: number }
 *                   paidMaintenance: { type: number, description: This flat's approved Deposits + approved Credits, cumulative, Maintenance pool only. }
 *                   creditMaintenance: { type: number, description: This flat's Available Credit, Maintenance pool only. }
 *                   outstandingOtherCharges: { type: number }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/admin/dashboard/flagged-flats:
 *   get:
 *     tags: [Dashboard (Admin)]
 *     summary: Flats with Outstanding > 0 whose oldest unsettled charge is past its grace period
 *     parameters:
 *       - name: gracePeriodDays
 *         in: query
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 7 }
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   flat:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       wing: { type: string }
 *                       flatNumber: { type: string }
 *                   recipient: { $ref: '#/components/schemas/ContactSummary' }
 *                   outstandingTotal: { type: number, description: "The flat's full Outstanding, not just the overdue portion." }
 *                   oldestDueDate: { type: string, format: date-time }
 *                   overdueRecordCount: { type: integer, description: Overdue records that are not already fully settled. }
 *                   message: { type: string, description: Prepared escalation message text — admin shares it manually, no auto-send. }
 *       400: { description: Invalid gracePeriodDays, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
