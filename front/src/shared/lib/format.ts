const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

// signed=true adds an explicit "+" for positives (for PnL — a non-color hint of the sign).
export function formatUsd(v: number | null | undefined, opts?: { signed?: boolean }): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = usd.format(v);
  return opts?.signed && v > 0 ? `+${s}` : s;
}

export function formatPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

export function formatPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v >= 100) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (v <= 0) return '0.00';
  // Small prices (BSC memecoins): show ~4 significant digits without losing precision.
  const digits = Math.min(12, Math.max(6, 2 - Math.floor(Math.log10(v))));
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}
