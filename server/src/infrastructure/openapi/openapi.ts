import path from 'node:path';
import swaggerJsdoc from 'swagger-jsdoc';

// Each endpoint's `@openapi` JSDoc block lives in an openapi file sibling to the route
// file it documents — `<feature>.openapi.ts` next to `<feature>.route.ts` for a flat
// feature folder (e.g. features/auth/auth.openapi.ts), or `<prefix>-openapi.ts` next
// to `<prefix>-route.ts` inside a concern subfolder (e.g.
// features/flats/admin/admin-flats-openapi.ts) — a separate file rather than inline
// above each route registration, so the route files themselves stay short and
// readable. swagger-jsdoc only needs to find the comment blocks somewhere in a matched
// file, not attached to specific code, so both naming shapes are matched here. Matches
// both `.ts` (dev, via `tsx watch`) and the compiled `.js` (production, `node
// dist/server.js`) — swagger-jsdoc parses the raw file text, so comments survive the
// TypeScript → JavaScript compile untouched.
const isCompiled = __filename.endsWith('.js');
const ext = isCompiled ? 'js' : 'ts';
const routeGlobs = [
  path.join(__dirname, '..', '..', 'features', '**', `*.openapi.${ext}`),
  path.join(__dirname, '..', '..', 'features', '**', `*-openapi.${ext}`),
  path.join(__dirname, '..', '..', 'features', '**', `openapi.${ext}`),
];

const definition: swaggerJsdoc.Options['definition'] = {
  openapi: '3.0.3',
  info: {
    title: 'Housing Society Management API',
    version: '0.1.0',
    description:
      'Backend API for a single housing society: flat onboarding, monthly maintenance ' +
      'accrual, UPI-based payment collection with manual proof verification, and ' +
      'committee dues tracking. See the project docs/ directory for the full business ' +
      'rules behind these endpoints.',
  },
  // Relative, not a hardcoded host — this spec is served by the same origin it
  // documents (mounted at /api/docs, see app.ts), so "Try it out" requests in the UI
  // always target whichever host is actually serving this page, dev or production.
  servers: [{ url: '/', description: 'Current host' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Short-lived (15 min) access token from POST /api/auth/login or ' +
          'POST /api/auth/refresh, sent as `Authorization: Bearer <token>`.',
      },
      refreshTokenCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'refreshToken',
        description:
          'httpOnly cookie set by POST /api/auth/login, scoped to /api/auth. Not ' +
          'readable/settable from this UI — included here for documentation only.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Invalid input' },
          details: {
            type: 'object',
            description: 'Present on 400 responses — Zod\'s flattened validation errors.',
          },
        },
        required: ['error'],
      },
      UserPublic: {
        type: 'object',
        description: 'A User row with passwordHash stripped — the shape every endpoint returns.',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['ADMIN', 'OWNER', 'TENANT'] },
          societyId: { type: 'string' },
        },
      },
      ContactSummary: {
        type: 'object',
        description: 'The trimmed owner/tenant summary embedded in a Flat response.',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', nullable: true },
        },
      },
      Flat: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          wing: { type: 'string' },
          flatNumber: { type: 'string' },
          baseRate: { type: 'string', description: 'Decimal, serialized as a string.' },
          societyId: { type: 'string' },
          ownerId: { type: 'string' },
          currentTenantId: { type: 'string', nullable: true },
          owner: { $ref: '#/components/schemas/ContactSummary' },
          currentTenant: {
            allOf: [{ $ref: '#/components/schemas/ContactSummary' }],
            nullable: true,
          },
        },
      },
      LedgerEntry: {
        type: 'object',
        description:
          'A resident-created Deposit or Credit row. Only APPROVED rows count toward ' +
          'a flat\'s Outstanding/Available Credit — see docs/payments.md.',
        properties: {
          id: { type: 'string' },
          flatId: { type: 'string' },
          payerId: { type: 'string' },
          type: { type: 'string', enum: ['DEPOSIT', 'CREDIT'] },
          amount: { type: 'string', description: 'Decimal, serialized as a string.' },
          status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] },
          note: { type: 'string', nullable: true },
          fileUrl: { type: 'string', nullable: true },
          mimeType: { type: 'string', nullable: true },
          adminNote: { type: 'string', nullable: true },
          reviewedBy: { type: 'string', nullable: true },
          reviewedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      MaintenanceRecord: {
        type: 'object',
        description:
          'A monthly SYSTEM charge — always implicitly "Approved," never individually ' +
          'payable on its own. Contributes permanently to its flat\'s totalCharges.',
        properties: {
          id: { type: 'string' },
          flatId: { type: 'string' },
          period: { type: 'string', example: '2026-08', description: 'YYYY-MM' },
          payerType: { type: 'string', enum: ['OWNER', 'TENANT'] },
          payerId: { type: 'string' },
          amount: { type: 'string', description: 'Decimal, serialized as a string.' },
          dueDate: { type: 'string', format: 'date-time' },
        },
      },
      CreateFlatRequest: {
        type: 'object',
        description:
          'wing/flatNumber/baseRate/ownerEmail are required; everything else is ' +
          'optional. Owner/tenant accounts are found-or-created by email, not by id.',
        required: ['wing', 'flatNumber', 'baseRate', 'ownerName', 'ownerEmail'],
        properties: {
          wing: { type: 'string' },
          flatNumber: { type: 'string' },
          baseRate: { type: 'number' },
          ownerName: { type: 'string' },
          ownerPhone: { type: 'string' },
          ownerEmail: { type: 'string', format: 'email' },
          occupancy: { type: 'string', enum: ['owner', 'tenant'] },
          tenantName: { type: 'string' },
          tenantPhone: { type: 'string' },
          tenantEmail: { type: 'string', format: 'email' },
          effectiveFrom: { type: 'string', format: 'date-time' },
        },
      },
      UpdateFlatRequest: {
        type: 'object',
        description: 'Every field optional — at least one must be present. wing/flatNumber are never accepted.',
        properties: {
          baseRate: { type: 'number' },
          ownerName: { type: 'string' },
          ownerPhone: { type: 'string' },
          ownerEmail: { type: 'string', format: 'email' },
          occupancy: { type: 'string', enum: ['owner', 'tenant'] },
          tenantName: { type: 'string' },
          tenantPhone: { type: 'string' },
          tenantEmail: { type: 'string', format: 'email' },
          effectiveFrom: { type: 'string', format: 'date-time' },
        },
      },
      CommitteeMemberSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
      SocietySettings: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: { type: 'string' },
          constructionDate: { type: 'string', nullable: true, example: '2010-04-01' },
          formationDate: { type: 'string', nullable: true, example: '2011-01-15' },
          upiVpa: { type: 'string', nullable: true },
          bankAccountNumber: { type: 'string', nullable: true },
          bankIfsc: { type: 'string', nullable: true },
          tenantRateFactor: { type: 'number', example: 1.5 },
          defaultBaseRate: { type: 'number' },
          receiptNumberPrefix: { type: 'string', example: 'RCPT' },
          receiptFooterNote: { type: 'string', nullable: true },
          hasChairmanSignature: { type: 'boolean' },
          hasSecretarySignature: { type: 'boolean' },
          hasTreasurerSignature: { type: 'boolean' },
          chairman: { allOf: [{ $ref: '#/components/schemas/CommitteeMemberSummary' }], nullable: true },
          secretary: { allOf: [{ $ref: '#/components/schemas/CommitteeMemberSummary' }], nullable: true },
          treasurer: { allOf: [{ $ref: '#/components/schemas/CommitteeMemberSummary' }], nullable: true },
        },
      },
      UpdateSettingsRequest: {
        type: 'object',
        description: 'Every field optional — a partial update.',
        properties: {
          name: { type: 'string' },
          address: { type: 'string' },
          constructionDate: { type: 'string', example: '2010-04-01' },
          formationDate: { type: 'string', example: '2011-01-15' },
          upiVpa: { type: 'string', description: "'' clears it back to null." },
          bankAccountNumber: { type: 'string', maxLength: 34 },
          bankIfsc: { type: 'string', example: 'HDFC0001234' },
          tenantRateFactor: { type: 'number', maximum: 9.99 },
          defaultBaseRate: { type: 'number' },
          chairmanId: { type: 'string', description: "A User id — must be this society's OWNER." },
          secretaryId: { type: 'string' },
          treasurerId: { type: 'string' },
          receiptNumberPrefix: { type: 'string', pattern: '^[A-Za-z0-9-]{1,20}$' },
          receiptFooterNote: { type: 'string', maxLength: 500 },
        },
      },
      PaymentIntent: {
        type: 'object',
        description:
          'A locked pending-payment amount plus how to pay it — a UPI QR/deep-link, or ' +
          'bank transfer details if the society has no UPI VPA configured.',
        properties: {
          amount: { type: 'string' },
          paymentMethod: { type: 'string', enum: ['UPI', 'BANK_TRANSFER'] },
          upiDeepLink: { type: 'string', nullable: true },
          qrCodeDataUrl: { type: 'string', nullable: true },
          bankAccountNumber: { type: 'string', nullable: true },
          bankIfsc: { type: 'string', nullable: true },
        },
      },
    },
  },
  // Every endpoint requires a bearer token unless its own doc block overrides this
  // with `security: []` (login, refresh, request-reset, reset — the handful that are
  // reached before a token exists).
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth', description: 'Login, session refresh, logout, password reset.' },
    { name: 'Users (Admin)', description: 'Admin-only account provisioning/lookup.' },
    { name: 'Flats (Admin)', description: 'Flat onboarding, CRUD, id-based tenant assignment.' },
    { name: 'My Flat', description: "A resident's own flat and tenant self-service." },
    { name: 'My Profile', description: 'Any authenticated user updating their own contact details.' },
    { name: 'My Ledger', description: "A resident's own Passbook, payments, and credit requests." },
    { name: 'Ledger (Admin)', description: 'Reviewing/approving pending Deposits and Credits.' },
    { name: 'Maintenance Records (Admin)', description: 'Monthly charge generation and listing.' },
    { name: 'Dashboard (Admin)', description: 'Society-wide collection summary and dues.' },
    { name: 'Society Settings (Admin)', description: 'Billing rules, payment config, receipt template, committee signatures.' },
  ],
};

export const openapiSpec = swaggerJsdoc({
  definition,
  apis: routeGlobs,
});
