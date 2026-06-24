export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PriceInfo {
  pair: string;
  bid: number;
  ask: number;
  mid: number;
  ts: number;
}
