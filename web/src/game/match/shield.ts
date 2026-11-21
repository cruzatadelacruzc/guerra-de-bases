import type { Entity, Faction } from '../ecs/components.ts';
import { applyDamageSystem } from '../ecs/systems.ts';
import type { DamageResult } from '../ecs/systems.ts';
import type { World } from '../ecs/World.ts';
import { applyShieldReduction, getRewardDefinitionForDifficulty } from '../rewardSystem.ts';
import type { Difficulty } from '../rewardSystem.ts';
import type { MatchState } from './MatchState.ts';

/** The single place the defensive shield reduces damage: only on its own faction's Nexus. */
export function applyFactionShield(
  match: MatchState,
  bases: Readonly<Record<Faction, Entity>>,
  target: Entity,
  damage: number,
  nowMs: number,
  difficulty: Difficulty
): number {
  const faction: Faction | undefined = target === bases.player ? 'player' : target === bases.enemy ? 'enemy' : undefined;
  if (faction === undefined) return damage;
  const shieldUntil = match.rewards[faction].shieldUntilMs;
  if (shieldUntil <= nowMs) return damage;
  return applyShieldReduction(
    damage,
    shieldUntil,
    nowMs,
    getRewardDefinitionForDifficulty('defensive_shield', difficulty).reduction
  );
}

/** Reward damage bypasses the simulation's projectiles, so it goes through the shield here. */
export function applyRewardDamage(
  world: World,
  match: MatchState,
  bases: Readonly<Record<Faction, Entity>>,
  target: Entity,
  damage: number,
  nowMs: number,
  difficulty: Difficulty
): DamageResult {
  return applyDamageSystem(world, target, applyFactionShield(match, bases, target, damage, nowMs, difficulty));
}
