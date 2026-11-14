import type { Entity, Position, SoldierKind } from '../ecs/components.ts';
import { SOLDIER_PRODUCTION } from '../ecs/initialBattle.ts';
import { STRUCTURE_DEFINITIONS } from '../definitions/structures.ts';
import type { BuildableStructureKind } from '../definitions/structures.ts';
import { validateRewardActivation } from '../rewardSystem.ts';
import type { Difficulty, RewardId } from '../rewardSystem.ts';
import type { EnemyAiProfile } from './enemyAiProfile.ts';

/** A source of random numbers in [0, 1), injected so decisions can be tested deterministically. */
export type Rng = () => number;

export type EnemyAiTargets = Readonly<Record<BuildableStructureKind, number>>;

export interface IdleFactory {
  readonly entity: Entity;
  readonly position: Position;
}

/** What the enemy AI reads about the match when it decides; plain data, never live game objects. */
export interface EnemyAiSnapshot {
  readonly difficulty: Difficulty;
  readonly nowMs: number;
  readonly gold: number;
  /** Live structures; barracks counts only valid soldier factories. */
  readonly structureCounts: Readonly<Record<BuildableStructureKind, number>>;
  /** Valid factories without an order, in enemy building order. */
  readonly idleFactories: readonly IdleFactory[];
  readonly combatPoints: number;
  readonly rewardCooldownUntilMs: number;
  readonly shieldActive: boolean;
  readonly validRewardTargetCount: number;
  readonly nexusHealthRatio: number;
}

export type EnemyAiCommand =
  | { readonly type: 'build'; readonly kind: BuildableStructureKind; readonly position: Position }
  | { readonly type: 'train'; readonly factory: Entity; readonly unit: SoldierKind; readonly spawnPosition: Position }
  | { readonly type: 'activateReward'; readonly reward: RewardId };

/** For the HUD: whether the AI still builds towards its targets. */
export type EnemyAiStatus = 'building' | 'satisfied';

export interface EnemyAiTurn {
  readonly status: EnemyAiStatus;
  readonly commands: readonly EnemyAiCommand[];
}

const BUILD_ORDER: readonly BuildableStructureKind[] = ['generator', 'barracks', 'turret'];
const REWARD_OPTIONS: readonly RewardId[] = ['artillery_strike', 'air_strike', 'defensive_shield'];

/** Rolls the structure counts the AI builds towards this match, in generator, barracks, turret order. */
export function rollEnemyAiTargets(profile: EnemyAiProfile, rng: Rng): EnemyAiTargets {
  const roll = (kind: BuildableStructureKind) => {
    const { min, max } = profile.targets[kind];
    return min + Math.floor(rng() * (max - min + 1));
  };
  const generator = roll('generator');
  const barracks = roll('barracks');
  const turret = roll('turret');
  return { generator, barracks, turret };
}

/**
 * One enemy AI turn. Reproduces the pre-R2 behaviour exactly, including the
 * order and number of random draws: at most one structure (generator, then
 * barracks, then turret, each behind its own chance roll), then one order per
 * idle barracks, then at most one reward. Gold is projected across the turn
 * the way the game spends it: a structure always, a unit only when affordable
 * (the ECS rejects the rest without spending).
 */
export function decideEnemyTurn(
  snapshot: EnemyAiSnapshot,
  targets: EnemyAiTargets,
  profile: EnemyAiProfile,
  rng: Rng
): EnemyAiTurn {
  const counts = snapshot.structureCounts;
  const status: EnemyAiStatus = BUILD_ORDER.every((kind) => counts[kind] >= targets[kind]) ? 'satisfied' : 'building';
  const commands: EnemyAiCommand[] = [];
  let gold = snapshot.gold;

  for (const kind of BUILD_ORDER) {
    const cost = STRUCTURE_DEFINITIONS[kind].cost;
    if (counts[kind] >= targets[kind] || gold < cost || rng() >= profile.buildChance[kind]) continue;
    const zone = profile.buildZones[kind];
    const x = (rng() - 0.5) * zone.width;
    const z = zone.nearZ - rng() * zone.depth;
    commands.push({ type: 'build', kind, position: { x, y: 0, z } });
    gold -= cost;
    break;
  }

  for (const factory of snapshot.idleFactories) {
    const unit: SoldierKind | undefined = rng() < profile.tankChance
      ? (gold >= SOLDIER_PRODUCTION.tank.cost ? 'tank' : undefined)
      : 'rifleman';
    if (!unit) continue;
    const { position } = factory;
    commands.push({
      type: 'train',
      factory: factory.entity,
      unit,
      spawnPosition: {
        x: position.x + (rng() - 0.5) * profile.spawnJitter,
        y: position.y,
        z: position.z + profile.spawnForwardOffset
      }
    });
    const cost = SOLDIER_PRODUCTION[unit].cost;
    if (gold >= cost) gold -= cost;
  }

  if (snapshot.rewardCooldownUntilMs <= snapshot.nowMs) {
    const valid = REWARD_OPTIONS.filter((id) => {
      if (id === 'defensive_shield' && snapshot.nexusHealthRatio > profile.shieldHealthThreshold) return false;
      return validateRewardActivation({
        id,
        points: snapshot.combatPoints,
        gold,
        difficulty: snapshot.difficulty,
        validTargetCount: snapshot.validRewardTargetCount,
        activeShield: snapshot.shieldActive,
        cooldownMs: Math.max(0, snapshot.rewardCooldownUntilMs - snapshot.nowMs),
        now: snapshot.nowMs,
        expiresAt: snapshot.rewardCooldownUntilMs
      }).accepted;
    });
    const reward = profile.rewardPreference.find((id) => valid.includes(id));
    if (reward) commands.push({ type: 'activateReward', reward });
  }

  return { status, commands };
}
