#!/usr/bin/env node
// Cron job: pulls a live bid/ask quote from twak for all pairs from config.json and upserts them into the
// quotes table; then prunes stale rows. The API reads quotes ONLY from the DB — the request path never calls
// twak. Run: node --env-file-if-exists=.env bin/refresh-quotes.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPool, getPool } from '../core/db.js';
import { getQuote } from '../core/quotes.js';
import { insertQuote, pruneOldQuotes } from '../core/quotes-store.js';

const NOTIONAL = 100; // default USD notional for the quote (price impact ~0 at this size)
const KEEP_DAYS = 7;

// Non-zero exit only if nothing got updated while there were failures (for cron monitoring).
export function exitCode(ok, fail) {
  return ok === 0 && fail > 0 ? 1 : 0;
}

// Pure orchestration (no createPool/exit) — testable with dependency injection. Pairs run in PARALLEL,
// each isolated (one failure does not affect others). Prune runs once, only if something got updated.
export async function refreshQuotes({
  pairs,
  quoteAddr,
  notionalUsd = NOTIONAL,
  keepDays = KEEP_DAYS,
  deps = { getQuote, insertQuote, pruneOldQuotes },
  log = () => {},
} = {}) {
  const results = await Promise.all(
    Object.entries(pairs).map(async ([pair, cfg]) => {
      try {
        const q = await deps.getQuote(cfg, { notionalUsd, quoteAddr });
        await deps.insertQuote(pair, q);
        log(`✓ ${pair}: bid=${q.bid} ask=${q.ask}`);
        return true;
      } catch (e) {
        log(`✗ ${pair}: ${e.message}`);
        return false;
      }
    }),
  );
  const ok = results.filter(Boolean).length;
  const fail = results.length - ok;
  const pruned = ok > 0 ? await deps.pruneOldQuotes(keepDays) : 0;
  return { ok, fail, pruned };
}

// Auto-run only when invoked directly as a script (not when imported in tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const config = JSON.parse(readFileSync(join(__dirname, '..', 'core', 'config.json'), 'utf8'));
  const notionalUsd = Number(process.env.QUOTE_NOTIONAL_USD) || NOTIONAL;
  const keepDays = Number(process.env.QUOTES_KEEP_DAYS) || KEEP_DAYS;
  const quoteAddr = config.quote_token.address;
  createPool();
  let res = { ok: 0, fail: 0, pruned: 0 };
  try {
    res = await refreshQuotes({ pairs: config.pairs, quoteAddr, notionalUsd, keepDays, log: (m) => console.log(m) });
  } finally {
    await getPool().end();
  }
  console.log(`refresh-quotes: ok=${res.ok} fail=${res.fail} pruned=${res.pruned}`);
  process.exit(exitCode(res.ok, res.fail));
}
