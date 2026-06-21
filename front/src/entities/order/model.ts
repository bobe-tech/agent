export interface Order {
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
