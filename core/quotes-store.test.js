// quotes-store: writing twak quotes into the DB (for the refresh-quotes cron). Focus — insertQuote upsert
// (idempotent per pair,ts) and pruneOldQuotes by age. We verify via a direct SELECT (the read path for the
// dashboard lives in the API layer, not here). Runs inside a test transaction (rolled back).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { query } from './db.js';
import { withTx, setupTestDb } from '../tests/db.js';
import { insertQuote, pruneOldQuotes } from './quotes-store.js';

setupTestDb();

// Read a row back directly (NUMERIC/BIGINT -> Number) — used only to assert what insertQuote wrote.
async function rowAt(pair, ts) {
  const { rows } = await query(
    `SELECT bid::float8 AS bid, ask::float8 AS ask, mid::float8 AS mid, notional::float8 AS notional, provider, ts
       FROM quotes WHERE pair = $1 AND ts = $2`,
    [pair, ts],
  );
  return rows[0] ?? null;
}

test('insertQuote: writes all columns of a quote row', async () => {
  await withTx(async () => {
    await insertQuote('ZZZ/TEST', { bid: 20, ask: 22, mid: 21, notional: 100, provider: 'X', ts: 2000 });
    const r = await rowAt('ZZZ/TEST', 2000);
    assert.equal(Number(r.bid), 20);
    assert.equal(Number(r.ask), 22);
    assert.equal(Number(r.mid), 21);
    assert.equal(Number(r.notional), 100);
    assert.equal(r.provider, 'X');
    assert.equal(Number(r.ts), 2000);
  });
});

test('insertQuote: provider defaults to null when omitted', async () => {
  await withTx(async () => {
    await insertQuote('ZZZ/TEST', { bid: 1, ask: 2, mid: 1.5, notional: 100, ts: 100 });
    const r = await rowAt('ZZZ/TEST', 100);
    assert.equal(r.provider, null);
  });
});

test('insertQuote: re-insert same (pair,ts) updates the row (upsert)', async () => {
  await withTx(async () => {
    await insertQuote('ZZZ/TEST', { bid: 1, ask: 2, mid: 1.5, notional: 100, ts: 500 });
    await insertQuote('ZZZ/TEST', { bid: 9, ask: 10, mid: 9.5, notional: 100, ts: 500 });
    const r = await rowAt('ZZZ/TEST', 500);
    assert.equal(Number(r.bid), 9);
    assert.equal(Number(r.ask), 10);
    // Still a single row for that (pair, ts).
    const { rows } = await query(`SELECT count(*)::int AS n FROM quotes WHERE pair = $1 AND ts = $2`, ['ZZZ/TEST', 500]);
    assert.equal(rows[0].n, 1);
  });
});

test('pruneOldQuotes: deletes rows older than N days, keeps fresh ones', async () => {
  await withTx(async () => {
    const now = Math.floor(Date.now() / 1000);
    await insertQuote('ZZZ/TEST', { bid: 1, ask: 2, mid: 1.5, notional: 100, ts: now - 10 * 86400 });
    await insertQuote('ZZZ/TEST', { bid: 3, ask: 4, mid: 3.5, notional: 100, ts: now });
    const deleted = await pruneOldQuotes(7);
    assert.ok(deleted >= 1);
    assert.equal(await rowAt('ZZZ/TEST', now - 10 * 86400), null); // old row gone
    assert.notEqual(await rowAt('ZZZ/TEST', now), null);            // fresh row kept
  });
});
