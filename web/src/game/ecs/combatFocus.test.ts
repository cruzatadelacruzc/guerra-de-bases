import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENTS, FACTIONS } from './components.ts';
import type { Entity } from './components.ts';
import { COMBAT_RANGE_FACTOR, visitCombatPositions } from './combatFocus.ts';
import { createSoldier, createStructure } from './initialBattle.ts';
import { World } from './World.ts';

function collect(world: World): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  visitCombatPositions(world, [] as Entity[], (x, z) => points.push([x, z]));
  return points;
}

function aim(world: World, shooter: Entity, target: Entity): void {
  const targeting = world.getComponent(shooter, COMPONENTS.targeting);
  if (!targeting) throw new Error('shooter needs a targeting component');
  targeting.target = target;
}

test('only units whose target is within reach count as fighting', () => {
  const world = new World();
  const player = createSoldier(world, FACTIONS.player, { x: 0, y: 0, z: 10 });
  const enemy = createSoldier(world, FACTIONS.enemy, { x: 0, y: 0, z: 0 });
  const range = world.getComponent(player, COMPONENTS.weapon)?.range ?? 0;
  assert.ok(10 <= range * COMBAT_RANGE_FACTOR, 'precondition: soldiers 10 apart are within reach');

  assert.deepEqual(collect(world), [], 'no targets assigned yet means no fighting');

  aim(world, player, enemy);
  assert.deepEqual(collect(world), [[0, 10], [0, 0]]);

  // The enemy walks far away: still targeted (nearest enemy) but no longer fighting.
  const enemyPosition = world.getComponent(enemy, COMPONENTS.transform);
  if (!enemyPosition) throw new Error('enemy needs a transform');
  enemyPosition.z = -60;
  assert.deepEqual(collect(world), []);
});

test('unarmed structures are never fighters but can be fought over', () => {
  const world = new World();
  const structure = createStructure(world, FACTIONS.player, { x: 5, y: 0, z: 20 }, 300, 'generator');
  const enemy = createSoldier(world, FACTIONS.enemy, { x: 5, y: 0, z: 12 });
  aim(world, enemy, structure);
  assert.deepEqual(collect(world), [[5, 12], [5, 20]]);
});
