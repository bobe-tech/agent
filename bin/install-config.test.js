import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configFor } from './install.js';

test('configFor returns the per-pair crsi_buy level plus the new-schema keys', () => {
  const cfg = configFor('ETH/USDT');
  assert.equal(cfg.crsi_buy, 19.7);                 // from core/crsi-levels.js
  assert.equal(cfg.adx_mult_threshold, 30);         // new-schema key present
  assert.equal(cfg.crsi_window_hours, 3);
  assert.equal(cfg.high_window_hours, 24);
  assert.deepEqual(cfg.sizes_usd, [20, 30, 50]);
});

test('configFor throws for a pair missing from core/crsi-levels.js', () => {
  assert.throws(() => configFor('NOPE/USDT'), /no crsi_buy level for pair NOPE\/USDT/);
});
