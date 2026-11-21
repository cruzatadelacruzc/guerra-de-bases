import type { Faction } from '../ecs/components.ts';
import type { StrikeId } from '../rewardSystem.ts';
import { createStrikeTimeline } from './strikeState.ts';
import type { StrikeTimeline } from './strikeState.ts';

export type MatchOutcome = 'victory' | 'defeat';

/** Reward timers of one faction, on the gameplay clock. */
export interface FactionRewardState {
  cooldownUntilMs: number;
  shieldUntilMs: number;
  /** Until when each strike shows as active in the UI: its activation plus its duration. */
  strikeActiveUntilMs: Partial<Record<StrikeId, number>>;
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
  /** Strikes in flight; a new match starts with none. */
  strikes: StrikeTimeline;
}

export function createMatchState(): MatchState {
  return {
    combatPoints: { player: 0, enemy: 0 },
    killStreak: { player: 0, enemy: 0 },
    playerUnitsDestroyed: 0,
    playerUnitsLost: 0,
    outcome: null,
    rewards: {
      player: { cooldownUntilMs: 0, shieldUntilMs: 0, strikeActiveUntilMs: {} },
      enemy: { cooldownUntilMs: 0, shieldUntilMs: 0, strikeActiveUntilMs: {} }
    },
    strikes: createStrikeTimeline()
  };
}

/** Spends points the reward rules have already validated; there is no check here, as before. */
export function spendCombatPoints(state: MatchState, faction: Faction, points: number): void {
  state.combatPoints[faction] -= points;
}
