/** Test-only: runs a headless match against the enemy AI with an exchangeable executor. */
import { BattleSimulation } from '../ecs/BattleSimulation.ts';
import { COMPONENTS } from '../ecs/components.ts';
import type { Entity, Faction, Position } from '../ecs/components.ts';
import type { World } from '../ecs/World.ts';
import type { BuildableStructureKind } from '../definitions/structures.ts';
import { STRUCTURE_DEFINITIONS } from '../definitions/structures.ts';
import { DeathResolver } from '../match/DeathResolver.ts';
import { advanceStrikes, clearStrikes } from '../match/rewardExecution.ts';
import type { StrikeEvent } from '../match/rewardExecution.ts';
import { createMatchState } from '../match/MatchState.ts';
import type { MatchOutcome, MatchState } from '../match/MatchState.ts';
import { getDifficultyProfile } from '../rewardSystem.ts';
import type { Difficulty } from '../rewardSystem.ts';
import { EnemyAiController } from './EnemyAiController.ts';
import type { EnemyAiCommand, EnemyAiSnapshot, EnemyAiTurn } from './enemyAi.ts';
import { getEnemyAiProfile } from './enemyAiProfile.ts';
import { seededRng } from './testRng.ts';

const FRAME_SECONDS = 1 / 60;
const SPACING = 3.8;

export interface AiRunState {
  readonly world: World;
  readonly bases: Readonly<Record<Faction, Entity>>;
  readonly match: MatchState;
  readonly difficulty: Difficulty;
  nowMs: number;
}

export interface ExecutedCommand {
  readonly command: EnemyAiCommand;
  readonly accepted: boolean;
  readonly reason?: string;
  readonly entity?: Entity;
}

export interface AiStrategy {
  snapshot(state: AiRunState): EnemyAiSnapshot;
  execute(state: AiRunState, turn: EnemyAiTurn): readonly ExecutedCommand[];
}

export interface AiTurnRecord {
  readonly frame: number;
  readonly goldBefore: number;
  readonly goldAfter: number;
  readonly executed: readonly ExecutedCommand[];
}

export interface AiRunMetrics {
  buildAttempts: number;
  tooCloseRejections: number;
  outsideZoneRejections: number;
  acceptedBuilds: Record<BuildableStructureKind, number>;
  /** Accepted builds placed under 3.8 from an own structure that already existed. */
  overlappingAcceptedBuilds: number;
  goldSpentOnStructures: number;
  goldSpentTotal: number;
  acceptedTrainOrders: number;
  rewardCommands: number;
  outcome: MatchOutcome | null;
  outcomeAtSeconds: number | null;
}

/** Reward figures kept apart from `AiRunMetrics`, whose shape the R4 comparison pins. */
export interface AiRunRewardMetrics {
  /** Strike impacts that landed; 0 with strikes off. */
  strikeImpacts: number;
  /** Enemy combat points spent inside `strategy.execute`, accumulated. */
  combatPointsSpent: number;
}

function enemyGold(state: AiRunState): number {
  return state.world.getComponent(state.bases.enemy, COMPONENTS.economy)?.gold ?? 0;
}

function overlapsOwnStructure(world: World, faction: Faction, position: Position): boolean {
  for (const entity of world.query(COMPONENTS.building, COMPONENTS.faction, COMPONENTS.transform)) {
    if (world.getComponent(entity, COMPONENTS.faction) !== faction) continue;
    const at = world.getComponent(entity, COMPONENTS.transform);
    if (!at) continue;
    const dx = at.x - position.x;
    const dz = at.z - position.z;
    if (dx * dx + dz * dz < SPACING * SPACING) return true;
  }
  return false;
}

export function runAiMatch(
  options: {
    difficulty: Difficulty;
    seed: number;
    durationSeconds: number;
    /** Run reward strikes on the gameplay clock; off by default, then pending strikes are dropped each frame. */
    strikes?: boolean;
    /** Called once before the first frame, e.g. to place player targets. */
    setup?: (state: AiRunState) => void;
  },
  strategy: AiStrategy
): { metrics: AiRunMetrics; log: AiTurnRecord[]; rewards: AiRunRewardMetrics } {
  const { difficulty } = options;
  const simulation = new BattleSimulation({ enemyBaseIncome: getDifficultyProfile(difficulty).enemyBaseIncome });
  const state: AiRunState = {
    world: simulation.world,
    bases: { player: simulation.playerBase, enemy: simulation.enemyBase },
    match: createMatchState(),
    difficulty,
    nowMs: 0
  };
  const resolver = new DeathResolver();
  const controller = new EnemyAiController(getEnemyAiProfile(difficulty), seededRng(options.seed));
  const metrics: AiRunMetrics = {
    buildAttempts: 0,
    tooCloseRejections: 0,
    outsideZoneRejections: 0,
    acceptedBuilds: { generator: 0, barracks: 0, turret: 0 },
    overlappingAcceptedBuilds: 0,
    goldSpentOnStructures: 0,
    goldSpentTotal: 0,
    acceptedTrainOrders: 0,
    rewardCommands: 0,
    outcome: null,
    outcomeAtSeconds: null
  };
  const rewards: AiRunRewardMetrics = { strikeImpacts: 0, combatPointsSpent: 0 };
  const strikes = options.strikes ?? false;
  const strikeEvents: StrikeEvent[] = [];
  const log: AiTurnRecord[] = [];
  options.setup?.(state);
  const frames = Math.round(options.durationSeconds / FRAME_SECONDS);

  for (let frame = 0; frame < frames; frame++) {
    state.nowMs += FRAME_SECONDS * 1000;
    const turn = controller.update(FRAME_SECONDS, () => strategy.snapshot(state));
    if (turn) {
      const overlapping = new Set<EnemyAiCommand>();
      for (const command of turn.commands) {
        if (command.type === 'build' && overlapsOwnStructure(state.world, 'enemy', command.position)) {
          overlapping.add(command);
        }
      }
      const goldBefore = enemyGold(state);
      const pointsBefore = state.match.combatPoints.enemy;
      const executed = strategy.execute(state, turn);
      const goldAfter = enemyGold(state);
      rewards.combatPointsSpent += pointsBefore - state.match.combatPoints.enemy;
      log.push({ frame, goldBefore, goldAfter, executed });
      metrics.goldSpentTotal += goldBefore - goldAfter;
      for (const result of executed) {
        const { command } = result;
        if (command.type === 'build') {
          metrics.buildAttempts++;
          if (result.reason === 'too-close') metrics.tooCloseRejections++;
          if (result.reason === 'outside-zone') metrics.outsideZoneRejections++;
          if (result.accepted) {
            metrics.acceptedBuilds[command.kind]++;
            metrics.goldSpentOnStructures += STRUCTURE_DEFINITIONS[command.kind].cost;
            if (overlapping.has(command)) metrics.overlappingAcceptedBuilds++;
          }
        } else if (command.type === 'train') {
          if (result.accepted) metrics.acceptedTrainOrders++;
        } else {
          metrics.rewardCommands++;
        }
      }
    }
    if (!strikes) clearStrikes(state.match);
    simulation.advance(FRAME_SECONDS);
    if (strikes) {
      // state.nowMs already includes this frame, so it is the frame's end.
      advanceStrikes(state.world, state.match, state.bases, FRAME_SECONDS, state.nowMs, difficulty, strikeEvents);
      for (const event of strikeEvents) if (event.type === 'impact') rewards.strikeImpacts++;
    }
    const resolution = resolver.resolve(state.world, state.match, difficulty, state.bases);
    if (resolution.outcome !== null) {
      metrics.outcome = resolution.outcome;
      metrics.outcomeAtSeconds = Math.round((frame + 1) * FRAME_SECONDS * 100) / 100;
      break;
    }
  }
  return { metrics, log, rewards };
}
