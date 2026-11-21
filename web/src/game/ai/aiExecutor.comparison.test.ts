import assert from 'node:assert/strict';
import test from 'node:test';
import type { Difficulty } from '../rewardSystem.ts';
import { runAiMatch } from './aiMatchRunner.ts';
import type { AiRunMetrics } from './aiMatchRunner.ts';
import { LEGACY_STRATEGY } from './legacyEnemyExecutor.ts';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const SEED = 1;
const DURATION_SECONDS = 300;

/** Pinned before R4 changed any production code: what the old executor does with this seed. */
const BASELINE: Record<Difficulty, AiRunMetrics> = {
  easy: {
    buildAttempts: 6, tooCloseRejections: 0, outsideZoneRejections: 0,
    acceptedBuilds: { generator: 3, barracks: 1, turret: 2 }, overlappingAcceptedBuilds: 1,
    goldSpentOnStructures: 700, goldSpentTotal: 1490, acceptedTrainOrders: 8, rewardCommands: 0,
    outcome: 'defeat', outcomeAtSeconds: 54.33
  },
  normal: {
    buildAttempts: 9, tooCloseRejections: 0, outsideZoneRejections: 0,
    acceptedBuilds: { generator: 4, barracks: 2, turret: 3 }, overlappingAcceptedBuilds: 1,
    goldSpentOnStructures: 1075, goldSpentTotal: 2165, acceptedTrainOrders: 14, rewardCommands: 0,
    outcome: 'defeat', outcomeAtSeconds: 42.13
  },
  hard: {
    buildAttempts: 13, tooCloseRejections: 0, outsideZoneRejections: 0,
    acceptedBuilds: { generator: 5, barracks: 3, turret: 5 }, overlappingAcceptedBuilds: 4,
    goldSpentOnStructures: 1575, goldSpentTotal: 2985, acceptedTrainOrders: 23, rewardCommands: 0,
    outcome: 'defeat', outcomeAtSeconds: 42.13
  }
};

/** A run in which the old executor never places a structure under 3.8 from an own one. */
const CONTROL = { difficulty: 'normal', seed: 3, durationSeconds: DURATION_SECONDS } as const;

for (const difficulty of DIFFICULTIES) {
  test(`legacy executor reproduces its pinned baseline (${difficulty})`, () => {
    const { metrics } = runAiMatch({ difficulty, seed: SEED, durationSeconds: DURATION_SECONDS }, LEGACY_STRATEGY);
    assert.equal(metrics.rewardCommands, 0);
    assert.deepEqual(metrics, BASELINE[difficulty], JSON.stringify(metrics));
  });
}

test('the control run has no overlapping builds', () => {
  const { metrics } = runAiMatch(CONTROL, LEGACY_STRATEGY);
  assert.equal(metrics.overlappingAcceptedBuilds, 0);
  assert.ok(metrics.buildAttempts >= 3, `only ${metrics.buildAttempts} build attempts`);
});

test('the run is deterministic', () => {
  const options = { difficulty: 'normal' as const, seed: SEED, durationSeconds: DURATION_SECONDS };
  const first = runAiMatch(options, LEGACY_STRATEGY);
  const second = runAiMatch(options, LEGACY_STRATEGY);
  assert.deepEqual(second, first);
});
