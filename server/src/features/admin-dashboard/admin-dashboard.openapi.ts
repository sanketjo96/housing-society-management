// OpenAPI docs for admin-dashboard.route.ts.
export {};

/**
 * @openapi
 * /api/admin/dashboard/summary:
 *   get:
 *     tags: [Dashboard (Admin)]
 *     summary: Society-wide collection summary, all-time or scoped to one calendar year
 *     description: >
 *       `year`, when given, scopes every money figure below (billed/paid/outstanding
 *       amounts and the society income/expense/net) to that calendar year. Flat/owner/
 *       tenant counts are a separate endpoint (/flat-dues) entirely unaffected by this
 *       param. `availableYears` is always the full lifetime set regardless of `year`.
 *     parameters:
 *       - name: year
 *         in: query
 *         required: false
 *         schema: { type: integer }
 *         description: Scope every total to one calendar year; omit for all-time (the default).
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalBilled: { type: number, description: Sum of every MaintenanceRecord.amount, in-scope. }
 *                 totalPaid: { type: number, description: Sum of approved Deposits, society-wide, in-scope. }
 *                 outstandingTotal: { type: number, description: Sum of each flat's own Outstanding, in-scope. }
 *                 pendingReviewTotal: { type: number, description: Sum of amounts on still-PENDING Deposits, in-scope. }
 *                 collectionRatePercent: { type: number, description: 'round(totalPaid / totalBilled * 100), in-scope.' }
 *                 otherChargesOutstandingTotal: { type: number }
 *                 totalOutstandingTotal: { type: number }
 *                 societyTotalIncome: { type: number }
 *                 societyTotalExpense: { type: number }
 *                 societyNetPosition: { type: number }
 *                 availableYears: { type: array, items: { type: integer }, description: Every year with at least one charge, Deposit, or SocietyLedgerEntry, society-wide — always lifetime. }
 *       400: { description: Invalid year, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
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
 *                   paidTotal: { type: number, description: This flat's approved Deposits, cumulative. }
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
 *                   paidMaintenance: { type: number, description: This flat's approved Deposits, cumulative, Maintenance pool only. }
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
