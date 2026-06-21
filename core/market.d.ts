export interface PairCfg {
  network: string;
  pool: string;
  base: string;
  quote: string;
  token?: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketFeatures {
  latest_bar: { ts: number; open: number; high: number; low: number; close: number };
  close: number;
  atr_pct: number | null;
  daily_vol_pct: number | null;
  crsi: number | null;
  sma20: number | null;
  sma50: number | null;
  adx: number | null;
  base: string;
  quote: string;
  token_address?: string;
}

export function getCandles(
  pairCfg: PairCfg,
  opts?: { timeframe?: string; limit?: number },
): Promise<Candle[]>;

export function getMarket(
  pairCfg: PairCfg,
  opts?: { slope_lag?: number; timeframe?: string; limit?: number; now_sec?: number; crsi_periods?: Record<string, number> },
): Promise<MarketFeatures>;
