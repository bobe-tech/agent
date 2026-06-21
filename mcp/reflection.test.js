// Reflection tools: reading the journal (trades/ticks/missed-moves/history) + writing memory
// (lessons/regime_stats/params). All on the test DB in a transaction with ROLLBACK; data via factories.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { query, getPool } from '../core/db.js';
import { withTx, setupTestDb } from '../tests/db.js';
import { seedParams, seedPosition, seedOrder, seedTick } from '../tests/factories.js';
import {
  getTrades, getTicks, getMissedMoves, getParamsHistory,
  upsertRegimeStats, upsertLesson, deactivateLesson,
  proposeParams, activateParams, rollbackParams, recordParamsPerf, logReflection,
} from './reflection.js';

setupTestDb();

// --- Reading the journal ---

test('getTrades returns completed positions of the window with a nested orders array', async () => {
  await withTx(async () => {
    const pos = await seedPosition({ pair: 'ETH/USDT', status: 'completed' });
    await seedOrder({ position_id: pos.id, pair: 'ETH/USDT', action: 'open' });
    const trades = await getTrades('ETH/USDT', '2000-01-01', '2100-01-01', 'completed');
    const trade = trades.find((t) => String(t.id) === String(pos.id));
    assert.ok(trade, 'the position should fall within the window');
    assert.equal(trade.orders.length, 1);
    assert.equal(trade.orders[0].action, 'open');
  });
});

test('getTrades excludes positions outside the time window', async () => {
  await withTx(async () => {
    await seedPosition({ pair: 'ETH/USDT', status: 'completed' }); // status_at = now()
    // The window is entirely in the past → the current position does not fall in.
    const trades = await getTrades('ETH/USDT', '2000-01-01', '2000-02-01', 'completed');
    assert.equal(trades.length, 0);
  });
});

test('getTicks returns the window ticks ascending by ts, excluding adjacent windows', async () => {
  await withTx(async () => {
    await seedTick({ pair: 'ETH/USDT', ts: '2024-03-01T01:00:00Z', action: 'HOLD' });
    await seedTick({ pair: 'ETH/USDT', ts: '2024-03-01T03:00:00Z', action: 'OPEN_LONG' });
    await seedTick({ pair: 'ETH/USDT', ts: '2024-02-01T00:00:00Z', action: 'HOLD' }); // outside the window
    const ticks = await getTicks('ETH/USDT', '2024-03-01T00:00:00Z', '2024-03-02T00:00:00Z');
    assert.equal(ticks.length, 2);
    assert.ok(new Date(ticks[0].ts) < new Date(ticks[1].ts), 'ascending by ts');
    assert.equal(ticks[1].action, 'OPEN_LONG');
  });
});

// --- getMissedMoves: the most complex SQL (analysis of missed entries) ---

test('getMissedMoves: HOLD in an up-structure with a real move ≥ threshold → missed_up, adx_lo block', async () => {
  await withTx(async () => {
    await seedParams('ETH/USDT', { config: { adx_lo: 20 } });
    // HOLD in a rising structure (close>sma20>sma50), but ADX below the threshold → entry blocked by adx_lo.
    await seedTick({
      pair: 'ETH/USDT', ts: '2024-03-01T00:00:00Z', action: 'HOLD',
      close: 100, sma20: 99, sma50: 98, adx: 15,
    });
    // The "future" price 5h later (in the window [4h,12h)): +5% → move ≥ the 3% threshold.
    await seedTick({
      pair: 'ETH/USDT', ts: '2024-03-01T05:00:00Z', action: 'HOLD',
      close: 105, sma20: null, sma50: null, adx: null, // sma null → does not enter the holds CTE
    });
    const r = await getMissedMoves('ETH/USDT', '2024-03-01T00:00:00Z', '2024-03-01T01:00:00Z',
      { horizon_hours: 4, move_threshold_pct: 3 });
    assert.equal(r.trend_structured, 1);
    assert.equal(r.missed_moves, 1);
    assert.equal(r.missed_up, 1);
    assert.equal(r.gate_blocks.adx_lo, 1);
    assert.equal(r.examples.length, 1);
    assert.equal(r.examples[0].structure, 'up');
    assert.deepEqual(r.examples[0].blocked_by, ['adx_lo']);
  });
});

test('getMissedMoves: move below the threshold → structure exists, but not a miss', async () => {
  await withTx(async () => {
    await seedParams('ETH/USDT', { config: { adx_lo: 20 } });
    await seedTick({ pair: 'ETH/USDT', ts: '2024-03-01T00:00:00Z', action: 'HOLD', close: 100, sma20: 99, sma50: 98, adx: 25 });
    await seedTick({ pair: 'ETH/USDT', ts: '2024-03-01T05:00:00Z', action: 'HOLD', close: 101, sma20: null, sma50: null });
    const r = await getMissedMoves('ETH/USDT', '2024-03-01T00:00:00Z', '2024-03-01T01:00:00Z',
      { horizon_hours: 4, move_threshold_pct: 3 });
    assert.equal(r.trend_structured, 1);
    assert.equal(r.missed_moves, 0, 'move +1% < the 3% threshold');
    assert.equal(r.gate_blocks.adx_lo, 0, 'adx=25 ≥ adx_lo=20 — not a block');
  });
});

test('getMissedMoves: a HOLD without a trending structure does not count as a miss', async () => {
  await withTx(async () => {
    await seedParams('ETH/USDT', { config: { adx_lo: 20 } });
    // close>sma20, but sma20<sma50 — neither an up-structure (needs sma20>sma50) nor a down-structure (needs close<sma20).
    await seedTick({ pair: 'ETH/USDT', ts: '2024-03-01T00:00:00Z', action: 'HOLD', close: 100, sma20: 99, sma50: 102, adx: 10 });
    await seedTick({ pair: 'ETH/USDT', ts: '2024-03-01T05:00:00Z', action: 'HOLD', close: 110, sma20: null, sma50: null });
    const r = await getMissedMoves('ETH/USDT', '2024-03-01T00:00:00Z', '2024-03-01T01:00:00Z');
    assert.equal(r.total_holds, 1);
    assert.equal(r.trend_structured, 0);
    assert.equal(r.missed_moves, 0);
  });
});

test('getMissedMoves: no "future" tick in the window → skip (edge of the window)', async () => {
  await withTx(async () => {
    await seedParams('ETH/USDT', { config: { adx_lo: 20 } });
    await seedTick({ pair: 'ETH/USDT', ts: '2024-03-01T00:00:00Z', action: 'HOLD', close: 100, sma20: 99, sma50: 98, adx: 15 });
    // There is no future tick at all.
    const r = await getMissedMoves('ETH/USDT', '2024-03-01T00:00:00Z', '2024-03-01T01:00:00Z');
    assert.equal(r.total_holds, 1);
    assert.equal(r.trend_structured, 0, 'future_close=null → the row is skipped before counting the structure');
    assert.equal(r.missed_moves, 0);
  });
});

// --- Params history ---

test('getParamsHistory: the active version + the history with attached perf', async () => {
  await withTx(async () => {
    const v1 = await seedParams('ETH/USDT');
    await recordParamsPerf(v1, { from: '2024-01-01', to: '2024-01-08' }, { n_trades: 5, avg_r: 1.2, max_drawdown_pct: 3.4 });
    const h = await getParamsHistory('ETH/USDT');
    assert.equal(h.active.version, v1);
    const row = h.history.find((p) => p.version === v1);
    assert.equal(row.perf.length, 1);
    assert.equal(Number(row.perf[0].n_trades), 5);
  });
});

// --- Writing memory ---

test('upsertRegimeStats: insert and update on conflict (pair,regime)', async () => {
  await withTx(async () => {
    await upsertRegimeStats('ETH/USDT', 'UP_TREND', { n_trades: 3, win_rate: 0.66, avg_r: 1.1 });
    await upsertRegimeStats('ETH/USDT', 'UP_TREND', { n_trades: 7, win_rate: 0.71 });
    const { rows } = await query('SELECT * FROM regime_stats WHERE pair=$1 AND regime=$2', ['ETH/USDT', 'UP_TREND']);
    assert.equal(rows.length, 1, 'one row — updated, not duplicated');
    assert.equal(rows[0].n_trades, 7);
    assert.equal(Number(rows[0].win_rate), 0.71);
  });
});

test('upsertLesson creates a lesson, deactivateLesson deactivates it', async () => {
  await withTx(async () => {
    const { id } = await upsertLesson('ETH/USDT', { regime: 'DOWN_TREND', text: 'do not long in a downtrend', confidence: 0.8 });
    let { rows } = await query('SELECT * FROM lessons WHERE id=$1', [id]);
    assert.equal(rows[0].active, true);
    assert.equal(rows[0].text, 'do not long in a downtrend');
    await deactivateLesson(id);
    ({ rows } = await query('SELECT active FROM lessons WHERE id=$1', [id]));
    assert.equal(rows[0].active, false);
  });
});

// --- Params versioning ---

test('proposeParams(auto_apply=false): the new version is inactive, the old is active, config is merged', async () => {
  await withTx(async () => {
    const v = await seedParams('BTC/USDT', { config: { tp_mult: 1.3 } });
    const r = await proposeParams('BTC/USDT', { changes: { config: { tp_mult: 1.6 } }, reason: 'test', auto_apply: false });
    assert.ok(r.version > v);
    const { rows } = await query('SELECT version, is_active, config, parent_version FROM params WHERE pair=$1 ORDER BY version', ['BTC/USDT']);
    const neu = rows.find((x) => x.version === r.version);
    assert.equal(neu.is_active, false);
    assert.equal(neu.config.tp_mult, 1.6, 'override applied');
    assert.equal(neu.config.side_mode, 'long', 'the rest of the config inherited (shallow-merge)');
    assert.equal(rows.find((x) => x.version === v).is_active, true);
    assert.equal(neu.parent_version, v, 'parent_version = the base active one');
  });
});

test('proposeParams(auto_apply=true): the new one is active, the old one is deactivated', async () => {
  await withTx(async () => {
    await seedParams('SOL/USDT', { config: { adx_lo: 18 } });
    const r = await proposeParams('SOL/USDT', { changes: { config: { adx_lo: 22 } }, reason: 'higher ADX', auto_apply: true });
    const { rows } = await query('SELECT version, is_active, config FROM params WHERE pair=$1', ['SOL/USDT']);
    const active = rows.filter((x) => x.is_active);
    assert.equal(active.length, 1);
    assert.equal(active[0].version, r.version);
    assert.equal(active[0].config.adx_lo, 22);
  });
});

test('proposeParams from parent_version takes the specified version as the base, not the active one', async () => {
  await withTx(async () => {
    const v1 = await seedParams('ETH/USDT', { config: { tp_mult: 1.3 } });
    const r2 = await proposeParams('ETH/USDT', { changes: { config: { tp_mult: 2.0 } }, reason: 'v2', auto_apply: true });
    // Base = v1 (parent), even though r2 is active now. We change max_adds, tp_mult should come from v1 (1.3).
    const r3 = await proposeParams('ETH/USDT', { changes: { config: { max_adds: 5 } }, reason: 'from v1', auto_apply: false, parent_version: v1 });
    const { rows } = await query('SELECT version, config, parent_version FROM params WHERE pair=$1', ['ETH/USDT']);
    const v3 = rows.find((x) => x.version === r3.version);
    assert.equal(v3.config.tp_mult, 1.3, 'tp_mult from parent v1, not from the active v2(2.0)');
    assert.equal(v3.config.max_adds, 5);
    assert.equal(v3.parent_version, v1);
  });
});

test('activateParams switches the active version; a nonexistent one → error', async () => {
  await withTx(async () => {
    const v1 = await seedParams('ETH/USDT');
    const r2 = await proposeParams('ETH/USDT', { changes: { config: { tp_mult: 1.1 } }, reason: 'v2', auto_apply: false });
    await activateParams('ETH/USDT', r2.version);
    const { rows } = await query('SELECT version, is_active FROM params WHERE pair=$1', ['ETH/USDT']);
    assert.equal(rows.find((x) => x.version === r2.version).is_active, true);
    assert.equal(rows.find((x) => x.version === v1).is_active, false);
    await assert.rejects(() => activateParams('ETH/USDT', 999999), /not found/);
  });
});

test('rollbackParams creates a new copy version with source=rollback and activates it', async () => {
  await withTx(async () => {
    const v1 = await seedParams('ETH/USDT', { config: { tp_mult: 1.3 } });
    const r2 = await proposeParams('ETH/USDT', { changes: { config: { tp_mult: 2.5 } }, reason: 'v2', auto_apply: true });
    const rb = await rollbackParams('ETH/USDT', v1, 'rollback to conservative');
    assert.ok(rb.version > r2.version, 'rollback = a NEW version, not reactivating the old one');
    const { rows } = await query('SELECT * FROM params WHERE pair=$1', ['ETH/USDT']);
    const copy = rows.find((x) => x.version === rb.version);
    assert.equal(copy.is_active, true);
    assert.equal(copy.source, 'rollback');
    assert.equal(copy.parent_version, v1);
    assert.equal(copy.config.tp_mult, 1.3, 'config copied from v1');
    assert.equal(rows.filter((x) => x.is_active).length, 1, 'exactly one active');
  });
});

test('rollbackParams to a nonexistent version → error', async () => {
  await withTx(async () => {
    await seedParams('ETH/USDT');
    await assert.rejects(() => rollbackParams('ETH/USDT', 999999, 'no such one'), /not found/);
  });
});

test('logReflection writes a row to reflection_log', async () => {
  await withTx(async () => {
    const r = await logReflection('ETH/USDT', { summary: 'weekly summary', payload: { proposals: 2 } });
    assert.ok(r.ok && r.id);
    const { rows } = await query('SELECT * FROM reflection_log WHERE id=$1', [r.id]);
    assert.equal(rows[0].summary, 'weekly summary');
    assert.equal(rows[0].payload.proposals, 2);
  });
});

test('recordParamsPerf writes a version performance window', async () => {
  await withTx(async () => {
    const v = await seedParams('ETH/USDT');
    await recordParamsPerf(v, { from: '2024-01-01', to: '2024-01-08' }, { n_trades: 9, avg_r: 0.7, max_drawdown_pct: 5.1 });
    const { rows } = await query('SELECT * FROM params_perf WHERE params_version=$1', [v]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].n_trades, 9);
    assert.equal(Number(rows[0].max_drawdown_pct), 5.1);
  });
});

process.on('exit', () => { try { getPool().end(); } catch { /* already ended */ } });
