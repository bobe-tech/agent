export interface PnlSummary {
  realized_usd: number;
  unrealized_usd: number;
  total_usd: number;
  base_usd: number;
  realized_pct: number | null;
  unrealized_pct: number | null;
  roi_pct: number | null;
  apr_pct: number | null;
  closed_count: number;
  open_count: number;
  win_rate: number | null;
  avg_pnl_pct: number | null;
  days_active: number | null;
}

export interface PortfolioPnl {
  total: PnlSummary;
  by_pair: (PnlSummary & { pair: string })[];
}
