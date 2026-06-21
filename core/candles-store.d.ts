export interface CandleInput {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

export interface RawBar {
  ts: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export function upsertCandles(pair: string, tf: string, bars: CandleInput[]): Promise<number>;
export function pruneOldCandles(tf: string, days: number): Promise<number>;
export function readCandles(pair: string, tf: string, limit: number): Promise<RawBar[]>;
