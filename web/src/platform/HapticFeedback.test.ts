import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHapticFeedback,
  NEXUS_DESTROYED_DURATION_MS,
  STRIKE_IMPACT_DURATION_MS,
  STRIKE_IMPACT_MIN_INTERVAL_MS
} from './HapticFeedback.ts';

function setup() {
  const calls: number[] = [];
  let time = 1000;
  const haptics = createHapticFeedback({
    vibrate: (durationMs) => calls.push(durationMs),
    now: () => time
  });
  return {
    calls,
    haptics,
    advance(ms: number) {
      time += ms;
    }
  };
}

test('strike impact vibrates with a short pulse', () => {
  const { calls, haptics } = setup();
  haptics.strikeImpact();
  assert.deepEqual(calls, [STRIKE_IMPACT_DURATION_MS]);
});

test('strike impacts inside the throttle window are dropped', () => {
  const { calls, haptics, advance } = setup();
  haptics.strikeImpact();
  advance(STRIKE_IMPACT_MIN_INTERVAL_MS - 1);
  haptics.strikeImpact();
  assert.equal(calls.length, 1);
  advance(1);
  haptics.strikeImpact();
  assert.equal(calls.length, 2);
});

test('nexus destruction always vibrates, even right after a strike', () => {
  const { calls, haptics } = setup();
  haptics.strikeImpact();
  haptics.nexusDestroyed();
  assert.deepEqual(calls, [STRIKE_IMPACT_DURATION_MS, NEXUS_DESTROYED_DURATION_MS]);
});

test('a failing vibrator does not throw', () => {
  const haptics = createHapticFeedback({
    vibrate: () => {
      throw new Error('no vibrator');
    },
    now: () => 0
  });
  assert.doesNotThrow(() => haptics.strikeImpact());
  assert.doesNotThrow(() => haptics.nexusDestroyed());
});
