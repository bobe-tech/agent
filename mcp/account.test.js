import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, query, withTransaction, getPool } from '../core/db.js';
import { getParams, getState, openPosition, fillOrder, addToPosition, closePosition, cancelOrder } from './account.js';
import { BlockchainUnavailable } from '../core/blockchain.js';

// Helper factory: creates an injectable resolveFill with fixed amounts.
const fakeFill = (size, amount) => async () => ({ comp_size: size, comp_amount: amount });

createPool({ test: true });

// Helper: seed an active params version for a pair within the current transaction.
// Deactivates the pair's previous active rows before insert (to bypass params_one_active).
async function seedParams(pair, config = {}) {
  await query(`UPDATE params SET is_active=false WHERE pair=$1 AND is_active`, [pair]);
  const { rows } = await query(
    `INSERT INTO params (pair, is_active, config, source) VALUES ($1, true, $2::jsonb, 'seed') RETURNING version`,
    [pair, JSON.stringify({ sizes_usd: [20, 30, 50], max_adds: 2, side_mode: 'long', ...config })]);
  return rows[0].version;
}

test('getState returns active positions without daily_trade_done', async () => {
  await withTransaction(async () => {
    const v = await seedParams('ETH/USDT');
    await query(
      `INSERT INTO positions (pair, side, status, opened_size, opened_amount, opened_price, regime_at_entry, features_at_entry, params_version)
       VALUES ('ETH/USDT','LONG','active', 0.01, 20, 2000, 'UP_TREND', '{}'::jsonb, $1)`, [v]);
    const st = await getState('ETH/USDT', 'UP_TREND');
    assert.equal(st.open_positions.length, 1);
    assert.equal(st.open_positions[0].side, 'LONG');
    assert.ok(!('daily_trade_done' in st));
    assert.ok(Array.isArray(st.open_positions[0].orders));
  });
});

test('getParams returns the active params for a pair', async () => {
  await withTransaction(async () => {
    const v = await seedParams('BTC/USDT', { side_mode: 'both' });
    const p = await getParams('BTC/USDT');
    assert.equal(p.pair, 'BTC/USDT');
    assert.equal(p.version, v);
    assert.ok(p.is_active);
    assert.equal(p.config.side_mode, 'both');
  });
});

test('getParams throws when there are no active params', async () => {
  await withTransaction(async () => {
    await assert.rejects(
      () => getParams('UNKNOWN/PAIR'),
      /no active params/
    );
  });
});

test('openPosition rejects a leg amount above the limit max(sizes_usd)·2', async () => {
  await withTransaction(async () => {
    const v = await seedParams('ETH/USDT'); // sizes_usd=[20,30,50] → limit 100
    await assert.rejects(
      () => openPosition({
        pair: 'ETH/USDT', side: 'LONG', amount: 101, price: 2000,
        regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.3, params_version: v,
      }),
      /exceeds the limit 100/,
    );
    // at the limit (=100) — passes
    const ok = await openPosition({
      pair: 'ETH/USDT', side: 'LONG', amount: 100, price: 2000,
      regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.3, params_version: v,
    });
    assert.equal(ok.action, 'open');
  });
});

test('openPosition creates an active position + active open order; fillOrder recomputes aggregates', async () => {
  await withTransaction(async () => {
    const v = await seedParams('ETH/USDT');
    const order = await openPosition({
      pair: 'ETH/USDT', side: 'LONG', amount: 20, price: 2000,
      regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.3, params_version: v,
    });
    assert.equal(order.action, 'open');
    assert.equal(order.status, 'active');
    assert.equal(String(order.start_amount), '20.000000000000000000');
    assert.equal(String(order.start_size), '0.010000000000000000'); // 20/2000

    const { order: filled, position } = await fillOrder(
      { order_id: order.id, tx_id: 'tx-test-1' },
      { resolveFill: fakeFill('0.0099', '20') });
    assert.equal(filled.status, 'completed');
    assert.equal(position.status, 'active');
    assert.equal(String(position.opened_amount), '20.000000000000000000');
    assert.equal(String(position.opened_size), '0.009900000000000000');
  });
});

test('fillOrder close branch: reason from the order via COALESCE, realized_pnl > 0, position completed', async () => {
  await withTransaction(async () => {
    const v = await seedParams('SOL/USDT');
    // Open a position
    const openOrd = await openPosition({
      pair: 'SOL/USDT', side: 'LONG', amount: 20, price: 200,
      regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.5, params_version: v,
    });
    // Fill the open order: opened_size=0.1, opened_amount=20, opened_price=200
    await fillOrder(
      { order_id: openOrd.id, tx_id: 'tx-test-2' },
      { resolveFill: fakeFill('0.1', '20') });
    // Get the position_id
    const posRes = await query(
      `SELECT id, opened_size FROM positions WHERE pair='SOL/USDT' AND status='active' LIMIT 1`);
    const posId = posRes.rows[0].id;
    const openedSize = posRes.rows[0].opened_size;

    // Create a close order manually (reason='take_profit' in the order, not in fillOrder)
    const closeRes = await query(
      `INSERT INTO orders (position_id, pair, side, action, status, start_size, start_amount, start_price, params_version, reason)
       VALUES ($1,'SOL/USDT','LONG','close','active', $2, 22, 220, $3, 'take_profit') RETURNING id`,
      [posId, openedSize, v]);
    const closeId = closeRes.rows[0].id;

    // Fill the close order WITHOUT a.reason: comp_amount=22 > opened_amount=20 → PnL > 0
    const { order: closedOrd, position } = await fillOrder(
      { order_id: closeId, tx_id: 'tx-test-3' },
      { resolveFill: fakeFill('0.1', '22') });
    assert.equal(closedOrd.status, 'completed');
    assert.equal(position.status, 'completed');
    // reason should come from the order via COALESCE
    assert.equal(position.reason, 'take_profit');
    assert.ok(Number(position.realized_pnl_usd) > 0, `expected PnL>0, got ${position.realized_pnl_usd}`);
  });
});

test('fillOrder close branch: partial close (closed_size ≠ opened_size) → PnL by cost-basis on the sold fraction', async () => {
  await withTransaction(async () => {
    const v = await seedParams('SOL/USDT');
    const openOrd = await openPosition({
      pair: 'SOL/USDT', side: 'LONG', amount: 20, price: 200,
      regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.5, params_version: v,
    });
    await fillOrder(
      { order_id: openOrd.id, tx_id: 'tx-test-4' },
      { resolveFill: fakeFill('0.1', '20') }); // opened_size=0.1, opened_amount=20
    const posRes = await query(
      `SELECT id FROM positions WHERE pair='SOL/USDT' AND status='active' LIMIT 1`);
    const posId = posRes.rows[0].id;
    const closeRes = await query(
      `INSERT INTO orders (position_id, pair, side, action, status, start_size, start_amount, start_price, params_version, reason)
       VALUES ($1,'SOL/USDT','LONG','close','active', 0.1, 22, 220, $2, 'take_profit') RETURNING id`,
      [posId, v]);
    // Fill the close on half the base (comp_size=0.05 of 0.1) for 11 USDT. Cost basis of the sold fraction =
    // 20·(0.05/0.1)=10 → realized_usd = 11−10 = +1; realized_pct = 1/10·100 = 10%.
    const { position } = await fillOrder(
      { order_id: closeRes.rows[0].id, tx_id: 'tx-test-5' },
      { resolveFill: fakeFill('0.05', '11') });
    assert.equal(position.status, 'completed');           // the close was NOT rejected
    assert.equal(Number(position.realized_pnl_usd), 1);   // cost-basis: proceeds − cost of the sold fraction
    assert.equal(Number(position.realized_pnl_pct), 10);
  });
});

test('closePosition always rejects closing at a loss; allows closing in profit', async () => {
  await withTransaction(async () => {
    const v = await seedParams('ETH/USDT');
    const o = await openPosition({ pair: 'ETH/USDT', side: 'LONG', amount: 20, price: 2000,
      regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.3, params_version: v });
    await fillOrder(
      { order_id: o.id, tx_id: 'tx-test-6' },
      { resolveFill: fakeFill('0.01', '20') }); // opened_price=2000
    // price below the average → net<0 → reject (no bypass exists)
    await assert.rejects(() => closePosition({ pair: 'ETH/USDT', position_id: o.position_id, price: 1900, reason: 'tp' }), /loss|net/i);
    // price above the average → ok, a close order is created
    const close = await closePosition({ pair: 'ETH/USDT', position_id: o.position_id, price: 2100, reason: 'tp' });
    assert.equal(close.action, 'close');
    assert.equal(String(close.start_size), '0.010000000000000000'); // the entire base
  });
});

test('cancelOrder cancels an open order and cascades to cancel the position with no fills', async () => {
  await withTransaction(async () => {
    const v = await seedParams('ETH/USDT');
    const o = await openPosition({ pair: 'ETH/USDT', side: 'LONG', amount: 20, price: 2000,
      regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.3, params_version: v });
    const { order } = await cancelOrder({ order_id: o.id, reason: 'swap failed' });
    assert.equal(order.status, 'cancelled');
    const { rows } = await query('SELECT status FROM positions WHERE id=$1', [o.position_id]);
    assert.equal(rows[0].status, 'cancelled');
  });
});

test('addToPosition: friendly error on an unfinished active order (orders_one_active_per_position)', async () => {
  await withTransaction(async () => {
    const v = await seedParams('ETH/USDT');
    // open order created but NOT filled (hanging active) — reconciliation did not run
    const openOrd = await openPosition({
      pair: 'ETH/USDT', side: 'LONG', amount: 20, price: 2000,
      regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.3, params_version: v,
    });
    // Attempt to add on with a hanging active open order → friendly error, not a raw 23505
    await assert.rejects(
      () => addToPosition({ pair: 'ETH/USDT', position_id: openOrd.position_id, amount: 30, price: 1900 }),
      /unfinished \(active\) order|fill_order or cancel_order/i);
  });
});

test('addToPosition: blocks exceeding max_adds (seedParams gives max_adds=2)', async () => {
  await withTransaction(async () => {
    const v = await seedParams('ETH/USDT'); // max_adds=2
    // Open a position
    const openOrd = await openPosition({
      pair: 'ETH/USDT', side: 'LONG', amount: 20, price: 2000,
      regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.3, params_version: v,
    });
    // Fill the open order → 1 completed (open)
    await fillOrder(
      { order_id: openOrd.id, tx_id: 'tx-test-7' },
      { resolveFill: fakeFill('0.01', '20') });

    const posId = openOrd.position_id;

    // add #1
    const add1 = await addToPosition({ pair: 'ETH/USDT', position_id: posId, amount: 30, price: 1900 });
    await fillOrder(
      { order_id: add1.id, tx_id: 'tx-test-8' },
      { resolveFill: fakeFill('0.01578947', '30') });

    // add #2
    const add2 = await addToPosition({ pair: 'ETH/USDT', position_id: posId, amount: 50, price: 1800 });
    await fillOrder(
      { order_id: add2.id, tx_id: 'tx-test-9' },
      { resolveFill: fakeFill('0.02777778', '50') });

    // now 3 completed (open + add + add) → the next add should fail
    await assert.rejects(
      () => addToPosition({ pair: 'ETH/USDT', position_id: posId, amount: 50, price: 1700 }),
      /max_adds/
    );
  });
});

test('getState: each position contains nested orders; the agent computes adds_count itself', async () => {
  await withTransaction(async () => {
    const v = await seedParams('ETH/USDT');
    // Open a position
    const openOrd = await openPosition({
      pair: 'ETH/USDT', side: 'LONG', amount: 20, price: 2000,
      regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.3, params_version: v,
    });

    // Before fill: the open order is active → orders=[{status:'active'}], agent adds_count = -1
    const st0 = await getState('ETH/USDT', 'UP_TREND');
    assert.ok(Array.isArray(st0.open_positions[0].orders), 'orders should be an array');
    assert.equal(st0.open_positions[0].orders.length, 1);
    assert.equal(st0.open_positions[0].orders[0].status, 'active');
    // check that there is no adds_count field at the position level (the agent computes it itself)
    assert.ok(!('adds_count' in st0.open_positions[0]), 'adds_count should not be a position field');
    // agent-computed adds_count = completed open+add - 1 = 0 - 1 = -1
    const addsCount0 = st0.open_positions[0].orders.filter(
      (o) => ['open', 'add'].includes(o.action) && o.status === 'completed').length - 1;
    assert.equal(addsCount0, -1);
    // check that there is no active_orders at the top level
    assert.ok(!('active_orders' in st0), 'active_orders should not be at the top level');

    // Fill the open order → orders=[{status:'completed'}], agent adds_count = 0
    await fillOrder(
      { order_id: openOrd.id, tx_id: 'tx-test-10' },
      { resolveFill: fakeFill('0.01', '20') });
    const st1 = await getState('ETH/USDT', 'UP_TREND');
    assert.equal(st1.open_positions[0].orders.length, 1);
    assert.equal(st1.open_positions[0].orders[0].status, 'completed');
    // money in orders as strings
    assert.equal(typeof st1.open_positions[0].orders[0].comp_amount, 'string',
      'comp_amount should be a string');
    const addsCount1 = st1.open_positions[0].orders.filter(
      (o) => ['open', 'add'].includes(o.action) && o.status === 'completed').length - 1;
    assert.equal(addsCount1, 0);

    // Add an add order and fill it → orders=2 elements, agent adds_count = 1
    const addOrd = await addToPosition({ pair: 'ETH/USDT', position_id: openOrd.position_id, amount: 30, price: 1900 });
    await fillOrder(
      { order_id: addOrd.id, tx_id: 'tx-test-11' },
      { resolveFill: fakeFill('0.015789', '30') });
    const st2 = await getState('ETH/USDT', 'UP_TREND');
    assert.equal(st2.open_positions[0].orders.length, 2);
    const addsCount2 = st2.open_positions[0].orders.filter(
      (o) => ['open', 'add'].includes(o.action) && o.status === 'completed').length - 1;
    assert.equal(addsCount2, 1);
  });
});

test('openPosition: a second active LONG for the same pair → friendly error (one_active_per_side)', async () => {
  await withTransaction(async () => {
    const v = await seedParams('ETH/USDT');
    const base = {
      pair: 'ETH/USDT', side: 'LONG', price: 2000,
      regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.3, params_version: v,
    };
    await openPosition({ ...base, amount: 20 });
    // A second active LONG violates the unique index positions_one_active_per_side — we expect clear
    // text, not a raw driver code 23505.
    await assert.rejects(
      () => openPosition({ ...base, amount: 30 }),
      /there is already an open LONG position for ETH\/USDT/,
    );
  });
});

test('fillOrder: on BlockchainUnavailable the position → error, the order stays active, the alert is called', async () => {
  await withTransaction(async () => {
    const v = await seedParams('ETH/USDT');
    const order = await openPosition({
      pair: 'ETH/USDT', side: 'LONG', amount: 20, price: 2000,
      regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.3, params_version: v });
    let alerted = null;
    const failFill = async () => { throw new BlockchainUnavailable('receipt unavailable'); };
    await assert.rejects(
      () => fillOrder({ order_id: order.id, tx_id: 'tx-fail' },
        { resolveFill: failFill, sendAlert: async (t) => { alerted = t; } }),
      /marked error/);
    const { rows: pos } = await query('SELECT * FROM positions WHERE id=$1', [order.position_id]);
    assert.equal(pos[0].error, true);
    assert.equal(pos[0].status, 'active');
    const { rows: o } = await query('SELECT status FROM orders WHERE id=$1', [order.id]);
    assert.equal(o[0].status, 'active');
    assert.match(alerted, /ERROR/);
  });
});

test('fillOrder: a repeated fill with the same tx_id is rejected (UNIQUE tx_id — double-counting protection)', async () => {
  await withTransaction(async () => {
    const v = await seedParams('ETH/USDT');
    const fake = (size, amount) => async () => ({ comp_size: size, comp_amount: amount });
    const openOrd = await openPosition({
      pair: 'ETH/USDT', side: 'LONG', amount: 20, price: 2000,
      regime_at_entry: 'UP_TREND', features_at_entry: {}, expected_move_pct: 1.3, params_version: v });
    await fillOrder({ order_id: openOrd.id, tx_id: 'tx-dup' }, { resolveFill: fake('0.01', '20') });
    // A second order of the same position with the SAME tx_id → UNIQUE(tx_id) conflict → rejection.
    const add1 = await addToPosition({ pair: 'ETH/USDT', position_id: openOrd.position_id, amount: 30, price: 1900 });
    await assert.rejects(
      () => fillOrder({ order_id: add1.id, tx_id: 'tx-dup' }, { resolveFill: fake('0.015', '30') }),
      /double-counting/);
  });
});

// Close the pool after all tests
process.on('exit', () => { try { getPool().end(); } catch { /* already ended */ } });
