export interface Position {
  id: string;
  pair: string;
  side: 'LONG' | 'SHORT';
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
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
  expected_move_pct: string | null;
  params_version: number;
}
