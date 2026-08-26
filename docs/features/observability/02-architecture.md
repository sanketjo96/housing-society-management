# Observability — Architecture

## Design Principle
One shared module (`infrastructure/observability/`) is the single source of truth. Features never instantiate their own logger or error client — they import from here and attach `feature` context. This keeps the footprint small now and lets later stages (metrics, tracing) slot in without touching feature code.

## Target Folder Structure
```
src/
├── infrastructure/
│   └── observability/
│       ├── logger.ts        # Pino instance + config          (Stage 1)
│       ├── sentry.ts        # Sentry.init + capture helpers    (Stage 2)
│       ├── metrics.ts        # prom-client registry             (future, not built yet)
│       ├── tracing.ts        # OTel setup                        (future, not built yet)
│       └── index.ts          # re-exports what currently exists
├── middleware/
│   └── requestLogger.ts     # pino-http wiring                 (Stage 1)
├── jobs/
│   └── *.ts                 # wrapped with error capture       (Stage 2)
└── features/
    └── */                   # logger.child({ feature: 'x' })
```

## Stage 1 Architecture — Structured Logging
```
Request → pino-http middleware → logger.child({ feature }) in handler
                                        │
                                        ▼
                              stdout (JSON in prod, pretty in dev)
                                        │
                                        ▼
                        Hosting provider's built-in log viewer
                        (Render / Railway / Fly.io / Vercel, etc.)
```
- No new infrastructure. Logs go to stdout; the hosting platform is the viewer.
- `logger.child({ feature: 'payments' })` per feature module gives filterable context for free once a real log viewer is added later.
- `requestId` generated per request (via `pino-http`) — carried through logs for that request, sets up Stage-3 correlation without extra work now.

## Stage 2 Architecture — Error Aggregation
```
Exception in feature/job
        │
        ├─→ logger.error({ err }, 'message')     — goes to stdout as before
        └─→ Sentry.captureException(err)          — goes to Sentry dashboard
                       │
                       ▼
              Grouped issues, stack traces,
              tags (feature, persona), Slack alert
```
- Sentry and Pino are **complementary, not redundant**: Pino is the full-fidelity record of everything; Sentry is the "tell me only what's broken and let me manage it" layer.
- `Sentry.setTag('feature', ...)` on capture so issues are filterable in the dashboard by the same feature boundary as the code.
- `jobs/` handlers wrapped in a `withJobErrorCapture()` helper in `observability/sentry.ts` so background/cron failures can't slip through silently — this is the single highest-value wiring point given payments/notifications live in jobs.

## Data Flow Summary (current target state)

| Concern | Tool | Where it lives | Cost |
|---|---|---|---|
| Structured logs | Pino | stdout → hosting log viewer | Free |
| Request logging | pino-http | middleware | Free |
| Error aggregation | Sentry | sentry.io free tier | Free (≤5k events/mo) |
| Job failure capture | Sentry (wrapped) | `jobs/` | Free |

## Deferred Architecture (not built now — see future-scope.md)
- **Log aggregation**: Promtail/Alloy → Loki, only if log volume/number of services grows past what a hosting log viewer can handle.
- **Metrics**: `prom-client` → Prometheus → Grafana, only if there's a real need for latency/throughput dashboards.
- **Tracing**: OpenTelemetry → Tempo, only if requests start spanning multiple services and a request-scoped `requestId` in logs stops being enough.

## Key Architectural Decisions
1. **stdout-first**: never write logs to a file or run a log shipper until there's an actual second consumer of logs (Loki) — the hosting platform already captures stdout.
2. **One entry point per concern**: `infrastructure/observability/logger.ts` and `sentry.ts` are the only files that call `pino()`/`Sentry.init()`. Everything else imports.
3. **Feature tagging is mandatory, not optional**: every logger call and every Sentry capture must be tagged by feature — this is what makes Stage 3+ (dashboards, correlation) nearly free to add later.
4. **No infra Claude/you have to operate**: Stage 1 and Stage 2 require zero servers, containers, or agents beyond the app itself.
