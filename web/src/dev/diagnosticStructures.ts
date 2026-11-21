import type { Entity, Faction, Position } from '../game/ecs/components.ts';
import { createBuildableStructure } from '../game/ecs/initialBattle.ts';
import type { World } from '../game/ecs/World.ts';
import type { BuildableStructureKind } from '../game/definitions/structures.ts';

/**
 * Development scenarios only: places a structure without validating or charging, so a
 * scenario can put turrets outside the build zones. Called only from the diagnostics
 * block, which production builds remove; the error text proves that in `dist/`.
 */
export function placeDiagnosticStructure(
  world: World,
  faction: Faction,
  kind: BuildableStructureKind,
  position: Position
): Entity {
  if (!import.meta.env.DEV) throw new Error('placeDiagnosticStructure: development only');
  return createBuildableStructure(world, faction, kind, position);
}
