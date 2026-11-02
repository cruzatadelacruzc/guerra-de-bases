import { COMPONENTS, FACTIONS } from './components.ts';
import type { Entity, Faction, Position, SoldierKind, Weapon } from './components.ts';
import { World } from './World.ts';

const BASE_HEALTH = 1200;
const SOLDIER_SPEED = 8;
const SOLDIER_RANGE = 14;
export interface SoldierProductionDefinition {
  cost: number;
  durationSeconds: number;
  health: number;
  speed: number;
  range: number;
  weapon: Omit<Weapon, 'cooldownRemaining'>;
}

export const DEFAULT_SOLDIER_WEAPONS: Readonly<Record<SoldierKind, Omit<Weapon, 'cooldownRemaining'>>> =
  Object.freeze({
    rifleman: {
      damage: 12,
      range: SOLDIER_RANGE,
      cooldownSeconds: 0.35,
      projectileSpeed: 38,
      projectileLifetime: 5,
      impactRadius: 1.2,
      isHeavy: false,
      originHeight: 0.8
    },
    tank: {
      damage: 45,
      range: 18,
      cooldownSeconds: 1.2,
      projectileSpeed: 38,
      projectileLifetime: 5,
      impactRadius: 1.2,
      isHeavy: true,
      originHeight: 1.2
    }
  });
export const SOLDIER_PRODUCTION: Readonly<Record<SoldierKind, SoldierProductionDefinition>> =
  Object.freeze({
    rifleman: {
      cost: 50,
      durationSeconds: 2,
      health: 100,
      speed: SOLDIER_SPEED,
      range: SOLDIER_RANGE,
      weapon: DEFAULT_SOLDIER_WEAPONS.rifleman
    },
    tank: {
      cost: 180,
      durationSeconds: 5,
      health: 380,
      speed: 4.5,
      range: 18,
      weapon: DEFAULT_SOLDIER_WEAPONS.tank
    }
  });
const TURRET_WEAPON: Omit<Weapon, 'cooldownRemaining'> = Object.freeze({
  damage: 35,
  range: 22,
  cooldownSeconds: 0.8,
  projectileSpeed: 38,
  projectileLifetime: 5,
  impactRadius: 1.2,
  isHeavy: true,
  originHeight: 1.8
});

export function createInitialBattle(enemyBaseIncome = 11): {
  world: World;
  playerBase: Entity;
  enemyBase: Entity;
} {
  const world = new World();
  const playerBase = createBase(world, FACTIONS.player, { x: 0, y: 0, z: 45 }, 5);
  const enemyBase = createBase(world, FACTIONS.enemy, { x: 0, y: 0, z: -45 }, enemyBaseIncome);
  return { world, playerBase, enemyBase };
}

export function createBase(
  world: World,
  faction: Faction,
  position: Position,
  incomePerSecond = faction === FACTIONS.player ? 5 : 11
): Entity {
  const entity = world.createEntity();
  world.addComponent(entity, COMPONENTS.base, true);
  world.addComponent(entity, COMPONENTS.building, { kind: 'hq' });
  world.addComponent(entity, COMPONENTS.targetable, true);
  world.addComponent(entity, COMPONENTS.faction, faction);
  world.addComponent(entity, COMPONENTS.transform, { ...position });
  world.addComponent(entity, COMPONENTS.health, { current: BASE_HEALTH, max: BASE_HEALTH });
  world.addComponent(entity, COMPONENTS.economy, { gold: 200 });
  world.addComponent(entity, COMPONENTS.resourceGenerator, { incomePerSecond });
  return entity;
}

export function createStructure(
  world: World,
  faction: Faction,
  position: Position,
  health: number,
  kind?: 'generator' | 'turret'
): Entity {
  const entity = world.createEntity();
  world.addComponent(entity, COMPONENTS.structure, true);
  if (kind) world.addComponent(entity, COMPONENTS.building, { kind });
  world.addComponent(entity, COMPONENTS.targetable, true);
  world.addComponent(entity, COMPONENTS.faction, faction);
  world.addComponent(entity, COMPONENTS.transform, { ...position });
  world.addComponent(entity, COMPONENTS.health, { current: health, max: health });
  if (kind === 'generator') {
    world.addComponent(entity, COMPONENTS.resourceGenerator, {
      incomePerSecond: faction === FACTIONS.player ? 12 : 16
    });
  } else if (kind === 'turret') {
    world.addComponent(entity, COMPONENTS.weapon, {
      ...TURRET_WEAPON,
      cooldownRemaining: 0
    });
    world.addComponent(entity, COMPONENTS.targeting, { target: undefined });
  }
  return entity;
}

export function createSoldierFactory(
  world: World,
  faction: Faction,
  position: Position,
  health = 380
): Entity {
  const entity = createStructure(world, faction, position, health);
  world.addComponent(entity, COMPONENTS.building, { kind: 'barracks' });
  world.addComponent(entity, COMPONENTS.factory, true);
  world.addComponent(entity, COMPONENTS.production, { order: undefined });
  return entity;
}

export function createSoldier(
  world: World,
  faction: Faction,
  position: Position,
  speed = SOLDIER_SPEED,
  range = SOLDIER_RANGE,
  health = 100,
  kind: SoldierKind = 'rifleman',
  weaponOverrides: Partial<Omit<Weapon, 'cooldownRemaining'>> = {}
): Entity {
  const entity = world.createEntity();
  world.addComponent(entity, COMPONENTS.soldier, true);
  world.addComponent(entity, COMPONENTS.soldierKind, kind);
  world.addComponent(entity, COMPONENTS.targeting, { target: undefined });
  world.addComponent(entity, COMPONENTS.targetable, true);
  world.addComponent(entity, COMPONENTS.faction, faction);
  world.addComponent(entity, COMPONENTS.transform, { ...position });
  world.addComponent(entity, COMPONENTS.movement, { speed, range });
  world.addComponent(entity, COMPONENTS.health, { current: health, max: health });
  const weapon = { ...DEFAULT_SOLDIER_WEAPONS[kind], ...weaponOverrides, range };
  world.addComponent(entity, COMPONENTS.weapon, {
    ...weapon,
    cooldownRemaining: weapon.cooldownSeconds
  });
  return entity;
}
