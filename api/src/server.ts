import Fastify, {
  type FastifyInstance,
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify';
import cors from '@fastify/cors';
import { createLogger } from './logger.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerMarketRoutes } from './routes/market.js';
import { registerPairsRoutes } from './routes/pairs.js';
import { registerParamsRoutes } from './routes/params.js';
import { registerPositionsRoutes } from './routes/positions.js';
import { registerTicksRoutes } from './routes/ticks.js';
import { registerReflectionsRoutes } from './routes/reflections.js';
import { registerPnlRoutes } from './routes/pnl.js';
import { registerOrdersRoutes } from './routes/orders.js';
import { registerDocsRoutes } from './routes/docs.js';

// Builds a Fastify instance with all routes. Used by the entry point and by tests (.inject()).
export function buildServer(): FastifyInstance {
  // In tests we disable the logger (no file streams or noise); in dev/prod — pino to stdout + file.
  const isTest = process.env['NODE_ENV'] === 'test';
  // cast: pino Logger is compatible with FastifyBaseLogger (a superset), but we pin the instance's
  // generic type so the returned FastifyInstance doesn't "leak" the pino type due to the pino version.
  const app = Fastify(isTest ? { logger: false } : { loggerInstance: createLogger() as FastifyBaseLogger });

  // CORS: for prod set CORS_ORIGINS (comma-separated) — an allowlist. Without the variable, origin:true
  // reflects any Origin (NOTE: intentional for dev/demo; set an allowlist in prod).
  const allow = process.env['CORS_ORIGINS'];
  app.register(cors, allow ? { origin: allow.split(',').map((s) => s.trim()) } : { origin: true });

  // Single error handler: the full error with its stack is written to the log,
  // outward 5xx responses use a GENERIC message (no stack/internal details). API_DEBUG=true — return
  // the real message (for debugging). Client 4xx errors (validation, etc.) are returned as is.
  app.setErrorHandler((err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err }, 'unhandled request error');
      const debug = process.env['API_DEBUG'] === 'true';
      return reply.code(500).send({ error: debug ? err.message : 'Internal server error' });
    }
    req.log.warn({ err: err.message }, 'client error');
    return reply.code(status).send({ error: err.message });
  });

  app.register(registerHealthRoutes);
  app.register(registerMarketRoutes);
  app.register(registerPairsRoutes);
  app.register(registerParamsRoutes);
  app.register(registerPositionsRoutes);
  app.register(registerTicksRoutes);
  app.register(registerReflectionsRoutes);
  app.register(registerPnlRoutes);
  app.register(registerOrdersRoutes);
  app.register(registerDocsRoutes);
  return app;
}
