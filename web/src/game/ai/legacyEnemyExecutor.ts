/**
 * Test-only: the enemy AI's snapshot and executor as GameApplication.ts had them at bf2c4a7
 * (buildEnemyAiSnapshot and executeEnemyAiTurn), read from the ECS instead of the visual lists.
 * Building only checks gold, so structures may overlap; training ignores the order result.
 */
import { COMPONENTS } from '../ecs/components.ts';
import type { BuildingKind, Entity } from '../ecs/components.ts';
import { createSoldierFactory, createStructure } from '../ecs/initialBattle.ts';
import { requestUnitProduction, trySpendResources } from '../ecs/systems.ts';
import { STRUCTURE_DEFINITIONS } from '../definitions/structures.ts';
import type { AiRunState, AiStrategy, ExecutedCommand } from './aiMatchRunner.ts';

function isAlive(state: AiRunState, entity: Entity): boolean {
  const health = state.world.getComponent(entity, COMPONENTS.health);
  return health !== undefined && health.current > 0;
}

function enemyStructures(state: AiRunState, kind: BuildingKind): Entity[] {
  return state.world.query(COMPONENTS.building, COMPONENTS.faction)
    .filter((entity) => state.world.getComponent(entity, COMPONENTS.faction) === 'enemy'
      && state.world.getComponent(entity, COMPONENTS.building)?.kind === kind);
}

/** isValidSoldierFactory: a live barracks with a factory component. */
function validFactories(state: AiRunState): Entity[] {
  return enemyStructures(state, 'barracks')
    .filter((entity) => state.world.getComponent(entity, COMPONENTS.factory) !== undefined && isAlive(state, entity));
}

/** getRewardTargetCandidates('enemy'): live, targetable player entities other than the Nexus. */
function rewardTargetCount(state: AiRunState): number {
  const { world } = state;
  let count = 0;
  for (const entity of world.query(COMPONENTS.targetable, COMPONENTS.faction, COMPONENTS.transform, COMPONENTS.health)) {
    if (world.getComponent(entity, COMPONENTS.faction) !== 'player') continue;
    if (!isAlive(state, entity) || world.getComponent(entity, COMPONENTS.building)?.kind === 'hq') continue;
    count++;
  }
  return count;
}

export const LEGACY_STRATEGY: AiStrategy = {
  snapshot(state) {
    const { world } = state;
    const factories = validFactories(state);
    const countAlive = (kind: BuildingKind) => enemyStructures(state, kind).filter((entity) => isAlive(state, entity)).length;
    const nexus = world.getComponent(state.bases.enemy, COMPONENTS.health);
    return {
      difficulty: state.difficulty,
      nowMs: state.nowMs,
      gold: world.getComponent(state.bases.enemy, COMPONENTS.economy)?.gold ?? 0,
      structureCounts: {
        generator: countAlive('generator'),
        barracks: factories.length,
        turret: countAlive('turret')
      },
      idleFactories: factories
        .filter((entity) => !world.getComponent(entity, COMPONENTS.production)?.order)
        .map((entity) => {
          const position = world.getComponent(entity, COMPONENTS.transform);
          if (!position) throw new Error(`Factory ${entity} has no position`);
          return { entity, position: { x: position.x, y: position.y, z: position.z } };
        }),
      combatPoints: state.match.combatPoints.enemy,
      // The comparison never activates rewards, so the cooldown and the shield stay at their start values.
      rewardCooldownUntilMs: 0,
      shieldActive: false,
      validRewardTargetCount: rewardTargetCount(state),
      nexusHealthRatio: nexus && nexus.max > 0 ? nexus.current / nexus.max : 1
    };
  },

  execute(state, turn) {
    const { world } = state;
    const executed: ExecutedCommand[] = [];
    for (const command of turn.commands) {
      if (command.type === 'build') {
        const definition = STRUCTURE_DEFINITIONS[command.kind];
        if (!trySpendResources(world, state.bases.enemy, definition.cost)) {
          executed.push({ command, accepted: false, reason: 'insufficient-gold' });
          continue;
        }
        const entity = command.kind === 'barracks'
          ? createSoldierFactory(world, 'enemy', { ...command.position }, definition.health)
          : createStructure(world, 'enemy', { ...command.position }, definition.health, command.kind);
        executed.push({ command, accepted: true, entity });
      } else if (command.type === 'train') {
        const result = requestUnitProduction(world, command.factory, state.bases.enemy, command.unit, command.spawnPosition);
        executed.push(result.accepted
          ? { command, accepted: true }
          : { command, accepted: false, reason: result.reason });
      } else {
        throw new Error('legacy reward activation is outside the comparison scenario');
      }
    }
    return executed;
  }
};
