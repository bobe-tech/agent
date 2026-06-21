import { describe, it, expect } from 'vitest';
import { withTestTx } from './helpers/db.js';
import { query } from '../../core/db.js';
import { upsertCandles, pruneOldCandles } from '../../core/candles-store.js';

describe('candles-store', () => {
  it('upsert + prune deletes candles older than the retention, keeps fresh ones', async () => {
    await withTestTx(async () => {
      const now = Math.floor(Date.now() / 1000);
      const oldTs = now - 100 * 86400; // 100 days ago — beyond the 45-day retention
      const freshTs = now - 1 * 86400; // yesterday — within retention
      await upsertCandles('ZZZ/TEST', '1h', [
        { time: oldTs, open: 1, high: 1, low: 1, close: 1 },
        { time: freshTs, open: 2, high: 2, low: 2, close: 2 },
      ]);

      const removed = await pruneOldCandles('1h', 45);
      expect(removed).toBeGreaterThanOrEqual(1);

      const { rows } = await query<{ ts: string }>(
        "SELECT ts FROM candles WHERE pair = 'ZZZ/TEST' AND tf = '1h'",
      );
      const tss = rows.map((r) => Number(r.ts));
      expect(tss).toContain(freshTs);
      expect(tss).not.toContain(oldTs);
    });
  });

  it('upsert is idempotent (re-inserting the same bar updates, does not duplicate)', async () => {
    await withTestTx(async () => {
      const ts = Math.floor(Date.now() / 1000) - 3600;
      await upsertCandles('ZZZ/TEST', '1h', [{ time: ts, open: 1, high: 1, low: 1, close: 1 }]);
      await upsertCandles('ZZZ/TEST', '1h', [{ time: ts, open: 1, high: 2, low: 0.5, close: 1.5 }]);
      const { rows } = await query<{ close: number }>(
        "SELECT close::float8 AS close FROM candles WHERE pair = 'ZZZ/TEST' AND tf = '1h' AND ts = $1",
        [ts],
      );
      expect(rows).toHaveLength(1); // not duplicated
      expect(rows[0]?.close).toBe(1.5); // updated
    });
  });
});
