import { COMPONENTS } from '../ecs/components.ts';
import type { Entity, Faction, Position, SoldierKind } from '../ecs/components.ts';
import { requestUnitProduction } from '../ecs/systems.ts';
import type { ProductionOrderResult, ProductionOverrides } from '../ecs/systems.ts';
import type { WorldReader } from '../ecs/WorldReader.ts';
import type { BuildableStructureKind } from '../definitions/structures.ts';
import { checkMatchPlaying } from './CommandContext.ts';
import type { CommandContext, MatchNotPlaying } from './CommandContext.ts';

/**
 * Queues a unit at a barracks and pays for it from the faction's own gold, so a
 * barracks of the other faction is an invalid factory.
 */
export function trainUnit(
  ctx: CommandContext,
  faction: Faction,
  factory: Entity,
  unit: SoldierKind,
  spawnPosition: Position,
  overrides?: ProductionOverrides
): ProductionOrderResult | { readonly accepted: false; readonly reason: MatchNotPlaying } {
  const playing = checkMatchPlaying(ctx);
  if (!playing.ok) return { accepted: false, reason: playing.reason };
  return requestUnitProduction(ctx.world, factory, ctx.bases[faction], unit, spawnPosition, overrides);
}

function isLiveProducer(
  world: WorldReader,
  entity: Entity,
  faction: Faction,
  producer: BuildableStructureKind
): boolean {
  return world.getComponent(entity, COMPONENTS.faction) === faction
    && world.getComponent(entity, COMPONENTS.building)?.kind === producer
    && (world.getComponent(entity, COMPONENTS.health)?.current ?? 0) > 0;
}

const PRODUCER_COMPONENTS = [COMPONENTS.factory, COMPONENTS.building, COMPONENTS.faction, COMPONENTS.health] as const;

/** Live producers of a faction (barracks by default), in creation order. */
export function liveFactories(
  world: WorldReader,
  faction: Faction,
  producer: BuildableStructureKind = 'barracks'
): readonly Entity[] {
  const found: Entity[] = [];
  world.queryInto(found, PRODUCER_COMPONENTS);
  return found.filter((entity) => isLiveProducer(world, entity, faction, producer));
}

/** Live producers of a faction without a production order, in creation order. */
export function idleFactories(
  world: WorldReader,
  faction: Faction,
  producer: BuildableStructureKind = 'barracks'
): readonly Entity[] {
  return liveFactories(world, faction, producer)
    .filter((entity) => world.getComponent(entity, COMPONENTS.production)?.order === undefined);
}

export interface ProducerAvailability { total: number; free: number }

/** Counts live and idle producers without allocating: `scratch` takes the query, the result goes into `out`. */
export function producerAvailability(
  world: WorldReader,
  faction: Faction,
  producer: BuildableStructureKind,
  scratch: Entity[],
  out: ProducerAvailability
): ProducerAvailability {
  world.queryInto(scratch, PRODUCER_COMPONENTS);
  out.total = 0;
  out.free = 0;
  for (const entity of scratch) {
    if (!isLiveProducer(world, entity, faction, producer)) continue;
    out.total++;
    if (world.getComponent(entity, COMPONENTS.production)?.order === undefined) out.free++;
  }
  return out;
}
