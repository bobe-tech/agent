export type TickAction = 'OPEN_LONG' | 'OPEN_SHORT' | 'ADD' | 'CLOSE' | 'HOLD';

export interface Tick {
  id: string;
  pair: string;
  ts: string;
  regime: string;
  action: TickAction;
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
