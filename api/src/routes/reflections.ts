import type { FastifyInstance } from 'fastify';
import { listReflections } from '../repositories/reflections.js';
import { reflectionsQuerySchema } from '../schemas.js';
import { validateResponse, responseSchemas } from '../responses.js';

export async function registerReflectionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/reflections', async (req, reply) => {
    const parsed = reflectionsQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad query' });
    const reflections = await listReflections(parsed.data);
    return validateResponse(responseSchemas.reflections, { reflections }, req.log);
  });
}
