// MCP validators/guards (validation.js) — the contract protecting against junk from the LLM.
// Pure functions, no DB needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePairCfg, nonNegNum, assertSideAllowed } from './validation.js';

const config = { pairs: { 'ETH/USDT': { base: 'ETH' }, 'BTCB/USDT': { base: 'BTCB' } } };
const pairCfg = makePairCfg(config);

test('pairCfg returns the config of a known pair', () => {
  assert.deepEqual(pairCfg('ETH/USDT'), { base: 'ETH' });
});

test('pairCfg throws listing the configured pairs for an unknown one', () => {
  assert.throws(() => pairCfg('DOGE/USDT'), (e) => {
    assert.match(e.message, /unknown pair: DOGE\/USDT/);
    assert.match(e.message, /ETH\/USDT/); // hint with the list
    return true;
  });
});

test('pairCfg is notation-sensitive (typos in the pair are cut off)', () => {
  assert.throws(() => pairCfg('eth/usdt'), /unknown pair/);
  assert.throws(() => pairCfg('ETH-USDT'), /unknown pair/);
});

test('nonNegNum accepts 0, positives and numeric strings', () => {
  for (const v of [0, 0.01, 42, '0', '20', '0.0099']) {
    assert.equal(nonNegNum.safeParse(v).success, true, `should pass: ${v}`);
  }
});

test('nonNegNum rejects negatives, NaN, ±Infinity, non-numeric junk', () => {
  for (const v of [-1, '-0.5', 'abc', 'NaN', Infinity, -Infinity, NaN]) {
    assert.equal(nonNegNum.safeParse(v).success, false, `should be rejected: ${v}`);
  }
});

// Characterizing a known quirk: Number('')===0 and Number('  ')===0 — an empty/whitespace
// string is coerced to 0 and PASSES as non-negative. Not dangerous (0 is valid), but we pin it down
// so an accidental tightening/loosening of the validator gets noticed.
test('nonNegNum: empty/whitespace string is coerced to 0 and accepted (documented quirk)', () => {
  assert.equal(nonNegNum.safeParse('').success, true);
  assert.equal(nonNegNum.safeParse('   ').success, true);
});

test('assertSideAllowed: SHORT is forbidden when the flag is off, LONG is always ok', () => {
  assert.throws(() => assertSideAllowed('SHORT', false), /SHORT is disabled/);
  assert.doesNotThrow(() => assertSideAllowed('SHORT', true));
  assert.doesNotThrow(() => assertSideAllowed('LONG', false));
});
