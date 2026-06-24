import { z, type ZodTypeAny } from 'zod';

// Validation of OUTGOING payloads — locks down the API contract and catches repositories↔frontend drift.
// Behavior:
//   • test / API_DEBUG=true → throw on mismatch (drift is visible immediately in tests and debugging);
//   • prod → log and return the data as is (a schema mismatch must not bring down the dashboard).
// Object schemas use .passthrough(): we don't strip extra fields (don't break the frontend), we only check
// the declared required ones. We return the ORIGINAL object (not the .parse result) — without trimming fields.
export function validateResponse<T>(
  schema: ZodTypeAny,
  data: T,
  log?: { error: (obj: unknown, msg: string) => void },
): T {
  const r = schema.safeParse(data);
  if (r.success) return data;
  const issue = r.error.issues[0];
  const where = issue ? `${issue.path.join('.') || '<root>'}: ${issue.message}` : 'unknown';
  const strict = process.env['NODE_ENV'] === 'test' || process.env['API_DEBUG'] === 'true';
  if (strict) throw new Error(`response failed schema validation (${where})`);
  log?.error({ issues: r.error.issues }, 'API response failed schema validation');
  return data;
}

// NUMERIC from pg arrives as a string; float8 projections (::float8) arrive as a number.
const numStr = z.string();
const numStrN = z.string().nullable();
const SIDE = z.enum(['LONG', 'SHORT']);

const pnlSummary = z
  .object({
    realized_usd: z.number(),
    unrealized_usd: z.number(),
    total_usd: z.number(),
    base_usd: z.number(),
    realized_pct: z.number().nullable(),
    unrealized_pct: z.number().nullable(),
    roi_pct: z.number().nullable(),
    apr_pct: z.number().nullable(),
    closed_count: z.number(),
    open_count: z.number(),
    win_rate: z.number().nullable(),
    avg_pnl_pct: z.number().nullable(),
    days_active: z.number().nullable(),
  })
  .passthrough();

// NOTE: time fields (created_at/status_at/ts) are NOT validated — pg returns them as JS Date (there is no
// type parser), and the check runs BEFORE JSON serialization. We hold the contract on stable fields: id/enum/money.
const positionRow = z
  .object({
    id: z.string(),
    pair: z.string(),
    side: SIDE,
    status: z.enum(['active', 'completed', 'cancelled']),
    opened_size: numStrN,
    opened_amount: numStrN,
    realized_pnl_usd: numStrN,
  })
  .passthrough();

const orderRow = z
  .object({
    id: z.string(),
    position_id: z.string(),
    pair: z.string(),
    action: z.enum(['open', 'add', 'close']),
    status: z.enum(['active', 'completed', 'cancelled']),
    comp_size: numStrN,
    comp_amount: numStrN,
  })
  .passthrough();

const tickRow = z
  .object({
    id: z.string(),
    pair: z.string(),
    action: z.enum(['OPEN_LONG', 'OPEN_SHORT', 'ADD', 'CLOSE', 'HOLD']),
  })
  .passthrough();

const reflectionRow = z
  .object({ id: z.string(), pair: z.string(), summary: z.string() })
  .passthrough();

const candle = z
  .object({ time: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number() })
  .passthrough();

// Response schemas per endpoint (name = meaning of the route).
export const responseSchemas = {
  pairs: z.object({ pairs: z.array(z.object({ pair: z.string(), active_version: z.number().nullable() })) }).passthrough(),
  params: z.object({ version: z.number(), pair: z.string(), is_active: z.boolean(), config: z.record(z.unknown()) }).passthrough(),
  positions: z.object({ positions: z.array(positionRow) }).passthrough(),
  orders: z.object({ orders: z.array(orderRow) }).passthrough(),
  ticks: z.object({ ticks: z.array(tickRow) }).passthrough(),
  reflections: z.object({ reflections: z.array(reflectionRow) }).passthrough(),
  pnl: pnlSummary,
  portfolio: z.object({ total: pnlSummary, by_pair: z.array(pnlSummary.and(z.object({ pair: z.string() }))) }).passthrough(),
  candles: z.object({ pair: z.string(), tf: z.string(), candles: z.array(candle) }).passthrough(),
  price: z.object({ pair: z.string(), bid: z.number(), ask: z.number(), mid: z.number(), ts: z.number() }).passthrough(),
  doc: z.object({ name: z.string(), content: z.string() }).passthrough(),
} as const;
