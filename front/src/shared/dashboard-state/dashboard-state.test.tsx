// useDashboardState — context for the selected pair and timeframe. We verify the guard outside the provider
// and state updates inside it.
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DashboardStateProvider, useDashboardState } from './dashboard-state';
import { DEFAULT_TIMEFRAME } from '@/shared/config';

const wrapper = ({ children }: { children: ReactNode }) => (
  <DashboardStateProvider>{children}</DashboardStateProvider>
);

describe('useDashboardState', () => {
  it('throws a meaningful error outside the provider', () => {
    expect(() => renderHook(() => useDashboardState())).toThrow(/must be used within DashboardStateProvider/);
  });

  it('starts with selectedPair=null and the default timeframe', () => {
    const { result } = renderHook(() => useDashboardState(), { wrapper });
    expect(result.current.selectedPair).toBeNull();
    expect(result.current.timeframe).toBe(DEFAULT_TIMEFRAME);
  });

  it('setSelectedPair updates the selected pair', () => {
    const { result } = renderHook(() => useDashboardState(), { wrapper });
    act(() => result.current.setSelectedPair('WBNB/USDT'));
    expect(result.current.selectedPair).toBe('WBNB/USDT');
  });

  it('setTimeframe updates the timeframe', () => {
    const { result } = renderHook(() => useDashboardState(), { wrapper });
    act(() => result.current.setTimeframe('4h'));
    expect(result.current.timeframe).toBe('4h');
  });
});
