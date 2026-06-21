// The single entry point to the test DB for ALL tests (node:test and vitest).
// Why: to guarantee that the automated tests touch ONLY the test database, not prod.
//
// The danger we're closing: createPool() without { test: true } lazily brings up the PROD pool
// (DB_DATABASE=bobe_agent). One forgotten flag — and a test writes to the live DB.
// So the only sanctioned way to initialize here is setupTestDb(), which brings up the pool
// with { test: true } AND checks that the DB name is indeed a test one.
import { createPool, getPool, withTransaction } from '../core/db.js';

let ready = false;

// The test DB name must contain 'test' (bobe_agent_test). Any other name is almost certainly
// a prod/local live database: we fail loudly, before a single query, so a test physically cannot touch it.
function assertTestDatabase() {
  const name = process.env.DB_TEST_DATABASE || 'bobe_agent_test';
  if (!/test/i.test(name)) {
    throw new Error(
      `[tests] refused: DB_TEST_DATABASE='${name}' does not look like a test DB (no 'test' in the name). ` +
      'Automated tests run only on the test database — check .env (DB_TEST_DATABASE).',
    );
  }
}

// Initialize the test pool once per process. Idempotent.
export function setupTestDb() {
  if (ready) return;
  assertTestDatabase();
  createPool({ test: true });
  // Double-check after the fact: ask the pool itself which DB it's connected to.
  const db = getPool().options?.database;
  if (db && !/test/i.test(db)) {
    throw new Error(`[tests] refused: the pool is connected to '${db}', not to the test DB.`);
  }
  ready = true;
}

// Run the test body inside a transaction with an unconditional ROLLBACK (isolation).
// A wrapper over withTransaction + a guarantee that the pool is up and is the test one.
export async function withTx(fn) {
  setupTestDb();
  return withTransaction(fn);
}
