import type { FastifyInstance } from 'fastify';
import { listOrders } from '../repositories/orders.js';
import { isKnownPair } from '../pairs-config.js';
import { ordersQuerySchema } from '../schemas.js';
import { validateResponse, responseSchemas } from '../responses.js';

export async function registerOrdersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/orders', async (req, reply) => {
    const parsed = ordersQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad query' });
    if (parsed.data.pair && !isKnownPair(parsed.data.pair))
      return reply.code(404).send({ error: `unknown pair: ${parsed.data.pair}` });
    const orders = await listOrders(parsed.data);
    return validateResponse(responseSchemas.orders, { orders }, req.log);
  });
}
