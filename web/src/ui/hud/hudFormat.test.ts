import assert from 'node:assert/strict';
import test from 'node:test';
import { formatGold, formatPercent, formatSeconds } from './hudFormat.ts';

test('formatGold shows whole gold and abbreviates from 10000', () => {
  assert.equal(formatGold(0), '0');
  assert.equal(formatGold(225.9), '225');
  assert.equal(formatGold(9999), '9999');
  assert.equal(formatGold(10000), '10,0k');
  assert.equal(formatGold(10234), '10,2k');
});

test('formatPercent and formatSeconds use the HUD text', () => {
  assert.equal(formatPercent(83), '83 %');
  assert.equal(formatSeconds(4.1), '5 s');
  assert.equal(formatSeconds(0), '0 s');
});
