import { type ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Toast } from '@heroui/react';
import { QueryProvider } from '@/shared/api/query';
import { DashboardStateProvider } from '@/shared/dashboard-state';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <QueryProvider>
        <DashboardStateProvider>{children}</DashboardStateProvider>
        {/* Global HeroUI toaster — one per app, invoked via toast(...) from anywhere. */}
        <Toast.Provider placement="top" />
      </QueryProvider>
    </BrowserRouter>
  );
}
