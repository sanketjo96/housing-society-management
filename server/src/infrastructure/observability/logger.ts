import pino from 'pino';
import { env } from '../../config/env';

const SERVICE_NAME = env('SERVICE_NAME', 'smi-server');
const LOG_LEVEL = env('LOG_LEVEL', 'info');

// NODE_ENV is only read here and in features/auth/auth.controller.ts (which
// explicitly warns against reusing it for the Secure-cookie flag, since Dockerfile
// hardcodes NODE_ENV=production even though HTTPS isn't ready yet). That mismatch
// doesn't apply to log formatting: NODE_ENV=production in the deployed container
// really does mean "real deployment, emit raw JSON," and `npm run dev`/`tsx watch`
// never sets NODE_ENV, so pretty-printing there is correct.
function isProduction(): boolean {
  return env('NODE_ENV') === 'production';
}

// Pure and exported so the dev/prod branch is unit-testable without spinning up
// pino-pretty's actual worker-thread transport (see logger.test.ts).
export function resolveTransport(prod: boolean): pino.TransportSingleOptions | undefined {
  return prod
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } };
}

// Single entry point that calls pino() — nothing else in this codebase should import
// `pino` directly (docs/observablity/02-architecture.md's "one entry point per
// concern" rule, same shape as infrastructure/storage and infrastructure/email each
// having exactly one file that touches their underlying implementation).
//
// `service` is a base binding, present on every line including every .child() call
// (R2). `feature` is deliberately NOT a base binding — every call site supplies it
// via logger.child({ feature: 'x' }), so a log line's feature always reflects the
// module that actually emitted it, not a global default.
export const logger = pino({
  level: LOG_LEVEL,
  base: { service: SERVICE_NAME },
  // R2 requires the literal field name `timestamp`, not pino's default `time` key.
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  // R2 requires a readable level name ("info"/"error"), not pino's default numeric level.
  formatters: { level: (label) => ({ level: label }) },
  transport: resolveTransport(isProduction()),
});
