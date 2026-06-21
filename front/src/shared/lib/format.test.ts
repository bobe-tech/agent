import { formatUsd, formatPct, formatPrice, formatDateTime } from './format.js';

describe('format helpers', () => {
  it('formatUsd', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(null)).toBe('—');
  });
  it('formatPct with sign', () => {
    expect(formatPct(2.5)).toBe('+2.50%');
    expect(formatPct(-1)).toBe('-1.00%');
    expect(formatPct(null)).toBe('—');
  });
  it('formatPrice adaptive precision', () => {
    expect(formatPrice(2500)).toBe('2,500.00');
    expect(formatPrice(0.12345)).toBe('0.123450');
    expect(formatPrice(undefined)).toBe('—');
  });
  it('formatDateTime', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('—');
    expect(formatDateTime('2026-06-19T10:00:00Z')).not.toBe('—');
  });
});
