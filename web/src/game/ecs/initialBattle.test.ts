import assert from 'node:assert/strict';
import test from 'node:test';
import { BattleSimulation } from './BattleSimulation.ts';
import { COMPONENTS, FACTIONS } from './components.ts';
import { World } from './World.ts';
import {
  createInitialBattle,
  createSoldier,
  createSoldierFactory,
  createStructure
} from './initialBattle.ts';
import {
  applyDamageSystem,
  findNearestTarget,
  requestSoldierProduction,
  runMovementSystem
} from './systems.ts';

test('world queries, type-safe components, removal, and clear preserve entity lifecycle', () => {
  const world = new World();
  const entity = world.createEntity();
  world.addComponent(entity, COMPONENTS.soldier, true);
  world.addComponent(entity, COMPONENTS.faction, FACTIONS.player);

  assert.deepEqual(world.query(COMPONENTS.soldier, COMPONENTS.faction), [entity]);
  assert.equal(world.removeEntity(entity), true);
  assert.deepEqual(world.query(COMPONENTS.soldier), []);
  assert.equal(world.removeEntity(entity), false);

  world.createEntity();
  world.clear();
  assert.deepEqual(world.query(), []);
  assert.equal(world.createEntity(), 1);
});

test('initial battle creates bases with opposing factions and health', () => {
  const battle = createInitialBattle();
  const bases = battle.world.query(COMPONENTS.base);

  assert.deepEqual(bases, [battle.playerBase, battle.enemyBase]);
  assert.equal(battle.world.getComponent(battle.playerBase, COMPONENTS.faction), FACTIONS.player);
  assert.equal(battle.world.getComponent(battle.enemyBase, COMPONENTS.faction), FACTIONS.enemy);
  assert.equal(battle.world.getComponent(battle.playerBase, COMPONENTS.factory), undefined);
  assert.deepEqual(battle.world.getComponent(battle.playerBase, COMPONENTS.health), {
    current: 1200,
    max: 1200
  });
});

test('Nexuses alone do not produce soldiers or authorize a production request', () => {
  const battle = createInitialBattle();
  const simulation = new BattleSimulation();

  assert.equal(requestSoldierProduction(battle.world, battle.playerBase), undefined);
  for (let index = 0; index < 120; index++) simulation.advance(0.1);
  assert.deepEqual(simulation.world.query(COMPONENTS.soldier), []);
});

test('only a living factory can authorize soldier production', () => {
  const battle = createInitialBattle();
  const playerFactory = createSoldierFactory(
    battle.world,
    FACTIONS.player,
    { x: 4, y: 0, z: 10 }
  );
  const enemyFactory = createSoldierFactory(
    battle.world,
    FACTIONS.enemy,
    { x: -4, y: 0, z: -10 }
  );

  assert.deepEqual(requestSoldierProduction(battle.world, playerFactory), {
    faction: FACTIONS.player,
    position: { x: 4, y: 0, z: 7 }
  });
  assert.deepEqual(requestSoldierProduction(battle.world, enemyFactory), {
    faction: FACTIONS.enemy,
    position: { x: -4, y: 0, z: -7 }
  });

  const request = requestSoldierProduction(battle.world, playerFactory);
  assert.ok(request);
  createSoldier(battle.world, request.faction, request.position);
  assert.deepEqual(battle.world.query(COMPONENTS.soldier), [5]);
});

test('destroyed or removed factories cannot authorize further production', () => {
  const battle = createInitialBattle();
  const destroyedFactory = createSoldierFactory(
    battle.world,
    FACTIONS.player,
    { x: 0, y: 0, z: 10 }
  );
  const removedFactory = createSoldierFactory(
    battle.world,
    FACTIONS.enemy,
    { x: 0, y: 0, z: -10 }
  );

  applyDamageSystem(battle.world, destroyedFactory, 380);
  assert.equal(requestSoldierProduction(battle.world, destroyedFactory), undefined);
  assert.equal(battle.world.removeEntity(removedFactory), true);
  assert.equal(requestSoldierProduction(battle.world, removedFactory), undefined);
});

test('targeting selects the nearest living entity of the opposing faction', () => {
  const battle = createInitialBattle();
  const playerSoldier = createSoldier(battle.world, FACTIONS.player, { x: 0, y: 0, z: 0 });
  const distantEnemy = createSoldier(battle.world, FACTIONS.enemy, { x: 0, y: 0, z: -20 });
  const nearbyEnemy = createStructure(battle.world, FACTIONS.enemy, { x: 2, y: 0, z: -3 }, 50);
  const candidates = battle.world.query(COMPONENTS.targetable);

  assert.equal(findNearestTarget(battle.world, playerSoldier, candidates), nearbyEnemy);
  applyDamageSystem(battle.world, nearbyEnemy, 50);
  assert.notEqual(findNearestTarget(battle.world, playerSoldier, candidates), nearbyEnemy);
  assert.ok(distantEnemy > 0);
});

test('movement honors weapon range and never overshoots the engagement distance', () => {
  const world = new World();
  const soldier = createSoldier(world, FACTIONS.player, { x: 0, y: 0, z: 0 }, 4, 2);

  runMovementSystem(world, soldier, { x: 0, y: 0, z: -10 }, 1);
  assert.equal(world.getComponent(soldier, COMPONENTS.transform)?.z, -4);

  runMovementSystem(world, soldier, { x: 0, y: 0, z: -10 }, 5);
  assert.equal(world.getComponent(soldier, COMPONENTS.transform)?.z, -8);
});

test('damage is clamped at zero and rejects invalid values', () => {
  const battle = createInitialBattle();

  assert.deepEqual(applyDamageSystem(battle.world, battle.enemyBase, 100), {
    current: 1100,
    destroyed: false
  });
  assert.deepEqual(applyDamageSystem(battle.world, battle.enemyBase, 5000), {
    current: 0,
    destroyed: true
  });
  assert.throws(() => applyDamageSystem(battle.world, battle.playerBase, -1), RangeError);
});

test('simulation orders production, targeting, and movement on fixed steps', () => {
  const simulation = new BattleSimulation();
  const soldier = createSoldier(
    simulation.world,
    FACTIONS.player,
    { x: 0, y: 0, z: 20 },
    8,
    14
  );

  simulation.advance(0);
  assert.equal(simulation.world.getComponent(soldier, COMPONENTS.transform)?.z, 20);
  assert.equal(simulation.getTarget(soldier), undefined);

  simulation.advance(0.1);
  assert.equal(simulation.getTarget(soldier), simulation.enemyBase);
  assert.ok((simulation.world.getComponent(soldier, COMPONENTS.transform)?.z ?? 20) < 20);
});

test('simulation clamps a long background delta and rejects invalid timing', () => {
  const simulation = new BattleSimulation();
  const soldier = createSoldier(
    simulation.world,
    FACTIONS.player,
    { x: 0, y: 0, z: 20 },
    8,
    0
  );

  simulation.advance(10);
  assert.ok((simulation.world.getComponent(soldier, COMPONENTS.transform)?.z ?? 20) > 19);
  assert.throws(() => simulation.advance(Number.NaN), RangeError);
});
