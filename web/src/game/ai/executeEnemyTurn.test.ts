import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENTS } from '../ecs/components.ts';
import { createSoldier, createStructure } from '../ecs/initialBattle.ts';
import { applyDamageSystem } from '../ecs/systems.ts';
import { buildStructure } from '../commands/structureCommands.ts';
import { trainUnit } from '../commands/trainCommand.ts';
import { createCommandTestContext, goldOf, setGold, snapshotCommandState } from '../commands/commandTestState.ts';
import type { CommandContext } from '../commands/CommandContext.ts';
import { buildEnemyAiSnapshot } from './aiSnapshot.ts';
import { EnemyAiController } from './EnemyAiController.ts';
import { executeEnemyTurn } from './executeEnemyTurn.ts';
import { getEnemyAiProfile } from './enemyAiProfile.ts';
import { LEGACY_STRATEGY } from './legacyEnemyExecutor.ts';
import { sequenceRng } from './testRng.ts';

function enemyBarracks(ctx: CommandContext, x: number, z: number) {
  setGold(ctx, 'enemy', 10000);
  const built = buildStructure(ctx, 'enemy', 'barracks', { x, y: 0, z });
  assert.ok(built.accepted);
  return built.entity;
}

function decideFirstTurn(ctx: CommandContext) {
  const profile = getEnemyAiProfile('normal');
  // Targets at their minimum; then: build a generator at x = 0, z = nearZ; one rifleman, no jitter.
  const controller = new EnemyAiController(profile, sequenceRng([0, 0, 0, 0, 0.5, 0, 0.9, 0.5]));
  const turn = controller.update(profile.decisionIntervalSeconds, () => buildEnemyAiSnapshot(ctx));
  assert.ok(turn);
  return turn;
}

test('a decided turn creates exactly the expected entities, orders and spending', () => {
  const ctx = createCommandTestContext();
  const factory = enemyBarracks(ctx, 20, -30);
  setGold(ctx, 'enemy', 1000);
  const entitiesBefore = ctx.world.query().length;

  const outcomes = executeEnemyTurn(ctx, decideFirstTurn(ctx));

  assert.deepEqual(outcomes.map(({ command, result }) => [command.type, result.accepted]), [['build', true], ['train', true]]);
  const [build] = outcomes;
  assert.ok(build.command.type === 'build' && build.result.accepted && 'entity' in build.result);
  const generator = build.result.entity;
  assert.equal(ctx.world.getComponent(generator, COMPONENTS.building)?.kind, 'generator');
  assert.deepEqual(ctx.world.getComponent(generator, COMPONENTS.transform), { x: 0, y: 0, z: -38 });
  assert.equal(ctx.world.query().length, entitiesBefore + 1);
  const order = ctx.world.getComponent(factory, COMPONENTS.production)?.order;
  assert.equal(order?.kind, 'rifleman');
  assert.deepEqual(order?.spawnPosition, { x: 20, y: 0, z: -27 });
  assert.equal(goldOf(ctx, 'enemy'), 1000 - 100 - 50);
});

test('a paused match rejects every command of the turn and changes nothing', () => {
  const ctx = createCommandTestContext();
  enemyBarracks(ctx, 20, -30);
  setGold(ctx, 'enemy', 1000);
  const turn = decideFirstTurn(ctx);
  const paused = { ...ctx, sessionPhase: 'PAUSED' as const };
  const before = snapshotCommandState(paused);
  const outcomes = executeEnemyTurn(paused, turn);
  assert.equal(outcomes.length, 2);
  for (const { result } of outcomes) assert.deepEqual(result, { accepted: false, reason: 'not-playing' });
  assert.deepEqual(snapshotCommandState(paused), before);
});

test('the snapshot reads the same values as the old one from the ECS and the match state', () => {
  const ctx = createCommandTestContext({ nowMs: 4000 });
  const idle = enemyBarracks(ctx, 20, -30);
  const busy = enemyBarracks(ctx, -20, -30);
  const dead = enemyBarracks(ctx, 0, -50);
  assert.equal(trainUnit(ctx, 'enemy', busy, 'rifleman', { x: -20, y: 0, z: -27 }).accepted, true);
  const deadHealth = ctx.world.getComponent(dead, COMPONENTS.health);
  if (!deadHealth) throw new Error('missing health');
  deadHealth.current = 0;
  createStructure(ctx.world, 'enemy', { x: 10, y: 0, z: -45 }, 380, 'generator');
  createStructure(ctx.world, 'enemy', { x: 0, y: 0, z: -15 }, 380, 'turret');
  createSoldier(ctx.world, 'player', { x: 0, y: 0, z: 10 });
  applyDamageSystem(ctx.world, ctx.bases.enemy, 300);
  ctx.match.combatPoints.enemy = 12;
  ctx.match.rewards.enemy = { cooldownUntilMs: 9000, shieldUntilMs: 6000, strikeActiveUntilMs: {} };

  const snapshot = buildEnemyAiSnapshot(ctx);
  const legacy = LEGACY_STRATEGY.snapshot({ ...ctx });
  assert.deepEqual({ ...snapshot, rewardCooldownUntilMs: 0, shieldActive: false }, legacy);
  assert.equal(snapshot.rewardCooldownUntilMs, 9000);
  assert.equal(snapshot.shieldActive, true);
  assert.deepEqual(snapshot.idleFactories.map(({ entity }) => entity), [idle]);
  assert.equal(snapshot.validRewardTargetCount, 1);
  assert.equal(snapshot.nexusHealthRatio, 900 / 1200);
});
