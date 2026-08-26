# Observability — Scope & Task Breakdown

## In Scope (Stage 1 + Stage 2 only)
Structured logging (Pino) + error aggregation (Sentry free tier), rolled out across the existing `features/`, `jobs/`, and `middleware/` folders, entered through a new `infrastructure/observability/` module.

## Out of Scope
Loki, Prometheus, Grafana, OpenTelemetry/Tempo, PagerDuty, multi-service tracing — see [`06-future-scope.md`](./06-future-scope.md).

---

## Task Breakdown

### Epic 1: Logging Foundation
| Task | Description | Effort |
|---|---|---|
| 1.1 | `npm install pino pino-http` + `npm install -D pino-pretty` | 5 min |
| 1.2 | Create `infrastructure/observability/logger.ts` (base Pino instance, `service`/`env` tags, pretty transport in dev only) | 20 min |
| 1.3 | Create `infrastructure/observability/index.ts` re-exporting `logger` | 5 min |
| 1.4 | Add `pino-http` in `middleware/requestLogger.ts`, wire into `app.ts` | 20 min |
| 1.5 | Replace `console.log`/`console.error` in `features/payments/` | 20 min |
| 1.6 | Replace `console.log`/`console.error` in `features/notifications/` | 20 min |
| 1.7 | Replace `console.log`/`console.error` in `features/receipts/` | 15 min |
| 1.8 | Replace `console.log`/`console.error` in `features/users/`, `features/maintenance/`, remaining features | 30 min |
| 1.9 | Replace `console.log`/`console.error` in `jobs/` | 20 min |
| 1.10 | Add `process.on('uncaughtException'/'unhandledRejection')` in `server.ts` | 15 min |
| 1.11 | Verify: prod build outputs raw JSON, dev outputs pretty-printed | 10 min |

**Epic 1 total: ~3 hours**

### Epic 2: Error Aggregation
| Task | Description | Effort |
|---|---|---|
| 2.1 | Create free Sentry account + project (Node) | 10 min |
| 2.2 | `npm install @sentry/node` | 5 min |
| 2.3 | Create `infrastructure/observability/sentry.ts` (`Sentry.init()`, `captureException` wrapper with feature tagging) | 20 min |
| 2.4 | Wire Sentry error middleware in `middleware/` (after routes, before final handler) | 15 min |
| 2.5 | Create `withJobErrorCapture()` helper, apply to `jobs/` handlers | 30 min |
| 2.6 | Add `Sentry.captureException` calls alongside `logger.error` in payment/notification failure paths | 30 min |
| 2.7 | Configure one alert rule (new issue → Slack or email) | 15 min |
| 2.8 | Store `SENTRY_DSN` in env config (`config/`), confirm not committed to git | 10 min |

**Epic 2 total: ~2 hours**

### Epic 3: Documentation & Handover
| Task | Description | Effort |
|---|---|---|
| 3.1 | Document logging conventions (object-first, string-second; when to use `warn` vs `error`) | 15 min |
| 3.2 | Document how to read Sentry issues + how tagging by feature works | 15 min |
| 3.3 | Add `.env.example` entries for `LOG_LEVEL`, `SENTRY_DSN`, `SERVICE_NAME` | 10 min |

**Epic 3 total: ~40 min**

---

## Total Effort Estimate
- **Stage 1 (Epic 1)**: ~3 hours
- **Stage 2 (Epic 2)**: ~2 hours
- **Docs (Epic 3)**: ~40 min
- **Total: ~5–6 hours**, splittable across a few sessions; Stage 1 and Stage 2 can ship independently.

## Acceptance Criteria (per epic)
- **Epic 1 done when**: no `console.log`/`console.error` remain in `src/`; every request produces a structured log line with `requestId`; an uncaught exception is logged before the process exits.
- **Epic 2 done when**: a deliberately thrown test error appears in the Sentry dashboard, tagged with the correct feature, and triggers the configured alert.
