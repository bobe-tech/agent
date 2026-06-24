// Build live bid/ask for a pair from twak quote-only swaps (BSC). This module IS the twak caller — it shells
// out to the CLI. Only the refresh-quotes cron uses it; the API/front request path reads quotes from the DB.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

// Parse the leading numeric token of a twak amount string ("0.0603 ETH" -> 0.0603). Throws if not finite.
export function parseAmount(s) {
  const n = Number.parseFloat(String(s).trim().split(/\s+/)[0]);
  if (!Number.isFinite(n)) throw new Error(`unparseable twak amount: ${JSON.stringify(s)}`);
  return n;
}

// Default exec: `twak swap --quote-only --json <args>` -> parsed JSON. 30s timeout.
async function twakSwapQuote(args) {
  const { stdout } = await execFileP('twak', ['swap', '--quote-only', '--json', ...args], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout);
}

// getQuote(cfg, {notionalUsd, quoteAddr, deps}) -> {bid, ask, mid, notional, provider, ts}.
// ask  = notional / tokenOut   (swap notional USDT -> base token)
// bid  = usdtOut  / tokenOut   (swap that same tokenOut base -> USDT)
export async function getQuote(cfg, { notionalUsd, quoteAddr, deps = { quote: twakSwapQuote } }) {
  const askRes = await deps.quote(['--chain', 'bsc', String(notionalUsd), quoteAddr, cfg.token]);
  const tokenOut = parseAmount(askRes.output);
  if (tokenOut <= 0) throw new Error(`twak ask quote returned non-positive output: ${askRes.output}`);
  const ask = notionalUsd / tokenOut;

  const bidRes = await deps.quote(['--chain', 'bsc', String(tokenOut), cfg.token, quoteAddr]);
  const usdtOut = parseAmount(bidRes.output);
  if (usdtOut <= 0) throw new Error(`twak bid quote returned non-positive output: ${bidRes.output}`);
  const bid = usdtOut / tokenOut;

  if (!Number.isFinite(ask) || !Number.isFinite(bid) || ask <= 0 || bid <= 0) {
    throw new Error(`invalid quote: bid=${bid} ask=${ask}`);
  }
  return {
    bid,
    ask,
    mid: (bid + ask) / 2,
    notional: notionalUsd,
    provider: askRes.provider ?? bidRes.provider ?? null,
    ts: Math.floor(Date.now() / 1000),
  };
}
