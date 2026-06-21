// core/blockchain.js — reads the actual swap amounts from the blockchain by tx_id (BSC).
// Source of truth for fill_order: we parse the Transfer events of the transaction receipt, not the quote estimate.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export class BlockchainUnavailable extends Error {
  constructor(message) { super(message); this.name = 'BlockchainUnavailable'; }
}

// wei (bigint) → decimal string with the given decimals, WITHOUT float (exact to the last digit).
export function formatUnits(value, decimals) {
  const neg = value < 0n;
  const v = (neg ? -value : value).toString().padStart(decimals + 1, '0');
  const i = v.slice(0, v.length - decimals);
  const f = v.slice(v.length - decimals).replace(/0+$/, '');
  return (neg ? '-' : '') + (f ? `${i}.${f}` : i);
}

// address from a 32-byte topic (last 20 bytes), lowercase.
const addrFromTopic = (topic) => ('0x' + topic.slice(-40)).toLowerCase();

async function rpc(method, params) {
  const url = process.env.BSC_RPC_URL;
  if (!url) throw new Error('BSC_RPC_URL is not set');
  const headers = { 'content-type': 'application/json' };
  if (process.env.TATUM_API_KEY) headers['x-api-key'] = process.env.TATUM_API_KEY;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 15000);
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: ctrl.signal });
  } finally { clearTimeout(id); }
  // On abort/network failure fetch rejects — the exception propagates from try (res never reaches here undefined).
  if (!res.ok) {
    // Tag the HTTP status so the retry loop won't hammer non-retryable 4xx (e.g. 401 — bad key).
    const e = new Error(`RPC ${method} HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const j = await res.json();
  if (j.error) throw new Error(`RPC ${method} error: ${JSON.stringify(j.error)}`);
  return j.result;
}

// Receipt by tx_id with retry on null (the node hasn't seen the block yet). Throws BlockchainUnavailable.
async function getReceiptWithRetry(txHash) {
  const tries = Number(process.env.BSC_RPC_RETRIES ?? 5);
  const delay = Number(process.env.BSC_RPC_RETRY_DELAY_MS ?? 5000);
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await rpc('eth_getTransactionReceipt', [txHash]);
      if (r) return r;
    } catch (e) {
      lastErr = e;
      // Client errors (4xx, e.g. 401 on a bad TATUM_API_KEY) are pointless to retry — bail immediately.
      if (e.status >= 400 && e.status < 500) break;
    }
    if (i < tries - 1 && delay > 0) await new Promise((res) => setTimeout(res, delay));
  }
  throw new BlockchainUnavailable(
    `receipt for tx ${txHash} unavailable after ${tries} attempts${lastErr ? ` (${lastErr.message})` : ''}`);
}

// Sums the value of all Transfers of the given token in the required direction relative to the wallet.
function sumTransfers(logs, token, dir, wallet) {
  const tok = token.toLowerCase();
  let sum = 0n;
  for (const log of logs) {
    if (!log.topics || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    if (log.address.toLowerCase() !== tok) continue;
    const party = dir === 'to' ? addrFromTopic(log.topics[2]) : addrFromTopic(log.topics[1]);
    if (party !== wallet) continue;
    // '0x' or empty data means zero (zero-value Transfer); BigInt('0x') would throw a SyntaxError.
    const v = (!log.data || log.data === '0x') ? 0n : BigInt(log.data);
    sum += v;
  }
  return sum;
}

// comp_size = base (for buy: received by us; for sell: left the wallet);
// comp_amount = USDT (for buy: left the wallet including fees; for sell: received by us).
export async function resolveSwapFill({ order, txHash }) {
  const pairCfg = config.pairs[order.pair];
  if (!pairCfg) throw new Error(`unknown pair: ${order.pair}`);
  const wallet = process.env.WALLET_ADDRESS?.toLowerCase();
  if (!wallet) throw new Error('WALLET_ADDRESS is not set');
  const base = { addr: pairCfg.token, decimals: pairCfg.decimals };
  const quote = { addr: config.quote_token.address, decimals: config.quote_token.decimals };

  const receipt = await getReceiptWithRetry(txHash);
  if (receipt.status !== '0x1')
    throw new BlockchainUnavailable(`tx ${txHash} status ${receipt.status} (swap did not succeed)`);
  const logs = receipt.logs || [];

  const buy = order.action === 'open' || order.action === 'add';
  const sizeWei = buy ? sumTransfers(logs, base.addr, 'to', wallet)
                      : sumTransfers(logs, base.addr, 'from', wallet);
  const amountWei = buy ? sumTransfers(logs, quote.addr, 'from', wallet)
                        : sumTransfers(logs, quote.addr, 'to', wallet);
  if (sizeWei === 0n)
    throw new BlockchainUnavailable(`receipt for tx ${txHash} has no Transfer of the base token to/from the wallet`);
  if (amountWei === 0n)
    throw new BlockchainUnavailable(`receipt for tx ${txHash} has no Transfer of USDT to/from the wallet`);

  return { comp_size: formatUnits(sizeWei, base.decimals),
           comp_amount: formatUnits(amountWei, quote.decimals) };
}
