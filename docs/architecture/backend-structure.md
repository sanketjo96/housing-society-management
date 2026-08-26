# Backend Structure

## Layout

```
server/src/
  features/<name>/     One folder per business domain — routes, controllers,
                        services, Zod schemas, and OpenAPI docs for that
                        feature live together. A feature with both admin and
                        resident-facing endpoints splits further into
                        admin/ and resident/ subfolders (e.g. features/ledger/).
  infrastructure/       Cross-cutting technical concerns: Prisma client,
                        storage adapters, email providers, structured logging,
                        OpenAPI assembly.
  shared/               Small helpers used across multiple features: error
                        classes, tenant-scoping, file-signature sniffing,
                        billing math (rate calculation, escalation, UPI links).
  jobs/                 node-cron job definitions. Thin — each wraps a call
                        into a feature's own service in try/catch and logs
                        the outcome; the actual logic lives in the service,
                        callable independently (e.g. from a manual-trigger
                        endpoint) as well as from the cron schedule.
  middleware/           Express middleware (auth, role checks, rate limiting).
  config/               Env var reading (env(), requiredEnv()).
  app.ts, server.ts     Express app assembly; process entry point + cron
                        registration.
```

Within a feature folder, naming convention:

```
<name>.route.ts        HTTP wiring only: path + method → controller handler.
<name>.controller.ts   Parses/validates the request (Zod schema), calls the
                        service, maps the result or a thrown domain error to
                        an HTTP status + JSON body.
<name>.service.ts       Business logic. Plain functions, no Express types.
                        Throws typed domain errors, never HTTP status codes —
                        the controller decides what those mean over HTTP.
<name>.schemas.ts       Zod request/response schemas.
<name>.openapi.ts       @openapi JSDoc blocks, kept out of the route file for
                        readability.
```

A service is callable from more than one entry point on purpose — e.g. a
billing-generation service is called from both a cron job and a manual-trigger
admin endpoint. This is why services never import Express types: nothing about
them should assume they're only ever reached via HTTP.

## Env var config

No central startup validation. Every env var is read lazily, at the point of
use — `env(name, fallback?)` / `requiredEnv(name)`
(`server/src/config/env.ts`). A swappable integration (email provider,
WhatsApp, S3 storage) gets its own `getXConfig()` factory that calls
`requiredEnv()` for anything with no sane default, called only from inside
that integration's own code path — never from `server.ts` or any
module-load-time code. An unconfigured optional integration never blocks
`docker compose up`.

## Prisma gotcha: P2002 unique-constraint errors

Prisma 7 + `@prisma/adapter-pg` doesn't use the documented
`err.meta.target: string[]` shape for P2002 errors — the actual field name is
nested at `err.meta.driverAdapterError.cause.constraint.fields`.
`server/src/shared/errors/prisma-errors.ts`'s `getUniqueConstraintFields()`
checks that path first, falls back to the classic shape. Use this helper for
detecting which field violated a unique constraint; don't re-derive it.

## Multi-tenancy

Every resource belongs to exactly one `Society`. See
`docs/architecture/multi-tenancy.md` for the isolation mechanism
(`scopedWhere()`) and why it's a plain function services call explicitly
rather than middleware or an automatic Prisma extension.
