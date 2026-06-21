// Pure indicator functions over an array of bars (ascending by ts): {ts,o,h,l,c,v}.
// All functions return null when there is not enough data.

export function sma(bars, n) {
  if (!bars || bars.length < n) return null;
  return bars.slice(-n).reduce((a, b) => a + b.c, 0) / n;
}

// SMA(n) shifted back by `lag` bars (for estimating slope).
export function smaPrev(bars, n, lag) {
  if (!bars || bars.length < n + lag) return null;
  return sma(bars.slice(0, bars.length - lag), n);
}

// Highest high over the last n bars.
export function hh(bars, n) {
  if (!bars || bars.length < n) return null;
  return Math.max(...bars.slice(-n).map((b) => b.h));
}

// Lowest low over the last n bars.
export function ll(bars, n) {
  if (!bars || bars.length < n) return null;
  return Math.min(...bars.slice(-n).map((b) => b.l));
}

// Wilder RSI(n) over an arbitrary numeric array of values. null when there is not enough data.
export function rsiValues(values, n = 14) {
  if (!values || values.length < n + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / n, avgLoss = loss / n;
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (n - 1) + (d > 0 ? d : 0)) / n;
    avgLoss = (avgLoss * (n - 1) + (d < 0 ? -d : 0)) / n;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Connors signed-streak series over closing prices: +k — the k-th consecutive up bar,
// -k — down, 0 — no change. streak[0]=0.
export function streakSeries(closes) {
  const out = [0];
  for (let i = 1; i < closes.length; i++) {
    const prev = out[i - 1];
    if (closes[i] > closes[i - 1]) out.push(prev > 0 ? prev + 1 : 1);
    else if (closes[i] < closes[i - 1]) out.push(prev < 0 ? prev - 1 : -1);
    else out.push(0);
  }
  return out;
}

// Connors PercentRank: the fraction of the previous `lookback` values that are STRICTLY less than the last one, in %.
export function percentRank(values, lookback) {
  if (!values || values.length < lookback + 1) return null;
  const cur = values[values.length - 1];
  const window = values.slice(values.length - 1 - lookback, values.length - 1);
  const less = window.filter((v) => v < cur).length;
  return (less / lookback) * 100;
}

// Connors RSI = ( RSI(close,Prsi) + RSI(streak,Pstreak) + PercentRank(ROC1,Prank) ) / 3.
// closes — closing prices (ascending). null when there is not enough data (need ≥ rank_period+2 closes).
export function connorsRsi(closes, { rsi_period = 3, streak_period = 2, rank_period = 100 } = {}) {
  if (!closes || closes.length < Math.max(rsi_period + 1, streak_period + 1, rank_period + 2)) return null;
  const priceRsi = rsiValues(closes, rsi_period);
  const streakRsi = rsiValues(streakSeries(closes), streak_period);
  const roc = [];
  for (let i = 1; i < closes.length; i++) roc.push((closes[i] - closes[i - 1]) / closes[i - 1] * 100);
  const rank = percentRank(roc, rank_period);
  if (priceRsi == null || streakRsi == null || rank == null) return null;
  return (priceRsi + streakRsi + rank) / 3;
}

// Wilder ATR(n): returns { atr_abs, atr_pct, last_close } or null.
export function wilderAtr(bars, n = 14) {
  if (!bars || bars.length < n + 1) return null;
  const tr = [];
  for (let i = 1; i < bars.length; i++) {
    const { h, l } = bars[i];
    const pc = bars[i - 1].c;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let atr = tr.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < tr.length; i++) atr = (atr * (n - 1) + tr[i]) / n;
  const lastClose = bars[bars.length - 1].c;
  return { atr_abs: atr, atr_pct: (atr / lastClose) * 100, last_close: lastClose };
}

// Wilder ADX(n). Returns the last ADX value or null when there is not enough data.
// Need >= 2n+1 bars for a stable value.
export function adx(bars, n = 14) {
  if (!bars || bars.length < 2 * n + 1) return null;
  const plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].h - bars[i - 1].h;
    const down = bars[i - 1].l - bars[i].l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const pc = bars[i - 1].c;
    tr.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - pc), Math.abs(bars[i].l - pc)));
  }
  // Wilder smoothing: first sum over n, then s = s - s/n + x.
  const smooth = (arr) => {
    let s = arr.slice(0, n).reduce((a, b) => a + b, 0);
    const out = [s];
    for (let i = n; i < arr.length; i++) { s = s - s / n + arr[i]; out.push(s); }
    return out;
  };
  const trS = smooth(tr), pS = smooth(plusDM), mS = smooth(minusDM);
  const dx = [];
  for (let i = 0; i < trS.length; i++) {
    const plusDI = trS[i] === 0 ? 0 : 100 * (pS[i] / trS[i]);
    const minusDI = trS[i] === 0 ? 0 : 100 * (mS[i] / trS[i]);
    const denom = plusDI + minusDI;
    dx.push(denom === 0 ? 0 : 100 * Math.abs(plusDI - minusDI) / denom);
  }
  if (dx.length < n) return null;
  // ADX = Wilder-smoothed DX.
  let adxVal = dx.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < dx.length; i++) adxVal = (adxVal * (n - 1) + dx[i]) / n;
  return adxVal;
}
