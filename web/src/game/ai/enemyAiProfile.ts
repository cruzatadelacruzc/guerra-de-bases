import type { BuildableStructureKind } from '../definitions/structures.ts';
import type { Difficulty, RewardId } from '../rewardSystem.ts';

export interface CountRange {
  readonly min: number;
  readonly max: number;
}

/** Where the enemy places a structure: x = (r - 0.5) * width, z = nearZ - r * depth. */
export interface BuildZone {
  readonly width: number;
  readonly nearZ: number;
  readonly depth: number;
}

/** Decision parameters of the enemy AI; tuning them never touches game rules or values. */
export interface EnemyAiProfile {
  readonly decisionIntervalSeconds: number;
  /** Structure counts the AI builds towards, rolled once per match. */
  readonly targets: Readonly<Record<BuildableStructureKind, CountRange>>;
  readonly buildChance: Readonly<Record<BuildableStructureKind, number>>;
  readonly buildZones: Readonly<Record<BuildableStructureKind, BuildZone>>;
  readonly tankChance: number;
  /** A unit spawns at its factory + { x: (r - 0.5) * spawnJitter, z: spawnForwardOffset }. */
  readonly spawnJitter: number;
  readonly spawnForwardOffset: number;
  /** The shield is only considered at or below this share of Nexus health. */
  readonly shieldHealthThreshold: number;
  readonly rewardPreference: readonly RewardId[];
}

const range = (min: number, max: number): CountRange => Object.freeze({ min, max });

const SHARED_BUILD_CHANCE = Object.freeze({ generator: 0.6, barracks: 0.65, turret: 0.7 });
const SHARED_BUILD_ZONES = Object.freeze({
  generator: Object.freeze({ width: 44, nearZ: -38, depth: 32 }),
  barracks: Object.freeze({ width: 40, nearZ: -25, depth: 30 }),
  turret: Object.freeze({ width: 42, nearZ: -12, depth: 20 })
});

function profile(
  decisionIntervalSeconds: number,
  targets: Record<BuildableStructureKind, CountRange>,
  shieldHealthThreshold: number,
  rewardPreference: readonly RewardId[]
): EnemyAiProfile {
  return Object.freeze({
    decisionIntervalSeconds,
    targets: Object.freeze(targets),
    buildChance: SHARED_BUILD_CHANCE,
    buildZones: SHARED_BUILD_ZONES,
    tankChance: 0.45,
    spawnJitter: 5,
    spawnForwardOffset: 3,
    shieldHealthThreshold,
    rewardPreference: Object.freeze([...rewardPreference])
  });
}

/** Current enemy behaviour, unchanged; intervals are the effective pace measured before R2. */
export const ENEMY_AI_PROFILES: Readonly<Record<Difficulty, EnemyAiProfile>> = Object.freeze({
  easy: profile(
    1.25,
    { generator: range(2, 3), barracks: range(1, 2), turret: range(1, 2) },
    0.3,
    ['defensive_shield', 'artillery_strike', 'air_strike']
  ),
  normal: profile(
    0.7,
    { generator: range(3, 4), barracks: range(2, 3), turret: range(2, 4) },
    0.55,
    ['artillery_strike', 'air_strike', 'defensive_shield']
  ),
  hard: profile(
    0.35,
    { generator: range(4, 5), barracks: range(3, 4), turret: range(4, 6) },
    0.75,
    ['air_strike', 'artillery_strike', 'defensive_shield']
  )
});

export function getEnemyAiProfile(difficulty: Difficulty): EnemyAiProfile {
  return ENEMY_AI_PROFILES[difficulty];
}
