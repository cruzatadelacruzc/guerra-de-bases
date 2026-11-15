/** Test-only harness: builds a battle and runs one frame of death handling as the app does. */
import { BattleSimulation } from '../ecs/BattleSimulation.ts';
import { COMPONENTS } from '../ecs/components.ts';
import type { Entity, Faction, Position, SoldierKind } from '../ecs/components.ts';
import { createSoldier, createSoldierFactory, createStructure, SOLDIER_PRODUCTION } from '../ecs/initialBattle.ts';
import { applyDamageSystem } from '../ecs/systems.ts';
import { STRUCTURE_DEFINITIONS } from '../definitions/structures.ts';
import type { Difficulty } from '../rewardSystem.ts';
import { DeathResolver } from './DeathResolver.ts';
import { createMatchState } from './MatchState.ts';
import { unlockEventsFor } from './unlockEvents.ts';
import type { UnlockCall } from './unlockEvents.ts';

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
  readonly #difficulty: Difficulty;
  readonly #state = createMatchState();
  readonly #resolver = new DeathResolver();

  constructor(difficulty: Difficulty = 'normal') {
    this.#difficulty = difficulty;
    this.simulation = new BattleSimulation();
  }

  get ended(): boolean {
    return this.#state.outcome !== null;
  }

  addSoldier(faction: Faction, kind: SoldierKind, position?: Position): Entity {
    const definition = SOLDIER_PRODUCTION[kind];
    return createSoldier(
      this.simulation.world,
      faction,
      position ?? { x: 0, y: 0, z: faction === 'player' ? 20 : -20 },
      definition.speed,
      definition.range,
      definition.health,
      kind
    );
  }

  addStructure(faction: Faction, kind: 'generator' | 'barracks' | 'turret', position?: Position): Entity {
    const world = this.simulation.world;
    const at = position ?? { x: 0, y: 0, z: faction === 'player' ? 40 : -40 };
    const health = STRUCTURE_DEFINITIONS[kind].health;
    return kind === 'barracks'
      ? createSoldierFactory(world, faction, at, health)
      : createStructure(world, faction, at, health, kind);
  }

  setHealth(entity: Entity, current: number): void {
    const health = this.simulation.world.getComponent(entity, COMPONENTS.health);
    if (!health) throw new Error(`Entity ${entity} has no health`);
    health.current = current;
  }

  damage(entity: Entity, amount: number): void {
    applyDamageSystem(this.simulation.world, entity, amount);
  }

  /** Advances the simulation and drains its events, as advanceBattleSimulation does. */
  advance(deltaSeconds: number): void {
    this.simulation.advance(deltaSeconds);
    this.simulation.drainGeneratedIncome();
    this.simulation.drainWeaponEvents();
    this.simulation.drainProjectileImpacts();
    this.simulation.drainProductionEvents();
  }

  /** One frame of death handling: DeathResolver plus the unlock translation the app uses. */
  processFrame(): FrameResult {
    const resolution = this.#resolver.resolve(this.simulation.world, this.#state, this.#difficulty, {
      player: this.simulation.playerBase,
      enemy: this.simulation.enemyBase
    });
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
}
