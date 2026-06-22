// Account MCP — tick tools (reading memory + writing orders/positions).
// Money arithmetic lives in SQL. Ambient query() from core/db.js; atomic writes use transaction()
// (COMMIT in prod; participates in the test's ALS transaction → ROLLBACK isolation). NOT withTransaction (which always rolls back).
import { query, transaction } from '../core/db.js';
import { resolveSwapFill, BlockchainUnavailable } from '../core/blockchain.js';
import { buildErrorAlert, sendTelegram } from './notify.js';

// Cap on a SINGLE leg amount (USDT) = max(sizes_usd)·2 — a safeguard against an LLM mistake/hallucination
// (the agent chooses amount itself; this limit doesn't depend on the prompt). null if sizes_usd is not set —
// then the limit isn't applied (graceful degradation: don't block a legitimate operation over a broken config).
function legCapUsd(config) {
  const sizes = config?.sizes_usd;
  if (!Array.isArray(sizes) || !sizes.length) return null;
  return Math.max(...sizes.map(Number)) * 2;
}

// Minimum CRSI over the trailing window (entry/averaging crossing gate input). null when no rows.
export async function crsiMinOverWindow(pair, windowHours) {
  const { rows } = await query(
    `SELECT MIN(crsi)::float8 AS crsi_min FROM tick_log
      WHERE pair=$1 AND crsi IS NOT NULL AND ts >= now() - ($2 || ' hours')::interval`,
    [pair, String(windowHours)]);
  return rows[0]?.crsi_min ?? null;
}

// Active params version for a pair.
export async function getParams(pair) {
  const { rows } = await query('SELECT * FROM params WHERE pair=$1 AND is_active LIMIT 1', [pair]);
  if (!rows[0]) throw new Error(`no active params for pair ${pair}`);
  return rows[0];
}

// get_state: active positions with a nested orders array (all orders of the position: action=open/add/close,
// status=active/completed/cancelled), last_trade_at, lessons, regime_stats.
// The agent computes adds_count itself from orders:
//   orders.filter(o => ['open','add'].includes(o.action) && o.status==='completed').length - 1
// Semantics (strategy.md §6): after only open (1 completed leg) → adds_count=0 → avg1 = sizes_usd[1];
// after open+avg1 (2 legs) → adds_count=1 → avg2 = sizes_usd[2].
// Reconciliation: orders with status='active' inside the position's orders.
export async function getState(pair, regime) {
  const { rows: positions } = await query(
    `SELECT * FROM positions WHERE pair=$1 AND status='active' ORDER BY id DESC`, [pair]);
  let orders = [];
  if (positions.length) {
    const ids = positions.map((p) => p.id);
    const r = await query(`SELECT * FROM orders WHERE position_id = ANY($1) ORDER BY id`, [ids]);
    orders = r.rows;
  }
  for (const p of positions) p.orders = orders.filter((o) => String(o.position_id) === String(p.id));
  const { rows: lt } = await query(
    `SELECT GREATEST(MAX(created_at), MAX(status_at)) AS last_trade_at FROM positions WHERE pair=$1`, [pair]);
  const { rows: lessons } = await query(
    `SELECT id, regime, text, confidence FROM lessons
       WHERE pair=$1 AND active AND (regime=$2 OR regime IS NULL)
       ORDER BY confidence DESC LIMIT 3`, [pair, regime]);
  const { rows: stats } = await query(
    `SELECT * FROM regime_stats WHERE pair=$1 AND regime=$2`, [pair, regime]);
  return { open_positions: positions, last_trade_at: lt[0]?.last_trade_at ?? null,
           lessons, regime_stats: stats[0] ?? null };
}

// Recompute the position aggregates from its completed orders (a single SQL). Returns the position row.
async function recomputePosition(executor, positionId) {
  const { rows } = await executor.query(
    `WITH agg AS (
       SELECT
         coalesce(sum(comp_size)   FILTER (WHERE action IN ('open','add')),0) AS o_size,
         coalesce(sum(comp_amount) FILTER (WHERE action IN ('open','add')),0) AS o_amount,
         coalesce(sum(comp_size)   FILTER (WHERE action='close'),0)           AS c_size,
         coalesce(sum(comp_amount) FILTER (WHERE action='close'),0)           AS c_amount
       FROM orders WHERE position_id=$1 AND status='completed')
     UPDATE positions p SET
       opened_size   = agg.o_size,
       opened_amount = agg.o_amount,
       opened_price  = CASE WHEN agg.o_size>0 THEN agg.o_amount/agg.o_size ELSE NULL END,
       closed_size   = CASE WHEN agg.c_size>0 THEN agg.c_size ELSE NULL END,
       closed_amount = CASE WHEN agg.c_size>0 THEN agg.c_amount ELSE NULL END,
       closed_price  = CASE WHEN agg.c_size>0 THEN agg.c_amount/agg.c_size ELSE NULL END
     FROM agg WHERE p.id=$1 RETURNING p.*`,
    [positionId]);
  return rows[0];
}

// open_position: creates an active position + an active open order (start_size = amount/price). Returns the order resource.
export async function openPosition(a) {
  return transaction(async (client) => {
    const { rows: pr } = await client.query('SELECT config FROM params WHERE pair=$1 AND is_active', [a.pair]);
    const cap = legCapUsd(pr[0]?.config);
    if (cap != null && Number(a.amount) > cap)
      throw new Error(`leg amount ${a.amount} USDT exceeds the limit ${cap} (max(sizes_usd)·2)`);
    let pos;
    try {
      const result = await client.query(
        `INSERT INTO positions (pair, side, status, opened_size, opened_amount, opened_price,
            regime_at_entry, features_at_entry, expected_move_pct, params_version)
         VALUES ($1,$2,'active',0,0,NULL,$3,$4::jsonb,$5,$6) RETURNING id`,
        [a.pair, a.side, a.regime_at_entry, JSON.stringify(a.features_at_entry || {}),
         a.expected_move_pct ?? null, a.params_version]);
      pos = result.rows;
    } catch (e) {
      if (e.code === '23505' && e.constraint === 'positions_one_active_per_side') {
        throw new Error(`there is already an open ${a.side} position for ${a.pair}`);
      }
      throw e;
    }
    const positionId = pos[0].id;
    const { rows } = await client.query(
      `INSERT INTO orders (position_id, pair, side, action, status, start_size, start_amount, start_price, params_version)
       VALUES ($1,$2,$3,'open','active', ($5::numeric/$4::numeric), $5, $4, $6) RETURNING *`,
      [positionId, a.pair, a.side, a.price, a.amount, a.params_version]);
    return rows[0];
  });
}

// Marks the position error=true (status stays active) + reason. A separate mini-transaction.
async function markPositionError(positionId, reason) {
  const { rows } = await query(
    `UPDATE positions SET error=true, reason=$2, status_at=now() WHERE id=$1 RETURNING *`,
    [positionId, reason]);
  return rows[0];
}

// fill_order: order active → completed with the ACTUAL amounts from the blockchain receipt (resolveFill).
// If the receipt is unavailable: position → error (active, not traded), order stays active, alert to Telegram.
// deps are injected in tests (resolveFill/sendAlert), defaults in prod.
export async function fillOrder(a, deps = {}) {
  const resolveFill = deps.resolveFill ?? ((order, txHash) => resolveSwapFill({ order, txHash }));
  const sendAlert = deps.sendAlert ?? ((text) => sendTelegram(text));

  // 1. Load the active order (outside a transaction — to know action/pair/position_id).
  const { rows: ord0 } = await query(`SELECT * FROM orders WHERE id=$1 AND status='active'`, [a.order_id]);
  const order0 = ord0[0];
  if (!order0) throw new Error(`active order #${a.order_id} not found`);

  // 2. Read the actual amounts from the receipt (network + retry) OUTSIDE a transaction.
  let comp;
  try {
    comp = await resolveFill(order0, a.tx_id);
  } catch (e) {
    if (e instanceof BlockchainUnavailable) {
      const reason = `fill #${a.order_id}: ${e.message}`;
      await markPositionError(order0.position_id, reason);
      // The alert is best-effort: a Telegram failure must NOT mask a meaningful reason (the position is already in error).
      try {
        await sendAlert(buildErrorAlert({
          env: process.env.APP_ENV, pair: order0.pair, position_id: order0.position_id,
          order_id: a.order_id, tx_id: a.tx_id, reason: e.message,
        }));
      } catch (alertErr) {
        console.error(`[fill_order] error-position alert not sent: ${alertErr.message}`);
      }
      throw new Error(`failed to read the swap receipt (tx ${a.tx_id}) — position #${order0.position_id} marked error`);
    }
    throw e;
  }

  // 3. Write comp_*, recompute aggregates (for close — realized_pnl + position completed).
  return transaction(async (client) => {
    let upd;
    try {
      ({ rows: upd } = await client.query(
        `UPDATE orders SET status='completed', status_at=now(),
           comp_size=$2, comp_amount=$3,
           comp_price = CASE WHEN $2::numeric>0 THEN $3::numeric/$2::numeric ELSE NULL END,
           tx_id=$4
         WHERE id=$1 AND status='active' RETURNING *`,
        [a.order_id, comp.comp_size, comp.comp_amount, a.tx_id]));
    } catch (e) {
      // UNIQUE(tx_id) WHERE NOT NULL — one tx_id can't be written to two orders (protection against double-counting amounts).
      if (e.code === '23505' && e.constraint === 'orders_tx_id_unique') {
        throw new Error(`tx_id ${a.tx_id} is already used by another order — a repeated/foreign fill was rejected (double-counting protection)`);
      }
      throw e;
    }
    const order = upd[0];
    if (!order) throw new Error(`active order #${a.order_id} not found (race)`);
    let position = await recomputePosition(client, order.position_id);
    if (order.action === 'close') {
      // A close ALWAYS goes through (status=completed). PnL is by the ACTUAL flow of money via
      // cost-basis on the sold fraction (no thresholds/"dust"):
      //   sold_frac    = closed_size / opened_size      — what fraction of the base was actually sold
      //   cost_sold    = opened_amount * sold_frac      — the cost basis of exactly the sold fraction
      //   realized_usd = closed_amount - cost_sold      — proceeds − cost of what was sold
      //   realized_pct = realized_usd / cost_sold * 100
      // On a full close (sold_frac=1) this is "closed_amount − opened_amount" — exact to the money;
      // swap dust in the quantity shifts the fraction by fractions of a %, no tolerance needed. We divide by opened_size/
      // cost_sold → guard against 0/NULL (no investment / close with no volume) → NULL, we don't fudge the number. SHORT → NULL.
      const { rows: pc } = await client.query(
        `UPDATE positions SET status='completed', status_at=now(), reason=$2, force_closed=$3,
           realized_pnl_usd = CASE
             WHEN side='LONG' AND opened_size > 0 AND opened_amount > 0 AND closed_size > 0
               THEN closed_amount - opened_amount * (closed_size / opened_size)
             ELSE NULL END,
           realized_pnl_pct = CASE
             WHEN side='LONG' AND opened_size > 0 AND opened_amount > 0 AND closed_size > 0
               THEN (closed_amount - opened_amount * (closed_size / opened_size))
                    / (opened_amount * (closed_size / opened_size)) * 100
             ELSE NULL END
         WHERE id=$1 RETURNING *`,
        [order.position_id, a.reason ?? order.reason ?? null, a.force ?? false]);
      position = pc[0];
    }
    return { order, position };
  });
}

// A clear error on a concurrent attempt to create a second active order on a position (violation of
// orders_one_active_per_position). Normally precluded by reconciliation of unfinished orders at the start of the tick
// (prompt §0a); this catch is for diagnostics instead of a raw driver code 23505.
function rethrowActiveOrderConflict(e, positionId) {
  if (e.code === '23505' && e.constraint === 'orders_one_active_per_position') {
    throw new Error(
      `position #${positionId} already has an unfinished (active) order — ` +
      `first complete it via fill_order or cancel_order (reconciliation §0a)`);
  }
  throw e;
}

// add_to_position: checks max_adds (completed open+add count < max_adds+1), creates an active add order.
export async function addToPosition(a) {
  return transaction(async (client) => {
    const { rows: pos } = await client.query(
      `SELECT * FROM positions WHERE id=$1 AND status='active' FOR UPDATE`, [a.position_id]);
    if (!pos[0]) throw new Error('active position not found');
    if (a.pair && pos[0].pair !== a.pair) throw new Error(`position #${a.position_id} belongs to pair ${pos[0].pair}, not ${a.pair}`);
    const { rows: pr } = await client.query('SELECT config FROM params WHERE pair=$1 AND is_active', [pos[0].pair]);
    const maxAdds = pr[0]?.config?.max_adds;
    if (maxAdds == null) throw new Error(`config.max_adds is not set for pair ${pos[0].pair}`);
    const cap = legCapUsd(pr[0]?.config);
    if (cap != null && Number(a.amount) > cap)
      throw new Error(`add-on amount ${a.amount} USDT exceeds the limit ${cap} (max(sizes_usd)·2)`);
    const { rows: cnt } = await client.query(
      `SELECT count(*)::int >= ($2::int + 1) AS limit_reached
         FROM orders WHERE position_id=$1 AND action IN ('open','add') AND status='completed'`, [a.position_id, maxAdds]);
    if (cnt[0].limit_reached) throw new Error('max_adds limit reached');
    try {
      const { rows } = await client.query(
        `INSERT INTO orders (position_id, pair, side, action, status, start_size, start_amount, start_price, params_version)
         VALUES ($1,$2,$3,'add','active', ($5::numeric/$4::numeric), $5, $4, $6) RETURNING *`,
        [a.position_id, pos[0].pair, pos[0].side, a.price, a.amount, pos[0].params_version]);
      return rows[0];
    } catch (e) { rethrowActiveOrderConflict(e, a.position_id); }
  });
}

// close_position: guard net>0 before the swap (by price), creates an active close order for the ENTIRE opened_size.
export async function closePosition(a) {
  return transaction(async (client) => {
    const { rows: pos } = await client.query(
      `SELECT * FROM positions WHERE id=$1 AND status='active' FOR UPDATE`, [a.position_id]);
    const p = pos[0];
    if (!p) throw new Error('active position not found');
    if (a.pair && p.pair !== a.pair) throw new Error(`position #${a.position_id} belongs to pair ${p.pair}, not ${a.pair}`);
    // Guard net>0 (LONG): price*opened_size - opened_amount > 0. Computed in SQL (exactly).
    if (!a.force) {
      const { rows: g } = await client.query(
        `SELECT ($1::numeric * opened_size - opened_amount) > 0 AS profitable FROM positions WHERE id=$2`, [a.price, a.position_id]);
      if (!g[0].profitable) {
        throw new Error(`closing at a loss is forbidden: net ≤ 0. To force a finish, pass force=true.`);
      }
    }
    try {
      const { rows } = await client.query(
        `INSERT INTO orders (position_id, pair, side, action, status, start_size, start_amount, start_price, params_version, reason)
         VALUES ($1,$2,$3,'close','active', $4, ($4::numeric*$5::numeric), $5, $6, $7) RETURNING *`,
        [a.position_id, p.pair, p.side, p.opened_size, a.price, p.params_version, a.reason ?? null]);
      return rows[0];
    } catch (e) { rethrowActiveOrderConflict(e, a.position_id); }
  });
}

// cancel_order: order → cancelled. If it's an open order and there are no other completed orders — position → cancelled.
export async function cancelOrder(a) {
  return transaction(async (client) => {
    const { rows: ord } = await client.query(
      `UPDATE orders SET status='cancelled', status_at=now(), reason=$2 WHERE id=$1 AND status='active' RETURNING *`,
      [a.order_id, a.reason ?? null]);
    const order = ord[0];
    if (!order) throw new Error(`active order #${a.order_id} not found`);
    let position = null;
    if (order.action === 'open') {
      const { rows: cnt } = await client.query(
        `SELECT count(*)::int AS c FROM orders WHERE position_id=$1 AND status='completed'`, [order.position_id]);
      if (cnt[0].c === 0) {
        const { rows: pc } = await client.query(
          `UPDATE positions SET status='cancelled', status_at=now(), reason=$2 WHERE id=$1 RETURNING *`,
          [order.position_id, a.reason ?? null]);
        position = pc[0];
      }
    }
    return { order, position };
  });
}

// log_tick: writes a tick_log row from the decision's output JSON (+ pair, params_version).
// Signature: logTick(pair, d) — no pool (ambient query).
export async function logTick(pair, d) {
  const f = d.features || {};
  const { rows } = await query(
    `INSERT INTO tick_log
       (pair, regime, action, close, live_close, high_24h, atr_pct, daily_vol_pct, adx, adx_mult,
        crsi, crsi_min_3h, fng, btc_dom, expected_move_pct,
        confidence, reason, applied_lessons, position_id, params_version, live_bid, live_ask, raw_decision)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING id`,
    [pair, d.regime, d.action, f.close ?? null, f.live_close ?? null, f.high_24h ?? null,
     f.atr_pct ?? null, f.daily_vol_pct ?? null, f.adx ?? null, f.adx_mult ?? null,
     f.crsi ?? null, f.crsi_min_3h ?? null, f.fng ?? null, f.btc_dom ?? null, d.expected_move_pct ?? null,
     d.confidence ?? null, d.reason ?? null,
     d.applied_lessons ? JSON.stringify(d.applied_lessons) : null,
     d.position_id ?? null,
     d.params_version, d.live_bid ?? null, d.live_ask ?? null, JSON.stringify(d)]);
  return { ok: true, tick_id: rows[0].id };
}
