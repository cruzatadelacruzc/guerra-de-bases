import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCameraShake, CAMERA_SHAKE_DECAY_PER_SECOND } from './cameraShake.ts';

function sequence(...values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) throw new Error('random sequence exhausted');
    index++;
    return value;
  };
}

test('the shake jitters each axis by (random - 0.5) · shake, in x, y, z order', () => {
  const position = { x: 10, y: 20, z: 30 };
  applyCameraShake(position, 4, 0, sequence(1, 0, 0.75));
  assert.deepEqual(position, { x: 12, y: 18, z: 31 });
});

test('the shake decays by 4 per second and never goes below zero', () => {
  assert.equal(CAMERA_SHAKE_DECAY_PER_SECOND, 4);
  const position = { x: 0, y: 0, z: 0 };
  assert.equal(applyCameraShake(position, 4.5, 0.25, sequence(0.5, 0.5, 0.5)), 3.5);
  assert.equal(applyCameraShake(position, 0.3, 0.25, sequence(0.5, 0.5, 0.5)), 0);
});

test('no shake leaves the position untouched and draws no random numbers', () => {
  const position = { x: 1, y: 2, z: 3 };
  assert.equal(applyCameraShake(position, 0, 0.016, sequence()), 0);
  assert.deepEqual(position, { x: 1, y: 2, z: 3 });
});
