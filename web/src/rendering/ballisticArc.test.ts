import assert from 'node:assert/strict';
import test from 'node:test';
import { apexHeightFor, ballisticPoint, type ArcPoint } from './ballisticArc.ts';

const origin: ArcPoint = { x: 0, y: 5, z: 60 };
const target: ArcPoint = { x: 10, y: 0, z: -20 };

test('a shell starts at the Nexus, peaks halfway and lands on its impact point', () => {
  const out: ArcPoint = { x: 0, y: 0, z: 0 };

  assert.deepEqual(ballisticPoint(origin, target, 20, 0, out), origin);
  assert.deepEqual(ballisticPoint(origin, target, 20, 1, out), target);

  ballisticPoint(origin, target, 20, 0.5, out);
  assert.equal(out.x, 5);
  assert.equal(out.z, 20);
  assert.equal(out.y, 2.5 + 20);
});

test('progress outside [0, 1] stays on the ends of the arc', () => {
  const out: ArcPoint = { x: 0, y: 0, z: 0 };
  assert.deepEqual(ballisticPoint(origin, target, 20, -0.5, out), origin);
  assert.deepEqual(ballisticPoint(origin, target, 20, 1.5, out), target);
});

test('the arc rises higher for longer shots within its limits', () => {
  const near = apexHeightFor(origin, { x: 0, y: 0, z: 55 });
  const mid = apexHeightFor(origin, { x: 0, y: 0, z: 0 });
  const far = apexHeightFor(origin, { x: 0, y: 0, z: -200 });
  assert.equal(near, 10);
  assert.equal(mid, 21);
  assert.equal(far, 40);
});
