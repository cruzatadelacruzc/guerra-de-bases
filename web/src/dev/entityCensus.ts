import { COMPONENTS } from '../game/ecs/components.ts';
import type { BuildingKind, Entity, Faction, SoldierKind } from '../game/ecs/components.ts';
import type { World } from '../game/ecs/World.ts';

export type FactionCensus = Record<SoldierKind | BuildingKind, number>;

export interface EntityCensus {
  player: FactionCensus;
  enemy: FactionCensus;
  /** Projectiles carry no faction, so they are only counted in total. */
  projectiles: number;
  total: number;
}

function createFactionCensus(): FactionCensus {
  return { rifleman: 0, tank: 0, hq: 0, generator: 0, barracks: 0, turret: 0 };
}

export function createEntityCensus(): EntityCensus {
  return { player: createFactionCensus(), enemy: createFactionCensus(), projectiles: 0, total: 0 };
}

function resetFactionCensus(census: FactionCensus): void {
  census.rifleman = 0;
  census.tank = 0;
  census.hq = 0;
  census.generator = 0;
  census.barracks = 0;
  census.turret = 0;
}

/** Counts live gameplay entities into `out`, reusing `scratch` for the entity list. */
export function countEntities(world: World, scratch: Entity[], out: EntityCensus): EntityCensus {
  resetFactionCensus(out.player);
  resetFactionCensus(out.enemy);
  out.projectiles = 0;
  world.queryInto(scratch, []);
  out.total = scratch.length;

  for (const entity of scratch) {
    if (world.getComponent(entity, COMPONENTS.projectile)) {
      out.projectiles++;
      continue;
    }
    const faction: Faction | undefined = world.getComponent(entity, COMPONENTS.faction);
    if (!faction) continue;
    const kind = world.getComponent(entity, COMPONENTS.soldierKind)
      ?? world.getComponent(entity, COMPONENTS.building)?.kind;
    if (kind) out[faction][kind]++;
  }
  return out;
}
