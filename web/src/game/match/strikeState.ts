import type { Entity, Faction } from '../ecs/components.ts';
import type { StrikeId } from '../rewardSystem.ts';

/** One artillery shell; what is `readonly` is fixed when the strike is scheduled. */
export interface ArtilleryShellState {
  /** Impact point: aim + offset. */
  readonly x: number;
  readonly z: number;
  /** 0.7 + i·0.7 s after the strike starts. */
  readonly launchAtSeconds: number;
  launched: boolean;
  landed: boolean;
}

/** One bomb of an air strike. */
export interface BombState {
  /** Impact point: aim + offset. */
  readonly x: number;
  readonly z: number;
  released: boolean;
  /** Where the aircraft was when it released the bomb (only for drawing). */
  releaseX: number;
  releaseZ: number;
  /** Flight progress when it was released (the bomb's height in the view). */
  releaseProgress: number;
  fallElapsedSeconds: number;
  landed: boolean;
}

interface StrikeBase {
  /** Unique within the match. */
  readonly id: number;
  readonly kind: StrikeId;
  readonly faction: Faction;
  readonly aimX: number;
  readonly aimZ: number;
  /** Fixed when scheduled. */
  readonly damagePerImpact: number;
  readonly radius: number;
  /** `nowMs` at activation; only for the UI and the duration, never for ordering impacts. */
  readonly startedAtMs: number;
  elapsedSeconds: number;
}

export type ActiveStrike =
  | (StrikeBase & { readonly kind: 'artillery_strike'; readonly shells: readonly ArtilleryShellState[] })
  | (StrikeBase & {
      readonly kind: 'air_strike';
      /** Frozen copy of the heading given at activation. */
      readonly heading: Readonly<{ x: number; z: number }>;
      readonly startX: number;
      readonly startZ: number;
      readonly endX: number;
      readonly endZ: number;
      readonly bombs: readonly BombState[];
    });

/** The strikes in flight in one match, in activation order, and the id the next one gets. */
export interface StrikeTimeline {
  readonly active: ActiveStrike[];
  nextId: number;
}

export function createStrikeTimeline(): StrikeTimeline {
  return { active: [], nextId: 1 };
}

/** How much health one impact took from one target (only for tests that compare impacts). */
export interface StrikeHit {
  readonly entity: Entity;
  /** Health before the hit minus health after it. */
  readonly healthLoss: number;
}
