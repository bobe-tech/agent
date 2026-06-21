export interface Reflection {
  id: string;
  pair: string;
  ts: string;
  summary: string;
  payload: Record<string, unknown> | null;
}
