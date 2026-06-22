import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sma, smaPrev, hh, ll, wilderAtr, adx, adxMult,
  rsiValues, streakSeries, percentRank, connorsRsi,
} from './indicators.js';

// A linearly rising series of 60 bars: close = 101+i.
const bars = Array.from({ length: 60 }, (_, i) => ({
  ts: i, o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i, v: 1,
}));

test('sma: average close over the last n bars', () => {
  // last 3 closes: 158,159,160 → 159
  assert.equal(sma(bars, 3), 159);
});

test('smaPrev: SMA20 lag bars back differs by lag (linear series +1/bar)', () => {
  const cur = sma(bars, 20);
  const prev = smaPrev(bars, 20, 3);
  assert.ok(Math.abs((cur - prev) - 3) < 1e-9);
});

test('hh/ll: max high and min low over n bars', () => {
  assert.equal(hh(bars, 20), bars.at(-1).h);     // rising series → last high
  assert.equal(ll(bars, 20), bars.at(-20).l);    // min low — the earliest of the 20
});

test('wilderAtr: positive atr_abs/atr_pct', () => {
  const a = wilderAtr(bars, 14);
  assert.ok(a.atr_pct > 0 && a.atr_abs > 0);
});

test('null when there is not enough data', () => {
  assert.equal(sma(bars.slice(0, 2), 20), null);
  assert.equal(smaPrev(bars.slice(0, 5), 20, 3), null);
  assert.equal(hh(bars.slice(0, 2), 20), null);
  assert.equal(wilderAtr(bars.slice(0, 2), 14), null);
  assert.equal(adx([{ ts: 0, o: 1, h: 1, l: 1, c: 1, v: 1 }], 14), null);
});

test('adx: strong trend → high ADX (>25)', () => {
  const up = Array.from({ length: 60 }, (_, i) => ({ ts: i, o: 100 + i, h: 101 + i, l: 99.5 + i, c: 100.8 + i, v: 1 }));
  const v = adx(up, 14);
  assert.ok(v !== null && v > 25, `trend ADX should be >25, got ${v}`);
});

test('adx: chop → low ADX (<25)', () => {
  const chop = Array.from({ length: 60 }, (_, i) => {
    const base = 100 + (i % 2 === 0 ? 0 : 0.5);
    return { ts: i, o: base, h: base + 0.6, l: base - 0.6, c: base, v: 1 };
  });
  const v = adx(chop, 14);
  assert.ok(v !== null && v < 25, `chop ADX should be <25, got ${v}`);
});

test('streakSeries: Connors signed streaks', () => {
  assert.deepEqual(streakSeries([100, 101, 102, 101, 101, 103]), [0, 1, 2, -1, 0, 1]);
});

test('rsiValues: Wilder RSI over an array (period 2)', () => {
  // [10,11,12,11]: changes +1,+1,-1 → avgGain=0.5, avgLoss=0.5 → RSI=50
  assert.ok(Math.abs(rsiValues([10, 11, 12, 11], 2) - 50) < 1e-9);
});

test('percentRank: fraction of previous values strictly less than the last one', () => {
  // last=-0.98, previous [1.0,0.99] → 0 less → 0%
  assert.equal(percentRank([1.0, 0.99, -0.98], 2), 0);
  // last=3, previous [1,2,5] → 2 less (1,2) → 2/3*100
  assert.ok(Math.abs(percentRank([1, 2, 5, 3], 3) - (2 / 3) * 100) < 1e-9);
});

test('connorsRsi: small periods, a manually verifiable example', () => {
  // closes=[100,101,102,101], {2,2,2}: RSI(close)=50, RSI(streak)=25, PercentRank=0 → CRSI=25
  const v = connorsRsi([100, 101, 102, 101], { rsi_period: 2, streak_period: 2, rank_period: 2 });
  assert.ok(Math.abs(v - 25) < 1e-9, `expected 25, got ${v}`);
});

test('connorsRsi/percentRank/rsiValues: null when there is not enough data', () => {
  assert.equal(rsiValues([1, 2], 14), null);
  assert.equal(percentRank([1, 2], 5), null);
  assert.equal(connorsRsi([100, 101, 102], { rsi_period: 2, streak_period: 2, rank_period: 2 }), null);
});

// --- Edge/degenerate series: pin down indicator behavior ---

test('rsiValues: only rises → RSI=100, only falls → RSI=0', () => {
  const up = Array.from({ length: 20 }, (_, i) => 100 + i);
  const down = Array.from({ length: 20 }, (_, i) => 100 - i);
  assert.equal(rsiValues(up, 5), 100);
  assert.equal(rsiValues(down, 5), 0);
});

test('streakSeries: fully flat series → all zeros (no streaks)', () => {
  assert.deepEqual(streakSeries([100, 100, 100, 100]), [0, 0, 0, 0]);
});

test('percentRank: last value above all → 100, below all → 0', () => {
  assert.equal(percentRank([1, 2, 3, 4, 100], 4), 100);
  assert.equal(percentRank([100, 90, 80, 70, 1], 4), 0);
});

test('connorsRsi with NON-default periods on a sufficient series → value in [0,100]', () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 2) * 5 + i * 0.1);
  const v = connorsRsi(closes, { rsi_period: 2, streak_period: 2, rank_period: 20 });
  assert.ok(v !== null && v >= 0 && v <= 100, `CRSI should be in [0,100], got ${v}`);
});

test('sma/hh/ll on a flat series equal the value itself', () => {
  const flat = Array.from({ length: 25 }, () => ({ o: 50, h: 50, l: 50, c: 50 }));
  assert.equal(sma(flat, 20), 50);
  assert.equal(hh(flat, 20), 50);
  assert.equal(ll(flat, 20), 50);
});

test('wilderAtr on a flat series → 0 (no true range)', () => {
  const flat = Array.from({ length: 30 }, () => ({ o: 50, h: 50, l: 50, c: 50 }));
  const a = wilderAtr(flat, 14);
  assert.equal(a.atr_abs, 0);
  assert.equal(a.atr_pct, 0);
});

test('adxMult: <= threshold → lo, > threshold → hi (boundary inclusive on lo)', () => {
  const cfg = { threshold: 30, lo: 1, hi: 1.3 };
  assert.equal(adxMult(10, cfg), 1);
  assert.equal(adxMult(30, cfg), 1);
  assert.equal(adxMult(30.0001, cfg), 1.3);
  assert.equal(adxMult(50, cfg), 1.3);
});

test('adxMult: defaults applied and null/NaN adx → null', () => {
  assert.equal(adxMult(40), 1.3);
  assert.equal(adxMult(20), 1);
  assert.equal(adxMult(null), null);
  assert.equal(adxMult(NaN), null);
});
