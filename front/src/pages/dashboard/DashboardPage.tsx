import { useDashboardState } from '@/shared/dashboard-state';
import { StatsSection } from '@/widgets/stats-section';
import { CandlesChart } from '@/widgets/candles-chart';
import { DataPanel } from '@/widgets/data-panel';

export function DashboardPage() {
  const { selectedPair } = useDashboardState();
  return (
    <div className="space-y-6" data-testid="dashboard-root">
      <StatsSection />
      <CandlesChart pair={selectedPair} />
      <DataPanel pair={selectedPair} />
    </div>
  );
}
