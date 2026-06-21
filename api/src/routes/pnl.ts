import type { FastifyInstance } from 'fastify';
import { getClosedForPnl, getOpenForPnl, getFirstTradeMsByPair } from '../repositories/pnl.js';
import { getDepositBases } from '../repositories/params.js';
import { summarizePnl } from '../services/pnl.js';
import { listPairs, isKnownPair } from '../pairs-config.js';
import { getLastClose } from '../repositories/candles.js';
import { pnlQuerySchema } from '../schemas.js';
import { validateResponse, responseSchemas } from '../responses.js';
import type { ClosedPnlRow, OpenPnlRow, PnlSummary } from '../types.js';

// last prices of a set of pairs from the DB (for unrealized). Cheap and without an external source; error/no data → null.
async function lastPrices(pairs: string[]): Promise<Record<string, number | null>> {
  const entries = await Promise.all(
    pairs.map(async (pair): Promise<readonly [string, number | null]> => {
      try {
        const p = await getLastClose(pair);
        return [pair, p?.last ?? null];
      } catch {
        return [pair, null];
      }
    }),
  );
  return Object.fromEntries(entries);
}

// Earliest trade date across all pairs (for the portfolio APR). null if there are no trades.
function minMs(byPair: Record<string, number>): number | null {
  const vals = Object.values(byPair);
  return vals.length ? Math.min(...vals) : null;
}

// Group rows by pair in memory (for the portfolio breakdown without extra DB queries).
function groupByPair<T extends { pair: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const arr = map.get(r.pair);
    if (arr) arr.push(r);
    else map.set(r.pair, [r]);
  }
  return map;
}

export async function registerPnlRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/pnl', async (req, reply) => {
    const parsed = pnlQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'bad query' });
    const { pair } = parsed.data;
    if (pair && !isKnownPair(pair)) return reply.code(404).send({ error: `unknown pair: ${pair}` });

    const [closed, open, bases, firstByPair] = await Promise.all([
      getClosedForPnl(pair),
      getOpenForPnl(pair),
      getDepositBases(),
      getFirstTradeMsByPair(),
    ]);
    const prices = await lastPrices([...new Set(open.map((o) => o.pair))]);
    const summary = summarizePnl(closed, open, prices, {
      base: pair ? (bases.byPair[pair] ?? 0) : bases.total,
      firstTradeMs: pair ? (firstByPair[pair] ?? null) : minMs(firstByPair),
    });
    return validateResponse(responseSchemas.pnl, summary, req.log);
  });

  app.get('/api/pnl/portfolio', async (req) => {
    // Load everything ONCE, compute the per-pair breakdown in memory — no N+1 to the DB.
    const [closed, open, bases, firstByPair] = await Promise.all([
      getClosedForPnl(),
      getOpenForPnl(),
      getDepositBases(),
      getFirstTradeMsByPair(),
    ]);
    const prices = await lastPrices([...new Set(open.map((o) => o.pair))]);
    const total = summarizePnl(closed, open, prices, { base: bases.total, firstTradeMs: minMs(firstByPair) });

    const closedByPair = groupByPair<ClosedPnlRow>(closed);
    const openByPair = groupByPair<OpenPnlRow>(open);
    const by_pair: Array<PnlSummary & { pair: string }> = listPairs().map((pair) => ({
      pair,
      ...summarizePnl(closedByPair.get(pair) ?? [], openByPair.get(pair) ?? [], prices, {
        base: bases.byPair[pair] ?? 0,
        firstTradeMs: firstByPair[pair] ?? null,
      }),
    }));

    return validateResponse(responseSchemas.portfolio, { total, by_pair }, req.log);
  });
}
