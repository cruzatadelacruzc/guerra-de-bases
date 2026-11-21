import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_AIR_STRIKE_HEADING } from '../rewardSystem.ts';
import { COMPONENTS } from '../ecs/components.ts';
import { createSoldier, createStructure } from '../ecs/initialBattle.ts';
import { applyDamageSystem } from '../ecs/systems.ts';
import { getRewardDefinitionForDifficulty, getStrikePattern, selectStrikeAim } from '../rewardSystem.ts';
import type { Difficulty } from '../rewardSystem.ts';
import { activateReward, rewardTargetCandidates } from './rewardCommand.ts';
import { createCommandTestContext, goldOf, setGold, snapshotCommandState } from './commandTestState.ts';
import type { CommandContext } from './CommandContext.ts';

function assertUnchanged(ctx: CommandContext, run: () => unknown, expected: unknown, label: string) {
  const before = snapshotCommandState(ctx);
  assert.deepEqual(run(), expected, label);
  assert.deepEqual(snapshotCommandState(ctx), before, label);
}

test('an attack is rejected for each missing condition in order, changing nothing', () => {
  const ctx = createCommandTestContext({ nowMs: 1000 });
  setGold(ctx, 'player', 0);
  ctx.match.rewards.player.cooldownUntilMs = 5000;
  const activate = () => activateReward(ctx, 'player', 'artillery_strike');
  assertUnchanged(ctx, activate, { accepted: false, reason: 'insufficient-points' }, 'points');
  ctx.match.combatPoints.player = 100;
  assertUnchanged(ctx, activate, { accepted: false, reason: 'insufficient-gold' }, 'gold');
  setGold(ctx, 'player', 1000);
  assertUnchanged(ctx, activate, { accepted: false, reason: 'no-valid-target' }, 'target');
  createStructure(ctx.world, 'enemy', { x: 0, y: 0, z: -40 }, 380, 'turret');
  assertUnchanged(ctx, activate, { accepted: false, reason: 'cooldown' }, 'cooldown');
  ctx.match.rewards.player.cooldownUntilMs = 1000;
  assert.equal(activate().accepted, true);
});

test('the shield is rejected while active, then by cooldown', () => {
  const ctx = createCommandTestContext({ nowMs: 1000 });
  ctx.match.combatPoints.player = 100;
  setGold(ctx, 'player', 1000);
  ctx.match.rewards.player.shieldUntilMs = 3000;
  ctx.match.rewards.player.cooldownUntilMs = 5000;
  const activate = () => activateReward(ctx, 'player', 'defensive_shield');
  assertUnchanged(ctx, activate, { accepted: false, reason: 'shield-active' }, 'shield');
  ctx.match.rewards.player.shieldUntilMs = 1000;
  assertUnchanged(ctx, activate, { accepted: false, reason: 'cooldown' }, 'cooldown');
});

test('a reward outside an active match changes nothing, however valid', () => {
  for (const { sessionPhase, outcome, reason } of [
    { sessionPhase: 'PLAYING', outcome: 'victory', reason: 'match-over' },
    { sessionPhase: 'PAUSED', outcome: 'defeat', reason: 'match-over' },
    { sessionPhase: 'PAUSED', outcome: null, reason: 'not-playing' },
    { sessionPhase: 'MATCH_ENDING', outcome: null, reason: 'not-playing' }
  ] as const) {
    const ctx = createCommandTestContext({ sessionPhase });
    ctx.match.outcome = outcome;
    ctx.match.combatPoints.player = 100;
    setGold(ctx, 'player', 1000);
    for (const id of ['defensive_shield', 'artillery_strike', 'air_strike'] as const) {
      createStructure(ctx.world, 'enemy', { x: 0, y: 0, z: -40 }, 380, 'turret');
      assertUnchanged(ctx, () => activateReward(ctx, 'player', id, { heading: { x: 0, z: -1 } }), { accepted: false, reason }, `${sessionPhase} ${id}`);
      assert.equal(ctx.match.strikes.active.length, 0, `${sessionPhase} ${id} schedules nothing`);
    }
  }
});

for (const difficulty of ['easy', 'normal', 'hard'] as const satisfies readonly Difficulty[]) {
  test(`an accepted reward spends points and gold and starts this faction's cooldown (${difficulty})`, () => {
    const ctx = createCommandTestContext({ difficulty, nowMs: 2000 });
    for (const faction of ['player', 'enemy'] as const) {
      ctx.match.combatPoints[faction] = 100;
      setGold(ctx, faction, 1000);
    }
    const definition = getRewardDefinitionForDifficulty('defensive_shield', difficulty);
    const result = activateReward(ctx, 'enemy', 'defensive_shield');
    assert.deepEqual(result, { accepted: true, definition });
    assert.equal(ctx.match.combatPoints.enemy, 100 - definition.pointsCost);
    assert.equal(goldOf(ctx, 'enemy'), 1000 - definition.goldCost);
    assert.deepEqual(ctx.match.rewards.enemy, {
      cooldownUntilMs: 17000,
      shieldUntilMs: 2000 + definition.durationSeconds * 1000,
      strikeActiveUntilMs: {}
    });
    assert.deepEqual(ctx.match.rewards.player, { cooldownUntilMs: 0, shieldUntilMs: 0, strikeActiveUntilMs: {} });
    assert.equal(ctx.match.combatPoints.player, 100);
    assert.equal(goldOf(ctx, 'player'), 1000);
  });
}

test('an accepted attack aims where the strike pattern hits most', () => {
  const ctx = createCommandTestContext({ difficulty: 'hard' });
  ctx.match.combatPoints.player = 100;
  setGold(ctx, 'player', 1000);
  createStructure(ctx.world, 'enemy', { x: 10, y: 0, z: -30 }, 380, 'turret');
  createSoldier(ctx.world, 'enemy', { x: -20, y: 0, z: -10 });
  createSoldier(ctx.world, 'enemy', { x: -21, y: 0, z: -11 });
  const expected = selectStrikeAim(rewardTargetCandidates(ctx.world, 'player'), getStrikePattern('air_strike', 'hard'));
  const result = activateReward(ctx, 'player', 'air_strike', { heading: { x: 0, z: -1 } });
  assert.ok(result.accepted);
  assert.ok(expected);
  assert.deepEqual(result.aim, expected);
  assert.equal(ctx.match.rewards.player.shieldUntilMs, 0);
});

test('reward targets are live enemy targets other than the Nexus, read from the ECS', () => {
  const ctx = createCommandTestContext();
  const turret = createStructure(ctx.world, 'enemy', { x: 10, y: 0, z: -30 }, 380, 'turret');
  const soldier = createSoldier(ctx.world, 'enemy', { x: -20, y: 0, z: -10 });
  const dead = createSoldier(ctx.world, 'enemy', { x: 5, y: 0, z: -5 });
  createStructure(ctx.world, 'player', { x: 0, y: 0, z: 40 }, 380, 'turret');
  applyDamageSystem(ctx.world, turret, 80);
  const deadHealth = ctx.world.getComponent(dead, COMPONENTS.health);
  if (!deadHealth) throw new Error('missing health');
  deadHealth.current = 0;
  const soldierHealth = ctx.world.getComponent(soldier, COMPONENTS.health)?.current;
  assert.deepEqual(rewardTargetCandidates(ctx.world, 'player'), [
    { x: 10, z: -30, health: 300, kind: 'structure' },
    { x: -20, z: -10, health: soldierHealth, kind: 'unit' }
  ]);
});

function readyStrikeContext() {
  const ctx = createCommandTestContext({ difficulty: 'hard', nowMs: 1000 });
  ctx.match.combatPoints.player = 100;
  setGold(ctx, 'player', 1000);
  createStructure(ctx.world, 'enemy', { x: 10, y: 0, z: -30 }, 380, 'turret');
  return ctx;
}

test('an accepted strike schedules exactly one strike with the aim and the caller\'s heading', () => {
  const ctx = readyStrikeContext();
  const heading = { x: 0.6, z: -0.8 };
  const result = activateReward(ctx, 'player', 'air_strike', { heading });
  assert.ok(result.accepted && result.strikeId !== undefined && result.aim);
  assert.equal(ctx.match.strikes.active.length, 1);
  const [strike] = ctx.match.strikes.active;
  assert.equal(strike.id, result.strikeId);
  assert.equal(strike.kind, 'air_strike');
  assert.equal(strike.aimX, result.aim.x);
  assert.equal(strike.aimZ, result.aim.z);
  assert.ok(strike.kind === 'air_strike');
  assert.deepEqual(strike.heading, heading);
  const artillery = readyStrikeContext();
  const shelling = activateReward(artillery, 'player', 'artillery_strike');
  assert.ok(shelling.accepted);
  assert.equal(artillery.match.strikes.active.length, 1);
  assert.equal(artillery.match.strikes.active[0].id, shelling.strikeId);
});

test('the shield schedules no strike', () => {
  const ctx = readyStrikeContext();
  const result = activateReward(ctx, 'player', 'defensive_shield');
  assert.ok(result.accepted);
  assert.equal(result.strikeId, undefined);
  assert.equal(ctx.match.strikes.active.length, 0);
});

test('an air strike without a heading or with a non-unit heading throws before charging', () => {
  for (const heading of [undefined, { x: 2, z: 0 }, { x: Number.NaN, z: 0 }, { x: 1 + 2e-6, z: 0 }]) {
    const ctx = readyStrikeContext();
    const before = snapshotCommandState(ctx);
    assert.throws(() => activateReward(ctx, 'player', 'air_strike', heading ? { heading } : undefined));
    assert.deepEqual(snapshotCommandState(ctx), before);
  }
  const paused = { ...readyStrikeContext(), sessionPhase: 'PAUSED' as const };
  assert.throws(() => activateReward(paused, 'player', 'air_strike'));
});

test('the camera fallback heading and the enemy heading are accepted', () => {
  assert.ok(activateReward(readyStrikeContext(), 'player', 'air_strike', { heading: { x: 0, z: -1 } }).accepted);
  assert.ok(activateReward(readyStrikeContext(), 'player', 'air_strike', { heading: ENEMY_AIR_STRIKE_HEADING }).accepted);
});
