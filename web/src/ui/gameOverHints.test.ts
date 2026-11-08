import assert from 'node:assert/strict';
import test from 'node:test';
import { getRetryHint } from './gameOverHints.ts';

test('a close defeat says how much damage was missing', () => {
  assert.equal(getRetryHint(false, 64), '¡Casi lo tumbas! Te faltó un 36%.');
  assert.equal(getRetryHint(false, 50), '¡Casi lo tumbas! Te faltó un 50%.');
  assert.equal(getRetryHint(false, 99), '¡Casi lo tumbas! Te faltó un 1%.');
});

test('no hint for a distant defeat or a victory', () => {
  assert.equal(getRetryHint(false, 49), null);
  assert.equal(getRetryHint(false, 0), null);
  assert.equal(getRetryHint(true, 100), null);
  assert.equal(getRetryHint(true, 64), null);
});

test('out-of-range damage never produces a hint', () => {
  assert.equal(getRetryHint(false, 100), null);
  assert.equal(getRetryHint(false, Number.NaN), null);
});
