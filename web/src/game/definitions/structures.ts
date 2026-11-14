import type { BuildingKind } from '../ecs/components.ts';

/** Structures a faction can place; the Nexus exists from the start and is never built. */
export type BuildableStructureKind = Exclude<BuildingKind, 'hq'>;

export interface StructureDefinition {
  readonly cost: number;
  readonly health: number;
}

/** Single source of construction rules shared by the player, the enemy AI and the UI. */
export const STRUCTURE_DEFINITIONS: Readonly<Record<BuildableStructureKind, StructureDefinition>> = Object.freeze({
  generator: Object.freeze({ cost: 100, health: 380 }),
  barracks: Object.freeze({ cost: 150, health: 380 }),
  turret: Object.freeze({ cost: 125, health: 380 })
});

export const NEXUS_HEALTH = 1200;
