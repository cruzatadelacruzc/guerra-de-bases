import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENTS } from '../ecs/components.ts';
import type { Position } from '../ecs/components.ts';
import { createStructure } from '../ecs/initialBattle.ts';
import { buildStructure, sellStructure } from './structureCommands.ts';
import { createCommandTestContext, goldOf, setGold, snapshotCommandState } from './commandTestState.ts';

const at = (x: number, z: number): Position => ({ x, y: 0, z });

test('building spends the cost and creates the structure', () => {
  const ctx = createCommandTestContext();
  setGold(ctx, 'player', 1000);
  const generator = buildStructure(ctx, 'player', 'generator', at(-10, 40));
  assert.equal(goldOf(ctx, 'player'), 900);
  const barracks = buildStructure(ctx, 'player', 'barracks', at(0, 40));
  assert.equal(goldOf(ctx, 'player'), 750);
  const turret = buildStructure(ctx, 'player', 'turret', at(10, 40));
  assert.equal(goldOf(ctx, 'player'), 625);
  assert.ok(generator.accepted && barracks.accepted && turret.accepted);
  assert.deepEqual([generator.cost, barracks.cost, turret.cost], [100, 150, 125]);

  const { world } = ctx;
  for (const [result, kind] of [[generator, 'generator'], [barracks, 'barracks'], [turret, 'turret']] as const) {
    assert.equal(world.getComponent(result.entity, COMPONENTS.building)?.kind, kind);
    assert.equal(world.getComponent(result.entity, COMPONENTS.faction), 'player');
    assert.deepEqual(world.getComponent(result.entity, COMPONENTS.health), { current: 380, max: 380 });
    assert.ok(world.getComponent(result.entity, COMPONENTS.collider));
  }
  assert.deepEqual(world.getComponent(barracks.entity, COMPONENTS.transform), at(0, 40));
  assert.ok(world.getComponent(barracks.entity, COMPONENTS.factory));
  assert.deepEqual(world.getComponent(barracks.entity, COMPONENTS.production), { order: undefined });
  assert.equal(world.getComponent(generator.entity, COMPONENTS.resourceGenerator)?.incomePerSecond, 12);
  assert.ok(world.getComponent(turret.entity, COMPONENTS.weapon));
  assert.ok(world.getComponent(turret.entity, COMPONENTS.targeting));
});

test('a rejected build changes nothing', () => {
  const cases = [
    { name: 'insufficient-gold', gold: 99, position: at(0, 40), reason: 'insufficient-gold' },
    { name: 'too-close', gold: 1000, position: at(1, 40), reason: 'too-close' },
    { name: 'outside-zone', gold: 1000, position: at(0, 80), reason: 'outside-zone' }
  ] as const;
  for (const { name, gold, position, reason } of cases) {
    const ctx = createCommandTestContext();
    setGold(ctx, 'player', gold);
    createStructure(ctx.world, 'player', at(0, 40), 380, 'turret');
    if (name === 'insufficient-gold') ctx.world.removeEntity(ctx.world.query(COMPONENTS.structure)[0]);
    const before = snapshotCommandState(ctx);
    assert.deepEqual(buildStructure(ctx, 'player', 'generator', position), { accepted: false, reason }, name);
    assert.deepEqual(snapshotCommandState(ctx), before, name);
  }
});

test('a build outside an active match changes nothing', () => {
  const cases = [
    { sessionPhase: 'PLAYING', outcome: 'victory', reason: 'match-over' },
    { sessionPhase: 'PAUSED', outcome: 'defeat', reason: 'match-over' },
    { sessionPhase: 'PAUSED', outcome: null, reason: 'not-playing' },
    { sessionPhase: 'MATCH_ENDING', outcome: null, reason: 'not-playing' }
  ] as const;
  for (const { sessionPhase, outcome, reason } of cases) {
    const ctx = createCommandTestContext({ sessionPhase });
    ctx.match.outcome = outcome;
    setGold(ctx, 'player', 1000);
    const before = snapshotCommandState(ctx);
    assert.deepEqual(buildStructure(ctx, 'player', 'generator', at(0, 40)), { accepted: false, reason });
    assert.deepEqual(snapshotCommandState(ctx), before);
  }
});

test('the AI and the player share the placement rule', () => {
  const ctx = createCommandTestContext();
  setGold(ctx, 'enemy', 1000);
  createStructure(ctx.world, 'enemy', at(0, -40), 380, 'turret');
  assert.deepEqual(buildStructure(ctx, 'enemy', 'generator', at(2, -40)), { accepted: false, reason: 'too-close' });
  assert.equal(goldOf(ctx, 'enemy'), 1000);
});

test('selling refunds 70 % and removes the entity', () => {
  const ctx = createCommandTestContext();
  setGold(ctx, 'player', 1000);
  const refunds = { generator: 70, barracks: 105, turret: 87 } as const;
  let x = -20;
  for (const kind of ['generator', 'barracks', 'turret'] as const) {
    const position = at(x, 40);
    x += 10;
    const built = buildStructure(ctx, 'player', kind, position);
    assert.ok(built.accepted);
    const goldBefore = goldOf(ctx, 'player');
    assert.deepEqual(sellStructure(ctx, 'player', built.entity), { accepted: true, refund: refunds[kind], kind, position });
    assert.equal(goldOf(ctx, 'player'), goldBefore + refunds[kind]);
    assert.equal(ctx.world.query().includes(built.entity), false);
  }
});

test('a rejected sale changes nothing', () => {
  const ctx = createCommandTestContext();
  setGold(ctx, 'enemy', 1000);
  const enemyTurret = buildStructure(ctx, 'enemy', 'turret', at(0, -40));
  assert.ok(enemyTurret.accepted);
  const removed = createStructure(ctx.world, 'player', at(0, 40), 380, 'turret');
  ctx.world.removeEntity(removed);
  const cases = [
    { entity: ctx.bases.player, reason: 'not-sellable' },
    { entity: enemyTurret.entity, reason: 'not-owned' },
    { entity: removed, reason: 'not-found' }
  ] as const;
  for (const { entity, reason } of cases) {
    const before = snapshotCommandState(ctx);
    assert.deepEqual(sellStructure(ctx, 'player', entity), { accepted: false, reason });
    assert.deepEqual(snapshotCommandState(ctx), before, reason);
  }
});

test('a sale outside an active match changes nothing', () => {
  for (const { sessionPhase, outcome, reason } of [
    { sessionPhase: 'PLAYING', outcome: 'defeat', reason: 'match-over' },
    { sessionPhase: 'PAUSED', outcome: null, reason: 'not-playing' }
  ] as const) {
    const ctx = createCommandTestContext();
    setGold(ctx, 'player', 1000);
    const built = buildStructure(ctx, 'player', 'turret', at(0, 40));
    assert.ok(built.accepted);
    const stopped = { ...ctx, sessionPhase };
    stopped.match.outcome = outcome;
    const before = snapshotCommandState(stopped);
    assert.deepEqual(sellStructure(stopped, 'player', built.entity), { accepted: false, reason });
    assert.deepEqual(snapshotCommandState(stopped), before);
  }
});
