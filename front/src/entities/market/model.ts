export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PriceInfo {
  pair: string;
  last: number;
  time: number;
  prev_close: number | null;
}
