import type { FastifyInstance } from 'fastify';
import { listPositions } from '../repositories/positions.js';
import { isKnownPair } from '../pairs-config.js';
import { positionsQuerySchema } from '../schemas.js';
import { validateResponse, responseSchemas } from '../responses.js';

export async function registerPositionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/positions', async (req, reply) => {
    const parsed = positionsQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad query' });
    if (parsed.data.pair && !isKnownPair(parsed.data.pair))
      return reply.code(404).send({ error: `unknown pair: ${parsed.data.pair}` });
    const positions = await listPositions(parsed.data);
    return validateResponse(responseSchemas.positions, { positions }, req.log);
  });
}
