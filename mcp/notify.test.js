import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, buildReflectionMessage, shouldNotifyTick, buildErrorAlert } from './notify.js';

test('buildErrorAlert: contains the environment, pair, order, tx and reason', () => {
  const s = buildErrorAlert({ env: 'production', pair: 'BTCB/USDT', position_id: 1001,
    order_id: 1001, tx_id: '0xabc', reason: 'receipt unavailable' });
  assert.match(s, /production/);
  assert.match(s, /BTCB\/USDT/);
  assert.match(s, /1001/);
  assert.match(s, /0xabc/);
  assert.match(s, /receipt unavailable/);
});

test('shouldNotifyTick: HOLD with no closes — do NOT send', () => {
  assert.equal(shouldNotifyTick({ tick: { action: 'HOLD' }, closed: [] }), false);
});

test('shouldNotifyTick: actions (open/add/close) — send', () => {
  for (const action of ['OPEN_LONG', 'OPEN_SHORT', 'ADD', 'CLOSE']) {
    assert.equal(shouldNotifyTick({ tick: { action }, closed: [] }), true, `${action} should be sent`);
  }
});

test('shouldNotifyTick: HOLD, but something closed within the window — send', () => {
  assert.equal(shouldNotifyTick({ tick: { action: 'HOLD' }, closed: [{ id: 1 }] }), true);
});

test('shouldNotifyTick: tick not recorded (agent failure) — send', () => {
  assert.equal(shouldNotifyTick({ tick: undefined, closed: [] }), true);
});

test('buildMessage HOLD: action, reason, features, no positions', () => {
  const t = buildMessage({
    tick: { action: 'HOLD', regime: 'DOWN_TREND', close: 2604, atr_pct: 0.83, adx: 24, reason: 'Weak fluctuations.' },
    positions: [], closed: [], pair: 'ETH/USDT',
  });
  assert.ok(t.includes('ETH/USDT'));
  assert.ok(t.includes('Decided to wait'));
  assert.ok(t.includes('Weak fluctuations.'));
  assert.ok(t.includes('downtrend'));          // regime → English label
  assert.ok(t.includes('No open positions'));
});

test('buildMessage CLOSE: result + exit reason (text)', () => {
  const t = buildMessage({
    tick: { action: 'CLOSE', regime: 'UP_TREND', close: 2640 },
    positions: [],
    closed: [{ realized_pnl_pct: 2.09, realized_pnl_usd: 10.45, reason: 'trailing stop hit the target' }],
    pair: 'ETH/USDT',
  });
  assert.ok(t.includes('+2.09%'));
  assert.ok(!t.includes('R='));               // r_multiple removed
  assert.ok(t.includes('trailing stop hit the target'));
});

test('buildMessage open position: average / unrealized PnL', () => {
  const t = buildMessage({
    tick: { action: 'HOLD', close: 2600 },
    positions: [{ side: 'LONG', opened_amount: 500, opened_price: 2550 }],
    closed: [], pair: 'ETH/USDT',
  });
  assert.ok(t.includes('Open LONG'));
  assert.ok(t.includes('2550'));               // average
  assert.ok(t.includes('+1.96%'));             // (2600-2550)/2550*100
  assert.ok(!t.includes('bars held'));         // bars_held removed
});

test('buildMessage position with no fills (opened_price null): does not crash, no PnL line', () => {
  const t = buildMessage({
    tick: { action: 'HOLD', close: 2600 },
    positions: [{ side: 'LONG', opened_amount: 0, opened_price: null }],
    closed: [], pair: 'ETH/USDT',
  });
  assert.ok(t.includes('Open LONG'));
  assert.ok(!t.includes('Infinity'));          // guard in unrealizedPct: avg=0 → return null
  assert.ok(!t.includes('NaN'));
  assert.ok(!t.includes('unrealized PnL'));
});

test('buildReflectionMessage: agent summary + proposed inactive versions', () => {
  const t = buildReflectionMessage({
    summary: 'CAKE: 0 closed, 1 open (−2.6%). ADX dipping below 20 — take a look at adx_lo.',
    proposals: [{ version: 8, reason: 'tp_mult 1.3→1.1: takes are not reached' }],
    pair: 'ETH/USDT',
  });
  assert.ok(t.includes('self-learning'));
  assert.ok(t.includes('ADX dipping'));           // the agent's analysis is shown
  assert.ok(t.includes('v8') && t.includes('tp_mult')); // proposal
});

test('buildMessage without a tick: a warning instead of "undefined"', () => {
  const t = buildMessage({ tick: undefined, positions: [], closed: [], pair: 'ETH/USDT' });
  assert.ok(t.includes('Tick not recorded'));
  assert.ok(!t.includes('undefined'));
  assert.ok(t.includes('No open positions'));
});

test('buildMessage SHORT position: unrealized PnL by (opened_price-mark)/opened_price', () => {
  const t = buildMessage({
    tick: { action: 'HOLD', close: 2500 },
    positions: [{ side: 'SHORT', opened_amount: 500, opened_price: 2600 }],
    closed: [], pair: 'ETH/USDT',
  });
  assert.ok(t.includes('Open SHORT'));
  assert.ok(t.includes('+3.85%'));             // (2600-2500)/2600*100 = 3.846
});

test('buildMessage LONG: PnL from live bid (gross without deducting rt)', () => {
  const t = buildMessage({
    tick: { action: 'HOLD', close: 100, live_bid: 105, live_ask: 106 },
    positions: [{ side: 'LONG', opened_amount: 20, opened_price: 100 }],
    closed: [], pair: 'X/USDT',
  });
  assert.ok(t.includes('+5.00%'));             // (105-100)/100 = 5.00 (bid, without deducting rt)
});

test('buildMessage SHORT: PnL from live ask (gross without deducting rt)', () => {
  const t = buildMessage({
    tick: { action: 'HOLD', close: 100, live_bid: 94, live_ask: 95 },
    positions: [{ side: 'SHORT', opened_amount: 20, opened_price: 100 }],
    closed: [], pair: 'X/USDT',
  });
  assert.ok(t.includes('+5.00%'));             // (100-95)/100 = 5.00 (ask, without deducting rt)
});

test('buildMessage CLOSE with a loss: 📉 and a negative sign', () => {
  const t = buildMessage({
    tick: { action: 'CLOSE', close: 2500 },
    positions: [],
    closed: [{ realized_pnl_pct: -3.4, realized_pnl_usd: -17, reason: 'level invalidation' }],
    pair: 'ETH/USDT',
  });
  assert.ok(t.includes('📉'));
  assert.ok(t.includes('-3.40%'));
  assert.ok(t.includes('level invalidation'));
});

test('buildMessage CLOSE: force_closed flag', () => {
  const t = buildMessage({
    tick: { action: 'CLOSE', close: 2500 },
    positions: [],
    closed: [{ realized_pnl_pct: -1.2, realized_pnl_usd: -6,
               reason: 'take-profit', force_closed: true }],
    pair: 'ETH/USDT',
  });
  assert.ok(t.includes('forced close'));                // force_closed
  assert.ok(!t.includes('mandatory daily trade'));      // daily_forced removed
});

test('buildMessage a regular trade with no flags: no special markers', () => {
  const t = buildMessage({
    tick: { action: 'CLOSE', close: 2640 },
    positions: [{ side: 'LONG', opened_amount: 20, opened_price: 2550 }],
    closed: [{ realized_pnl_pct: 2.0, realized_pnl_usd: 10, reason: 'take-profit' }],
    pair: 'ETH/USDT',
  });
  assert.ok(!t.includes('forced close'));
  assert.ok(!t.includes('mandatory daily trade'));
});

test('buildReflectionMessage without a summary: an explicit "no summary"', () => {
  const t = buildReflectionMessage({ pair: 'ETH/USDT' });
  assert.ok(t.includes('self-learning') && t.includes('left no summary'));
});

test('buildMessage: HTML entities in reason are decoded (Telegram plain)', () => {
  const t = buildMessage({
    tick: { action: 'HOLD', reason: 'close &lt; sma20, F&amp;G=14, &quot;risk-off&quot;' },
    positions: [], closed: [], pair: 'ETH/USDT',
  });
  assert.ok(t.includes('close < sma20'));
  assert.ok(t.includes('F&G=14'));
  assert.ok(t.includes('"risk-off"'));
  assert.ok(!t.includes('&lt;') && !t.includes('&amp;'));
});

test('buildMessage: opened_amount and opened_price are shown in the position', () => {
  const t = buildMessage({
    tick: { action: 'HOLD', close: 3000 },
    positions: [{ side: 'LONG', opened_amount: 250, opened_price: 2950 }],
    closed: [], pair: 'ETH/USDT',
  });
  assert.ok(t.includes('250'));       // opened_amount
  assert.ok(t.includes('2950'));      // opened_price
});
