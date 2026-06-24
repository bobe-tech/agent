import { describe, it, expect } from 'vitest';
import { summarizePnl } from '../src/services/pnl.js';

describe('summarizePnl (pure aggregation)', () => {
  it('computes realized, win_rate and avg_pnl_pct over closed trades', () => {
    const s = summarizePnl(
      [
        { pair: 'ETH/USDT', realized_pnl_usd: '5', realized_pnl_pct: '2' },
        { pair: 'ETH/USDT', realized_pnl_usd: '-3', realized_pnl_pct: '-1' },
      ],
      [],
      {},
    );
    expect(s.realized_usd).toBe(2);
    expect(s.closed_count).toBe(2);
    expect(s.win_rate).toBe(0.5);
    expect(s.avg_pnl_pct).toBeCloseTo(0.5, 6);
    expect(s.unrealized_usd).toBe(0);
  });

  it('computes unrealized over open positions accounting for side and quote', () => {
    const s = summarizePnl(
      [],
      [
        { pair: 'ETH/USDT', side: 'LONG', opened_amount: '100', opened_price: '100' },
        { pair: 'WBNB/USDT', side: 'SHORT', opened_amount: '100', opened_price: '100' },
      ],
      // LONG marked at bid (110 -> +10%); SHORT marked at ask (90 -> +10%, price dropped)
      { 'ETH/USDT': { bid: 110, ask: 111 }, 'WBNB/USDT': { bid: 89, ask: 90 } },
    );
    expect(s.unrealized_usd).toBeCloseTo(20, 6);
    expect(s.open_count).toBe(2);
    expect(s.total_usd).toBeCloseTo(20, 6);
  });

  it('LONG uses bid, SHORT uses ask (spread-aware)', () => {
    const s = summarizePnl(
      [],
      [
        { pair: 'A/USDT', side: 'LONG', opened_amount: '100', opened_price: '100' },
        { pair: 'B/USDT', side: 'SHORT', opened_amount: '100', opened_price: '100' },
      ],
      { 'A/USDT': { bid: 100, ask: 102 }, 'B/USDT': { bid: 98, ask: 100 } },
    );
    // LONG at bid 100 -> 0%; SHORT at ask 100 -> 0%  => both flat despite a spread
    expect(s.unrealized_usd).toBeCloseTo(0, 6);
  });

  it('win_rate = null when there are no closed trades', () => {
    const s = summarizePnl([], [], {});
    expect(s.win_rate).toBeNull();
    expect(s.total_usd).toBe(0);
  });

  it('skips unrealized for a pair without a last price', () => {
    const s = summarizePnl([], [{ pair: 'X/USDT', side: 'LONG', opened_amount: '100', opened_price: '100' }], {});
    expect(s.unrealized_usd).toBe(0);
  });

  it('position without fills (opened_price=null) → unrealized=0, no NaN/Infinity', () => {
    const s = summarizePnl(
      [],
      [{ pair: 'ETH/USDT', side: 'LONG', opened_amount: '20', opened_price: null }],
      { 'ETH/USDT': { bid: 2500, ask: 2500 } },
      { base: 20 },
    );
    expect(s.unrealized_usd).toBe(0);
    expect(Number.isFinite(s.unrealized_usd)).toBe(true);
    expect(s.unrealized_pct).toBeCloseTo(0, 6);
  });

  it('opened_price=0 → unrealized=0 (no division by zero)', () => {
    const s = summarizePnl(
      [],
      [{ pair: 'ETH/USDT', side: 'LONG', opened_amount: '20', opened_price: '0' }],
      { 'ETH/USDT': { bid: 2500, ask: 2500 } },
      { base: 20 },
    );
    expect(s.unrealized_usd).toBe(0);
  });

  it('computes base / realized_pct / roi / apr from the base and the first trade date', () => {
    const nowMs = 1_000_000_000_000;
    const firstTradeMs = nowMs - 10 * 86_400_000; // 10 days of activity
    const s = summarizePnl(
      [{ pair: 'ETH/USDT', realized_pnl_usd: '10', realized_pnl_pct: '5' }],
      [],
      {},
      { base: 100, firstTradeMs, nowMs },
    );
    expect(s.base_usd).toBe(100);
    expect(s.realized_pct).toBeCloseTo(10, 6); // 10/100
    expect(s.roi_pct).toBeCloseTo(10, 6); // total 10/100
    expect(s.days_active).toBeCloseTo(10, 6);
    expect(s.apr_pct).toBeCloseTo(365, 4); // (10% / 10d) × 365
  });

  it('base=0 → percentages and apr = null', () => {
    const s = summarizePnl(
      [{ pair: 'X', realized_pnl_usd: '5', realized_pnl_pct: '1' }],
      [],
      {},
      { base: 0 },
    );
    expect(s.realized_pct).toBeNull();
    expect(s.roi_pct).toBeNull();
    expect(s.apr_pct).toBeNull();
  });
});
