import type { FastifyInstance } from 'fastify';
import { getActiveParams } from '../repositories/params.js';
import { validateResponse, responseSchemas } from '../responses.js';

export async function registerParamsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/params/:pair', async (req, reply) => {
    const pair = decodeURIComponent((req.params as { pair: string }).pair);
    const row = await getActiveParams(pair);
    if (!row) return reply.code(404).send({ error: `no active params for pair: ${pair}` });
    return validateResponse(responseSchemas.params, row, req.log);
  });
}
