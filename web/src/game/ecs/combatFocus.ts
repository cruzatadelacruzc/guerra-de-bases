import { COMPONENTS } from './components.ts';
import type { Entity } from './components.ts';
import type { World } from './World.ts';

/** A unit counts as fighting when its current target is within this multiple of its weapon range. */
export const COMBAT_RANGE_FACTOR = 1.3;

const COMBAT_QUERY = [COMPONENTS.targeting, COMPONENTS.weapon, COMPONENTS.transform] as const;

/**
 * Visits the ground position (x, z) of every armed unit or structure that is
 * fighting, and of the target it is fighting. Units only ever chase the nearest
 * enemy, so "fighting" means that target is (almost) within weapon range.
 * `scratch` is reused to avoid per-call allocations.
 */
export function visitCombatPositions(
  world: World,
  scratch: Entity[],
  visit: (x: number, z: number) => void
): void {
  world.queryInto(scratch, COMBAT_QUERY);
  for (const entity of scratch) {
    const target = world.getComponent(entity, COMPONENTS.targeting)?.target;
    if (target === undefined) continue;
    const weapon = world.getComponent(entity, COMPONENTS.weapon);
    const position = world.getComponent(entity, COMPONENTS.transform);
    const targetPosition = world.getComponent(target, COMPONENTS.transform);
    if (!weapon || !position || !targetPosition) continue;
    const reach = weapon.range * COMBAT_RANGE_FACTOR;
    const dx = targetPosition.x - position.x;
    const dz = targetPosition.z - position.z;
    if (dx * dx + dz * dz > reach * reach) continue;
    visit(position.x, position.z);
    visit(targetPosition.x, targetPosition.z);
  }
}
