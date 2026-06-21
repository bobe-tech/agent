import { describe, it, expect } from 'vitest';
import { resample, type Candle } from '../src/repositories/candles.js';

const c = (time: number, open: number, high: number, low: number, close: number): Candle => ({
  time,
  open,
  high,
  low,
  close,
});

describe('resample (1h → period)', () => {
  it('aggregates hourly bars into 4h buckets on UTC boundaries', () => {
    const base = 14400 * 10;
    const bars = [
      c(base, 100, 105, 99, 101),
      c(base + 3600, 101, 110, 100, 108),
      c(base + 7200, 108, 109, 95, 96),
      c(base + 10800, 96, 97, 90, 93),
      c(base + 14400, 93, 94, 92, 93.5), // next bucket
    ];
    const out = resample(bars, 14400);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ time: base, open: 100, high: 110, low: 90, close: 93 });
    expect(out[1]).toEqual({ time: base + 14400, open: 93, high: 94, low: 92, close: 93.5 });
  });

  it('empty input → empty output', () => {
    expect(resample([], 86400)).toEqual([]);
  });
});
