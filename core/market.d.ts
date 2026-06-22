export interface PairCfg {
  base: string;
  quote: string;
  symbol: string;
  token?: string;
  decimals?: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface AdxMultCfg {
  threshold?: number;
  lo?: number;
  hi?: number;
}

export interface CrsiPeriods {
  rsi_period?: number;
  streak_period?: number;
  rank_period?: number;
}

export interface MarketFeatures {
  latest_bar: { ts: number; open: number; high: number; low: number; close: number };
  last_raw_closed: boolean;
  close: number;
  live_close: number;
  high_24h: number | null;
  atr_pct: number | null;
  daily_vol_pct: number | null;
  adx: number | null;
  adx_mult: number | null;
  crsi: number | null;
  base: string;
  quote: string;
  token_address?: string;
}

export function getCandles(
  pairCfg: PairCfg,
  opts?: { timeframe?: string; limit?: number },
): Promise<Candle[]>;

export function computeFeatures(
  allBars: Array<{ ts: number; o: number; h: number; l: number; c: number; v?: number }>,
  opts?: {
    now_sec?: number;
    period?: number;
    crsi_periods?: CrsiPeriods;
    adx_mult?: AdxMultCfg;
    high_window_hours?: number;
  },
): Omit<MarketFeatures, 'base' | 'quote' | 'token_address'>;

export function getMarket(
  pairCfg: PairCfg,
  opts?: {
    timeframe?: string;
    limit?: number;
    now_sec?: number;
    crsi_periods?: CrsiPeriods;
    adx_mult?: AdxMultCfg;
    high_window_hours?: number;
  },
): Promise<MarketFeatures>;
