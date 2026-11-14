import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENTS, FACTIONS } from '../game/ecs/components.ts';
import {
  createInitialBattle,
  createSoldier,
  createSoldierFactory,
  createStructure
} from '../game/ecs/initialBattle.ts';
import { countEntities, createEntityCensus } from './entityCensus.ts';

test('the census counts units and structures by kind and faction, and projectiles in total', () => {
  const { world } = createInitialBattle();
  const origin = { x: 0, y: 0, z: 0 };
  createSoldier(world, FACTIONS.player, origin);
  createSoldier(world, FACTIONS.player, origin, 4.5, 18, 380, 'tank');
  createSoldier(world, FACTIONS.enemy, origin);
  createSoldier(world, FACTIONS.enemy, origin);
  createStructure(world, FACTIONS.player, origin, 380, 'generator');
  createStructure(world, FACTIONS.enemy, origin, 380, 'turret');
  createSoldierFactory(world, FACTIONS.enemy, origin);
  const projectile = world.createEntity();
  world.addComponent(projectile, COMPONENTS.transform, { ...origin });

  const census = countEntities(world, [], createEntityCensus());

  assert.deepEqual(census.player, { rifleman: 1, tank: 1, hq: 1, generator: 1, barracks: 0, turret: 0 });
  assert.deepEqual(census.enemy, { rifleman: 2, tank: 0, hq: 1, generator: 0, barracks: 1, turret: 1 });
  assert.equal(census.projectiles, 0);
  assert.equal(census.total, 10);

  world.addComponent(projectile, COMPONENTS.projectile, {
    target: 1,
    targetPosition: { ...origin },
    damage: 1,
    speed: 1,
    remainingSeconds: 1,
    impactRadius: 1,
    isHeavy: false
  });
  assert.equal(countEntities(world, [], census).projectiles, 1);
});

test('a reused census is reset before counting again', () => {
  const { world } = createInitialBattle();
  const census = createEntityCensus();
  countEntities(world, [], census);
  countEntities(world, [], census);
  assert.equal(census.player.hq, 1);
  assert.equal(census.total, 2);
});
