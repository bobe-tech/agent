// BoBe MCP — reflection tools (reading the journal + writing memory: lessons/regime_stats/params).
// Does NOT trade. Ambient query()/transaction() from core/db.js — without pool arguments.
import { query, transaction } from '../core/db.js';

// Insert a new params version (within the passed client/transaction). everything in JSONB config.
async function insertVersion(client, pair, config, { source, reason, parent_version, is_active }) {
  const { rows } = await client.query(
    `INSERT INTO params (pair, is_active, config, parent_version, source, reason)
     VALUES ($1,$2,$3::jsonb,$4,$5,$6) RETURNING version`,
    [pair, is_active, JSON.stringify(config ?? {}), parent_version ?? null, source, reason ?? null]);
  return rows[0].version;
}

// --- Reading the journal ---

// Closed trades of the window (for completed, filter by status_at; otherwise by created_at).
export async function getTrades(pair, from, to, status = 'completed') {
  const col = status === 'completed' ? 'status_at' : 'created_at';
  // Half-open window [from, to): adjacent reflection windows don't double-count on the boundary.
  const { rows } = await query(
    `SELECT * FROM positions WHERE pair=$1 AND status=$2 AND ${col} >= $3 AND ${col} < $4 ORDER BY ${col}`,
    [pair, status, from, to]);
  if (rows.length) {
    const ids = rows.map(r => r.id);
    const { rows: ords } = await query(`SELECT * FROM orders WHERE position_id = ANY($1) ORDER BY id`, [ids]);
    for (const p of rows) p.orders = ords.filter(o => String(o.position_id) === String(p.id));
  }
  return rows;
}

export async function getTicks(pair, from, to) {
  const { rows } = await query(
    `SELECT * FROM tick_log WHERE pair=$1 AND ts >= $2 AND ts < $3 ORDER BY ts`, [pair, from, to]);
  return rows;
}

// Analysis of MISSED opportunities: HOLD decisions in a trending STRUCTURE (close>sma20>sma50 or
// mirrored down), after which the price actually moved in the trend direction ≥ a threshold. This is a signal
// that the ADX entry threshold (adx_lo) is too strict. The future price is taken from tick_log via horizon_hours.
export async function getMissedMoves(pair, from, to, { horizon_hours = 4, move_threshold_pct = 3 } = {}) {
  const { rows } = await query(
    `WITH holds AS (
       SELECT id, ts, close, sma20, sma50, atr_pct, adx
       FROM tick_log
       WHERE pair=$1 AND action='HOLD' AND ts >= $2 AND ts < $3
         AND close IS NOT NULL AND sma20 IS NOT NULL AND sma50 IS NOT NULL
     )
     SELECT h.*,
       (SELECT t2.close FROM tick_log t2
          WHERE t2.pair=$1 AND t2.close IS NOT NULL
            AND t2.ts >= h.ts + ($4 || ' hours')::interval
            AND t2.ts <  h.ts + (($4::int * 3) || ' hours')::interval   -- upper bound: protection against "holes" in the journal
          ORDER BY t2.ts ASC LIMIT 1) AS future_close
     FROM holds h ORDER BY h.ts`,
    [pair, from, to, String(horizon_hours)]);

  const gp = await query('SELECT config FROM params WHERE pair=$1 AND is_active', [pair]);
  const adxLo = gp.rows[0]?.config?.adx_lo ?? null;   // trend-strength threshold in config

  let trendStructured = 0, missedUp = 0, missedDown = 0, sumMissed = 0, adxBlocks = 0;
  const examples = [];
  for (const r of rows) {
    if (r.future_close == null) continue;                       // no "future" — edge of the window
    const close = Number(r.close), sma20 = Number(r.sma20), sma50 = Number(r.sma50);
    const movePct = (Number(r.future_close) - close) / close * 100;
    const upStruct = close > sma20 && sma20 > sma50;
    const downStruct = close < sma20 && sma20 < sma50;
    if (!upStruct && !downStruct) continue;                     // no trending structure — not a miss
    trendStructured++;

    // Which gate likely blocked entry (only the ADX threshold adx_lo from config)
    const blocked = [];
    if (r.adx != null && adxLo != null && Number(r.adx) < Number(adxLo)) { adxBlocks++; blocked.push('adx_lo'); }

    const aligned = (upStruct && movePct >= move_threshold_pct) || (downStruct && movePct <= -move_threshold_pct);
    if (aligned) {
      if (upStruct) missedUp++; else missedDown++;
      sumMissed += Math.abs(movePct);
      if (examples.length < 5) examples.push({
        ts: r.ts, close, future_close: Number(r.future_close),
        move_pct: +movePct.toFixed(2), structure: upStruct ? 'up' : 'down', blocked_by: blocked,
      });
    }
  }
  const missed = missedUp + missedDown;
  return {
    horizon_hours, move_threshold_pct,
    total_holds: rows.length,
    trend_structured: trendStructured,          // HOLDs with a trending structure (potential entries)
    missed_moves: missed,                       // of them, with a real move ≥ threshold in the trend direction
    missed_up: missedUp, missed_down: missedDown,
    avg_missed_move_pct: missed ? +(sumMissed / missed).toFixed(2) : 0,
    gate_blocks: { adx_lo: adxBlocks },   // what blocked most often (the ADX threshold)
    examples,
  };
}

// The active version + the full version history with attached performance (params_perf) for rollback.
export async function getParamsHistory(pair) {
  const { rows: all } = await query('SELECT * FROM params WHERE pair=$1 ORDER BY version', [pair]);
  const versions = all.map((p) => p.version);
  const { rows: perf } = versions.length
    ? await query('SELECT * FROM params_perf WHERE params_version = ANY($1::int[])', [versions])
    : { rows: [] };
  const history = all.map((p) => ({ ...p, perf: perf.filter((pp) => pp.params_version === p.version) }));
  return { active: all.find((p) => p.is_active) ?? null, history };
}

// --- Writing memory ---

export async function upsertRegimeStats(pair, regime, s) {
  await query(
    `INSERT INTO regime_stats (pair, regime, n_trades, win_rate, avg_r, avg_pnl_pct, median_hold, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (pair, regime) DO UPDATE SET
       n_trades=EXCLUDED.n_trades, win_rate=EXCLUDED.win_rate, avg_r=EXCLUDED.avg_r,
       avg_pnl_pct=EXCLUDED.avg_pnl_pct, median_hold=EXCLUDED.median_hold, updated_at=now()`,
    [pair, regime, s.n_trades ?? 0, s.win_rate ?? null, s.avg_r ?? null, s.avg_pnl_pct ?? null, s.median_hold ?? null]);
  return { ok: true };
}

export async function upsertLesson(pair, { regime, text, confidence }) {
  const { rows } = await query(
    `INSERT INTO lessons (pair, regime, text, confidence) VALUES ($1,$2,$3,$4) RETURNING id`,
    [pair, regime ?? null, text, confidence ?? 0.5]);
  return { id: rows[0].id };
}

export async function deactivateLesson(id) {
  await query('UPDATE lessons SET active=false, updated_at=now() WHERE id=$1', [id]);
  return { ok: true };
}

// Proposing a new params version (only the JSONB config changes — there is no CHECK on it in the DB,
// the ranges are kept by reflection itself, see prompt §5). Base — parent_version (or the pair's active version).
// The handling of code 23514 below is left as a safety net (in case of a legacy CHECK).
export async function proposeParams(pair, { changes, reason, auto_apply, parent_version }) {
  const baseRow = parent_version
    ? (await query('SELECT * FROM params WHERE version=$1 AND pair=$2', [parent_version, pair])).rows[0]
    : (await query('SELECT * FROM params WHERE pair=$1 AND is_active', [pair])).rows[0];
  if (!baseRow) throw new Error(`no base params version for pair ${pair}`);

  // only config changes — a shallow merge of changes.config over the base version.
  const config = { ...(baseRow.config || {}), ...(changes?.config || {}) };

  try {
    return await transaction(async (client) => {
      if (auto_apply) await client.query('UPDATE params SET is_active=false WHERE pair=$1 AND is_active', [pair]);
      const version = await insertVersion(client, pair, config,
        { source: 'reflection', reason, parent_version: baseRow.version, is_active: !!auto_apply });
      return { version };
    });
  } catch (e) {
    if (e.code === '23514') return { error: `parameter out of the allowed range (${e.constraint})` };
    throw e;
  }
}

// Make a version active (one active per pair — guaranteed by the unique index).
export async function activateParams(pair, version) {
  return transaction(async (client) => {
    await client.query('UPDATE params SET is_active=false WHERE pair=$1 AND is_active', [pair]);
    const r = await client.query('UPDATE params SET is_active=true WHERE version=$1 AND pair=$2 RETURNING version',
      [version, pair]);
    if (!r.rows[0]) throw new Error(`version ${version} not found for pair ${pair}`);
    return { ok: true };
  });
}

// Rollback: creates a NEW copy version of to_version with source='rollback' and activates it (the history is preserved).
export async function rollbackParams(pair, toVersion, reason) {
  const base = (await query('SELECT * FROM params WHERE version=$1 AND pair=$2', [toVersion, pair])).rows[0];
  if (!base) throw new Error(`version ${toVersion} not found for pair ${pair}`);
  return transaction(async (client) => {
    await client.query('UPDATE params SET is_active=false WHERE pair=$1 AND is_active', [pair]);
    const version = await insertVersion(client, pair, base.config,
      { source: 'rollback', reason, parent_version: toVersion, is_active: true });
    return { ok: true, version };
  });
}

// The reflection output journal (for human visibility in Telegram). The tick agent does NOT read it —
// it's not a policy, but a record of "what was analyzed and what is recommended".
export async function logReflection(pair, { summary, payload }) {
  const { rows } = await query(
    `INSERT INTO reflection_log (pair, summary, payload) VALUES ($1,$2,$3::jsonb) RETURNING id`,
    [pair, summary, payload ? JSON.stringify(payload) : null]);
  return { ok: true, id: rows[0].id };
}

export async function recordParamsPerf(version, window, metrics) {
  await query(
    `INSERT INTO params_perf (params_version, window_from, window_to, n_trades, avg_r, max_drawdown_pct)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [version, window.from, window.to, metrics.n_trades, metrics.avg_r ?? null, metrics.max_drawdown_pct ?? null]);
  return { ok: true };
}
