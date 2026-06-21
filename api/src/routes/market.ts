import type { FastifyInstance } from 'fastify';
import { getPairCfg } from '../pairs-config.js';
import { listCandles, getLastClose } from '../repositories/candles.js';
import { candlesQuerySchema } from '../schemas.js';
import { validateResponse, responseSchemas } from '../responses.js';

export async function registerMarketRoutes(app: FastifyInstance): Promise<void> {
  // Candles are read ONLY from the DB (filled by the refresh-candles cron). We don't hit the external source
  // on the request path — no 429/502 for the user; we show what we have (we don't show older than available).
  app.get('/api/market/:pair/candles', async (req, reply) => {
    const pair = decodeURIComponent((req.params as { pair: string }).pair);
    if (!getPairCfg(pair)) return reply.code(404).send({ error: `unknown pair: ${pair}` });

    const parsed = candlesQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad query' });

    const candles = await listCandles(pair, parsed.data.tf, parsed.data.limit);
    return validateResponse(responseSchemas.candles, { pair, tf: parsed.data.tf, candles }, req.log);
  });

  app.get('/api/market/:pair/price', async (req, reply) => {
    const pair = decodeURIComponent((req.params as { pair: string }).pair);
    if (!getPairCfg(pair)) return reply.code(404).send({ error: `unknown pair: ${pair}` });

    const p = await getLastClose(pair);
    if (!p) return reply.code(503).send({ error: 'no price data' });
    return validateResponse(responseSchemas.price, { pair, last: p.last, time: p.time, prev_close: p.prevClose }, req.log);
  });
}
