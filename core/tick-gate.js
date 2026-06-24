// Pre-filter gate: decide whether a tick can possibly require the LLM agent, or is a guaranteed HOLD.
//
// The ATR threshold is the FIRST necessary condition of every action (entry/averaging/exit), so if it
// provably fails we skip the (expensive) agent and log a HOLD directly. The gate only ever checks the
// NECESSARY ATR condition — it never decides to trade — so it can never skip a tick the agent would act on.
//
// This module is PURE: no DB, no network. All IO (market, position, twak bid, logging) is done by the
// caller (bin/tick-gate.mjs) and passed in, which keeps the decision fully unit-testable.

const num = (v) => (v == null ? null : Number(v));

// adds_count per strategy §6: completed open+add legs minus the initial open.
// after open only (1 leg) → 0 ; after open+avg1 (2 legs) → 1.
export function addsCount(orders = []) {
  const legs = orders.filter((o) => ['open', 'add'].includes(o.action) && o.status === 'completed').length;
  return legs - 1;
}

// Regime label (strategy §4) — a journal label only, for the tick_log row the gate writes on SKIP.
// adx above the band threshold → trend (UP if at/above the recent high, else DOWN); otherwise RANGE.
export function regimeLabel(market = {}, config = {}) {
  const adx = num(market.adx);
  const threshold = num(config.adx_mult_threshold) ?? 30;
  if (adx == null) return 'RANGE';
  if (adx > threshold) {
    const live_close = num(market.live_close);
    const high_24h = num(market.high_24h);
    if (live_close != null && high_24h != null) return live_close >= high_24h ? 'UP_TREND' : 'DOWN_TREND';
    return 'UP_TREND';
  }
  return 'RANGE';
}

// Decide RUN/SKIP for one tick.
//   position: the open position row (with nested `orders`), or null if none.
//   market:   getMarket() output (live_close, high_24h, atr_pct=hv, daily_vol_pct=dv, adx_mult, ...).
//   config:   the active params config (max_adds, avg2_atr_mult, ...).
//   fetchBid: async () => number|null — live twak bid (base→USDT), called ONLY for the take-profit check.
// Returns { decision:'RUN'|'SKIP', branch, reason, checks }.
export async function gateDecision({ position, market, config, fetchBid }) {
  const hv = num(market?.atr_pct);
  const dv = num(market?.daily_vol_pct);
  const adx_mult = num(market?.adx_mult);
  const live_close = num(market?.live_close);

  // Warm-up: without hv/adx_mult/live_close no threshold can be computed → guaranteed HOLD.
  if (hv == null || adx_mult == null || live_close == null) {
    return { decision: 'SKIP', branch: 'warmup',
      reason: 'pre-filter SKIP: warm-up (hv/adx_mult/live_close null)', checks: { hv, adx_mult, live_close } };
  }

  // ── BRANCH A: no open position → only OPEN is possible ──────────────────────
  if (!position) {
    const high_24h = num(market?.high_24h);
    if (high_24h == null || high_24h <= 0) {
      return { decision: 'RUN', branch: 'entry', reason: 'fail-open: high_24h unavailable', checks: { high_24h } };
    }
    const entry_drop_pct = ((high_24h - live_close) / high_24h) * 100;
    const entry_gate = hv * adx_mult;
    const checks = { entry_drop_pct, entry_gate, hv, adx_mult, high_24h, live_close };
    if (entry_drop_pct >= entry_gate) {
      return { decision: 'RUN', branch: 'entry',
        reason: `entry candidate: drop ${entry_drop_pct.toFixed(2)}% >= gate ${entry_gate.toFixed(2)}%`, checks };
    }
    return { decision: 'SKIP', branch: 'entry',
      reason: `pre-filter SKIP: entry_drop ${entry_drop_pct.toFixed(2)}% < gate ${entry_gate.toFixed(2)}%`, checks };
  }

  // ── BRANCH B: open position → ADD / CLOSE(TP) / reconciliation ──────────────
  if (position.error) {
    return { decision: 'SKIP', branch: 'manage',
      reason: 'pre-filter SKIP: position error=true (awaiting human)', checks: {} };
  }
  const orders = position.orders || [];
  if (orders.some((o) => o.status === 'active')) {
    return { decision: 'RUN', branch: 'manage', reason: 'reconcile: active order present', checks: {} };
  }

  const opened_price = num(position.opened_price);
  if (opened_price == null || opened_price <= 0) {
    return { decision: 'RUN', branch: 'manage', reason: 'fail-open: opened_price unavailable', checks: { opened_price } };
  }
  const adds_count = addsCount(orders);
  const max_adds = num(config?.max_adds) ?? 2;
  const dd_pct = ((opened_price - live_close) / opened_price) * 100;

  // ADD ATR gate (next leg by adds_count). dv may be null (warm-up) → ADD not computable → not possible.
  let add_threshold = null;
  if (adds_count < max_adds && dv != null) {
    const next = adds_count + 1; // 1 → avg1, 2 → avg2 (deeper)
    add_threshold = next === 1 ? dv * adx_mult : num(config?.avg2_atr_mult) * dv * adx_mult;
  }
  const addPossible = add_threshold != null && dd_pct >= add_threshold;
  const base = { dd_pct, add_threshold, adds_count, max_adds, opened_price, live_close };
  if (addPossible) {
    return { decision: 'RUN', branch: 'manage',
      reason: `add candidate: dd ${dd_pct.toFixed(2)}% >= ${add_threshold.toFixed(2)}%`, checks: base };
  }

  // Take-profit ATR gate — needs the live twak bid (base→USDT). TP requires price ABOVE the average,
  // so a position underwater (bid <= opened_price) can never take profit → SKIP. Bid > avg → RUN.
  const bid = await fetchBid();
  if (bid == null || !Number.isFinite(bid)) {
    return { decision: 'RUN', branch: 'manage', reason: 'fail-open: twak bid unavailable', checks: base };
  }
  if (bid > opened_price) {
    return { decision: 'RUN', branch: 'manage',
      reason: `tp possible: bid ${bid} > avg ${opened_price}`, checks: { ...base, bid } };
  }
  return { decision: 'SKIP', branch: 'manage',
    reason: `pre-filter SKIP: dd ${dd_pct.toFixed(2)}% < add ${add_threshold == null ? 'n/a' : add_threshold.toFixed(2)}; bid ${bid} <= avg ${opened_price}`,
    checks: { ...base, bid } };
}
