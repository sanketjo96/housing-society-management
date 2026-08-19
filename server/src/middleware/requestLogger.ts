import pinoHttp from 'pino-http';
import { logger } from '../infrastructure/observability';

// R3 — pino-http's defaults already log method, path, status code, response time,
// and a per-request id (attached to req.id and included on every line for that
// request) with no extra config. `feature: 'http'` since this is the cross-cutting
// request/response record, not owned by any one features/* folder.
export const requestLogger = pinoHttp({
  logger,
  customProps: () => ({ feature: 'http' }),
});
