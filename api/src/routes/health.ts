import type { FastifyInstance } from 'fastify';

// Liveness probe (no DB). DB readiness is checked at the level of specific routes.
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ status: 'ok' as const }));
}
