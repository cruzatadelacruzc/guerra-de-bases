import { COMPONENTS, FACTIONS } from './components.ts';
import type { Entity, Faction, Position } from './components.ts';
import { World } from './World.ts';

export interface ProductionOrder {
  faction: Faction;
  position: Position;
}

export interface DamageResult {
  current: number;
  destroyed: boolean;
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
  if (!health || health.current <= 0 || !faction || !transform) return undefined;

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
  deltaSeconds: number
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
    transform.x += (deltaX / distance) * travelDistance;
    transform.z += (deltaZ / distance) * travelDistance;
  }
  return Math.max(0, distance - travelDistance);
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
