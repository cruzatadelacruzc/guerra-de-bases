import assert from 'node:assert/strict';
import test from 'node:test';
import { BattleSimulation } from './BattleSimulation.ts';
import { COMPONENTS, FACTIONS } from './components.ts';
import { World } from './World.ts';
import {
  createInitialBattle,
  ENEMY_BASE_POSITION,
  PLAYER_BASE_POSITION,
  createSoldier,
  createSoldierFactory,
  createStructure
} from './initialBattle.ts';
import { getDifficultyProfile } from '../rewardSystem.ts';
import {
  applyDamageSystem,
  findNearestTarget,
  requestUnitProduction,
  requestSoldierProduction,
  runMovementSystem,
  runResourceGenerationSystem,
  trySpendResources
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

test('production orders atomically spend resources and create one soldier after simulation time', () => {
  const simulation = new BattleSimulation();
  const factory = createSoldierFactory(
    simulation.world,
    FACTIONS.player,
    { x: 4, y: 0, z: 10 }
  );
  const wallet = simulation.world.getComponent(simulation.playerBase, COMPONENTS.economy);
  assert.ok(wallet);
  assert.equal(wallet.gold, 200);

  const accepted = requestUnitProduction(
    simulation.world,
    factory,
    simulation.playerBase,
    'rifleman',
    { x: 3, y: 0, z: 7 }
  );
  assert.deepEqual(accepted, { accepted: true, cost: 50, durationSeconds: 2 });
  assert.equal(wallet.gold, 150);
  assert.equal(simulation.world.query(COMPONENTS.soldier).length, 0);

  assert.deepEqual(
    requestUnitProduction(simulation.world, factory, simulation.playerBase, 'tank'),
    { accepted: false, reason: 'factory-busy' }
  );
  assert.equal(wallet.gold, 150);

  for (let index = 0; index < 21; index++) simulation.advance(0.1);
  const soldiers = simulation.world.query(COMPONENTS.soldier);
  assert.equal(soldiers.length, 1);
  assert.equal(simulation.world.getComponent(soldiers[0], COMPONENTS.soldierKind), 'rifleman');
  const spawnedPosition = simulation.world.getComponent(soldiers[0], COMPONENTS.transform);
  assert.ok(spawnedPosition);
  assert.ok(Math.hypot(spawnedPosition.x - 3, spawnedPosition.z - 7) <= 1);
  assert.equal(simulation.drainProductionEvents().length, 1);
  assert.equal(simulation.world.getComponent(factory, COMPONENTS.production)?.order, undefined);

  for (let index = 0; index < 60; index++) simulation.advance(0.1);
  assert.equal(simulation.world.query(COMPONENTS.soldier).length, 1);
});

test('production rejects unaffordable, faction-mismatched, dead, and invalid factories without spending', () => {
  const simulation = new BattleSimulation();
  const playerFactory = createSoldierFactory(
    simulation.world,
    FACTIONS.player,
    { x: 0, y: 0, z: 10 }
  );
  const enemyFactory = createSoldierFactory(
    simulation.world,
    FACTIONS.enemy,
    { x: 0, y: 0, z: -10 }
  );
  const wallet = simulation.world.getComponent(simulation.playerBase, COMPONENTS.economy);
  assert.ok(wallet);
  wallet.gold = 49;
  assert.deepEqual(
    requestUnitProduction(simulation.world, playerFactory, simulation.playerBase, 'rifleman'),
    { accepted: false, reason: 'insufficient-resources' }
  );
  assert.equal(wallet.gold, 49);

  assert.deepEqual(
    requestUnitProduction(simulation.world, enemyFactory, simulation.playerBase, 'rifleman'),
    { accepted: false, reason: 'invalid-factory' }
  );
  assert.deepEqual(
    requestUnitProduction(simulation.world, simulation.playerBase, simulation.playerBase, 'rifleman'),
    { accepted: false, reason: 'invalid-factory' }
  );
  assert.deepEqual(
    requestUnitProduction(
      simulation.world,
      playerFactory,
      simulation.playerBase,
      'rifleman',
      { x: Number.NaN, y: 0, z: 10 }
    ),
    { accepted: false, reason: 'invalid-order' }
  );
  assert.deepEqual(
    requestUnitProduction(
      simulation.world,
      playerFactory,
      simulation.playerBase,
      'rifleman',
      undefined,
      { health: 0 }
    ),
    { accepted: false, reason: 'invalid-override' }
  );

  wallet.gold = 200;
  applyDamageSystem(simulation.world, playerFactory, 380);
  assert.deepEqual(
    requestUnitProduction(simulation.world, playerFactory, simulation.playerBase, 'rifleman'),
    { accepted: false, reason: 'invalid-factory' }
  );
  assert.equal(wallet.gold, 200);
  assert.equal(trySpendResources(simulation.world, simulation.playerBase, 201), false);
  assert.equal(wallet.gold, 200);
});

test('tank production uses its configured cost, duration, and combat state', () => {
  const simulation = new BattleSimulation();
  const factory = createSoldierFactory(
    simulation.world,
    FACTIONS.player,
    { x: 0, y: 0, z: 10 }
  );
  const accepted = requestUnitProduction(
    simulation.world,
    factory,
    simulation.playerBase,
    'tank',
    undefined,
    { health: 456, weaponDamage: 54 }
  );
  assert.deepEqual(accepted, { accepted: true, cost: 180, durationSeconds: 5 });

  for (let index = 0; index < 49; index++) simulation.advance(0.1);
  assert.equal(simulation.world.query(COMPONENTS.soldier).length, 0);
  for (let index = 0; index < 4; index++) simulation.advance(0.1);

  const [tank] = simulation.world.query(COMPONENTS.soldier);
  assert.ok(tank);
  assert.equal(simulation.world.getComponent(tank, COMPONENTS.soldierKind), 'tank');
  assert.equal(simulation.world.getComponent(tank, COMPONENTS.health)?.max, 456);
  assert.equal(simulation.world.getComponent(tank, COMPONENTS.weapon)?.damage, 54);
});

test('idle Barracks never produce units without an explicit order', () => {
  const simulation = new BattleSimulation();
  createSoldierFactory(simulation.world, FACTIONS.player, { x: 0, y: 0, z: 10 });
  for (let index = 0; index < 300; index++) simulation.advance(0.1);
  assert.deepEqual(simulation.world.query(COMPONENTS.soldier), []);
  assert.deepEqual(simulation.drainProductionEvents(), []);
});

test('buildings and generators store their type and production rates in ECS components', () => {
  const simulation = new BattleSimulation({ enemyBaseIncome: 6 });
  const playerGenerator = createStructure(
    simulation.world,
    FACTIONS.player,
    { x: 4, y: 0, z: 10 },
    380,
    'generator'
  );
  const enemyGenerator = createStructure(
    simulation.world,
    FACTIONS.enemy,
    { x: -4, y: 0, z: -10 },
    380,
    'generator'
  );
  const barracks = createSoldierFactory(
    simulation.world,
    FACTIONS.player,
    { x: 0, y: 0, z: 15 }
  );
  const turret = createStructure(
    simulation.world,
    FACTIONS.player,
    { x: 0, y: 0, z: 20 },
    380,
    'turret'
  );

  assert.deepEqual(simulation.world.getComponent(playerGenerator, COMPONENTS.building), {
    kind: 'generator'
  });
  assert.deepEqual(simulation.world.getComponent(barracks, COMPONENTS.building), {
    kind: 'barracks'
  });
  assert.deepEqual(simulation.world.getComponent(turret, COMPONENTS.building), {
    kind: 'turret'
  });
  assert.equal(simulation.world.getComponent(turret, COMPONENTS.weapon)?.damage, 35);
  assert.equal(simulation.world.getComponent(barracks, COMPONENTS.factory), true);
  assert.equal(
    simulation.world.getComponent(playerGenerator, COMPONENTS.resourceGenerator)?.incomePerSecond,
    12
  );
  assert.equal(
    simulation.world.getComponent(enemyGenerator, COMPONENTS.resourceGenerator)?.incomePerSecond,
    12
  );

  simulation.advance(0.1);
  const income = simulation.drainGeneratedIncome();
  assert.ok(Math.abs(income.player - 1.7) < 0.001);
  assert.ok(Math.abs(income.enemy - 1.8) < 0.001);
  assert.ok(Math.abs(
    (simulation.world.getComponent(simulation.playerBase, COMPONENTS.economy)?.gold ?? 0) - 201.7
  ) < 0.001);
  assert.ok(Math.abs(
    (simulation.world.getComponent(simulation.enemyBase, COMPONENTS.economy)?.gold ?? 0) - 201.8
  ) < 0.001);
});

test('resource generation preserves base income and adds 12 per living generator', () => {
  const difficultyProfiles = [
    {
      name: 'Easy',
      difficulty: 'easy',
      enemyBaseIncome: 6,
      expectedEnemyIncome: [6, 18, 30, 42]
    },
    {
      name: 'Normal',
      difficulty: 'normal',
      enemyBaseIncome: 11,
      expectedEnemyIncome: [11, 23, 35, 47]
    },
    {
      name: 'Hard',
      difficulty: 'hard',
      enemyBaseIncome: 18,
      expectedEnemyIncome: [18, 30, 42, 54]
    }
  ] as const;
  const expectedPlayerIncome = [5, 17, 29, 41];

  for (const profile of difficultyProfiles) {
    assert.equal(getDifficultyProfile(profile.difficulty).enemyBaseIncome, profile.enemyBaseIncome);
    for (let generatorCount = 0; generatorCount <= 3; generatorCount++) {
      const battle = createInitialBattle(profile.enemyBaseIncome);
      const wallets = {
        player: battle.playerBase,
        enemy: battle.enemyBase
      };
      const playerWallet = battle.world.getComponent(battle.playerBase, COMPONENTS.economy);
      const enemyWallet = battle.world.getComponent(battle.enemyBase, COMPONENTS.economy);
      assert.ok(playerWallet);
      assert.ok(enemyWallet);
      assert.equal(playerWallet.gold, 200);
      assert.equal(enemyWallet.gold, 200);

      for (let index = 0; index < generatorCount; index++) {
        const playerGenerator = createStructure(
          battle.world,
          FACTIONS.player,
          { x: index, y: 0, z: 10 },
          380,
          'generator'
        );
        const enemyGenerator = createStructure(
          battle.world,
          FACTIONS.enemy,
          { x: index, y: 0, z: -10 },
          380,
          'generator'
        );
        assert.equal(
          battle.world.getComponent(playerGenerator, COMPONENTS.resourceGenerator)?.incomePerSecond,
          12
        );
        assert.equal(
          battle.world.getComponent(enemyGenerator, COMPONENTS.resourceGenerator)?.incomePerSecond,
          12
        );
      }

      const playerGoldBefore = playerWallet.gold;
      const enemyGoldBefore = enemyWallet.gold;
      runResourceGenerationSystem(battle.world, 1, [], wallets);

      assert.equal(
        playerWallet.gold - playerGoldBefore,
        expectedPlayerIncome[generatorCount],
        `Player income with ${generatorCount} generators`
      );
      assert.equal(
        enemyWallet.gold - enemyGoldBefore,
        profile.expectedEnemyIncome[generatorCount],
        `Enemy ${profile.name} income with ${generatorCount} generators`
      );
    }
  }
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

test('destroyed buildings stop targeting and are removed from the ECS world', () => {
  const battle = createInitialBattle();
  const attacker = createSoldier(battle.world, FACTIONS.player, { x: 0, y: 0, z: 0 });
  const turret = createStructure(
    battle.world,
    FACTIONS.enemy,
    { x: 0, y: 0, z: -5 },
    35,
    'turret'
  );
  const candidates = battle.world.query(COMPONENTS.targetable);

  assert.equal(findNearestTarget(battle.world, attacker, candidates), turret);
  assert.deepEqual(applyDamageSystem(battle.world, turret, 35), {
    current: 0,
    destroyed: true
  });
  assert.notEqual(findNearestTarget(battle.world, attacker, candidates), turret);
  assert.equal(battle.world.removeEntity(turret), true);
  assert.equal(battle.world.getComponent(turret, COMPONENTS.building), undefined);
  assert.equal(battle.world.getComponent(turret, COMPONENTS.weapon), undefined);
});

test('weapons target through ECS and projectiles apply ECS damage on impact', () => {
  const simulation = new BattleSimulation();
  const turret = createStructure(
    simulation.world,
    FACTIONS.player,
    { x: 0, y: 0, z: 0 },
    380,
    'turret'
  );
  const enemyBuilding = createStructure(
    simulation.world,
    FACTIONS.enemy,
    { x: 0, y: 0, z: -5 },
    50,
    'generator'
  );

  simulation.advance(0.1);

  assert.equal(simulation.getTarget(turret), enemyBuilding);
  assert.equal(simulation.world.getComponent(turret, COMPONENTS.targeting)?.target, enemyBuilding);
  assert.equal(simulation.drainWeaponEvents().length, 1);
  simulation.advance(0.1);
  assert.equal(simulation.drainProjectileImpacts().length, 1);
  assert.equal(simulation.world.getComponent(enemyBuilding, COMPONENTS.health)?.current, 15);
  assert.deepEqual(simulation.world.query(COMPONENTS.projectile), []);
});

test('battle damage modifiers apply before authoritative ECS projectile damage', () => {
  const simulation = new BattleSimulation({ modifyDamage: (_target, amount) => amount * 0.5 });
  const turret = createStructure(
    simulation.world,
    FACTIONS.player,
    { x: 0, y: 0, z: 0 },
    380,
    'turret'
  );
  const enemyBuilding = createStructure(
    simulation.world,
    FACTIONS.enemy,
    { x: 0, y: 0, z: -5 },
    50,
    'generator'
  );

  simulation.advance(0.1);
  assert.equal(simulation.getTarget(turret), enemyBuilding);
  simulation.advance(0.1);

  assert.equal(simulation.world.getComponent(enemyBuilding, COMPONENTS.health)?.current, 32.5);
});

test('soldier weapons keep their attack cooldown and damage in ECS state', () => {
  const simulation = new BattleSimulation();
  const soldier = createSoldier(
    simulation.world,
    FACTIONS.player,
    { x: 0, y: 0, z: 0 }
  );
  const enemyBuilding = createStructure(
    simulation.world,
    FACTIONS.enemy,
    { x: 0, y: 0, z: -5 },
    100
  );

  simulation.advance(0.1);
  assert.equal(simulation.drainWeaponEvents().length, 0);
  simulation.advance(0.1);
  simulation.advance(0.1);
  simulation.advance(0.1);
  simulation.advance(0.1);

  assert.equal(simulation.world.getComponent(soldier, COMPONENTS.weapon)?.damage, 12);
  assert.equal(simulation.world.getComponent(soldier, COMPONENTS.weapon)?.cooldownSeconds, 0.35);
  assert.equal(simulation.world.getComponent(enemyBuilding, COMPONENTS.health)?.current, 88);
  assert.equal(simulation.getTarget(soldier), enemyBuilding);
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

test('structures register colliders and soldiers do not move through their footprint', () => {
  const world = new World();
  const soldier = createSoldier(world, FACTIONS.player, { x: 0, y: 0, z: 0 }, 10, 0);
  const structure = createStructure(world, FACTIONS.enemy, { x: 0, y: 0, z: -4 }, 100, 'turret');

  assert.deepEqual(world.getComponent(structure, COMPONENTS.collider), { radius: 1.8 });

  runMovementSystem(world, soldier, { x: 0, y: 0, z: -10 }, 1);
  assert.ok((world.getComponent(soldier, COMPONENTS.transform)?.z ?? -10) > -2);
});

test('a soldier passing outside a structure collider radius is not blocked', () => {
  const world = new World();
  const soldier = createSoldier(world, FACTIONS.player, { x: 0, y: 0, z: 0 }, 10, 0);
  const structure = createStructure(world, FACTIONS.enemy, { x: 3, y: 0, z: -4 }, 100, 'turret');

  assert.deepEqual(world.getComponent(structure, COMPONENTS.collider), { radius: 1.8 });

  runMovementSystem(world, soldier, { x: 0, y: 0, z: -10 }, 1);
  assert.equal(world.getComponent(soldier, COMPONENTS.transform)?.z, -10);
});

test('a destroyed structure no longer blocks soldier movement', () => {
  const world = new World();
  const soldier = createSoldier(world, FACTIONS.player, { x: 0, y: 0, z: 0 }, 10, 0);
  const structure = createStructure(world, FACTIONS.enemy, { x: 0, y: 0, z: -4 }, 100, 'turret');

  assert.deepEqual(applyDamageSystem(world, structure, 100), { current: 0, destroyed: true });

  runMovementSystem(world, soldier, { x: 0, y: 0, z: -10 }, 1);
  assert.equal(world.getComponent(soldier, COMPONENTS.transform)?.z, -10);
});

test('a soldier stops at the nearer of two colliders in its path', () => {
  const world = new World();
  const soldier = createSoldier(world, FACTIONS.player, { x: 0, y: 0, z: 0 }, 10, 0);
  const farStructure = createStructure(world, FACTIONS.enemy, { x: 0, y: 0, z: -8 }, 100, 'turret');
  const nearStructure = createStructure(world, FACTIONS.enemy, { x: 0, y: 0, z: -4 }, 100, 'turret');

  runMovementSystem(world, soldier, { x: 0, y: 0, z: -10 }, 1);
  const finalZ = world.getComponent(soldier, COMPONENTS.transform)?.z ?? -10;
  assert.ok(finalZ > -2, 'soldier should stop at the nearer structure, not pass through it');
  assert.ok(finalZ < -1, 'soldier should actually be blocked, not stay at its starting position');
  assert.ok(farStructure > 0 && nearStructure > 0);
});

test('a soldier blocked by an off-target structure slides around it over several ticks instead of freezing forever', () => {
  // Regression test for the Critical "permanently stuck soldier" bug: a
  // structure that is NOT the soldier's target, sitting directly in its
  // straight-line path, used to stop the soldier dead on the first blocked
  // tick and then re-block it at the same point on every subsequent tick
  // (entry ~= 0 forever) because there was no sliding response. A single
  // `runMovementSystem` call cannot distinguish "stopped, and stuck forever"
  // from "stopped, and able to continue next tick" - both look identical
  // after one call - so this test drives many small ticks (several seconds
  // of simulated time), mirroring the geometry of the
  // "structures register colliders..." test above.
  const world = new World();
  const soldier = createSoldier(world, FACTIONS.player, { x: 0, y: 0, z: 0 }, 10, 0);
  createStructure(world, FACTIONS.enemy, { x: 0, y: 0, z: -4 }, 100, 'turret');
  const target = { x: 0, y: 0, z: -10 };
  const obstacleFarEdgeZ = -4 - (1.8 + 0.5); // collider radius + blocking margin

  const tickSeconds = 0.1;
  const totalTicks = 30; // 3 simulated seconds
  let firstBlockedZ: number | undefined;
  for (let tick = 0; tick < totalTicks; tick++) {
    runMovementSystem(world, soldier, target, tickSeconds);
    const z = world.getComponent(soldier, COMPONENTS.transform)?.z;
    if (firstBlockedZ === undefined && z !== undefined && z > obstacleFarEdgeZ && z < -1.5) {
      firstBlockedZ = z;
    }
  }

  const finalPosition = world.getComponent(soldier, COMPONENTS.transform);
  assert.ok(firstBlockedZ !== undefined, 'the soldier should have been blocked by the structure at some point');
  assert.ok(
    finalPosition !== undefined && finalPosition.z < obstacleFarEdgeZ,
    `soldier should have slid past the obstacle's far edge (z < ${obstacleFarEdgeZ}), got z=${finalPosition?.z}`
  );
  assert.ok(
    finalPosition !== undefined && finalPosition.z < (firstBlockedZ as number) - 1,
    'soldier should have made net progress past where it first got blocked, not frozen there'
  );
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

test('initial battle places both nexuses at their mirrored base positions', () => {
  const { world, playerBase, enemyBase } = createInitialBattle();
  assert.deepEqual(world.getComponent(playerBase, COMPONENTS.transform), PLAYER_BASE_POSITION);
  assert.deepEqual(world.getComponent(enemyBase, COMPONENTS.transform), ENEMY_BASE_POSITION);
  assert.equal(PLAYER_BASE_POSITION.x, ENEMY_BASE_POSITION.x);
  assert.equal(PLAYER_BASE_POSITION.z, -ENEMY_BASE_POSITION.z);
  // Mutating an entity's transform must not move the shared constant.
  const transform = world.getComponent(playerBase, COMPONENTS.transform);
  if (transform) transform.z += 1;
  assert.equal(PLAYER_BASE_POSITION.z, 60);
});
