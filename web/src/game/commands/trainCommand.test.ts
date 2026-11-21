import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENTS } from '../ecs/components.ts';
import type { Position } from '../ecs/components.ts';
import { SOLDIER_PRODUCTION } from '../ecs/initialBattle.ts';
import { buildStructure } from './structureCommands.ts';
import { idleFactories, liveFactories, trainUnit } from './trainCommand.ts';
import { createCommandTestContext, goldOf, setGold, snapshotCommandState } from './commandTestState.ts';
import type { CommandContext } from './CommandContext.ts';

const at = (x: number, z: number): Position => ({ x, y: 0, z });

function barracks(ctx: CommandContext, faction: 'player' | 'enemy', x: number) {
  setGold(ctx, faction, 10000);
  const built = buildStructure(ctx, faction, 'barracks', at(x, faction === 'player' ? 40 : -40));
  assert.ok(built.accepted);
  return built.entity;
}

test('training spends the unit cost and queues the order at the spawn point', () => {
  const ctx = createCommandTestContext();
  const factory = barracks(ctx, 'player', 0);
  setGold(ctx, 'player', 1000);
  const spawn = at(1, 37);
  const result = trainUnit(ctx, 'player', factory, 'tank', spawn);
  assert.equal(result.accepted, true);
  assert.equal(goldOf(ctx, 'player'), 1000 - SOLDIER_PRODUCTION.tank.cost);
  const order = ctx.world.getComponent(factory, COMPONENTS.production)?.order;
  assert.equal(order?.kind, 'tank');
  assert.deepEqual(order?.spawnPosition, spawn);
});

test('a rejected training order changes nothing', () => {
  const ctx = createCommandTestContext();
  const busy = barracks(ctx, 'player', -10);
  const idle = barracks(ctx, 'player', 10);
  const enemyFactory = barracks(ctx, 'enemy', 0);
  const dead = barracks(ctx, 'player', 20);
  setGold(ctx, 'player', 1000);
  assert.equal(trainUnit(ctx, 'player', busy, 'rifleman', at(-10, 37)).accepted, true);
  const health = ctx.world.getComponent(dead, COMPONENTS.health);
  if (!health) throw new Error('missing health');
  health.current = 0;

  const cases = [
    { name: 'busy', factory: busy, gold: 1000, reason: 'factory-busy' },
    { name: 'no gold', factory: idle, gold: 0, reason: 'insufficient-resources' },
    { name: 'other faction', factory: enemyFactory, gold: 1000, reason: 'invalid-factory' },
    { name: 'dead', factory: dead, gold: 1000, reason: 'invalid-factory' }
  ] as const;
  for (const { name, factory, gold, reason } of cases) {
    setGold(ctx, 'player', gold);
    const before = snapshotCommandState(ctx);
    assert.deepEqual(trainUnit(ctx, 'player', factory, 'rifleman', at(0, 37)), { accepted: false, reason }, name);
    assert.deepEqual(snapshotCommandState(ctx), before, name);
  }
});

test('training outside an active match changes nothing', () => {
  for (const { sessionPhase, outcome, reason } of [
    { sessionPhase: 'PLAYING', outcome: 'victory', reason: 'match-over' },
    { sessionPhase: 'PAUSED', outcome: null, reason: 'not-playing' },
    { sessionPhase: 'MATCH_ENDING', outcome: null, reason: 'not-playing' }
  ] as const) {
    const ctx = createCommandTestContext();
    const factory = barracks(ctx, 'player', 0);
    const stopped = { ...ctx, sessionPhase };
    stopped.match.outcome = outcome;
    const before = snapshotCommandState(stopped);
    assert.deepEqual(trainUnit(stopped, 'player', factory, 'rifleman', at(0, 37)), { accepted: false, reason });
    assert.deepEqual(snapshotCommandState(stopped), before);
  }
});

test('factory queries keep creation order and skip dead, foreign and busy barracks', () => {
  const ctx = createCommandTestContext();
  const first = barracks(ctx, 'player', -20);
  const second = barracks(ctx, 'player', -10);
  const third = barracks(ctx, 'player', 0);
  const dead = barracks(ctx, 'player', 10);
  barracks(ctx, 'enemy', 0);
  const health = ctx.world.getComponent(dead, COMPONENTS.health);
  if (!health) throw new Error('missing health');
  health.current = 0;
  assert.equal(trainUnit(ctx, 'player', second, 'rifleman', at(-10, 37)).accepted, true);

  assert.deepEqual(liveFactories(ctx.world, 'player'), [first, second, third]);
  assert.deepEqual(idleFactories(ctx.world, 'player'), [first, third]);
});
