import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, query } from '../core/db.js';
import { withTx, setupTestDb } from '../tests/db.js';
import { seedParams } from '../tests/factories.js';
import { setCrsiBuy } from './set-crsi-buy.mjs';

setupTestDb();

test('setCrsiBuy updates crsi_buy in place on the active version, keeping other keys', async () => {
  await withTx(async () => {
    await seedParams('ETH/USDT', { config: { crsi_buy: 5 } });
    await setCrsiBuy({ 'ETH/USDT': 19.7 });
    const { rows } = await query('SELECT config FROM params WHERE pair=$1 AND is_active', ['ETH/USDT']);
    const cfg = rows[0].config;
    assert.equal(Number(cfg.crsi_buy), 19.7);
    // The merge must touch only crsi_buy — a default key (from DEFAULT_PARAMS_CONFIG) stays intact.
    assert.deepEqual(cfg.sizes_usd, [20, 30, 50]);
  });
});

test('setCrsiBuy on a pair with no active version does not throw and updates nothing', async () => {
  await withTx(async () => {
    await setCrsiBuy({ 'NOPE/USDT': 10 });
    const { rowCount } = await query('SELECT 1 FROM params WHERE pair=$1', ['NOPE/USDT']);
    assert.equal(rowCount, 0);
  });
});

process.on('exit', () => { try { getPool().end(); } catch { /* already ended */ } });
