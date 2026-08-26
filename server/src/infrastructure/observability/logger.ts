import pino from 'pino';
import { env } from '../../config/env';

const SERVICE_NAME = env('SERVICE_NAME', 'smi-server');
const LOG_LEVEL = env('LOG_LEVEL', 'info');

function isProduction(): boolean {
  return env('NODE_ENV') === 'production';
}

// Pure so the dev/prod branch is unit-testable without spinning up pino-pretty's
// worker-thread transport.
export function resolveTransport(prod: boolean): pino.TransportSingleOptions | undefined {
  return prod
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } };
}

// Only file that imports pino directly. `service` is a base binding on every
// line; `feature` is supplied per call site via logger.child({ feature: 'x' }).
export const logger = pino({
  level: LOG_LEVEL,
  base: { service: SERVICE_NAME },
  // Required field name is `timestamp`, not pino's default `time`.
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  // Level must be the readable name ("info"), not pino's default numeric level.
  formatters: { level: (label) => ({ level: label }) },
  transport: resolveTransport(isProduction()),
});
