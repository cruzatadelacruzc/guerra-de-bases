import { COMPONENTS } from '../ecs/components.ts';
import type { Entity, Faction, Position, SoldierKind } from '../ecs/components.ts';
import { requestUnitProduction } from '../ecs/systems.ts';
import type { ProductionOrderResult, ProductionOverrides } from '../ecs/systems.ts';
import type { World } from '../ecs/World.ts';
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

/** Live barracks of a faction, in creation order. */
export function liveFactories(world: World, faction: Faction): readonly Entity[] {
  return world.query(COMPONENTS.factory, COMPONENTS.building, COMPONENTS.faction, COMPONENTS.health)
    .filter((entity) => world.getComponent(entity, COMPONENTS.faction) === faction
      && world.getComponent(entity, COMPONENTS.building)?.kind === 'barracks'
      && (world.getComponent(entity, COMPONENTS.health)?.current ?? 0) > 0);
}

/** Live barracks of a faction without a production order, in creation order. */
export function idleFactories(world: World, faction: Faction): readonly Entity[] {
  return liveFactories(world, faction)
    .filter((entity) => world.getComponent(entity, COMPONENTS.production)?.order === undefined);
}
