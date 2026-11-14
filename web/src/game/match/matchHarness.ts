/** Test-only harness: builds a battle and runs one frame of death handling with a chosen implementation. */
import { BattleSimulation } from '../ecs/BattleSimulation.ts';
import { COMPONENTS } from '../ecs/components.ts';
import type { Entity, Faction, Position, SoldierKind } from '../ecs/components.ts';
import { createSoldier, createSoldierFactory, createStructure, SOLDIER_PRODUCTION } from '../ecs/initialBattle.ts';
import { applyDamageSystem } from '../ecs/systems.ts';
import { STRUCTURE_DEFINITIONS } from '../definitions/structures.ts';
import type { Difficulty } from '../rewardSystem.ts';
import { DeathResolver } from './DeathResolver.ts';
import { legacyProcessDeaths } from './legacyDeathReference.ts';
import type { LegacyCounters, LegacyLists, LegacyRuntimeObject, UnlockCall } from './legacyDeathReference.ts';
import { createMatchState } from './MatchState.ts';
import { unlockEventsFor } from './unlockEvents.ts';

export type ProcessorKind = 'legacy' | 'current';

export interface FrameResult {
  combatPoints: Record<Faction, number>;
  killStreak: Record<Faction, number>;
  playerUnitsDestroyed: number;
  playerUnitsLost: number;
  unlockCalls: UnlockCall[];
  removed: Entity[];
  ending: 'victory' | 'defeat' | null;
}

export class MatchHarness {
  readonly simulation: BattleSimulation;
  readonly #kind: ProcessorKind;
  readonly #difficulty: Difficulty;
  readonly #lists: LegacyLists;
  readonly #counters: LegacyCounters = {
    playerCombatPoints: 0,
    enemyCombatPoints: 0,
    playerKillStreak: 0,
    enemyKillStreak: 0,
    playerUnitsDestroyed: 0,
    playerUnitsLost: 0
  };
  #ended = false;
  readonly #state = createMatchState();
  readonly #resolver = new DeathResolver();

  constructor(kind: ProcessorKind, difficulty: Difficulty = 'normal') {
    this.#kind = kind;
    this.#difficulty = difficulty;
    this.simulation = new BattleSimulation();
    const playerHQ = this.#runtime(this.simulation.playerBase, 'hq', true);
    const enemyHQ = this.#runtime(this.simulation.enemyBase, 'hq', false);
    // As startNewGame: each Nexus is the first entry of its faction's building list.
    this.#lists = {
      playerUnits: [],
      enemyUnits: [],
      playerBuildings: [playerHQ],
      enemyBuildings: [enemyHQ],
      playerHQ,
      enemyHQ
    };
  }

  get ended(): boolean {
    return this.#ended;
  }

  addSoldier(faction: Faction, kind: SoldierKind, position?: Position): Entity {
    const definition = SOLDIER_PRODUCTION[kind];
    const entity = createSoldier(
      this.simulation.world,
      faction,
      position ?? { x: 0, y: 0, z: faction === 'player' ? 20 : -20 },
      definition.speed,
      definition.range,
      definition.health,
      kind
    );
    this.#registerUnit(entity, faction, kind);
    return entity;
  }

  addStructure(faction: Faction, kind: 'generator' | 'barracks' | 'turret', position?: Position): Entity {
    const world = this.simulation.world;
    const at = position ?? { x: 0, y: 0, z: faction === 'player' ? 40 : -40 };
    const health = STRUCTURE_DEFINITIONS[kind].health;
    const entity = kind === 'barracks'
      ? createSoldierFactory(world, faction, at, health)
      : createStructure(world, faction, at, health, kind);
    // As registerStructureTarget: appended to its faction's building list.
    (faction === 'player' ? this.#lists.playerBuildings : this.#lists.enemyBuildings)
      .push(this.#runtime(entity, kind, faction === 'player'));
    return entity;
  }

  setHealth(entity: Entity, current: number): void {
    const health = this.simulation.world.getComponent(entity, COMPONENTS.health);
    if (!health) throw new Error(`Entity ${entity} has no health`);
    health.current = current;
  }

  damage(entity: Entity, amount: number): void {
    applyDamageSystem(this.simulation.world, entity, amount);
  }

  /** Advances the simulation and registers produced soldiers, as advanceBattleSimulation + createTroopVisual did. */
  advance(deltaSeconds: number): void {
    this.simulation.advance(deltaSeconds);
    this.simulation.drainGeneratedIncome();
    this.simulation.drainWeaponEvents();
    this.simulation.drainProjectileImpacts();
    for (const event of this.simulation.drainProductionEvents()) {
      const kind = this.simulation.world.getComponent(event.soldier, COMPONENTS.soldierKind) ?? 'rifleman';
      this.#registerUnit(event.soldier, event.faction, kind);
    }
  }

  /** One frame of death handling. After the match ended nothing runs, as the app left PLAYING. */
  processFrame(): FrameResult {
    if (this.#kind === 'current') return this.#processCurrent();
    if (this.#ended) return this.#result([], [], null);
    const frame = legacyProcessDeaths(this.simulation.world, this.#lists, this.#counters, this.#difficulty);
    if (frame.matchEnding) this.#ended = true;
    return this.#result(frame.unlockCalls, frame.removed, frame.matchEnding);
  }

  /** The extracted rules: DeathResolver plus the unlock translation the app uses. */
  #processCurrent(): FrameResult {
    const resolution = this.#resolver.resolve(this.simulation.world, this.#state, this.#difficulty, {
      player: this.simulation.playerBase,
      enemy: this.simulation.enemyBase
    });
    if (this.#state.outcome !== null) this.#ended = true;
    const unlockCalls: UnlockCall[] = [];
    for (const event of resolution.events) {
      for (const call of unlockEventsFor(event)) unlockCalls.push({ name: call.name, payload: { ...call.payload } });
    }
    const state = this.#state;
    return {
      combatPoints: { ...state.combatPoints },
      killStreak: { ...state.killStreak },
      playerUnitsDestroyed: state.playerUnitsDestroyed,
      playerUnitsLost: state.playerUnitsLost,
      unlockCalls,
      removed: resolution.events.map((event) => event.entity),
      ending: resolution.outcomeIsNew ? resolution.outcome : null
    };
  }

  get kind(): ProcessorKind {
    return this.#kind;
  }

  #result(unlockCalls: UnlockCall[], removed: Entity[], ending: FrameResult['ending']): FrameResult {
    const counters = this.#counters;
    return {
      combatPoints: { player: counters.playerCombatPoints, enemy: counters.enemyCombatPoints },
      killStreak: { player: counters.playerKillStreak, enemy: counters.enemyKillStreak },
      playerUnitsDestroyed: counters.playerUnitsDestroyed,
      playerUnitsLost: counters.playerUnitsLost,
      unlockCalls,
      removed,
      ending
    };
  }

  #registerUnit(entity: Entity, faction: Faction, kind: SoldierKind): void {
    (faction === 'player' ? this.#lists.playerUnits : this.#lists.enemyUnits)
      .push(this.#runtime(entity, kind, faction === 'player'));
  }

  #runtime(entity: Entity, type: LegacyRuntimeObject['type'], isPlayer: boolean): LegacyRuntimeObject {
    return { entity, type, isPlayer, hp: this.simulation.world.getComponent(entity, COMPONENTS.health)?.current ?? 0 };
  }
}
