import { COMPONENTS } from '../ecs/components.ts';
import type { Entity, Faction, Position } from '../ecs/components.ts';
import { createBuildableStructure } from '../ecs/initialBattle.ts';
import { trySpendResources } from '../ecs/systems.ts';
import { STRUCTURE_DEFINITIONS } from '../definitions/structures.ts';
import type { BuildableStructureKind } from '../definitions/structures.ts';
import { checkMatchPlaying } from './CommandContext.ts';
import type { CommandContext, CommandResult, MatchNotPlaying } from './CommandContext.ts';
import { validatePlacement } from './placement.ts';
import type { PlacementRejection } from './placement.ts';

const SELL_REFUND_RATIO = 0.7;

export type BuildRejection = MatchNotPlaying | PlacementRejection | 'insufficient-gold';
export type SellRejection = MatchNotPlaying | 'not-found' | 'not-owned' | 'not-sellable';

/** The only gameplay path that creates a structure: it validates everything before it spends. */
export function buildStructure(
  ctx: CommandContext,
  faction: Faction,
  kind: BuildableStructureKind,
  position: Position
): CommandResult<{ entity: Entity; cost: number }, BuildRejection> {
  const playing = checkMatchPlaying(ctx);
  if (!playing.ok) return { accepted: false, reason: playing.reason };
  const placement = validatePlacement(ctx.world, faction, position);
  if (!placement.ok) return { accepted: false, reason: placement.reason };
  const { cost } = STRUCTURE_DEFINITIONS[kind];
  const economy = ctx.world.getComponent(ctx.bases[faction], COMPONENTS.economy);
  if (!economy || economy.gold < cost) return { accepted: false, reason: 'insufficient-gold' };

  if (!trySpendResources(ctx.world, ctx.bases[faction], cost)) {
    throw new Error(`Validated ${kind} build could not be paid`);
  }
  return { accepted: true, entity: createBuildableStructure(ctx.world, faction, kind, position), cost };
}

export function sellStructure(
  ctx: CommandContext,
  faction: Faction,
  entity: Entity
): CommandResult<{ refund: number; kind: BuildableStructureKind; position: Position }, SellRejection> {
  const playing = checkMatchPlaying(ctx);
  if (!playing.ok) return { accepted: false, reason: playing.reason };
  const { world } = ctx;
  const owner = world.getComponent(entity, COMPONENTS.faction);
  if (owner === undefined) return { accepted: false, reason: 'not-found' };
  if (owner !== faction) return { accepted: false, reason: 'not-owned' };
  const kind = world.getComponent(entity, COMPONENTS.building)?.kind;
  const transform = world.getComponent(entity, COMPONENTS.transform);
  const economy = world.getComponent(ctx.bases[faction], COMPONENTS.economy);
  if (kind === undefined || kind === 'hq' || !transform || !economy) return { accepted: false, reason: 'not-sellable' };

  const refund = Math.floor(STRUCTURE_DEFINITIONS[kind].cost * SELL_REFUND_RATIO);
  const position = { x: transform.x, y: transform.y, z: transform.z };
  economy.gold += refund;
  world.removeEntity(entity);
  return { accepted: true, refund, kind, position };
}
