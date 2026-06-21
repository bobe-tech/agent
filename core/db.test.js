import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, query, withTransaction, transaction, getPool } from './db.js';

createPool({ test: true });

// We verify the "Laravel-style" isolation: a write inside withTransaction is visible inside
// (the same client from the ALS context), but is rolled back afterward — it doesn't exist outside.
test('withTransaction rolls back changes after the test', async () => {
  const marker = 'TX_TEST_LESSON_MARKER';

  // Pre-cleanup in case of leftovers from a previous run
  await query('DELETE FROM lessons WHERE text = $1', [marker]);

  let inside_count;
  await withTransaction(async () => {
    await query('INSERT INTO lessons (pair, text, confidence) VALUES ($1, $2, $3)', ['ETH/USDT', marker, 0.5]);
    const r = await query('SELECT count(*)::int AS c FROM lessons WHERE text = $1', [marker]);
    inside_count = r.rows[0].c;
  });

  assert.equal(inside_count, 1); // visible inside the transaction

  const after = await query('SELECT count(*)::int AS c FROM lessons WHERE text = $1', [marker]);
  assert.equal(after.rows[0].c, 0); // after ROLLBACK there is no row outside
});

// transaction() inside withTransaction — participates in the ALS context: visible inside, rolled back outside.
test('transaction() inside withTransaction participates in the test transaction and is rolled back', async () => {
  const marker = 'TX_PROD_LESSON_MARKER';

  await query('DELETE FROM lessons WHERE text = $1', [marker]);

  let inside_count;
  await withTransaction(async () => {
    // transaction() sees the existing ALS client and does NOT start a nested BEGIN
    await transaction(async () => {
      await query('INSERT INTO lessons (pair, text, confidence) VALUES ($1, $2, $3)', ['BTC/USDT', marker, 0.7]);
    });
    const r = await query('SELECT count(*)::int AS c FROM lessons WHERE text = $1', [marker]);
    inside_count = r.rows[0].c;
  });

  assert.equal(inside_count, 1); // visible inside (the same ALS client)

  const after = await query('SELECT count(*)::int AS c FROM lessons WHERE text = $1', [marker]);
  assert.equal(after.rows[0].c, 0); // withTransaction did a ROLLBACK — no row
});

// Close the pool after all tests
process.on('exit', () => { try { getPool().end(); } catch { /* already ended */ } });
