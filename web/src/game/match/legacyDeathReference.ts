/**
 * TEMPORARY, TEST-ONLY (R3). A literal transcription of the gameplay half of
 * GameApplication.ts at commit 5b988a8: the death branch of updateUnitGroup,
 * updateBuildingList and the match-ending check at the end of updateCombat,
 * with everything visual removed. It exists only so the R3 differential test
 * can prove the extracted rules behave the same; it is deleted at the end of
 * R3 and is never imported by application code.
 */
import { COMPONENTS, FACTIONS } from '../ecs/components.ts';
import type { BuildingKind, Entity, SoldierKind } from '../ecs/components.ts';
import type { World } from '../ecs/World.ts';
import { getCombatPointsFor } from '../rewardSystem.ts';
import type { Difficulty } from '../rewardSystem.ts';

/** The gameplay fields of RuntimeUnit / RuntimeStructure; `hp` mirrors ECS health like the app did. */
export interface LegacyRuntimeObject {
  readonly entity: Entity;
  /** Mutable like RuntimeStructure.type, so the original's double 'hq' check type-checks as it did. */
  type: SoldierKind | BuildingKind;
  readonly isPlayer: boolean;
  hp: number;
}

export interface LegacyLists {
  playerUnits: LegacyRuntimeObject[];
  enemyUnits: LegacyRuntimeObject[];
  playerBuildings: LegacyRuntimeObject[];
  enemyBuildings: LegacyRuntimeObject[];
  playerHQ: LegacyRuntimeObject;
  enemyHQ: LegacyRuntimeObject;
}

export interface LegacyCounters {
  playerCombatPoints: number;
  enemyCombatPoints: number;
  playerKillStreak: number;
  enemyKillStreak: number;
  playerUnitsDestroyed: number;
  playerUnitsLost: number;
}

export interface UnlockCall {
  readonly name: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface LegacyFrame {
  unlockCalls: UnlockCall[];
  removed: Entity[];
  matchEnding: 'victory' | 'defeat' | null;
}

function unitKind(type: SoldierKind | BuildingKind): 'rifleman' | 'tank' {
  return type === 'tank' ? 'tank' : 'rifleman';
}

function updateUnitGroup(
  world: World,
  units: LegacyRuntimeObject[],
  isPlayer: boolean,
  counters: LegacyCounters,
  difficulty: Difficulty,
  frame: LegacyFrame
): void {
  for (let i = units.length - 1; i >= 0; i--) {
    const unit = units[i];
    const entity = unit.entity;
    const health = world.getComponent(entity, COMPONENTS.health);
    if (health) unit.hp = health.current;

    if (unit.hp <= 0) {
      if (!isPlayer) {
        counters.playerKillStreak++;
        counters.enemyKillStreak = 0;
        counters.playerUnitsDestroyed++;
        frame.unlockCalls.push({
          name: 'unit_killed',
          payload: { byPlayer: true, killStreak: counters.playerKillStreak, unitType: unit.type }
        });
        frame.unlockCalls.push({ name: 'kill_streak', payload: { killStreak: counters.playerKillStreak } });
        if (counters.playerUnitsDestroyed === 20) {
          frame.unlockCalls.push({ name: 'achievement', payload: { achievement: 'destroy_20_units' } });
        }
      } else {
        counters.enemyKillStreak++;
        counters.playerKillStreak = 0;
        counters.playerUnitsLost++;
        frame.unlockCalls.push({
          name: 'unit_killed',
          payload: { byPlayer: false, killStreak: counters.enemyKillStreak, unitType: unit.type }
        });
      }

      if (!isPlayer) {
        counters.playerCombatPoints += getCombatPointsFor(unitKind(unit.type), difficulty);
      } else {
        counters.enemyCombatPoints += getCombatPointsFor(unitKind(unit.type), difficulty);
      }

      world.removeEntity(entity);
      frame.removed.push(entity);
      units.splice(i, 1);
      continue;
    }
  }
}

function updateBuildingList(
  world: World,
  list: LegacyRuntimeObject[],
  counters: LegacyCounters,
  difficulty: Difficulty,
  frame: LegacyFrame
): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    const health = world.getComponent(b.entity, COMPONENTS.health);
    if (health) b.hp = health.current;
    if (b.hp <= 0) {
      const isHQ = b.type === 'hq';
      if (!isHQ && b.type !== 'hq') {
        const scorerFaction = b.isPlayer ? FACTIONS.enemy : FACTIONS.player;
        const points = getCombatPointsFor(b.type, difficulty);
        if (scorerFaction === FACTIONS.player) counters.playerCombatPoints += points;
        else counters.enemyCombatPoints += points;
      }
      world.removeEntity(b.entity);
      frame.removed.push(b.entity);
      list.splice(i, 1);
    }
  }
}

/** One frame of the old death handling, in the old order. `hqExplodingSequence` was always false while PLAYING. */
export function legacyProcessDeaths(
  world: World,
  lists: LegacyLists,
  counters: LegacyCounters,
  difficulty: Difficulty
): LegacyFrame {
  const frame: LegacyFrame = { unlockCalls: [], removed: [], matchEnding: null };

  // Top of updateCombat: the Nexus mirrors are refreshed from ECS health.
  const playerHealth = world.getComponent(lists.playerHQ.entity, COMPONENTS.health);
  const enemyHealth = world.getComponent(lists.enemyHQ.entity, COMPONENTS.health);
  if (playerHealth) lists.playerHQ.hp = playerHealth.current;
  if (enemyHealth) lists.enemyHQ.hp = enemyHealth.current;

  updateUnitGroup(world, lists.playerUnits, true, counters, difficulty, frame);
  updateUnitGroup(world, lists.enemyUnits, false, counters, difficulty, frame);
  updateBuildingList(world, lists.playerBuildings, counters, difficulty, frame);
  updateBuildingList(world, lists.enemyBuildings, counters, difficulty, frame);

  if (lists.playerHQ.hp <= 0) {
    frame.matchEnding = 'defeat';
  } else if (lists.enemyHQ.hp <= 0) {
    frame.matchEnding = 'victory';
  }
  return frame;
}
