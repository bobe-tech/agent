#!/usr/bin/env node
// Reads the output of `claude -p` (a single JSON OR a stream-json stream) from stdin and records
// token usage / cost / duration onto the last tick_log for the pair (env PAIR).
import { fileURLToPath } from 'node:url';
import { createPool } from '../core/db.js';

// Extracts the final result event from both formats: --output-format json (a single object)
// and --output-format stream-json (a JSONL stream — we take the last type=result event).
export function extractResult(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const j = JSON.parse(trimmed);
    if (j && (j.usage || j.total_cost_usd != null || j.result != null)) return j;
  } catch { /* not a single JSON — parse as a stream */ }
  let result = null;
  for (const line of trimmed.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const ev = JSON.parse(s);
      if (ev.type === 'result') result = ev;
    } catch { /* skip unparsed lines */ }
  }
  return result;
}

// Record the usage from the parsed result event onto the pair's last tick_log (env PAIR).
async function recordUsage(d, pair = process.env.PAIR || null) {
  if (!d) return;
  const u = d.usage || {};
  const pool = createPool();
  try {
    await pool.query(
      `UPDATE tick_log SET cost_usd=$1, input_tokens=$2, output_tokens=$3, cache_read_tokens=$4,
         num_turns=$5, duration_ms=COALESCE(duration_ms,$6)
       WHERE id = (SELECT id FROM tick_log
                     WHERE ($7::text IS NULL OR pair = $7) AND ts > now() - interval '5 minutes'
                     ORDER BY id DESC LIMIT 1)`,
      [d.total_cost_usd ?? null, u.input_tokens ?? null, u.output_tokens ?? null,
       u.cache_read_input_tokens ?? null, d.num_turns ?? null, d.duration_ms ?? null, pair]
    );
  } catch (e) {
    console.error('[usage]', e.message);
  } finally {
    await pool.end();
  }
}

// Auto-run only when invoked directly as `node mcp/record-usage.js` (not when imported in tests):
// read stdin to the end, parse it and write the usage.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (input += d));
  process.stdin.on('end', () => recordUsage(extractResult(input)));
}
