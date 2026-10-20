import { COMPONENTS, FACTIONS } from './components.ts';
import type { Entity, Faction, Position } from './components.ts';
import { World } from './World.ts';

const BASE_HEALTH = 1200;
const SOLDIER_SPEED = 8;
const SOLDIER_RANGE = 14;

export function createInitialBattle(): {
  world: World;
  playerBase: Entity;
  enemyBase: Entity;
} {
  const world = new World();
  const playerBase = createBase(world, FACTIONS.player, { x: 0, y: 0, z: 45 });
  const enemyBase = createBase(world, FACTIONS.enemy, { x: 0, y: 0, z: -45 });
  return { world, playerBase, enemyBase };
}

export function createBase(world: World, faction: Faction, position: Position): Entity {
  const entity = world.createEntity();
  world.addComponent(entity, COMPONENTS.base, true);
  world.addComponent(entity, COMPONENTS.targetable, true);
  world.addComponent(entity, COMPONENTS.faction, faction);
  world.addComponent(entity, COMPONENTS.transform, { ...position });
  world.addComponent(entity, COMPONENTS.health, { current: BASE_HEALTH, max: BASE_HEALTH });
  return entity;
}

export function createStructure(
  world: World,
  faction: Faction,
  position: Position,
  health: number
): Entity {
  const entity = world.createEntity();
  world.addComponent(entity, COMPONENTS.structure, true);
  world.addComponent(entity, COMPONENTS.targetable, true);
  world.addComponent(entity, COMPONENTS.faction, faction);
  world.addComponent(entity, COMPONENTS.transform, { ...position });
  world.addComponent(entity, COMPONENTS.health, { current: health, max: health });
  return entity;
}

export function createSoldierFactory(
  world: World,
  faction: Faction,
  position: Position,
  health = 380
): Entity {
  const entity = createStructure(world, faction, position, health);
  world.addComponent(entity, COMPONENTS.factory, true);
  return entity;
}

export function createSoldier(
  world: World,
  faction: Faction,
  position: Position,
  speed = SOLDIER_SPEED,
  range = SOLDIER_RANGE,
  health = 100
): Entity {
  const entity = world.createEntity();
  world.addComponent(entity, COMPONENTS.soldier, true);
  world.addComponent(entity, COMPONENTS.targetable, true);
  world.addComponent(entity, COMPONENTS.faction, faction);
  world.addComponent(entity, COMPONENTS.transform, { ...position });
  world.addComponent(entity, COMPONENTS.movement, { speed, range });
  world.addComponent(entity, COMPONENTS.health, { current: health, max: health });
  return entity;
}
