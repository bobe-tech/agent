import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from '../core/db.js';
import { withTx, setupTestDb } from '../tests/db.js';
import { seedParams } from '../tests/factories.js';
import { logTick } from './account.js';
import { getTicks } from './reflection.js';

setupTestDb();

test('logTick persists the new strategy columns', async () => {
  await withTx(async () => {
    const v = await seedParams('ETH/USDT');
    await logTick('ETH/USDT', {
      regime: 'DOWN_TREND', action: 'HOLD', params_version: v,
      features: { close: 2000, live_close: 1980, high_24h: 2050, atr_pct: 1.2,
                  daily_vol_pct: 3.1, adx: 35, adx_mult: 1.3, crsi: 12, crsi_min_3h: 9, fng: 40, btc_dom: 55 },
    });
    const rows = await getTicks('ETH/USDT', '2000-01-01', '2999-01-01');
    const r = rows.at(-1);
    assert.equal(Number(r.live_close), 1980);
    assert.equal(Number(r.high_24h), 2050);
    assert.equal(Number(r.daily_vol_pct), 3.1);
    assert.equal(Number(r.adx_mult), 1.3);
    assert.equal(Number(r.crsi_min_3h), 9);
  });
});

process.on('exit', () => { try { getPool().end(); } catch { /* already ended */ } });
