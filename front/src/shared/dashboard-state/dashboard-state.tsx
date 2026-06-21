import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_TIMEFRAME, type Timeframe } from '@/shared/config';

interface DashboardState {
  selectedPair: string | null;
  setSelectedPair: (p: string) => void;
  timeframe: Timeframe;
  setTimeframe: (t: Timeframe) => void;
}

const Ctx = createContext<DashboardState | null>(null);

export function DashboardStateProvider({ children }: { children: ReactNode }) {
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>(DEFAULT_TIMEFRAME);
  const value = useMemo(
    () => ({ selectedPair, setSelectedPair, timeframe, setTimeframe }),
    [selectedPair, timeframe],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboardState(): DashboardState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDashboardState must be used within DashboardStateProvider');
  return v;
}
