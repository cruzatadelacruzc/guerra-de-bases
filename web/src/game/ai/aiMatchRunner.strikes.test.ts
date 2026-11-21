import assert from 'node:assert/strict';
import test from 'node:test';
import type { CommandContext } from '../commands/CommandContext.ts';
import { COMPONENTS } from '../ecs/components.ts';
import type { Entity } from '../ecs/components.ts';
import { createSoldier, createSoldierFactory, createStructure, SOLDIER_PRODUCTION } from '../ecs/initialBattle.ts';
import { STRUCTURE_DEFINITIONS } from '../definitions/structures.ts';
import { buildEnemyAiSnapshot } from './aiSnapshot.ts';
import { runAiMatch } from './aiMatchRunner.ts';
import type { AiRunState, AiStrategy } from './aiMatchRunner.ts';
import { ARTILLERY_LAUNCH_DELAY_SECONDS, ARTILLERY_SHELL_FLIGHT_SECONDS } from '../rewardSystem.ts';
import { executeEnemyTurn } from './executeEnemyTurn.ts';

const FRAME_SECONDS = 1 / 60;
const FRAME_MS = (1 / 60) * 1000;
const SEED = 1;
const DIFFICULTY = 'hard';

function contextOf(state: AiRunState): CommandContext {
  return { ...state, sessionPhase: 'PLAYING' };
}

const CURRENT_STRATEGY: AiStrategy = {
  snapshot: (state) => buildEnemyAiSnapshot(contextOf(state)),
  execute: (state, turn) => executeEnemyTurn(contextOf(state), turn).map(({ command, result }) => {
    if (!result.accepted) return { command, accepted: false, reason: result.reason };
    return 'entity' in result ? { command, accepted: true, entity: result.entity } : { command, accepted: true };
  })
};

const targets: Entity[] = [];

/** Player soldiers and structures spread over the player's half, and plenty of AI combat points. */
function setup(state: AiRunState): void {
  targets.length = 0;
  for (let i = 0; i < 12; i++) {
    const at = { x: -30 + i * 5.5, y: 0, z: 20 + (i % 3) * 6 };
    const definition = SOLDIER_PRODUCTION.rifleman;
    targets.push(createSoldier(state.world, 'player', at, definition.speed, definition.range, definition.health, 'rifleman'));
    targets.push(createStructure(state.world, 'player', { x: at.x, y: 0, z: at.z + 9 }, STRUCTURE_DEFINITIONS.turret.health, 'turret'));
  }
  targets.push(createSoldierFactory(state.world, 'player', { x: 0, y: 0, z: 40 }));
  state.match.combatPoints.enemy = 1e4;
  const economy = state.world.getComponent(state.bases.enemy, COMPONENTS.economy);
  if (economy) economy.gold = 1e4;
}

function healthOf(state: AiRunState, entity: Entity): number {
  return state.world.getComponent(entity, COMPONENTS.health)?.current ?? 0;
}

test('with strikes on, enemy strikes land and damage player targets without rendering', () => {
  let state: AiRunState | undefined;
  const healthAtStart = new Map<Entity, number>();
  const { metrics, rewards } = runAiMatch(
    {
      difficulty: DIFFICULTY, seed: SEED, durationSeconds: 120, strikes: true,
      setup: (s) => { setup(s); state = s; for (const e of targets) healthAtStart.set(e, healthOf(s, e)); }
    },
    CURRENT_STRATEGY
  );
  assert.ok(state);
  assert.ok(metrics.rewardCommands > 0, 'the AI never activated a reward');
  assert.ok(rewards.strikeImpacts > 0, `no impacts: ${JSON.stringify(rewards)}`);
  assert.ok(rewards.combatPointsSpent > 0);
  const damaged = targets.some((e) => healthOf(state as AiRunState, e) < (healthAtStart.get(e) ?? 0));
  assert.ok(damaged, 'no player target lost health');
  if (metrics.outcome !== null) assert.equal((state as AiRunState).match.strikes.active.length, 0);
});

test('with strikes off, pending strikes never exceed one and no strike damage is applied', () => {
  let maxPending = 0;
  const watching: AiStrategy = {
    snapshot: CURRENT_STRATEGY.snapshot,
    execute: (state, turn) => {
      const executed = CURRENT_STRATEGY.execute(state, turn);
      maxPending = Math.max(maxPending, state.match.strikes.active.length);
      return executed;
    }
  };
  const base = { difficulty: DIFFICULTY, seed: SEED, durationSeconds: 120, setup } as const;
  const off = runAiMatch({ ...base, strikes: false }, watching);
  const on = runAiMatch({ ...base, strikes: true }, CURRENT_STRATEGY);
  assert.ok(off.metrics.rewardCommands > 0);
  assert.ok(maxPending <= 1, `pending ${maxPending}`);
  assert.equal(off.rewards.strikeImpacts, 0);
  assert.ok(on.rewards.strikeImpacts > 0);

  // Up to the first frame with an impact, both runs spend exactly the same, turn by turn.
  const firstImpactFrame = firstImpact(base);
  let goldOff = 0; let goldOn = 0;
  const turnsOff = off.log.filter((t) => t.frame <= firstImpactFrame);
  const turnsOn = on.log.filter((t) => t.frame <= firstImpactFrame);
  assert.equal(turnsOff.length, turnsOn.length);
  turnsOff.forEach((turn, i) => {
    goldOff += turn.goldBefore - turn.goldAfter;
    goldOn += turnsOn[i].goldBefore - turnsOn[i].goldAfter;
    assert.equal(turn.frame, turnsOn[i].frame);
    assert.equal(goldOff, goldOn, `frame ${turn.frame}`);
  });
  const spentOff = runAiMatch({ ...base, strikes: false, durationSeconds: (firstImpactFrame + 1) / 60 }, CURRENT_STRATEGY).rewards.combatPointsSpent;
  const spentOn = runAiMatch({ ...base, strikes: true, durationSeconds: (firstImpactFrame + 1) / 60 }, CURRENT_STRATEGY).rewards.combatPointsSpent;
  assert.equal(spentOff, spentOn);
});

/** The first frame with an impact in a strikes-on run: the smallest duration with a recorded impact. */
function firstImpact(base: { readonly difficulty: 'hard'; readonly seed: number; readonly setup: (s: AiRunState) => void }): number {
  let low = 1; let high = 120 * 60;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const impacts = runAiMatch({ ...base, durationSeconds: mid / 60, strikes: true }, CURRENT_STRATEGY).rewards.strikeImpacts;
    if (impacts > 0) high = mid; else low = mid + 1;
  }
  return low - 1;
}

test('the runner passes the end-of-frame clock to advanceStrikes', () => {
  // (a) The mark a strike leaves is the end of the frame in which the AI activated it, plus its duration.
  let firstMark: { readonly id: string; readonly until: number } | undefined;
  const recording: AiStrategy = {
    snapshot: CURRENT_STRATEGY.snapshot,
    execute: (state, turn) => {
      const executed = CURRENT_STRATEGY.execute(state, turn);
      const strike = executed.find((r) => r.accepted && r.command.type === 'activateReward');
      if (!firstMark && strike && strike.command.type === 'activateReward') {
        const id = strike.command.reward;
        const until = (state.match.rewards.enemy.strikeActiveUntilMs as Record<string, number | undefined>)[id];
        if (until !== undefined) firstMark = { id, until };
      }
      return executed;
    }
  };
  // Normal prefers artillery, so the first strike is artillery and its timing is derivable.
  const options = { difficulty: 'normal', seed: SEED, strikes: true, setup } as const;
  const { log } = runAiMatch({ ...options, durationSeconds: 60 }, recording);
  const first = log.find((t) => t.executed.some((r) => r.accepted && r.command.type === 'activateReward'));
  assert.ok(first && firstMark, 'the AI activated no strike');
  assert.equal(firstMark.id, 'artillery_strike', 'this seed must open with artillery');
  let clock = 0;
  for (let f = 0; f <= first.frame; f++) clock += FRAME_SECONDS * 1000;
  assert.equal(firstMark.until, clock + 4300);
  assert.ok(Math.abs(firstMark.until - ((first.frame + 1) * FRAME_MS + 4300)) < 1e-6);

  // (b) The first impact lands on the frame where the summed deltas reach launch + flight, not one earlier.
  let elapsed = 0;
  let lastFrame = first.frame - 1;
  do {
    elapsed += FRAME_SECONDS;
    lastFrame++;
  } while (Math.min(1, (elapsed - ARTILLERY_LAUNCH_DELAY_SECONDS) / ARTILLERY_SHELL_FLIGHT_SECONDS) < 1);
  const impactsAfter = (frames: number): number =>
    runAiMatch({ ...options, durationSeconds: frames / 60 }, CURRENT_STRATEGY).rewards.strikeImpacts;
  assert.equal(impactsAfter(lastFrame), 0, `an impact landed before frame ${lastFrame}`);
  assert.ok(impactsAfter(lastFrame + 1) >= 1, `no impact on frame ${lastFrame}`);
});
