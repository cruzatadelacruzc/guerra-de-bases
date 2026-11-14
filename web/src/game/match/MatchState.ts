import type { Faction } from '../ecs/components.ts';

export type MatchOutcome = 'victory' | 'defeat';

/**
 * Per-match scoring state. Entity health, existence and lifecycle stay in the
 * ECS; this only keeps what the rules derive from deaths.
 */
export interface MatchState {
  combatPoints: Record<Faction, number>;
  killStreak: Record<Faction, number>;
  /** Enemy units destroyed (feeds the twentieth-kill achievement). */
  playerUnitsDestroyed: number;
  /** Player units lost (shown in the game-over summary). */
  playerUnitsLost: number;
  /** Terminal once set: deaths are no longer resolved after it. */
  outcome: MatchOutcome | null;
}

export function createMatchState(): MatchState {
  return {
    combatPoints: { player: 0, enemy: 0 },
    killStreak: { player: 0, enemy: 0 },
    playerUnitsDestroyed: 0,
    playerUnitsLost: 0,
    outcome: null
  };
}

/** Spends points the reward rules have already validated; there is no check here, as before. */
export function spendCombatPoints(state: MatchState, faction: Faction, points: number): void {
  state.combatPoints[faction] -= points;
}
