import { COMPONENTS, FACTIONS } from './components.ts';
import type {
  Entity,
  Faction,
  Position,
  ProductionOrder as ProductionOrderState,
  Projectile,
  SoldierKind
} from './components.ts';
import { createSoldier, SOLDIER_PRODUCTION } from './initialBattle.ts';
import { World } from './World.ts';

export interface ProductionOrder {
  faction: Faction;
  position: Position;
}

export interface DamageResult {
  current: number;
  destroyed: boolean;
}

export interface WeaponFireEvent {
  source: Entity;
  projectile: Entity;
}

export interface ProjectileImpact {
  projectile: Entity;
  target: Entity;
  position: Position;
  isHeavy: boolean;
}

export interface ResourceIncome {
  player: number;
  enemy: number;
}

export interface ProductionCompletedEvent {
  factory: Entity;
  soldier: Entity;
  kind: SoldierKind;
  faction: Faction;
}

export type ProductionOrderResult =
  | { accepted: true; cost: number; durationSeconds: number }
  | {
    accepted: false;
    reason: 'invalid-factory' | 'factory-busy' | 'insufficient-resources'
      | 'invalid-order' | 'invalid-override';
  };

export interface ProductionOverrides {
  health?: number;
  weaponDamage?: number;
}

export type ProjectileAdvanceResult = 'moving' | 'impact' | 'expired';

export interface ProjectileFlight {
  position: Position;
  target: Position;
  remainingSeconds: number;
}

export function requestSoldierProduction(
  world: World,
  factory: Entity,
  spawnPosition?: Position
): ProductionOrder | undefined {
  if (!world.getComponent(factory, COMPONENTS.factory)) return undefined;
  const health = world.getComponent(factory, COMPONENTS.health);
  const faction = world.getComponent(factory, COMPONENTS.faction);
  const transform = world.getComponent(factory, COMPONENTS.transform);
  const building = world.getComponent(factory, COMPONENTS.building);
  if (!health || health.current <= 0 || !faction || !transform
    || building?.kind !== 'barracks') return undefined;

  return {
    faction,
    position: {
      x: spawnPosition?.x ?? transform.x,
      y: spawnPosition?.y ?? transform.y,
      z: spawnPosition?.z ?? transform.z + (faction === FACTIONS.player ? -3 : 3)
    }
  };
}

export function findNearestTarget(
  world: World,
  source: Entity,
  candidates: readonly Entity[]
): Entity | undefined {
  const sourceFaction = world.getComponent(source, COMPONENTS.faction);
  const sourcePosition = world.getComponent(source, COMPONENTS.transform);
  if (!sourceFaction || !sourcePosition) return undefined;

  let nearest: Entity | undefined;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate === source || world.getComponent(candidate, COMPONENTS.faction) === sourceFaction) continue;

    const health = world.getComponent(candidate, COMPONENTS.health);
    const position = world.getComponent(candidate, COMPONENTS.transform);
    if (!health || health.current <= 0 || !position) continue;

    const deltaX = position.x - sourcePosition.x;
    const deltaZ = position.z - sourcePosition.z;
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (distanceSquared < nearestDistanceSquared) {
      nearest = candidate;
      nearestDistanceSquared = distanceSquared;
    }
  }
  return nearest;
}

export function runMovementSystem(
  world: World,
  entity: Entity,
  target: Position,
  deltaSeconds: number,
  obstacles?: readonly Entity[]
): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError('Movement delta must be a finite, non-negative number');
  }

  const transform = world.getComponent(entity, COMPONENTS.transform);
  const movement = world.getComponent(entity, COMPONENTS.movement);
  if (!world.getComponent(entity, COMPONENTS.soldier) || !transform || !movement) {
    throw new Error(`Entity ${entity} is missing soldier movement components`);
  }

  const deltaX = target.x - transform.x;
  const deltaZ = target.z - transform.z;
  const distance = Math.hypot(deltaX, deltaZ);
  const distanceToTravel = Math.max(0, distance - movement.range);
  const travelDistance = Math.min(distanceToTravel, movement.speed * deltaSeconds);

  if (distance > 0 && travelDistance > 0) {
    const nextX = transform.x + (deltaX / distance) * travelDistance;
    const nextZ = transform.z + (deltaZ / distance) * travelDistance;
    // `obstacles` is optional so non-hot-path callers (tests) can omit it; the
    // production hot path (BattleSimulation) always passes a persistent,
    // allocation-free array. When omitted, fall back to a one-off query.
    const colliders = obstacles ?? world.query(COMPONENTS.collider, COMPONENTS.transform, COMPONENTS.health);
    const blocked = findBlockingCollider(world, entity, transform, nextX, nextZ, colliders);
    transform.x = blocked?.x ?? nextX;
    transform.z = blocked?.z ?? nextZ;
  }
  return Math.max(0, distance - travelDistance);
}

function findBlockingCollider(
  world: World,
  movingEntity: Entity,
  start: Position,
  nextX: number,
  nextZ: number,
  obstacles: readonly Entity[]
): Position | undefined {
  const deltaX = nextX - start.x;
  const deltaZ = nextZ - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared === 0) return undefined;

  let earliest: Position | undefined;
  let earliestT = Number.POSITIVE_INFINITY;
  for (const obstacle of obstacles) {
    if (obstacle === movingEntity) continue;
    const health = world.getComponent(obstacle, COMPONENTS.health);
    const collider = world.getComponent(obstacle, COMPONENTS.collider);
    const position = world.getComponent(obstacle, COMPONENTS.transform);
    if (!health || health.current <= 0 || !collider || !position) continue;

    const relativeX = start.x - position.x;
    const relativeZ = start.z - position.z;
    const radius = collider.radius + 0.5;
    const a = lengthSquared;
    const b = 2 * (relativeX * deltaX + relativeZ * deltaZ);
    const c = relativeX * relativeX + relativeZ * relativeZ - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) continue;

    const entry = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (entry < 0 || entry > 1 || entry >= earliestT) continue;
    const safeT = Math.max(0, entry - 0.001);
    earliestT = entry;
    earliest = { x: start.x + deltaX * safeT, y: start.y, z: start.z + deltaZ * safeT };
  }
  return earliest;
}

export function applyDamageSystem(world: World, entity: Entity, amount: number): DamageResult {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError('Damage must be a finite, non-negative number');
  }

  const health = world.getComponent(entity, COMPONENTS.health);
  if (!health) throw new Error(`Entity ${entity} has no health component`);
  health.current = Math.max(0, health.current - amount);
  return { current: health.current, destroyed: health.current === 0 };
}

export function trySpendResources(world: World, economyEntity: Entity, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError('Resource cost must be a finite, non-negative number');
  }

  const economy = world.getComponent(economyEntity, COMPONENTS.economy);
  if (!economy || economy.gold < amount) return false;
  economy.gold -= amount;
  return true;
}

export function requestUnitProduction(
  world: World,
  factory: Entity,
  economyEntity: Entity,
  kind: SoldierKind,
  spawnPosition?: Position,
  overrides: ProductionOverrides = {}
): ProductionOrderResult {
  if (!SOLDIER_PRODUCTION[kind]
    || (spawnPosition !== undefined
      && ![spawnPosition.x, spawnPosition.y, spawnPosition.z].every(Number.isFinite))) {
    return { accepted: false, reason: 'invalid-order' };
  }
  const production = world.getComponent(factory, COMPONENTS.production);
  const factoryOrder = requestSoldierProduction(world, factory, spawnPosition);
  const economy = world.getComponent(economyEntity, COMPONENTS.economy);
  const economyFaction = world.getComponent(economyEntity, COMPONENTS.faction);
  if (!production || !factoryOrder || !economy || economyFaction !== factoryOrder.faction) {
    return { accepted: false, reason: 'invalid-factory' };
  }
  if (production.order) return { accepted: false, reason: 'factory-busy' };
  if ((overrides.health !== undefined
      && (!Number.isFinite(overrides.health) || overrides.health <= 0))
    || (overrides.weaponDamage !== undefined
      && (!Number.isFinite(overrides.weaponDamage) || overrides.weaponDamage <= 0))) {
    return { accepted: false, reason: 'invalid-override' };
  }

  const definition = SOLDIER_PRODUCTION[kind];
  if (economy.gold < definition.cost) {
    return { accepted: false, reason: 'insufficient-resources' };
  }

  const order: ProductionOrderState = {
    kind,
    durationSeconds: definition.durationSeconds,
    remainingSeconds: definition.durationSeconds,
    health: overrides.health ?? definition.health,
    speed: definition.speed,
    range: definition.range,
    spawnPosition: factoryOrder.position,
    weapon: {
      ...definition.weapon,
      damage: overrides.weaponDamage ?? definition.weapon.damage
    }
  };
  economy.gold -= definition.cost;
  production.order = order;
  return {
    accepted: true,
    cost: definition.cost,
    durationSeconds: definition.durationSeconds
  };
}

export function runProductionSystem(
  world: World,
  deltaSeconds: number,
  completed: ProductionCompletedEvent[],
  factories: Entity[]
): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError('Production delta must be a finite, non-negative number');
  }

  world.queryInto(factories, [
    COMPONENTS.factory,
    COMPONENTS.production,
    COMPONENTS.faction,
    COMPONENTS.health
  ]);
  for (const factory of factories) {
    const production = world.getComponent(factory, COMPONENTS.production);
    const faction = world.getComponent(factory, COMPONENTS.faction);
    const health = world.getComponent(factory, COMPONENTS.health);
    const order = production?.order;
    if (!production || !faction || !health || health.current <= 0 || !order) continue;

    order.remainingSeconds = Math.max(0, order.remainingSeconds - deltaSeconds);
    if (order.remainingSeconds > 0) continue;

    const soldier = createSoldier(
      world,
      faction,
      order.spawnPosition,
      order.speed,
      order.range,
      order.health,
      order.kind,
      order.weapon
    );
    production.order = undefined;
    completed.push({ factory, soldier, kind: order.kind, faction });
  }
}

export function runResourceGenerationSystem(
  world: World,
  deltaSeconds: number,
  generators: Entity[],
  wallets: Readonly<Record<Faction, Entity>>
): ResourceIncome {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError('Resource generation delta must be a finite, non-negative number');
  }

  const income: ResourceIncome = { player: 0, enemy: 0 };
  world.queryInto(generators, [
    COMPONENTS.resourceGenerator,
    COMPONENTS.faction,
    COMPONENTS.health
  ]);
  for (const entity of generators) {
    const generator = world.getComponent(entity, COMPONENTS.resourceGenerator);
    const faction = world.getComponent(entity, COMPONENTS.faction);
    const health = world.getComponent(entity, COMPONENTS.health);
    if (!generator || !faction || !health || health.current <= 0) continue;
    income[faction] += generator.incomePerSecond * deltaSeconds;
  }

  for (const faction of [FACTIONS.player, FACTIONS.enemy]) {
    const economy = world.getComponent(wallets[faction], COMPONENTS.economy);
    if (economy) economy.gold += income[faction];
  }
  return income;
}

export function runWeaponSystem(
  world: World,
  source: Entity,
  target: Entity | undefined,
  deltaSeconds: number
): WeaponFireEvent | undefined {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError('Weapon delta must be a finite, non-negative number');
  }

  const weapon = world.getComponent(source, COMPONENTS.weapon);
  const sourcePosition = world.getComponent(source, COMPONENTS.transform);
  const sourceHealth = world.getComponent(source, COMPONENTS.health);
  if (!weapon || !sourcePosition || !sourceHealth || sourceHealth.current <= 0) return undefined;
  weapon.cooldownRemaining = Math.max(0, weapon.cooldownRemaining - deltaSeconds);
  if (target === undefined) return undefined;

  const targetPosition = world.getComponent(target, COMPONENTS.transform);
  const targetHealth = world.getComponent(target, COMPONENTS.health);
  const sourceFaction = world.getComponent(source, COMPONENTS.faction);
  const targetFaction = world.getComponent(target, COMPONENTS.faction);
  if (!targetPosition || !targetHealth || targetHealth.current <= 0
    || !sourceFaction || sourceFaction === targetFaction) {
    return undefined;
  }

  const distance = Math.hypot(
    targetPosition.x - sourcePosition.x,
    targetPosition.z - sourcePosition.z
  );
  if (distance > weapon.range || weapon.cooldownRemaining > 0) return undefined;

  weapon.cooldownRemaining = weapon.cooldownSeconds;
  const projectile = world.createEntity();
  const spawnPosition = {
    x: sourcePosition.x,
    y: sourcePosition.y + weapon.originHeight,
    z: sourcePosition.z
  };
  const projectileData: Projectile = {
    target,
    targetPosition: { ...targetPosition },
    damage: weapon.damage,
    speed: weapon.projectileSpeed,
    remainingSeconds: weapon.projectileLifetime,
    impactRadius: weapon.impactRadius,
    isHeavy: weapon.isHeavy
  };
  world.addComponent(projectile, COMPONENTS.transform, spawnPosition);
  world.addComponent(projectile, COMPONENTS.projectile, projectileData);
  return { source, projectile };
}

export function runProjectileSystem(
  world: World,
  deltaSeconds: number,
  impacts: ProjectileImpact[],
  projectileEntities: Entity[],
  modifyDamage: (target: Entity, damage: number) => number = (_target, damage) => damage
): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError('Projectile delta must be a finite, non-negative number');
  }

  world.queryInto(projectileEntities, [COMPONENTS.projectile, COMPONENTS.transform]);
  for (const entity of projectileEntities) {
    const projectile = world.getComponent(entity, COMPONENTS.projectile);
    const position = world.getComponent(entity, COMPONENTS.transform);
    if (!projectile || !position) continue;

    const result = advanceProjectilePosition(
      position,
      projectile.targetPosition,
      deltaSeconds,
      projectile.speed,
      projectile.impactRadius,
      projectile.remainingSeconds
    );
    projectile.remainingSeconds = Math.max(0, projectile.remainingSeconds - deltaSeconds);
    if (result === 'moving') continue;

    const targetHealth = world.getComponent(projectile.target, COMPONENTS.health);
    if (result === 'impact' && targetHealth && targetHealth.current > 0) {
      applyDamageSystem(world, projectile.target, modifyDamage(projectile.target, projectile.damage));
    }
    if (result === 'impact') {
      impacts.push({
        projectile: entity,
        target: projectile.target,
        position: { ...position },
        isHeavy: projectile.isHeavy
      });
    }
    world.removeEntity(entity);
  }
}

function advanceProjectilePosition(
  position: Position,
  target: Position,
  deltaSeconds: number,
  speed: number,
  impactRadius: number,
  remainingSeconds: number
): ProjectileAdvanceResult {
  const deltaX = target.x - position.x;
  const deltaY = target.y - position.y;
  const deltaZ = target.z - position.z;
  const distance = Math.hypot(deltaX, deltaY, deltaZ);
  if (distance <= impactRadius) return 'impact';
  if (remainingSeconds === 0) return 'expired';

  const distanceToTravel = Math.min(speed * deltaSeconds, distance);
  position.x += (deltaX / distance) * distanceToTravel;
  position.y += (deltaY / distance) * distanceToTravel;
  position.z += (deltaZ / distance) * distanceToTravel;
  if (distance - distanceToTravel <= impactRadius) return 'impact';
  return remainingSeconds <= deltaSeconds ? 'expired' : 'moving';
}

export function advanceProjectile(
  flight: ProjectileFlight,
  deltaSeconds: number,
  speed = 38,
  impactRadius = 1.2
): ProjectileAdvanceResult {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0
    || !Number.isFinite(speed) || speed <= 0
    || !Number.isFinite(impactRadius) || impactRadius < 0
    || !Number.isFinite(flight.remainingSeconds) || flight.remainingSeconds < 0) {
    throw new RangeError('Projectile timing and movement values must be finite and non-negative');
  }

  const result = advanceProjectilePosition(
    flight.position,
    flight.target,
    deltaSeconds,
    speed,
    impactRadius,
    flight.remainingSeconds
  );
  flight.remainingSeconds = Math.max(0, flight.remainingSeconds - deltaSeconds);
  return result;
}
