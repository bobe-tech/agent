// Pure MCP-server validators/guards — extracted from index.js so they can be covered by tests
// (index.js connects to stdio on import and is therefore not importable). This is the contract by which
// the MCP protects itself from junk coming from the LLM: unknown pairs, negative amounts,
// opening a SHORT in long-only mode, a live swap without a tx_id.
import { z } from 'zod';

// Factory for a pair validator against config.json — protection against "shadow" pairs from notation typos.
// Returns the pair config or throws listing the configured pairs.
export function makePairCfg(config) {
  return function pairCfg(pair) {
    const c = config.pairs[pair];
    if (!c) throw new Error(`unknown pair: ${pair} (configured: ${Object.keys(config.pairs).join(', ')})`);
    return c;
  };
}

// Non-negative number (number | string): a swap receipt amount/volume can't be < 0 or junk.
// Protects the position aggregates (recomputePosition) from negative/non-numeric comp_*.
export const nonNegNum = z.union([z.number(), z.string()])
  .refine((v) => { const n = Number(v); return Number.isFinite(n) && n >= 0; },
    { message: 'value must be a non-negative number' });

// long-only: SHORT arithmetic and the net>0 guard are written only for LONG. We reject opening a SHORT
// before the swap, until SHORTS_ENABLED explicitly enables the reserve.
export function assertSideAllowed(side, shortsEnabled) {
  if (side === 'SHORT' && !shortsEnabled) {
    throw new Error('SHORT is disabled (long-only); opening a SHORT position is forbidden');
  }
}
