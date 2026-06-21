export const POLLING = { price: 15_000, market: 15_000, data: 30_000 } as const;

// Strategy on H1; 1h is stored natively, 4h/1d are resampled from 1h. 15m is not used (removed).
export const TIMEFRAMES = [
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1d' },
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number]['value'];

export const DEFAULT_TIMEFRAME: Timeframe = '1h';
