export interface ParamsRow {
  version: number;
  pair: string;
  is_active: boolean;
  config: Record<string, unknown>;
  source: string;
  reason: string | null;
  created_at: string;
}

export interface PairSummary {
  pair: string;
  active_version: number | null;
}

export interface PositionRow {
  id: string;
  created_at: string;
  pair: string;
  side: 'LONG' | 'SHORT';
  status: 'active' | 'completed' | 'cancelled';
  status_at: string | null;
  opened_size: string | null;
  opened_amount: string | null;
  opened_price: string | null;
  closed_size: string | null;
  closed_amount: string | null;
  closed_price: string | null;
  realized_pnl_usd: string | null;
  realized_pnl_pct: string | null;
  reason: string | null;
  force_closed: boolean;
  regime_at_entry: string;
  features_at_entry: Record<string, unknown> | null;
  expected_move_pct: string | null;
  params_version: number | null;
}

export interface ReflectionRow {
  id: string;
  pair: string;
  ts: string;
  summary: string;
  payload: Record<string, unknown> | null;
}

export interface TickRow {
  id: string;
  pair: string;
  ts: string;
  regime: string;
  action: 'OPEN_LONG' | 'OPEN_SHORT' | 'ADD' | 'CLOSE' | 'HOLD';
  close: number | null;
  atr_pct: number | null;
  adx: number | null;
  crsi: number | null;
  confidence: number | null;
  reason: string | null;
  position_id: string | null;
  live_bid: number | null;
  live_ask: number | null;
}

export interface ClosedPnlRow {
  pair: string;
  realized_pnl_usd: string | null;
  realized_pnl_pct: string | null;
}

export interface OpenPnlRow {
  pair: string;
  side: 'LONG' | 'SHORT';
  opened_amount: string | null;
  opened_price: string | null;
}

export interface PnlSummary {
  realized_usd: number;
  unrealized_usd: number;
  total_usd: number;
  base_usd: number; // capital base (sum of sizes_usd) — the ROI/APR denominator
  realized_pct: number | null; // realized_usd / base
  unrealized_pct: number | null; // unrealized_usd / base
  roi_pct: number | null; // total_usd / base (overall return on capital)
  apr_pct: number | null; // annualized projection of realized ROI
  closed_count: number;
  open_count: number;
  win_rate: number | null; // share of profitable trades among closed, 0..1; null if there are no closed
  avg_pnl_pct: number | null;
  days_active: number | null; // days since the first trade (for APR)
}

export interface OrderRow {
  id: string;
  created_at: string;
  position_id: string;
  pair: string;
  side: 'LONG' | 'SHORT';
  action: 'open' | 'add' | 'close';
  status: 'active' | 'completed' | 'cancelled';
  status_at: string | null;
  start_size: string | null;
  start_amount: string | null;
  start_price: string | null;
  comp_size: string | null;
  comp_amount: string | null;
  comp_price: string | null;
  tx_id: string | null;
  params_version: number | null;
  reason: string | null;
}
