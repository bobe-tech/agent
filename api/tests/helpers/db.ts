// The single test bootstrap (tests/db.js) brings up the pool with { test: true } AND verifies that the DB name
// is indeed a test one (a safeguard against writing to prod). The api tests go through the same
// entry point as the node layer — a single source of truth for the test DB.
import { withTx } from '../../../tests/db.js';

// Runs the test body inside a transaction with ROLLBACK (isolation). The pool is brought up lazily
// inside withTx with a DB name check. Repositories see the transaction's client via the ambient query().
export async function withTestTx(fn: () => Promise<void>): Promise<void> {
  await withTx(async () => {
    await fn();
  });
}
