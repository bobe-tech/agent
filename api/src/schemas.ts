import { z } from 'zod';

export const TIMEFRAMES = ['1h', 'hour', '4h', '1d', 'day'] as const;

export const candlesQuerySchema = z.object({
  tf: z.enum(TIMEFRAMES).default('1h'),
  limit: z.coerce.number().int().min(1).max(1000).default(300),
});

export type CandlesQuery = z.infer<typeof candlesQuerySchema>;

export const positionsQuerySchema = z.object({
  pair: z.string().optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
});

export type PositionsQuery = z.infer<typeof positionsQuerySchema>;

export const TICK_ACTIONS = ['OPEN_LONG', 'OPEN_SHORT', 'ADD', 'CLOSE', 'HOLD', 'all'] as const;

export const ticksQuerySchema = z.object({
  pair: z.string().optional(),
  action: z.enum(TICK_ACTIONS).default('all'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type TicksQuery = z.infer<typeof ticksQuerySchema>;

export const reflectionsQuerySchema = z.object({
  pair: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ReflectionsQuery = z.infer<typeof reflectionsQuerySchema>;

export const pnlQuerySchema = z.object({
  pair: z.string().optional(),
});

export type PnlQuery = z.infer<typeof pnlQuerySchema>;

export const ordersQuerySchema = z.object({
  pair: z.string().optional(),
  position_id: z.string().optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
