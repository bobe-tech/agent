import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from '../core/db.js';
import { withTx, setupTestDb } from '../tests/db.js';
import { seedTick } from '../tests/factories.js';
import { crsiMinOverWindow } from './account.js';

setupTestDb();

// ISO timestamp `minutes` ago (relative to now → deterministic regardless of exact now()).
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

test('crsiMinOverWindow returns the MIN crsi of rows inside the window', async () => {
  await withTx(async () => {
    await seedTick({ pair: 'ETH/USDT', ts: minutesAgo(10), crsi: 40 });
    await seedTick({ pair: 'ETH/USDT', ts: minutesAgo(20), crsi: 25 });
    await seedTick({ pair: 'ETH/USDT', ts: minutesAgo(30), crsi: 55 });
    const min = await crsiMinOverWindow('ETH/USDT', 3);
    assert.equal(min, 25);
  });
});

test('crsiMinOverWindow excludes a row older than the window', async () => {
  await withTx(async () => {
    await seedTick({ pair: 'ETH/USDT', ts: minutesAgo(10), crsi: 40 }); // inside
    await seedTick({ pair: 'ETH/USDT', ts: minutesAgo(60 * 5), crsi: 5 }); // 5h ago, outside a 3h window
    const min = await crsiMinOverWindow('ETH/USDT', 3);
    assert.equal(min, 40); // the lower (5) is excluded → MIN is 40
  });
});

test('crsiMinOverWindow ignores NULL crsi rows', async () => {
  await withTx(async () => {
    await seedTick({ pair: 'ETH/USDT', ts: minutesAgo(10), crsi: null });
    await seedTick({ pair: 'ETH/USDT', ts: minutesAgo(20), crsi: 33 });
    const min = await crsiMinOverWindow('ETH/USDT', 3);
    assert.equal(min, 33);
  });
});

test('crsiMinOverWindow returns null on empty history', async () => {
  await withTx(async () => {
    const min = await crsiMinOverWindow('ETH/USDT', 3);
    assert.equal(min, null);
  });
});

process.on('exit', () => { try { getPool().end(); } catch { /* already ended */ } });
