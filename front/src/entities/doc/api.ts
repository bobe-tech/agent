import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import type { Doc, DocName } from './model.js';

// Docs are static markdown files — fetch once and keep them fresh for the session (no polling).
export function useDoc(name: DocName) {
  return useQuery({
    queryKey: ['doc', name],
    queryFn: () => apiGet<Doc>(`/api/docs/${name}`),
    staleTime: 5 * 60_000,
  });
}
