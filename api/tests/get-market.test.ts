import { describe, it, expect } from 'vitest';
import { withTestTx } from './helpers/db.js';
import { upsertCandles } from '../../core/candles-store.js';
import { getMarket } from '../../core/market.js';

// getMarket now reads candles FROM the DB (not from the candle source). We check that features
// (close, hv, dv, CRSI) are computed from the seeded 1h bars — i.e. the "DB → computeFeatures" path works end-to-end.
describe('getMarket from DB', () => {
  it('computes features from 1h candles in the candles table', async () => {
    await withTestTx(async () => {
      const lastHour = Math.floor(Date.now() / 1000 / 3600) * 3600;
      const bars = [];
      for (let i = 420; i >= 1; i--) {
        const ts = lastHour - i * 3600; // 420 hours ≈ 17.5 days — enough for CRSI(100) and daily volatility(15d)
        const base = 100 + Math.sin(i / 8) * 4;
        bars.push({ time: ts, open: base, high: base + 1.5, low: base - 1.5, close: base + 0.7 });
      }
      await upsertCandles('ETH/USDT', '1h', bars);

      const m = await getMarket(
        { base: 'ETH', quote: 'USDT', symbol: 'ETHUSDT', token: '0xabc' },
        { timeframe: 'H1', limit: 720, crsi_periods: { rsi_period: 3, streak_period: 2, rank_period: 100 } },
      );

      expect(typeof m.close).toBe('number');
      expect(m.atr_pct).not.toBeNull(); // hourly volatility computed
      expect(m.daily_vol_pct).not.toBeNull(); // ≥15 closed days → daily volatility is present
      expect(m.crsi).not.toBeNull(); // ≥102 bars → CRSI is present
      expect(m.base).toBe('ETH');
      expect(m.token_address).toBe('0xabc');
    });
  });

  it('throws if there are no candles in the DB', async () => {
    await withTestTx(async () => {
      await expect(
        getMarket({ base: 'NOPE', quote: 'USDT', symbol: 'NOPEUSDT' }, { timeframe: 'H1' }),
      ).rejects.toThrow();
    });
  });
});
