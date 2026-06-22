#!/usr/bin/env node
// bin/migrate-params.mjs — one-time migration of active params to the ATR+CRSI strategy schema.
// For each active version still carrying old-strategy keys, UPDATE its config IN PLACE to the new
// schema (single atomic statement, no version bump — an "in-place edit" per reflection.md §0a).
// Idempotent: a pair already on the new schema is skipped. Run once at the rework deploy; NOT on every
// deploy (it must not run in install.js's always-run path, which would clobber tuned params).
import { createPool, getPool, query } from '../core/db.js';

const OLD_KEYS = ['tp_mult', 'adx_lo', 'adx_hi', 'avg1_depth_mult_lo', 'avg1_depth_mult_hi',
  'avg2_depth_mult', 'crsi_sell', 'crsi_prev_max_age_min'];
const NEW_DEFAULTS = {
  adx_mult_threshold: 30, adx_mult_lo: 1, adx_mult_hi: 1.3,
  avg2_atr_mult: 3, crsi_window_hours: 3, high_window_hours: 24,
};

// Pure: strip old keys, add new defaults (without overriding values already present), keep the rest
// (crsi_buy, sizes_usd, periods, side_mode, strategy, max_adds, hackathon_end).
export function migrateConfig(old) {
  const cfg = { ...(old || {}) };
  for (const k of OLD_KEYS) delete cfg[k];
  return { ...NEW_DEFAULTS, ...cfg };
}

export async function migrateParams() {
  const { rows } = await query('SELECT pair, version, config FROM params WHERE is_active');
  for (const r of rows) {
    const cfg = r.config || {};
    const hasOld = OLD_KEYS.some((k) => k in cfg);
    const hasNew = 'adx_mult_threshold' in cfg;
    if (hasNew && !hasOld) { console.log(`[migrate-params] ${r.pair}: already migrated, skip`); continue; }
    const next = migrateConfig(cfg);
    // In-place update of the active version's config — single atomic statement: no deactivate/insert
    // window (a crash can never leave a pair without an active version), no version bump. The FK
    // references to params.version stay valid. Matches the "in-place edit" model in reflection.md §0a.
    await query('UPDATE params SET config=$2::jsonb WHERE pair=$1 AND is_active', [r.pair, JSON.stringify(next)]);
    console.log(`[migrate-params] ${r.pair}: migrated active version v${r.version} config in place`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createPool();
  migrateParams().then(() => getPool().end()).catch((e) => { console.error(e); process.exit(1); });
}
