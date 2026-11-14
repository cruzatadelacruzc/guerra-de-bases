import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENTS, FACTIONS } from '../ecs/components.ts';
import { createInitialBattle, createSoldierFactory } from '../ecs/initialBattle.ts';
import { NEXUS_HEALTH, STRUCTURE_DEFINITIONS } from './structures.ts';

test('buildable structures keep their current costs and health', () => {
  assert.deepEqual(STRUCTURE_DEFINITIONS, {
    generator: { cost: 100, health: 380 },
    barracks: { cost: 150, health: 380 },
    turret: { cost: 125, health: 380 }
  });
  assert.equal(NEXUS_HEALTH, 1200);
});

test('the definitions cannot be changed at runtime', () => {
  assert.ok(Object.isFrozen(STRUCTURE_DEFINITIONS));
  for (const definition of Object.values(STRUCTURE_DEFINITIONS)) assert.ok(Object.isFrozen(definition));
});

test('both Nexus entities and a default barracks take their health from the definitions', () => {
  const { world, playerBase, enemyBase } = createInitialBattle();
  for (const base of [playerBase, enemyBase]) {
    assert.deepEqual(world.getComponent(base, COMPONENTS.health), { current: NEXUS_HEALTH, max: NEXUS_HEALTH });
  }
  const barracks = createSoldierFactory(world, FACTIONS.enemy, { x: 0, y: 0, z: 0 });
  assert.equal(world.getComponent(barracks, COMPONENTS.health)?.max, STRUCTURE_DEFINITIONS.barracks.health);
});
