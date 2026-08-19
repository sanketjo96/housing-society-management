# Observability — Roadmap

Principle: **evolve gradually, trigger-driven, not calendar-driven.** Each stage should be lived with for a while before moving to the next. Don't pre-build a later stage just because it's "next" — a felt problem should justify it.

## Stage 1 — Structured Logging (Pino)
**Status: do now**
**Trigger to start**: today
**Trigger to move on**: Stage 1 has been running for at least a couple of weeks with real usage, and console-log-style debugging feels sufficient day to day.

- Set up `infrastructure/observability/logger.ts`
- Add `pino-http` request logging middleware
- Replace `console.log`/`console.error` across `features/`, `jobs/`, `middleware/`
- Add global `uncaughtException` / `unhandledRejection` handlers in `server.ts`

## Stage 2 — Error Aggregation (Sentry free tier)
**Trigger to start**: real users (residents/admins) are active and you can no longer just tail logs yourself to catch problems in real time.
**Trigger to move on**: not applicable — Sentry is a long-lived tool, not a stage you "graduate" from.

- `infrastructure/observability/sentry.ts` with `Sentry.init()`
- Sentry error middleware in `middleware/`
- Wrap `jobs/` handlers (payments, notifications, receipts) so background failures are captured, not just HTTP errors
- Tag errors by `feature`
- Set up one Slack/email alert rule for new issues

## Stage 3 — Request Correlation (config only, no new infra)
**Trigger to start**: debugging a flow that spans multiple features/jobs (e.g. payment → notification) becomes genuinely annoying from logs alone.

- Ensure `requestId` from `pino-http` is threaded into any downstream job/log calls triggered by that request
- No new tools — this is a config/wiring tweak on what Stage 1 already set up

## Stage 4 — Simple Health Visibility (optional, lightweight)
**Trigger to start**: you want an at-a-glance "is it up" view instead of scanning Sentry/logs.

- Single `/health` or `/status` endpoint
- Sentry's own dashboard as the issue view
- Explicitly **not** Grafana at this stage

## Deferred Indefinitely (until a concrete trigger appears)
| Capability | Trigger that would justify it |
|---|---|
| Log aggregation (Loki) | Multiple services, or log volume outgrows the hosting provider's log viewer |
| Metrics (Prometheus + Grafana) | Need for latency/throughput dashboards, or SLAs to track |
| Distributed tracing (OpenTelemetry + Tempo) | Requests start spanning multiple independently-deployed services |
| On-call/PagerDuty alerting | Uptime becomes business-critical (e.g. paid tenants depending on it) |

## Rollout Timeline (indicative, not fixed)
```
Week 0        Stage 1 (Pino)                 ── ship
Week 0–4      Live with Stage 1 only          ── observe
Week 4+       Stage 2 (Sentry) if pain shows   ── ship when triggered
Ongoing       Stage 3/4 only on specific pain  ── reactive, not scheduled
Not scheduled Stage 5+ (Loki/Prometheus/OTel)  ── only if scale genuinely changes
```

## Explicit Non-Goals of This Roadmap
- Do not schedule Loki, Prometheus, or OpenTelemetry work
- Do not build metrics dashboards "just in case"
- Do not add a log shipper before there's a second consumer of logs beyond the hosting viewer
