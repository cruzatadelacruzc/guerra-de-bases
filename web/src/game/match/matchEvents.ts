import type { BuildingKind, Entity, Faction, Position, SoldierKind } from '../ecs/components.ts';
import type { MatchOutcome } from './MatchState.ts';

export type MatchEvent =
  | {
      readonly type: 'unitDied';
      readonly entity: Entity;
      readonly faction: Faction;
      readonly kind: SoldierKind;
      readonly position: Position;
      /** Kill streak of the faction that scored, after counting this death. */
      readonly killerStreak: number;
      /** This death was the player's twentieth enemy kill. */
      readonly playerReachedTwentyKills: boolean;
    }
  | {
      readonly type: 'structureDestroyed';
      readonly entity: Entity;
      readonly faction: Faction;
      readonly kind: BuildingKind;
      readonly position: Position;
    };

export interface DeathResolution {
  /** In processing order. The array is reused by the next resolve call. */
  readonly events: readonly MatchEvent[];
  readonly outcome: MatchOutcome | null;
  /** True only on the call that detected the outcome. */
  readonly outcomeIsNew: boolean;
}
