import assert from 'node:assert/strict';
import test from 'node:test';
import type { Difficulty } from '../rewardSystem.ts';
import { STRUCTURE_DEFINITIONS } from '../definitions/structures.ts';
import { SOLDIER_PRODUCTION } from '../ecs/initialBattle.ts';
import { runAiMatch } from './aiMatchRunner.ts';
import type { AiRunMetrics } from './aiMatchRunner.ts';
import { LEGACY_STRATEGY } from './legacyEnemyExecutor.ts';
import type { AiRunState, AiStrategy, AiTurnRecord } from './aiMatchRunner.ts';
import type { CommandContext } from '../commands/CommandContext.ts';
import { buildEnemyAiSnapshot } from './aiSnapshot.ts';
import { executeEnemyTurn } from './executeEnemyTurn.ts';

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

function contextOf(state: AiRunState): CommandContext {
  return { ...state, sessionPhase: 'PLAYING' };
}

/** The real snapshot and executor, as GameApplication uses them. */
const CURRENT_STRATEGY: AiStrategy = {
  snapshot: (state) => buildEnemyAiSnapshot(contextOf(state)),
  execute: (state, turn) => executeEnemyTurn(contextOf(state), turn).map(({ command, result }) => {
    if (!result.accepted) return { command, accepted: false, reason: result.reason };
    return 'entity' in result ? { command, accepted: true, entity: result.entity } : { command, accepted: true };
  })
};

/** What the current executor does with the same seed: the measured effect of the placement rule. */
const CURRENT: Record<Difficulty, AiRunMetrics> = {
  easy: {
    buildAttempts: 7, tooCloseRejections: 1, outsideZoneRejections: 0,
    acceptedBuilds: { generator: 3, barracks: 1, turret: 2 }, overlappingAcceptedBuilds: 0,
    goldSpentOnStructures: 700, goldSpentTotal: 1440, acceptedTrainOrders: 7, rewardCommands: 0,
    outcome: 'defeat', outcomeAtSeconds: 46.67
  },
  normal: {
    buildAttempts: 11, tooCloseRejections: 2, outsideZoneRejections: 0,
    acceptedBuilds: { generator: 4, barracks: 2, turret: 3 }, overlappingAcceptedBuilds: 0,
    goldSpentOnStructures: 1075, goldSpentTotal: 2215, acceptedTrainOrders: 15, rewardCommands: 0,
    outcome: 'defeat', outcomeAtSeconds: 43.27
  },
  hard: {
    buildAttempts: 14, tooCloseRejections: 1, outsideZoneRejections: 0,
    acceptedBuilds: { generator: 5, barracks: 3, turret: 5 }, overlappingAcceptedBuilds: 0,
    goldSpentOnStructures: 1575, goldSpentTotal: 2835, acceptedTrainOrders: 20, rewardCommands: 0,
    outcome: 'defeat', outcomeAtSeconds: 40.43
  }
};

function firstTooCloseTurn(log: readonly AiTurnRecord[]): number {
  return log.findIndex((turn) => turn.executed.some((result) => result.reason === 'too-close'));
}

for (const difficulty of DIFFICULTIES) {
  const options = { difficulty, seed: SEED, durationSeconds: DURATION_SECONDS };

  test(`current executor reproduces its pinned results (${difficulty})`, () => {
    const { metrics } = runAiMatch(options, CURRENT_STRATEGY);
    assert.deepEqual(metrics, CURRENT[difficulty], JSON.stringify(metrics));
  });

  test(`current matches legacy turn by turn until the first too-close rejection (${difficulty})`, () => {
    const legacy = runAiMatch(options, LEGACY_STRATEGY).log;
    const current = runAiMatch(options, CURRENT_STRATEGY).log;
    const first = firstTooCloseTurn(current);
    const shared = first === -1 ? current.length : first;
    assert.deepEqual(current.slice(0, shared), legacy.slice(0, shared));
    if (first === -1) return;
    const rejected = current[first].executed.findIndex((result) => result.reason === 'too-close');
    assert.deepEqual(current[first].executed.slice(0, rejected), legacy[first].executed.slice(0, rejected));
    assert.equal(current[first].frame, legacy[first].frame);
  });

  test(`current never builds too close (${difficulty})`, () => {
    const { metrics } = runAiMatch(options, CURRENT_STRATEGY);
    assert.equal(metrics.overlappingAcceptedBuilds, 0);
    assert.equal(metrics.outsideZoneRejections, 0);
  });

  test(`a rejected build changes nothing (${difficulty})`, () => {
    const { log } = runAiMatch(options, CURRENT_STRATEGY);
    for (const turn of log) {
      let spentByCommands = 0;
      for (const result of turn.executed) {
        if (result.command.type === 'build') {
          if (!result.accepted) assert.equal(result.entity, undefined);
          else spentByCommands += STRUCTURE_DEFINITIONS[result.command.kind].cost;
        } else if (result.command.type === 'train' && result.accepted) {
          spentByCommands += SOLDIER_PRODUCTION[result.command.unit].cost;
        }
      }
      assert.equal(turn.goldBefore - turn.goldAfter, spentByCommands, `frame ${turn.frame}`);
    }
  });
}

test('control run is identical end to end', () => {
  assert.deepEqual(runAiMatch(CONTROL, CURRENT_STRATEGY), runAiMatch(CONTROL, LEGACY_STRATEGY));
});
