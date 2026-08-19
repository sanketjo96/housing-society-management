# Observability — Requirements

## Context
- App: Society management system (24 flats, 2 personas — Admin, Resident)
- Stack: Node.js/TypeScript, feature-based folder structure
- Goal: Add clean, free, gradual error/log observability without over-engineering for current scale

## Problem Statement
Currently using `console.log`/unstructured logging with no error aggregation. Failures in background jobs (payments, notifications) can happen silently with no visibility, and there's no consistent way to search or correlate logs across features.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | Replace `console.log`/`console.error` with structured JSON logging across all features | Must |
| R2 | Every log line must include `service`, `timestamp`, `level`, and `feature` context | Must |
| R3 | HTTP requests must be auto-logged with method, path, status, duration, and a unique request ID | Must |
| R4 | Uncaught exceptions and unhandled promise rejections must be logged before process exit | Must |
| R5 | Errors in `jobs/` (cron, background, queue) must be captured — these must not fail silently | Must |
| R6 | Errors and exceptions must be aggregated in a dashboard with stack traces, grouping, and alerting | Should |
| R7 | Errors must be taggable/filterable by feature (e.g. `payments`, `notifications`) | Should |
| R8 | A request must be traceable across feature/module boundaries via a correlation ID | Could (Stage 3+) |
| R9 | Centralized log search (outside hosting provider's log viewer) | Won't (this phase) |
| R10 | Metrics dashboards (latency, throughput) and distributed tracing | Won't (this phase) |

## Non-Functional Requirements
- **Cost**: $0 at current scale (24 flats, 2 personas); free-tier services only
- **Simplicity**: No new infrastructure to operate/maintain (no self-hosted DBs, agents, or clusters)
- **Incremental**: Each stage must be independently useful and not block on later stages
- **No premature scaling**: Explicitly avoid tooling sized for multi-service/high-traffic systems until real pain justifies it
- **Dev experience**: Readable/colorized logs in local dev, raw JSON in production
- **Low maintenance overhead**: Should not require a dedicated person/time to babysit the observability stack

## Out of Scope (for now)
- Distributed tracing (OpenTelemetry/Tempo)
- Metrics/Prometheus + Grafana
- Centralized log aggregation (Loki)
- Multi-service correlation
- On-call/PagerDuty-style alerting

These are deferred to [`06-future-scope.md`](./06-future-scope.md) and should only be picked up when a concrete, felt problem justifies them — not on a schedule.

## Success Criteria
- Every feature module logs through one shared logger, no ad-hoc `console.log`
- A production error can be found, read (with stack trace), and traced to the feature/request that caused it, within a couple of minutes
- Silent job failures (e.g. a receipt not sent) are surfaced automatically instead of being discovered via a resident complaint
