import type { FastifyInstance } from 'fastify';
import { listTicks } from '../repositories/ticks.js';
import { isKnownPair } from '../pairs-config.js';
import { ticksQuerySchema } from '../schemas.js';
import { validateResponse, responseSchemas } from '../responses.js';

export async function registerTicksRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/ticks', async (req, reply) => {
    const parsed = ticksQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad query' });
    if (parsed.data.pair && !isKnownPair(parsed.data.pair))
      return reply.code(404).send({ error: `unknown pair: ${parsed.data.pair}` });
    const ticks = await listTicks(parsed.data);
    return validateResponse(responseSchemas.ticks, { ticks }, req.log);
  });
}
