import { COMPONENTS } from '../ecs/components.ts';
import type { Faction } from '../ecs/components.ts';
import { trySpendResources } from '../ecs/systems.ts';
import type { World } from '../ecs/World.ts';
import { spendCombatPoints } from '../match/MatchState.ts';
import { scheduleStrike } from '../match/rewardExecution.ts';
import { isStrikeTarget } from '../match/strikeTargets.ts';
import {
  getRewardDefinitionForDifficulty,
  getStrikePattern,
  REWARD_COOLDOWN_MS,
  selectStrikeAim,
  validateRewardActivation
} from '../rewardSystem.ts';
import type { RewardDefinition, RewardId, StrikeAim, StrikeCandidate } from '../rewardSystem.ts';
import { checkMatchPlaying } from './CommandContext.ts';
import type { CommandContext, CommandResult, MatchNotPlaying } from './CommandContext.ts';

export type RewardRejection = MatchNotPlaying | 'insufficient-points' | 'insufficient-gold'
  | 'no-valid-target' | 'shield-active' | 'cooldown';

/** What a faction's strikes can hit: live, targetable enemies other than the Nexus. */
export function rewardTargetCandidates(world: World, faction: Faction): StrikeCandidate[] {
  const candidates: StrikeCandidate[] = [];
  for (const entity of world.query(COMPONENTS.targetable, COMPONENTS.faction, COMPONENTS.transform, COMPONENTS.health)) {
    if (!isStrikeTarget(world, entity, faction)) continue;
    const health = world.getComponent(entity, COMPONENTS.health);
    const position = world.getComponent(entity, COMPONENTS.transform);
    if (!health || !position) continue;
    candidates.push({
      x: position.x,
      z: position.z,
      health: health.current,
      kind: world.getComponent(entity, COMPONENTS.soldier) ? 'unit' : 'structure'
    });
  }
  return candidates;
}

function assertUnitHeading(heading: Readonly<StrikeAim> | undefined): void {
  if (heading === undefined) throw new Error('An air strike needs a heading');
  const length = Math.hypot(heading.x, heading.z);
  if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-6) {
    throw new Error(`An air strike heading must be a unit vector, got (${heading.x}, ${heading.z})`);
  }
}

/**
 * Validates, aims and pays for a reward, then starts its cooldown and, for the shield,
 * its protection. A strike is scheduled on the gameplay clock with the caller's heading;
 * an air strike without a unit heading is a programming error and throws before anything changes.
 */
export function activateReward(
  ctx: CommandContext,
  faction: Faction,
  id: RewardId,
  options?: { readonly heading?: Readonly<StrikeAim> }
): CommandResult<{ aim?: StrikeAim; definition: RewardDefinition; strikeId?: number }, RewardRejection> {
  if (id === 'air_strike') assertUnitHeading(options?.heading);
  const playing = checkMatchPlaying(ctx);
  if (!playing.ok) return { accepted: false, reason: playing.reason };
  const { world, match, nowMs, difficulty } = ctx;
  const rewards = match.rewards[faction];
  const candidates = id === 'defensive_shield' ? [] : rewardTargetCandidates(world, faction);
  const validation = validateRewardActivation({
    id,
    points: match.combatPoints[faction],
    gold: world.getComponent(ctx.bases[faction], COMPONENTS.economy)?.gold ?? 0,
    difficulty,
    validTargetCount: candidates.length,
    activeShield: rewards.shieldUntilMs > nowMs,
    cooldownMs: Math.max(0, rewards.cooldownUntilMs - nowMs),
    now: nowMs,
    expiresAt: rewards.cooldownUntilMs
  });
  if (!validation.accepted) {
    if (!validation.reason) throw new Error(`Reward ${id} was rejected without a reason`);
    return { accepted: false, reason: validation.reason };
  }
  const aim = id === 'defensive_shield' ? undefined : selectStrikeAim(candidates, getStrikePattern(id, difficulty));
  if (id !== 'defensive_shield' && !aim) return { accepted: false, reason: 'no-valid-target' };

  const definition = getRewardDefinitionForDifficulty(id, difficulty);
  if (!trySpendResources(world, ctx.bases[faction], definition.goldCost)) {
    throw new Error(`Validated reward ${id} could not be paid`);
  }
  spendCombatPoints(match, faction, definition.pointsCost);
  rewards.cooldownUntilMs = nowMs + REWARD_COOLDOWN_MS;
  if (id === 'defensive_shield') {
    rewards.shieldUntilMs = nowMs + definition.durationSeconds * 1000;
    return { accepted: true, definition };
  }
  if (!aim) throw new Error(`Validated reward ${id} has no aim point`);
  const strike = scheduleStrike(match, faction, id, aim, options?.heading, difficulty, nowMs);
  return { accepted: true, aim, definition, strikeId: strike.id };
}
