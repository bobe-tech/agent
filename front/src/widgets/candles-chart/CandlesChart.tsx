import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
  type CandlestickData,
} from 'lightweight-charts';
import { useCandles } from '@/entities/market';
import { usePositions } from '@/entities/position';
import { useDashboardState } from '@/shared/dashboard-state';
import { Card, ToggleButtonGroup, ToggleButton, Skeleton } from '@heroui/react';
import { TIMEFRAMES } from '@/shared/config';
import { formatPrice } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { openAvgEntries } from './avg-lines.js';

interface Ohlc {
  open: number;
  high: number;
  low: number;
  close: number;
}

export function CandlesChart({ pair }: { pair: string | null }) {
  const { timeframe, setTimeframe } = useDashboardState();
  const { data: candlesData, isLoading } = useCandles(pair, timeframe);
  const { data: posData } = usePositions(pair);
  const [legend, setLegend] = useState<Ohlc | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const lastBarRef = useRef<Ohlc | null>(null);

  // Initialize the chart once + subscribe to crosshair for the OHLC legend.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#a1a1aa' },
      grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } },
      autoSize: true,
      rightPriceScale: { borderColor: '#27272a' },
      timeScale: { borderColor: '#27272a' },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
      priceLineColor: '#3b82f6', // current price line is blue so it doesn't blend with LONG (green)
    });
    chartRef.current = chart;
    seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      const d = param.seriesData.get(series) as CandlestickData<UTCTimestamp> | undefined;
      setLegend(d ? { open: d.open, high: d.high, low: d.low, close: d.close } : lastBarRef.current);
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
    };
  }, []);

  // Candle data. On pair/tf change candlesData=undefined → clear the series (no stale candles).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const candles = candlesData?.candles ?? [];
    series.setData(
      candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
    const last = candles.at(-1);
    lastBarRef.current = last ? { open: last.open, high: last.high, low: last.low, close: last.close } : null;
    setLegend(lastBarRef.current);
    if (candles.length) chartRef.current?.timeScale().fitContent();
  }, [candlesData]);

  // Average entry price lines for open positions (recreated when positions change).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const l of linesRef.current) series.removePriceLine(l);
    linesRef.current = openAvgEntries(posData?.positions ?? []).map((l) =>
      series.createPriceLine({
        price: l.price,
        color: l.side === 'LONG' ? '#10b981' : '#ef4444',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        // Side label (LONG/SHORT) on the entry line — built-in lightweight-charts mechanism;
        // the line color (green/red) already conveys meaning, the text improves readability.
        title: l.side,
      }),
    );
  }, [posData]);

  return (
    <Card>
      {/* p-0 on Card.Content: chart flush to the card edges; padding is only needed for the
          timeframe panel at the top, so we set padding locally on it rather than the whole card */}
      <Card.Content className="p-0">
        <div className="p-2 pb-0">
          <ToggleButtonGroup
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={new Set([timeframe])}
            onSelectionChange={(keys) => {
              const v = [...keys][0];
              if (v) setTimeframe(v as typeof timeframe);
            }}
          >
            {TIMEFRAMES.map((t) => (
              <ToggleButton key={t.value} id={t.value} size="sm" aria-label={t.label}>
                {t.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </div>
        <div className="relative">
          {/* Skeleton over the chart area while candles are loading. */}
          {isLoading && <Skeleton className="absolute inset-0 z-10 rounded-lg" />}
          {legend && <ChartLegend ohlc={legend} />}
          <div style={{ height: '360px' }} className="w-full" data-testid="chart-container">
            <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}

function ChartLegend({ ohlc }: { ohlc: Ohlc }) {
  const delta = ohlc.close - ohlc.open;
  const deltaPct = ohlc.open ? (delta / ohlc.open) * 100 : 0;
  const up = delta >= 0;
  const cls = up ? 'text-emerald-500' : 'text-red-500';
  return (
    <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums">
      <span className="text-muted">O <span className="text-foreground">{formatPrice(ohlc.open)}</span></span>
      <span className="text-muted">H <span className="text-foreground">{formatPrice(ohlc.high)}</span></span>
      <span className="text-muted">L <span className="text-foreground">{formatPrice(ohlc.low)}</span></span>
      <span className="text-muted">C <span className="text-foreground">{formatPrice(ohlc.close)}</span></span>
      <span className={cn('font-medium', cls)}>
        {up ? '+' : '−'}
        {formatPrice(Math.abs(delta))} ({up ? '+' : ''}
        {deltaPct.toFixed(2)}%)
      </span>
    </div>
  );
}
