// PostgreSQL pool + ambient executor (AsyncLocalStorage).
// Prod env: DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD.
// Test env: DB_TEST_HOST, DB_TEST_PORT, DB_TEST_DATABASE, DB_TEST_USERNAME, DB_TEST_PASSWORD.
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();
let pool = null;

function poolConfig({ test = false } = {}) {
  const p = test ? 'DB_TEST_' : 'DB_';
  return {
    host: process.env[`${p}HOST`] || 'localhost',
    port: Number(process.env[`${p}PORT`]) || 5432,
    database: process.env[`${p}DATABASE`] || (test ? 'bobe_agent_test' : 'bobe_agent'),
    user: process.env[`${p}USERNAME`] || undefined,
    password: process.env[`${p}PASSWORD`] || undefined,
  };
}

// Creates (and remembers) the module-level pool. With no arguments — prod config (backward compatibility).
// If a pool already existed — close it so connections don't leak on a repeated createPool.
// end() is async: we don't await it (createPool is synchronous by contract), but we MUST swallow a possible
// reject (the DB already went away) — otherwise an unhandledRejection crashes the process. The old pool drains in the background.
export function createPool(opts = {}) {
  if (pool) {
    const prev = pool;
    prev.end().catch((err) => console.error('[db] error closing the previous pool:', err?.message ?? err));
  }
  pool = new pg.Pool(poolConfig(opts));
  // The pg pool emits 'error' on an idle-connection failure (the DB dropped the connection, DB restart/rename).
  // Without a listener, the unhandled event crashes the WHOLE Node process. We log and continue: the pool
  // discards the broken client itself, the next query() grabs a fresh connection. This way the API survives a DB blip.
  pool.on('error', (err) => {
    console.error('[db] pool idle-connection error:', err?.message ?? err);
  });
  return pool;
}

export function getPool() {
  if (!pool) createPool();
  return pool;
}

// Current query executor: client from context (the test's transaction) or the shared pool.
export function getExecutor() {
  return als.getStore() ?? getPool();
}

export function query(text, params) {
  return getExecutor().query(text, params);
}

// Test isolation: one client + BEGIN, body within the ALS context, ROLLBACK on completion.
// Repositories using query()/getExecutor() transparently go through this client.
// NOTE: NOT reentrant — a nested withTransaction would grab a NEW client from the pool and send
// its own BEGIN, breaking the outer transaction's isolation. Contract: call only flatly
// (consumers do exactly that). Nesting would require a SAVEPOINT — deliberately not introduced.
export async function withTransaction(fn) {
  const client = await getPool().connect();
  // BEGIN inside try: if it throws, finally still returns the connection to the pool (otherwise — a leak).
  try {
    await client.query('BEGIN');
    return await als.run(client, () => fn(client));
  } finally {
    try { await client.query('ROLLBACK'); } finally { client.release(); }
  }
}

// Atomic transaction for prod writes. If already within an ALS context (a test inside withTransaction
// or an outer transaction) — just run fn on the current client (its BEGIN/ROLLBACK is managed by
// the outer code; we don't send a nested BEGIN). Otherwise — grab a connection, BEGIN, COMMIT/ROLLBACK.
// Unlike withTransaction, it does NOT roll back unconditionally — this is for real writes.
export async function transaction(fn) {
  const existing = als.getStore();
  if (existing) return fn(existing);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const r = await als.run(client, () => fn(client));
    await client.query('COMMIT');
    return r;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* the connection may have dropped */ }
    throw e;
  } finally {
    client.release();
  }
}
