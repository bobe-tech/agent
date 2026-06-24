import Big from 'big.js';
import type { ClosedPnlRow, OpenPnlRow, PnlSummary } from '../types.js';

export interface SideQuote {
  bid: number;
  ask: number;
}

// Unrealized PnL for a position, marked to the exit price from the live quote (spread included):
// LONG is valued at bid (the sell price), SHORT at ask (the buy-back price).
// LONG: (bid/opened_price − 1)·opened_amount; SHORT: (1 − ask/opened_price)·opened_amount.
// No quote, or opened_price null/0 → Big(0).
function unrealizedFor(p: OpenPnlRow, q: SideQuote | null | undefined): Big {
  if (!q || !p.opened_price || !p.opened_amount) return Big(0);
  const mark = p.side === 'LONG' ? q.bid : q.ask;
  if (!Number.isFinite(mark) || mark <= 0) return Big(0);
  const markBig = Big(String(mark));
  const priceBig = Big(p.opened_price);
  const amountBig = Big(p.opened_amount);
  if (priceBig.eq(0) || amountBig.eq(0)) return Big(0);
  const pct = p.side === 'LONG'
    ? markBig.div(priceBig).minus(1)
    : Big(1).minus(markBig.div(priceBig));
  return pct.times(amountBig);
}

export interface PnlBaseOpts {
  base: number; // capital base (sum of sizes_usd) — the ROI/APR denominator; 0 → percentages null
  firstTradeMs?: number | null; // ms of the first trade (for APR); null → apr null
  nowMs?: number; // current time (deterministic for tests)
}

export function summarizePnl(
  closed: ClosedPnlRow[],
  open: OpenPnlRow[],
  quotes: Record<string, SideQuote | null | undefined>,
  opts: PnlBaseOpts = { base: 0 },
): PnlSummary {
  const realized_big = closed.reduce(
    (s, t) => s.plus(t.realized_pnl_usd != null ? Big(t.realized_pnl_usd) : Big(0)),
    Big(0),
  );
  const realized_usd = realized_big.toNumber();

  const wins = closed.filter((t) => t.realized_pnl_usd != null && Big(t.realized_pnl_usd).gt(0)).length;

  const pctValues = closed
    .map((t) => t.realized_pnl_pct)
    .filter((v): v is string => v != null);
  const avg_pnl_pct = pctValues.length
    ? pctValues.reduce((a, b) => a.plus(Big(b)), Big(0)).div(pctValues.length).toNumber()
    : null;

  const unrealized_big = open.reduce(
    (s, p) => s.plus(unrealizedFor(p, quotes[p.pair])),
    Big(0),
  );
  const unrealized_usd = unrealized_big.toNumber();

  const total_usd = realized_big.plus(unrealized_big).toNumber();

  const base = opts.base > 0 ? opts.base : 0;
  const baseBig = Big(base);
  const pct = (v: Big): number | null => (base > 0 ? v.div(baseBig).times(100).toNumber() : null);

  const realized_pct = pct(realized_big);
  const nowMs = opts.nowMs ?? Date.now();
  const days_active =
    opts.firstTradeMs != null ? Math.max(1, (nowMs - opts.firstTradeMs) / 86_400_000) : null;
  const apr_pct = realized_pct != null && days_active ? Big(realized_pct).div(days_active).times(365).toNumber() : null;

  return {
    realized_usd,
    unrealized_usd,
    total_usd,
    base_usd: base,
    realized_pct,
    unrealized_pct: pct(unrealized_big),
    roi_pct: pct(realized_big.plus(unrealized_big)),
    apr_pct,
    closed_count: closed.length,
    open_count: open.length,
    win_rate: closed.length ? wins / closed.length : null,
    avg_pnl_pct,
    days_active,
  };
}
