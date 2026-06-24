// quotes: building bid/ask from twak quote-only swaps. exec is injected (no twak/network).
// ask = notional/tokenOut (USDT->token); bid = usdtOut/tokenOut (token->USDT, same quantity).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, getQuote } from './quotes.js';

test('parseAmount: leading numeric token of "0.0603 ETH"', () => {
  assert.equal(parseAmount('0.060324538479941936 ETH'), 0.060324538479941936);
  assert.equal(parseAmount('150.5 USDT'), 150.5);
});

test('parseAmount: throws on a non-numeric output', () => {
  assert.throws(() => parseAmount('n/a'));
  assert.throws(() => parseAmount(''));
});

test('getQuote: computes bid/ask/mid from two swap quotes', async () => {
  const calls = [];
  const deps = {
    quote: async (args) => {
      calls.push(args);
      // First call = ask (USDT->token): 100 USDT -> 0.05 token  => ask = 2000
      if (args[3] === 'USDT_ADDR') return { output: '0.05 ETH', provider: 'LiquidMesh' };
      // Second call = bid (token->USDT): 0.05 token -> 99 USDT  => bid = 1980
      return { output: '99 USDT', provider: 'LiquidMesh' };
    },
  };
  const q = await getQuote({ token: 'TOKEN_ADDR' }, { notionalUsd: 100, quoteAddr: 'USDT_ADDR', deps });
  assert.equal(q.ask, 2000);     // 100 / 0.05
  assert.equal(q.bid, 1980);     // 99 / 0.05
  assert.equal(q.mid, 1990);     // (1980 + 2000) / 2
  assert.equal(q.notional, 100);
  assert.equal(q.provider, 'LiquidMesh');
  assert.equal(typeof q.ts, 'number');
  // ask call: amount=100, from=USDT, to=token; bid call: amount=tokenOut, from=token, to=USDT
  assert.deepEqual(calls[0], ['--chain', 'bsc', '100', 'USDT_ADDR', 'TOKEN_ADDR']);
  assert.deepEqual(calls[1], ['--chain', 'bsc', '0.05', 'TOKEN_ADDR', 'USDT_ADDR']);
});

test('getQuote: throws when a quote yields a non-positive amount', async () => {
  const deps = { quote: async () => ({ output: '0 ETH' }) };
  await assert.rejects(getQuote({ token: 'T' }, { notionalUsd: 100, quoteAddr: 'U', deps }));
});
