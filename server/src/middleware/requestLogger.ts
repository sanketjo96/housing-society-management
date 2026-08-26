import pinoHttp from 'pino-http';
import { logger } from '../infrastructure/observability';

// pino-http's defaults already log method, path, status, response time, and a
// per-request id with no extra config.
export const requestLogger = pinoHttp({
  logger,
  customProps: () => ({ feature: 'http' }),
});
