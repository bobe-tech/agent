import { useState } from 'react';
import { Tabs, ScrollShadow } from '@heroui/react';
import { usePnl, usePortfolioPnl } from '@/entities/pnl';
import type { PnlSummary } from '@/entities/pnl';
import { useDashboardState } from '@/shared/dashboard-state';
import { formatUsd, formatPct } from '@/shared/lib/format';
import { StatCard, type StatCardProps, type Trend } from './StatCard.js';

const trendOf = (v: number | null | undefined): Trend => (v == null || v === 0 ? 'neutral' : v > 0 ? 'up' : 'down');
const usdBadge = (v: number | null | undefined): string | undefined => (v == null ? undefined : formatUsd(v));

// 4 widgets from the PnL summary. Unified look: main value in %, badge shows the amount in USDT (where applicable).
function buildCards(s: PnlSummary | undefined): Omit<StatCardProps, 'loading' | 'error'>[] {
  return [
    {
      title: 'Realized PnL',
      value: formatPct(s?.realized_pct),
      badge: usdBadge(s?.realized_usd),
      trend: trendOf(s?.realized_pct),
      hint: 'Closed positions',
    },
    {
      title: 'Unrealized PnL',
      value: formatPct(s?.unrealized_pct),
      badge: usdBadge(s?.unrealized_usd),
      trend: trendOf(s?.unrealized_pct),
      hint: 'Open positions',
    },
    {
      title: 'ROI',
      value: formatPct(s?.roi_pct),
      badge: usdBadge(s?.total_usd),
      trend: trendOf(s?.roi_pct),
      hint: `On capital ${formatUsd(s?.base_usd)}`,
    },
    {
      title: 'APR',
      // no data for the annual projection → show 0%, like ROI (not a dash)
      value: formatPct(s?.apr_pct ?? 0),
      trend: trendOf(s?.apr_pct),
      hint: (() => {
        const d = Math.round(s?.days_active ?? 0);
        return `Over ${d} ${d === 1 ? 'day' : 'days'}`;
      })(),
    },
  ];
}

export function StatsSection() {
  const { selectedPair } = useDashboardState();
  const [mode, setMode] = useState<'pair' | 'portfolio'>('pair');
  const isPair = mode === 'pair';
  // Poll only the active tab: the inactive mode doesn't fire a request (enabled=false).
  const pairQ = usePnl(selectedPair, isPair);
  const portQ = usePortfolioPnl(!isPair);

  const summary = isPair ? pairQ.data : portQ.data?.total;
  const loading = isPair ? pairQ.isLoading : portQ.isLoading;
  const error = isPair ? pairQ.isError : portQ.isError;
  const cards = buildCards(summary);

  return (
    <section className="space-y-3">
      <Tabs selectedKey={mode} onSelectionChange={(k) => setMode(k as 'pair' | 'portfolio')}>
        {/* w-fit — tabs sized to content, aligned left rather than spanning the full container width */}
        <ScrollShadow orientation="horizontal" hideScrollBar className="w-fit max-w-full">
          <Tabs.ListContainer className="w-fit">
            <Tabs.List aria-label="Statistics mode">
              <Tabs.Tab id="pair" className="whitespace-nowrap">
                Pair stats
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="portfolio" className="whitespace-nowrap">
                Portfolio stats
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </ScrollShadow>
      </Tabs>
      {/* Mobile: horizontal scroll with a peek at the next card; ≥sm — grid. */}
      <ScrollShadow orientation="horizontal" hideScrollBar className="pb-1">
        <div className="grid grid-flow-col auto-cols-[78%] gap-4 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <StatCard key={c.title} {...c} loading={loading} error={error} />
          ))}
        </div>
      </ScrollShadow>
    </section>
  );
}
