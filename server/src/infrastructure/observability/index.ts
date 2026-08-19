// The stable façade every feature/job/middleware imports through. Trivial today
// (Stage 1 is structured logging only), but this is the file a future Stage 2
// (sentry.ts) re-exports alongside `logger` — call sites never have to change when
// that lands. See docs/observablity/02-architecture.md.
export { logger } from './logger';
