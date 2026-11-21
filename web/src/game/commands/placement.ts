import { COMPONENTS } from '../ecs/components.ts';
import type { Faction, Position } from '../ecs/components.ts';
import type { World } from '../ecs/World.ts';

/**
 * Build zone, as a depth from the center line into each faction's own half
 * (player z > 0, enemy z < 0). Inclusive, because the player's tap is rounded
 * after the raycast and can land exactly on a border.
 */
export const BUILD_ZONE = Object.freeze({ minDepth: 5, maxDepth: 73, maxAbsX: 53 } as const);
export const MIN_STRUCTURE_SPACING = 3.8;

export type PlacementRejection = 'outside-zone' | 'too-close';

export function validatePlacement(
  world: World,
  faction: Faction,
  position: Position
): { readonly ok: true } | { readonly ok: false; readonly reason: PlacementRejection } {
  const depth = faction === 'player' ? position.z : -position.z;
  if (depth < BUILD_ZONE.minDepth || depth > BUILD_ZONE.maxDepth || Math.abs(position.x) > BUILD_ZONE.maxAbsX) {
    return { ok: false, reason: 'outside-zone' };
  }
  const minDistanceSquared = MIN_STRUCTURE_SPACING * MIN_STRUCTURE_SPACING;
  for (const entity of world.query(COMPONENTS.building, COMPONENTS.faction, COMPONENTS.transform)) {
    if (world.getComponent(entity, COMPONENTS.faction) !== faction) continue;
    const other = world.getComponent(entity, COMPONENTS.transform);
    if (!other) continue;
    const dx = other.x - position.x;
    const dz = other.z - position.z;
    if (dx * dx + dz * dz < minDistanceSquared) return { ok: false, reason: 'too-close' };
  }
  return { ok: true };
}
