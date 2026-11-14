import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePixelRatio } from './ThreeRenderCoordinator.ts';

test('the pixel ratio keeps the current caps when no override is given', () => {
  assert.equal(resolvePixelRatio(2.625, true), 1.5);
  assert.equal(resolvePixelRatio(3, false), 2);
  assert.equal(resolvePixelRatio(1, true), 1);
});

test('a development override replaces the cap but never exceeds the device', () => {
  assert.equal(resolvePixelRatio(2.625, true, 0.75), 0.75);
  assert.equal(resolvePixelRatio(2.625, true, 2), 2);
  assert.equal(resolvePixelRatio(1, true, 2), 1);
});
