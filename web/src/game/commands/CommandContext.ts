import type { Entity, Faction } from '../ecs/components.ts';
import type { World } from '../ecs/World.ts';
import type { GameSessionState } from '../GameSession.ts';
import type { MatchState } from '../match/MatchState.ts';
import type { Difficulty } from '../rewardSystem.ts';

/** What a game command reads and changes. The caller builds a fresh one for every command. */
export interface CommandContext {
  readonly world: World;
  /** Each faction's Nexus, which also holds its gold. */
  readonly bases: Readonly<Record<Faction, Entity>>;
  readonly match: MatchState;
  /** `session.state` when the command is issued; the session itself stays with the application. */
  readonly sessionPhase: GameSessionState;
  readonly difficulty: Difficulty;
  /** Gameplay clock in milliseconds. */
  readonly nowMs: number;
}

export type MatchNotPlaying = 'match-over' | 'not-playing';

export type CommandResult<Accepted extends object, Reason extends string> =
  | ({ readonly accepted: true } & Accepted)
  | { readonly accepted: false; readonly reason: Reason };

/**
 * A command is accepted only while the session plays and the match has no result.
 * The result is the stronger reason: it is terminal, the session phase is not.
 */
export function checkMatchPlaying(
  ctx: CommandContext
): { readonly ok: true } | { readonly ok: false; readonly reason: MatchNotPlaying } {
  if (ctx.match.outcome !== null) return { ok: false, reason: 'match-over' };
  if (ctx.sessionPhase !== 'PLAYING') return { ok: false, reason: 'not-playing' };
  return { ok: true };
}
