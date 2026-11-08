import assert from 'node:assert/strict';
import test from 'node:test';
import { keepsControlsOpen } from './BuildMenu.ts';

test('training troops keeps the command drawer open for repeated orders', () => {
  assert.equal(keepsControlsOpen('train-rifleman'), true);
  assert.equal(keepsControlsOpen('train-tank'), true);
});

test('building, demolishing and unknown actions still close the drawer', () => {
  for (const id of ['build-generator', 'build-barracks', 'build-turret', 'demolish-mode', 'unknown']) {
    assert.equal(keepsControlsOpen(id), false, id);
  }
});
