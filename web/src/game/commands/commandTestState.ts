/** Test-only: a fresh match for command tests, and a full picture of what a command may change. */
import { COMPONENTS } from '../ecs/components.ts';
import type { ComponentName, Faction } from '../ecs/components.ts';
import { createInitialBattle } from '../ecs/initialBattle.ts';
import { createMatchState } from '../match/MatchState.ts';
import type { MatchState } from '../match/MatchState.ts';
import type { CommandContext } from './CommandContext.ts';

export function createCommandTestContext(overrides: Partial<CommandContext> = {}): CommandContext {
  const { world, playerBase, enemyBase } = createInitialBattle();
  return {
    world,
    bases: { player: playerBase, enemy: enemyBase },
    match: createMatchState(),
    sessionPhase: 'PLAYING',
    difficulty: 'normal',
    nowMs: 0,
    ...overrides
  };
}

export function setGold(ctx: CommandContext, faction: Faction, gold: number): void {
  const economy = ctx.world.getComponent(ctx.bases[faction], COMPONENTS.economy);
  if (!economy) throw new Error(`No ${faction} economy`);
  economy.gold = gold;
}

export function goldOf(ctx: CommandContext, faction: Faction): number {
  return ctx.world.getComponent(ctx.bases[faction], COMPONENTS.economy)?.gold ?? Number.NaN;
}

export interface CommandStateSnapshot {
  /** Every entity with a deep copy of every component it has: gold and production orders included. */
  readonly entities: ReadonlyArray<readonly [number, Readonly<Record<string, unknown>>]>;
  /** Combat points, streaks, result and reward state of both factions. */
  readonly match: MatchState;
}

export function snapshotCommandState(ctx: CommandContext): CommandStateSnapshot {
  const names = Object.values(COMPONENTS) as ComponentName[];
  const entities = ctx.world.query().map((entity) => {
    const components: Record<string, unknown> = {};
    for (const name of names) {
      const value = ctx.world.getComponent(entity, name);
      if (value !== undefined) components[name] = structuredClone(value);
    }
    return [entity, components] as const;
  });
  return { entities, match: structuredClone(ctx.match) };
}
