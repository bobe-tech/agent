// record-usage: extractResult parses the output of `claude -p` in two formats — a single JSON and
// a stream-json stream (JSONL, we take the LAST type=result event). Pure function, no DB needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractResult } from './record-usage.js';

test('a single JSON with usage is recognized', () => {
  const j = JSON.stringify({ usage: { input_tokens: 100, output_tokens: 50 }, total_cost_usd: 0.01 });
  const r = extractResult(j);
  assert.equal(r.usage.input_tokens, 100);
  assert.equal(r.total_cost_usd, 0.01);
});

test('a single JSON with a result field (but no usage) is also recognized', () => {
  const r = extractResult(JSON.stringify({ result: 'done', num_turns: 3 }));
  assert.equal(r.num_turns, 3);
});

test('stream-json: take the last type=result event, ignoring intermediate ones', () => {
  const jsonl = [
    JSON.stringify({ type: 'system', subtype: 'init' }),
    JSON.stringify({ type: 'assistant', text: '...' }),
    JSON.stringify({ type: 'result', total_cost_usd: 0.02, usage: { input_tokens: 7 }, num_turns: 2 }),
  ].join('\n');
  const r = extractResult(jsonl);
  assert.equal(r.type, 'result');
  assert.equal(r.total_cost_usd, 0.02);
  assert.equal(r.usage.input_tokens, 7);
});

test('stream-json with multiple results: the last one is returned', () => {
  const jsonl = [
    JSON.stringify({ type: 'result', total_cost_usd: 0.01 }),
    JSON.stringify({ type: 'result', total_cost_usd: 0.09 }),
  ].join('\n');
  assert.equal(extractResult(jsonl).total_cost_usd, 0.09);
});

test('malformed lines in the stream are skipped, do not break parsing', () => {
  const jsonl = ['not json at all', '{broken', JSON.stringify({ type: 'result', num_turns: 1 })].join('\n');
  const r = extractResult(jsonl);
  assert.equal(r.num_turns, 1);
});

test('empty/whitespace input → null', () => {
  assert.equal(extractResult(''), null);
  assert.equal(extractResult('   \n  '), null);
});

test('a stream with no result event → null', () => {
  const jsonl = [JSON.stringify({ type: 'system' }), JSON.stringify({ type: 'assistant' })].join('\n');
  assert.equal(extractResult(jsonl), null);
});
