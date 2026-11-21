import { COMPONENTS } from '../ecs/components.ts';
import type { Faction } from '../ecs/components.ts';
import { trySpendResources } from '../ecs/systems.ts';
import type { World } from '../ecs/World.ts';
import { spendCombatPoints } from '../match/MatchState.ts';
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
  const enemy: Faction = faction === 'player' ? 'enemy' : 'player';
  const candidates: StrikeCandidate[] = [];
  for (const entity of world.query(COMPONENTS.targetable, COMPONENTS.faction, COMPONENTS.transform, COMPONENTS.health)) {
    if (world.getComponent(entity, COMPONENTS.faction) !== enemy) continue;
    if (world.getComponent(entity, COMPONENTS.building)?.kind === 'hq') continue;
    const health = world.getComponent(entity, COMPONENTS.health);
    const position = world.getComponent(entity, COMPONENTS.transform);
    if (!health || health.current <= 0 || !position) continue;
    candidates.push({
      x: position.x,
      z: position.z,
      health: health.current,
      kind: world.getComponent(entity, COMPONENTS.soldier) ? 'unit' : 'structure'
    });
  }
  return candidates;
}

/**
 * Validates, aims and pays for a reward, then starts its cooldown and, for the shield,
 * its protection. The strike itself is still played and applied by the view (R5).
 */
export function activateReward(
  ctx: CommandContext,
  faction: Faction,
  id: RewardId
): CommandResult<{ aim?: StrikeAim; definition: RewardDefinition }, RewardRejection> {
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
  return { accepted: true, aim, definition };
}
