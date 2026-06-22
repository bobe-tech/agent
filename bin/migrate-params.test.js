import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, query } from '../core/db.js';
import { withTx, setupTestDb } from '../tests/db.js';
import { migrateConfig, migrateParams } from './migrate-params.mjs';

setupTestDb();

// A realistic OLD-schema active config. Inserted directly (NOT via seedParams, whose DEFAULT_PARAMS_CONFIG
// is already the NEW schema and would merge new keys in, defeating the migration test).
const OLD = {
  strategy: 'nostop_dca', side_mode: 'long', sizes_usd: [20, 30, 50], max_adds: 2,
  tp_mult: 1.3, adx_lo: 16, adx_hi: 30, avg1_depth_mult_lo: 0.6667, avg1_depth_mult_hi: 1, avg2_depth_mult: 3,
  crsi_sell: 87, crsi_prev_max_age_min: 60, crsi_buy: 13,
  crsi_rsi_period: 3, crsi_streak_period: 2, crsi_rank_period: 100,
};
const OLD_KEYS = ['tp_mult', 'adx_lo', 'adx_hi', 'avg1_depth_mult_lo', 'avg1_depth_mult_hi',
  'avg2_depth_mult', 'crsi_sell', 'crsi_prev_max_age_min'];
const NEW_KEYS = ['adx_mult_threshold', 'adx_mult_lo', 'adx_mult_hi', 'avg2_atr_mult',
  'crsi_window_hours', 'high_window_hours'];
const PAIR = 'ZZZ/USDT'; // unlikely to collide with real pairs in the test DB

test('migrateConfig drops old keys, adds new defaults, keeps crsi_buy + sizes', () => {
  const old = {
    strategy: 'nostop_dca', side_mode: 'long', sizes_usd: [20, 30, 50], max_adds: 2,
    tp_mult: 1.3, adx_lo: 16, adx_hi: 30, avg1_depth_mult_lo: 0.6667, avg1_depth_mult_hi: 1,
    avg2_depth_mult: 3, crsi_sell: 87, crsi_prev_max_age_min: 60,
    crsi_buy: 13, crsi_rsi_period: 3, crsi_streak_period: 2, crsi_rank_period: 100,
  };
  const next = migrateConfig(old);
  for (const k of ['tp_mult', 'adx_lo', 'adx_hi', 'avg1_depth_mult_lo', 'avg1_depth_mult_hi',
                   'avg2_depth_mult', 'crsi_sell', 'crsi_prev_max_age_min']) {
    assert.ok(!(k in next), `old key ${k} should be dropped`);
  }
  assert.equal(next.adx_mult_threshold, 30);
  assert.equal(next.adx_mult_lo, 1);
  assert.equal(next.adx_mult_hi, 1.3);
  assert.equal(next.avg2_atr_mult, 3);
  assert.equal(next.crsi_window_hours, 3);
  assert.equal(next.high_window_hours, 24);
  assert.equal(next.crsi_buy, 13);            // kept
  assert.deepEqual(next.sizes_usd, [20, 30, 50]);
});

// migrateParams() selects WHERE is_active across ALL pairs, so each case runs inside withTx and seeds
// a controlled active row under a collision-unlikely pair; all assertions are scoped to that pair.
test('migrateParams rewrites the active config in place: old keys gone, new keys in, version unchanged', async () => {
  await withTx(async () => {
    const { rows: ins } = await query(
      `INSERT INTO params (pair, is_active, source, config) VALUES ($1, true, 'seed', $2::jsonb) RETURNING version`,
      [PAIR, JSON.stringify(OLD)]);
    const version = ins[0].version;

    await migrateParams();

    const { rows } = await query('SELECT version, is_active, config FROM params WHERE pair=$1 AND is_active', [PAIR]);
    assert.equal(rows.length, 1);
    const r = rows[0];
    const cfg = r.config;
    for (const k of OLD_KEYS) assert.ok(!(k in cfg), `old key ${k} should be dropped`);
    for (const k of NEW_KEYS) assert.ok(k in cfg, `new key ${k} should be present`);
    assert.equal(Number(cfg.crsi_buy), 13);              // preserved
    assert.deepEqual(cfg.sizes_usd, [20, 30, 50]);       // preserved
    assert.equal(r.version, version);                    // no version bump — in-place update
    assert.equal(r.is_active, true);                     // still active

    // Exactly one row for the pair — no new version was inserted.
    const { rows: cnt } = await query("SELECT count(*)::int AS n FROM params WHERE pair=$1", [PAIR]);
    assert.equal(cnt[0].n, 1);
  });
});

test('migrateParams is idempotent: a second run leaves the config and row count unchanged', async () => {
  await withTx(async () => {
    await query(
      `INSERT INTO params (pair, is_active, source, config) VALUES ($1, true, 'seed', $2::jsonb)`,
      [PAIR, JSON.stringify(OLD)]);

    await migrateParams();
    const { rows: first } = await query('SELECT config FROM params WHERE pair=$1 AND is_active', [PAIR]);

    await migrateParams(); // hasNew && !hasOld → skip path
    const { rows: second } = await query('SELECT config FROM params WHERE pair=$1 AND is_active', [PAIR]);
    assert.deepEqual(second[0].config, first[0].config);

    const { rows: cnt } = await query("SELECT count(*)::int AS n FROM params WHERE pair=$1", [PAIR]);
    assert.equal(cnt[0].n, 1);
  });
});

process.on('exit', () => { try { getPool().end(); } catch { /* already ended */ } });
