#!/usr/bin/env node
// bin/set-crsi-buy.mjs — set/recalibrate per-pair crsi_buy on the ACTIVE params version, in place.
// Single atomic UPDATE per pair (merges only the crsi_buy key, keeps the rest), no version bump
// (FKs stay valid) — an "in-place edit" per reflection.md §0a. Re-runnable any time the levels in
// core/crsi-levels.js change. A pair with no active version is skipped (logged).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPool, getPool, query } from '../core/db.js';
import { CRSI_BUY } from '../core/crsi-levels.js';

// Load <project>/.env when run directly — the deploy invokes `node bin/set-crsi-buy.mjs` without
// exporting DB_* first, so without this the pg client gets no password (SCRAM auth fails). Optional:
// if the file is absent or env is already set, we silently keep the current environment.
function loadEnv() {
  try { process.loadEnvFile?.(join(dirname(fileURLToPath(import.meta.url)), '..', '.env')); } catch { /* .env optional */ }
}

export async function setCrsiBuy(levels = CRSI_BUY) {
  for (const [pair, level] of Object.entries(levels)) {
    const { rowCount } = await query(
      `UPDATE params SET config = config || jsonb_build_object('crsi_buy', $2::numeric)
        WHERE pair=$1 AND is_active`,
      [pair, level]);
    console.log(`[set-crsi-buy] ${pair}: crsi_buy=${level} (${rowCount ? 'updated' : 'no active version, skipped'})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  createPool();
  setCrsiBuy().then(() => getPool().end()).catch((e) => { console.error(e); process.exit(1); });
}
