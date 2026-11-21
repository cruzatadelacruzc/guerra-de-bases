import type { Faction } from '../ecs/components.ts';

export type MatchOutcome = 'victory' | 'defeat';

/** Reward timers of one faction, on the gameplay clock. */
export interface FactionRewardState {
  cooldownUntilMs: number;
  shieldUntilMs: number;
}

/**
 * Per-match state. Entity health, existence and lifecycle stay in the ECS; this
 * keeps what the rules derive from deaths and each faction's reward timers.
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
  rewards: Record<Faction, FactionRewardState>;
}

export function createMatchState(): MatchState {
  return {
    combatPoints: { player: 0, enemy: 0 },
    killStreak: { player: 0, enemy: 0 },
    playerUnitsDestroyed: 0,
    playerUnitsLost: 0,
    outcome: null,
    rewards: {
      player: { cooldownUntilMs: 0, shieldUntilMs: 0 },
      enemy: { cooldownUntilMs: 0, shieldUntilMs: 0 }
    }
  };
}

/** Spends points the reward rules have already validated; there is no check here, as before. */
export function spendCombatPoints(state: MatchState, faction: Faction, points: number): void {
  state.combatPoints[faction] -= points;
}
