import { openAvgEntries } from './avg-lines.js';
import type { Position } from '@/entities/position';

const base: Omit<Position, 'id' | 'side' | 'status' | 'opened_price'> = {
  pair: 'ETH/USDT',
  created_at: '', status_at: null,
  opened_size: null, opened_amount: null,
  closed_size: null, closed_amount: null, closed_price: null,
  realized_pnl_usd: null, realized_pnl_pct: null,
  reason: null, force_closed: false,
  regime_at_entry: 'RANGE', expected_move_pct: null, params_version: 1,
};

it('takes opened_price only from active positions', () => {
  const positions: Position[] = [
    { ...base, id: '1', side: 'LONG', status: 'active', opened_price: '2500' },
    { ...base, id: '2', side: 'SHORT', status: 'completed', opened_price: '2400' },
  ];
  expect(openAvgEntries(positions)).toEqual([{ price: 2500, side: 'LONG' }]);
});
