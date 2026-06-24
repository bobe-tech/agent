import type { FastifyInstance } from 'fastify';
import { getPairCfg } from '../pairs-config.js';
import { listCandles } from '../repositories/candles.js';
import { getLatestQuote } from '../repositories/quotes.js';
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

    const q = await getLatestQuote(pair);
    if (!q) return reply.code(503).send({ error: 'no quote data' });
    return validateResponse(responseSchemas.price, { pair, bid: q.bid, ask: q.ask, mid: q.mid, ts: q.ts }, req.log);
  });
}
