import { COMPONENTS } from '../ecs/components.ts';
import type { BuildingKind } from '../ecs/components.ts';
import type { CommandContext } from '../commands/CommandContext.ts';
import { rewardTargetCandidates } from '../commands/rewardCommand.ts';
import { idleFactories, liveFactories } from '../commands/trainCommand.ts';
import type { EnemyAiSnapshot } from './enemyAi.ts';

/** What the enemy AI reads when it decides, from the ECS and the match state only. */
export function buildEnemyAiSnapshot(ctx: CommandContext): EnemyAiSnapshot {
  const { world, match, nowMs } = ctx;
  const countAlive = (kind: BuildingKind) => world.query(COMPONENTS.building, COMPONENTS.faction, COMPONENTS.health)
    .filter((entity) => world.getComponent(entity, COMPONENTS.faction) === 'enemy'
      && world.getComponent(entity, COMPONENTS.building)?.kind === kind
      && (world.getComponent(entity, COMPONENTS.health)?.current ?? 0) > 0)
    .length;
  const nexus = world.getComponent(ctx.bases.enemy, COMPONENTS.health);
  return {
    difficulty: ctx.difficulty,
    nowMs,
    gold: world.getComponent(ctx.bases.enemy, COMPONENTS.economy)?.gold ?? 0,
    structureCounts: {
      generator: countAlive('generator'),
      barracks: liveFactories(world, 'enemy').length,
      turret: countAlive('turret')
    },
    idleFactories: idleFactories(world, 'enemy').map((entity) => {
      const position = world.getComponent(entity, COMPONENTS.transform);
      if (!position) throw new Error(`Factory ${entity} has no position`);
      return { entity, position: { x: position.x, y: position.y, z: position.z } };
    }),
    combatPoints: match.combatPoints.enemy,
    rewardCooldownUntilMs: match.rewards.enemy.cooldownUntilMs,
    shieldActive: match.rewards.enemy.shieldUntilMs > nowMs,
    validRewardTargetCount: rewardTargetCandidates(world, 'enemy').length,
    nexusHealthRatio: nexus && nexus.max > 0 ? nexus.current / nexus.max : 1
  };
}
