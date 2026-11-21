import { COMPONENTS } from '../ecs/components.ts';
import type { Entity, Faction } from '../ecs/components.ts';
import type { World } from '../ecs/World.ts';

/** Targetable, of the faction opposite `attacker`, with health > 0 and a position, and not a Nexus. */
export function isStrikeTarget(world: World, entity: Entity, attacker: Faction): boolean {
  if (!world.getComponent(entity, COMPONENTS.targetable)) return false;
  const enemy: Faction = attacker === 'player' ? 'enemy' : 'player';
  if (world.getComponent(entity, COMPONENTS.faction) !== enemy) return false;
  if (world.getComponent(entity, COMPONENTS.building)?.kind === 'hq') return false;
  const health = world.getComponent(entity, COMPONENTS.health);
  if (!health || health.current <= 0) return false;
  return world.getComponent(entity, COMPONENTS.transform) !== undefined;
}
