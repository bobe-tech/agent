import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateDecision, addsCount, regimeLabel } from './tick-gate.js';

// A fetchBid stub that records whether it was called and returns a fixed value.
function bidSpy(value) {
  let calls = 0;
  const fn = async () => { calls++; return value; };
  fn.wasCalled = () => calls > 0;
  return fn;
}

const MARKET = { atr_pct: 1, daily_vol_pct: 5, adx_mult: 1, live_close: 100, high_24h: 100, adx: 20 };
const CONFIG = { max_adds: 2, avg2_atr_mult: 3, adx_mult_threshold: 30 };
const completed = (action) => ({ action, status: 'completed' });

// ── addsCount ───────────────────────────────────────────────────────────────
test('addsCount: open only → 0; open+add → 1; ignores cancelled/active', () => {
  assert.equal(addsCount([completed('open')]), 0);
  assert.equal(addsCount([completed('open'), completed('add')]), 1);
  assert.equal(addsCount([completed('open'), { action: 'add', status: 'active' }]), 0);
  assert.equal(addsCount([completed('open'), { action: 'add', status: 'cancelled' }]), 0);
});

// ── regimeLabel ───────────────────────────────────────────────────────────────
test('regimeLabel: adx band + high anchor', () => {
  assert.equal(regimeLabel({ adx: 35, live_close: 100, high_24h: 100 }, CONFIG), 'UP_TREND');
  assert.equal(regimeLabel({ adx: 35, live_close: 90, high_24h: 100 }, CONFIG), 'DOWN_TREND');
  assert.equal(regimeLabel({ adx: 20, live_close: 90, high_24h: 100 }, CONFIG), 'RANGE');
  assert.equal(regimeLabel({ adx: null }, CONFIG), 'RANGE');
});

// ── warm-up ───────────────────────────────────────────────────────────────────
test('warm-up: null hv/adx_mult/live_close → SKIP, twak not touched', async () => {
  for (const bad of [{ atr_pct: null }, { adx_mult: null }, { live_close: null }]) {
    const bid = bidSpy(999);
    const d = await gateDecision({ position: null, market: { ...MARKET, ...bad }, config: CONFIG, fetchBid: bid });
    assert.equal(d.decision, 'SKIP');
    assert.equal(d.branch, 'warmup');
    assert.equal(bid.wasCalled(), false);
  }
});

// ── BRANCH A: entry (no position) ─────────────────────────────────────────────
test('entry: drop ≥ gate → RUN; twak not touched', async () => {
  const bid = bidSpy(999);
  // high=100, live=98 → drop 2% ; gate = hv*adx_mult = 1 → 2 ≥ 1
  const d = await gateDecision({ position: null, market: { ...MARKET, live_close: 98 }, config: CONFIG, fetchBid: bid });
  assert.equal(d.decision, 'RUN');
  assert.equal(d.branch, 'entry');
  assert.equal(bid.wasCalled(), false);
});

test('entry: drop < gate → SKIP', async () => {
  // high=100, live=99.5 → drop 0.5% ; gate = 1 → 0.5 < 1
  const d = await gateDecision({ position: null, market: { ...MARKET, live_close: 99.5 }, config: CONFIG, fetchBid: bidSpy(0) });
  assert.equal(d.decision, 'SKIP');
  assert.equal(d.branch, 'entry');
  assert.ok(d.checks.entry_drop_pct < d.checks.entry_gate);
});

test('entry: scaled gate by adx_mult — drop just under hv*adx_mult → SKIP', async () => {
  // hv=1, adx_mult=1.3 → gate 1.3 ; drop 1.0% < 1.3
  const m = { ...MARKET, adx_mult: 1.3, live_close: 99 };
  const d = await gateDecision({ position: null, market: m, config: CONFIG, fetchBid: bidSpy(0) });
  assert.equal(d.decision, 'SKIP');
});

test('entry boundary: drop EXACTLY == gate → RUN (locks >= against a >  regression → false-skip)', async () => {
  // high=100, live=99 → drop 1.0% ; gate = hv*adx_mult = 1 → 1.0 == 1.0 must RUN
  const d = await gateDecision({ position: null, market: { ...MARKET, live_close: 99 }, config: CONFIG, fetchBid: bidSpy(0) });
  assert.equal(d.decision, 'RUN');
  assert.equal(d.checks.entry_drop_pct, d.checks.entry_gate);
});

test('entry: high_24h missing → fail-open RUN', async () => {
  const d = await gateDecision({ position: null, market: { ...MARKET, high_24h: null }, config: CONFIG, fetchBid: bidSpy(0) });
  assert.equal(d.decision, 'RUN');
});

// ── BRANCH B: manage (open position) ──────────────────────────────────────────
const pos = (over = {}) => ({ opened_price: 100, opened_size: 1, error: false, orders: [completed('open')], ...over });

test('manage: error=true → SKIP, twak not touched', async () => {
  const bid = bidSpy(999);
  const d = await gateDecision({ position: pos({ error: true }), market: MARKET, config: CONFIG, fetchBid: bid });
  assert.equal(d.decision, 'SKIP');
  assert.equal(bid.wasCalled(), false);
});

test('manage: active order → RUN (reconcile), twak not touched', async () => {
  const bid = bidSpy(999);
  const p = pos({ orders: [completed('open'), { action: 'add', status: 'active' }] });
  const d = await gateDecision({ position: p, market: MARKET, config: CONFIG, fetchBid: bid });
  assert.equal(d.decision, 'RUN');
  assert.equal(bid.wasCalled(), false);
});

test('manage: avg1 gate passes (dd ≥ dv*adx_mult) → RUN, twak not touched', async () => {
  const bid = bidSpy(999);
  // opened_price=100, live=90 → dd 10% ; avg1 thresh = dv*adx_mult = 5 ; 10 ≥ 5
  const d = await gateDecision({ position: pos(), market: { ...MARKET, live_close: 90 }, config: CONFIG, fetchBid: bid });
  assert.equal(d.decision, 'RUN');
  assert.equal(d.checks.add_threshold, 5);
  assert.equal(bid.wasCalled(), false);
});

test('manage: avg2 deeper threshold when adds_count=1', async () => {
  // adds_count=1 → avg2 thresh = avg2_atr_mult*dv*adx_mult = 3*5 = 15
  const p = pos({ orders: [completed('open'), completed('add')] });
  // dd 12% < 15 → not add; underwater so bid ≤ avg → SKIP
  const skip = await gateDecision({ position: p, market: { ...MARKET, live_close: 88 }, config: CONFIG, fetchBid: bidSpy(88) });
  assert.equal(skip.decision, 'SKIP');
  assert.equal(skip.checks.add_threshold, 15);
  // dd 20% ≥ 15 → RUN add
  const run = await gateDecision({ position: p, market: { ...MARKET, live_close: 80 }, config: CONFIG, fetchBid: bidSpy(0) });
  assert.equal(run.decision, 'RUN');
});

test('manage boundary: dd EXACTLY == add_threshold → RUN (locks >= against a > regression)', async () => {
  // opened_price=100, live=95 → dd 5.0% ; avg1 thresh = dv*adx_mult = 5 → 5.0 == 5.0 must RUN
  const d = await gateDecision({ position: pos(), market: { ...MARKET, live_close: 95 }, config: CONFIG, fetchBid: bidSpy(0) });
  assert.equal(d.decision, 'RUN');
  assert.equal(d.checks.dd_pct, d.checks.add_threshold);
});

test('manage boundary: bid EXACTLY == opened_price → SKIP (pins the strict bid>avg simplification)', async () => {
  // dd 1% < add 5 → no add; bid == avg 100 → 100 > 100 is false → SKIP (agent real TP needs bid strictly above avg)
  const bid = bidSpy(100);
  const d = await gateDecision({ position: pos(), market: { ...MARKET, live_close: 99 }, config: CONFIG, fetchBid: bid });
  assert.equal(d.decision, 'SKIP');
  assert.equal(d.checks.bid, 100);
});

test('manage: adds_count ≥ max_adds → no add; falls through to TP', async () => {
  const bid = bidSpy(90); // ≤ avg 100
  const p = pos({ orders: [completed('open'), completed('add'), completed('add')] }); // adds_count=2 = max_adds
  const d = await gateDecision({ position: p, market: { ...MARKET, live_close: 95 }, config: CONFIG, fetchBid: bid });
  assert.equal(d.decision, 'SKIP');
  assert.equal(d.checks.add_threshold, null); // no add leg available
  assert.equal(bid.wasCalled(), true);        // TP path was reached
});

test('manage: add fails + bid > opened_price → RUN (tp possible)', async () => {
  const bid = bidSpy(101); // > avg 100
  // dd 1% < avg1 thresh 5 → no add → TP check
  const d = await gateDecision({ position: pos(), market: { ...MARKET, live_close: 99 }, config: CONFIG, fetchBid: bid });
  assert.equal(d.decision, 'RUN');
  assert.equal(d.checks.bid, 101);
  assert.equal(bid.wasCalled(), true);
});

test('manage: add fails + bid ≤ opened_price (underwater) → SKIP', async () => {
  const bid = bidSpy(97); // ≤ avg 100
  const d = await gateDecision({ position: pos(), market: { ...MARKET, live_close: 99 }, config: CONFIG, fetchBid: bid });
  assert.equal(d.decision, 'SKIP');
  assert.equal(d.checks.bid, 97);
});

test('manage: twak bid unavailable → fail-open RUN', async () => {
  const d = await gateDecision({ position: pos(), market: { ...MARKET, live_close: 99 }, config: CONFIG, fetchBid: async () => null });
  assert.equal(d.decision, 'RUN');
});

test('manage: dv null → add not computable, still does TP check', async () => {
  const bid = bidSpy(95); // underwater
  const d = await gateDecision({ position: pos(), market: { ...MARKET, daily_vol_pct: null, live_close: 99 }, config: CONFIG, fetchBid: bid });
  assert.equal(d.decision, 'SKIP');
  assert.equal(d.checks.add_threshold, null);
  assert.equal(bid.wasCalled(), true);
});

test('manage: opened_price missing → fail-open RUN', async () => {
  const d = await gateDecision({ position: pos({ opened_price: null }), market: MARKET, config: CONFIG, fetchBid: bidSpy(0) });
  assert.equal(d.decision, 'RUN');
});
