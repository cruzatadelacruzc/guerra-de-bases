import assert from 'node:assert/strict';
import test from 'node:test';
import { MetricRing } from './MetricRing.ts';

test('summaries report average, 95th percentile, maximum and last value', () => {
  const ring = new MetricRing(100);
  for (let value = 1; value <= 20; value++) ring.record('frameMs', value);

  assert.deepEqual(ring.summary('frameMs'), {
    count: 20,
    average: 10.5,
    p95: 20,
    maximum: 20,
    last: 20
  });
});

test('the ring keeps only the most recent samples once it is full', () => {
  const ring = new MetricRing(4);
  for (const value of [100, 1, 2, 3, 4]) ring.record('drawCalls', value);

  const summary = ring.summary('drawCalls');
  assert.equal(summary.count, 4);
  assert.equal(summary.average, 2.5);
  assert.equal(summary.maximum, 4);
});

test('a summary can be limited to the latest samples', () => {
  const ring = new MetricRing(10);
  for (const value of [50, 50, 50, 1, 3]) ring.record('workMs', value);

  assert.equal(ring.summary('workMs', 2).average, 2);
  assert.equal(ring.summary('workMs', 2).count, 2);
});

test('unknown metrics and cleared rings summarize as empty', () => {
  const ring = new MetricRing(4);
  assert.deepEqual(ring.summary('missing'), { count: 0, average: 0, p95: 0, maximum: 0, last: 0 });

  ring.record('fps', 60);
  ring.clear();
  assert.equal(ring.summary('fps').count, 0);
  assert.deepEqual(ring.names(), ['fps']);
});

test('the capacity must be a positive integer', () => {
  assert.throws(() => new MetricRing(0), RangeError);
  assert.throws(() => new MetricRing(2.5), RangeError);
});
