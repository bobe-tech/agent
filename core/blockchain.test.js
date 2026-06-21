import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatUnits, resolveSwapFill, BlockchainUnavailable } from './blockchain.js';

// Real receipt of an ETH swap (1 USDT -> ETH) for wallet 0x997bb64a... — trimmed to Transfer logs.
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const USDT = '0x55d398326f99059ff775485246999027b3197955';
const ETH  = '0x2170ed0880ac9a755fd29b2688956bd959f933f8';
const W    = '0x997bb64abec57b4e9891f10fff3575c00f1aeee6';
const t = (a) => '0x000000000000000000000000' + a.slice(2);
const hex = (n) => '0x' + n.toString(16); // bigint wei → hex data (no manual encoding)
const ETH_RECEIPT = {
  status: '0x1',
  logs: [
    // USDT: us -> fee (0.007)
    { address: USDT, topics: [TRANSFER, t(W), t('0x73691cee20db22f55a6fd0d5948ab00e0fb973b1')], data: '0x0000000000000000000000000000000000000000000000000018de76816d8000' },
    // USDT: us -> swap (0.993)
    { address: USDT, topics: [TRANSFER, t(W), t('0x1905dbf18c916bf8ec659545de0858d9f20eaeab')], data: '0x0000000000000000000000000000000000000000000000000dc7d83d25f68000' },
    // ETH: router -> us (0.000575378911405899) — TARGET inflow
    { address: ETH, topics: [TRANSFER, t('0x3d90f66b534dd8482b181e24655a9e8265316be9'), t(W)], data: '0x00000000000000000000000000000000000000000000000000020b4dd7a0274b' },
    // ETH: routing hop NOT to us (should be ignored)
    { address: ETH, topics: [TRANSFER, t('0xf0ea5a817ae0d2882a1a128f2c5227a5eb676acc'), t('0x3d90f66b534dd8482b181e24655a9e8265316be9')], data: '0x00000000000000000000000000000000000000000000000000020b4f04706475' },
  ],
};

function withFetch(fn, resp) {
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => ({ ok: true, json: async () => { calls++; return resp(calls); } });
  return fn().finally(() => { globalThis.fetch = orig; });
}

test('resolveSwapFill (buy): comp_size = ETH to us, comp_amount = USDT from us (including fees)', async () => {
  process.env.WALLET_ADDRESS = W;
  process.env.BSC_RPC_URL = 'http://stub';
  await withFetch(async () => {
    const r = await resolveSwapFill({ order: { pair: 'ETH/USDT', action: 'open' }, txHash: '0xtest' });
    assert.equal(r.comp_size, '0.000575378911405899');
    assert.equal(r.comp_amount, '1');
  }, () => ({ jsonrpc: '2.0', id: 1, result: ETH_RECEIPT }));
});

test('resolveSwapFill (sell/close): comp_size = base FROM the wallet, comp_amount = USDT TO us (net)', async () => {
  process.env.WALLET_ADDRESS = W;
  process.env.BSC_RPC_URL = 'http://stub';
  // Sell: ETH leaves the wallet to the router, USDT comes to us. Plus a routing ETH hop NOT from the wallet (ignored).
  const SELL_RECEIPT = {
    status: '0x1',
    logs: [
      // ETH: us -> router (selling the base) — TARGET outflow → comp_size
      { address: ETH, topics: [TRANSFER, t(W), t('0x3d90f66b534dd8482b181e24655a9e8265316be9')], data: hex(500000000000000n) }, // 0.0005 ETH
      // ETH: routing hop between routers (we're not involved) — should be ignored
      { address: ETH, topics: [TRANSFER, t('0x3d90f66b534dd8482b181e24655a9e8265316be9'), t('0xf0ea5a817ae0d2882a1a128f2c5227a5eb676acc')], data: hex(500000000000000n) },
      // USDT: router -> us (proceeds, net) → comp_amount
      { address: USDT, topics: [TRANSFER, t('0x1905dbf18c916bf8ec659545de0858d9f20eaeab'), t(W)], data: hex(1230000000000000000n) }, // 1.23 USDT
    ],
  };
  await withFetch(async () => {
    const r = await resolveSwapFill({ order: { pair: 'ETH/USDT', action: 'close' }, txHash: '0xsell' });
    assert.equal(r.comp_size, '0.0005');
    assert.equal(r.comp_amount, '1.23');
  }, () => ({ jsonrpc: '2.0', id: 1, result: SELL_RECEIPT }));
});

test('formatUnits: exact conversion without float', () => {
  assert.equal(formatUnits(310445497936067n, 18), '0.000310445497936067');
  assert.equal(formatUnits(20000000000000000000n, 18), '20');
  assert.equal(formatUnits(0n, 18), '0');
});

test('resolveSwapFill: retry on null, then success', async () => {
  process.env.WALLET_ADDRESS = W; process.env.BSC_RPC_URL = 'http://stub';
  process.env.BSC_RPC_RETRIES = '3'; process.env.BSC_RPC_RETRY_DELAY_MS = '0';
  await withFetch(async () => {
    const r = await resolveSwapFill({ order: { pair: 'ETH/USDT', action: 'open' }, txHash: '0xt' });
    assert.equal(r.comp_size, '0.000575378911405899');
  }, (call) => ({ result: call < 2 ? null : ETH_RECEIPT }));
});

test('resolveSwapFill: zero-value Transfer (data: 0x) does not crash, comp_size stays real', async () => {
  process.env.WALLET_ADDRESS = W; process.env.BSC_RPC_URL = 'http://stub';
  // Add a Transfer of the base token to us with data: '0x' (zero-value) — it must not crash,
  // and must not change comp_size (adds 0).
  const receipt_with_zero = {
    status: '0x1',
    logs: [
      ...ETH_RECEIPT.logs,
      { address: ETH, topics: [TRANSFER, t('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'), t(W)], data: '0x' },
    ],
  };
  await withFetch(async () => {
    const r = await resolveSwapFill({ order: { pair: 'ETH/USDT', action: 'open' }, txHash: '0xtest' });
    // comp_size must match the real value (a zero-value Transfer adds 0)
    assert.equal(r.comp_size, '0.000575378911405899');
  }, () => ({ jsonrpc: '2.0', id: 1, result: receipt_with_zero }));
});

test('resolveSwapFill: BlockchainUnavailable when there is no USDT Transfer to/from the wallet', async () => {
  process.env.WALLET_ADDRESS = W; process.env.BSC_RPC_URL = 'http://stub';
  // Receipt with only an ETH Transfer to us, no USDT Transfer to/from the wallet.
  const receipt_no_usdt = {
    status: '0x1',
    logs: [
      // ETH: router -> us (base token present)
      { address: ETH, topics: [TRANSFER, t('0x3d90f66b534dd8482b181e24655a9e8265316be9'), t(W)], data: '0x00000000000000000000000000000000000000000000000000020b4dd7a0274b' },
      // USDT: transfer between two third-party addresses (we're in neither from nor to)
      { address: USDT, topics: [TRANSFER, t('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), t('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')], data: '0x000000000000000000000000000000000000000000000000016345785d8a0000' },
    ],
  };
  await withFetch(
    () => assert.rejects(
      () => resolveSwapFill({ order: { pair: 'ETH/USDT', action: 'open' }, txHash: '0xnousdt' }),
      BlockchainUnavailable),
    () => ({ jsonrpc: '2.0', id: 1, result: receipt_no_usdt }));
});

test('resolveSwapFill: BlockchainUnavailable after retries are exhausted', async () => {
  process.env.WALLET_ADDRESS = W; process.env.BSC_RPC_URL = 'http://stub';
  process.env.BSC_RPC_RETRIES = '2'; process.env.BSC_RPC_RETRY_DELAY_MS = '0';
  await withFetch(
    () => assert.rejects(
      () => resolveSwapFill({ order: { pair: 'ETH/USDT', action: 'open' }, txHash: '0xt' }),
      BlockchainUnavailable),
    () => ({ result: null }));
});
