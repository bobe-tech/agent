import type { Position } from '@/entities/position';

export interface AvgLine {
  price: number;
  side: 'LONG' | 'SHORT';
}

// opened_price values of active positions — for horizontal lines on the chart.
export function openAvgEntries(positions: Position[]): AvgLine[] {
  return positions
    .filter((p) => p.status === 'active' && Number.isFinite(Number(p.opened_price)))
    .map((p) => ({ price: Number(p.opened_price), side: p.side }));
}
