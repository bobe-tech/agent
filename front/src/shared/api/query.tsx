import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { toast } from '@heroui/react';
import { ApiError } from './client.js';

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    // 5xx outward — generic text (details are already in server logs); 4xx — the actual backend message.
    return error.status >= 500 ? 'Server Error' : error.message;
  }
  return 'Network Error';
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        // Globally show a toast on any failed query. The provider's maxVisibleToasts
        // limits the number of simultaneously visible toasts, so there will be no spam.
        queryCache: new QueryCache({
          onError: (error) => {
            toast.danger(messageFor(error));
          },
        }),
        // refetchIntervalInBackground:false — polling (refetchInterval) is PAUSED when the browser
        // tab is inactive (TanStack uses the Page Visibility API via focusManager; this is its
        // default, set explicitly). A hidden tab does not hit the API/DB; on return it refreshes immediately.
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, refetchIntervalInBackground: false, staleTime: 10_000 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
