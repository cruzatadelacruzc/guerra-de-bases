import assert from 'node:assert/strict';
import test from 'node:test';
import { DecisionClock } from './DecisionClock.ts';
import { getEnemyAiProfile } from './enemyAiProfile.ts';

function countDecisions(clock: DecisionClock, deltaSeconds: number, frames: number): number {
  let decisions = 0;
  for (let frame = 0; frame < frames; frame++) if (clock.advance(deltaSeconds)) decisions++;
  return decisions;
}

test('no decision before one full interval', () => {
  const clock = new DecisionClock(1.25);
  for (let frame = 0; frame < 4; frame++) assert.equal(clock.advance(0.25), false);
  assert.equal(clock.advance(0.25), true);
});

test('decisions follow the interval and keep the remainder', () => {
  assert.equal(countDecisions(new DecisionClock(1.25), 0.25, 50), 10);
  const clock = new DecisionClock(0.75);
  assert.deepEqual([clock.advance(0.5), clock.advance(0.5), clock.advance(0.5)], [false, true, true]);
});

test('one profile interval per difficulty', () => {
  const frames = 1400; // 70 s of 50 ms frames
  const expected = { easy: 56, normal: 100, hard: 200 } as const;
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const clock = new DecisionClock(getEnemyAiProfile(difficulty).decisionIntervalSeconds);
    const decisions = countDecisions(clock, 0.05, frames);
    assert.ok(Math.abs(decisions - expected[difficulty]) <= 1, `${difficulty}: ${decisions}`);
  }
});

test('a huge delta decides once and leaves no burst', () => {
  const clock = new DecisionClock(0.35);
  assert.equal(clock.advance(10), true);
  assert.equal(clock.advance(0), false);
  assert.equal(clock.advance(0.17), false);
  assert.equal(clock.advance(0.01), true);
});

test('a slow frame does not chain decisions on the next frames', () => {
  const clock = new DecisionClock(0.35);
  assert.equal(clock.advance(0.69), true);
  assert.equal(clock.advance(0.016), false);
});

test('paused time is never counted', () => {
  const clock = new DecisionClock(0.7);
  assert.equal(clock.advance(0.5), false);
  // Paused: the game sends no time at all; resuming starts from a zero delta.
  assert.equal(clock.advance(0), false);
  assert.equal(clock.advance(0.2), true);
});

test('normal frames keep the full remainder', () => {
  const decisions = countDecisions(new DecisionClock(0.35), 0.1, 1000);
  assert.ok(Math.abs(decisions - Math.floor(100 / 0.35)) <= 1, String(decisions));
});

test('invalid input is rejected', () => {
  assert.throws(() => new DecisionClock(0), RangeError);
  assert.throws(() => new DecisionClock(Number.NaN), RangeError);
  assert.throws(() => new DecisionClock(1).advance(-1), RangeError);
  assert.throws(() => new DecisionClock(1).advance(Number.POSITIVE_INFINITY), RangeError);
});
