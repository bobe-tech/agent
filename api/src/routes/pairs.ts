import type { FastifyInstance } from 'fastify';
import { listPairs } from '../pairs-config.js';
import { getActiveVersions } from '../repositories/params.js';
import type { PairSummary } from '../types.js';
import { validateResponse, responseSchemas } from '../responses.js';

export async function registerPairsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/pairs', async (req) => {
    const versions = await getActiveVersions();
    const pairs: PairSummary[] = listPairs().map((pair) => ({
      pair,
      active_version: versions[pair] ?? null,
    }));
    return validateResponse(responseSchemas.pairs, { pairs }, req.log);
  });
}
