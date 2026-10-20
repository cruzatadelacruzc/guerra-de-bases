import { COMPONENTS } from './components.ts';
import type { ComponentName, Entity } from './components.ts';
import { createInitialBattle } from './initialBattle.ts';
import { findNearestTarget, runMovementSystem } from './systems.ts';
import { World } from './World.ts';

const FIXED_STEP_SECONDS = 1 / 30;
const MAX_FRAME_DELTA_SECONDS = 0.1;
const MAX_STEPS_PER_FRAME = 3;
const SOLDIER_QUERY = [
  COMPONENTS.soldier,
  COMPONENTS.faction,
  COMPONENTS.transform,
  COMPONENTS.movement,
  COMPONENTS.health
] satisfies readonly ComponentName[];
const TARGET_QUERY = [
  COMPONENTS.targetable,
  COMPONENTS.faction,
  COMPONENTS.transform,
  COMPONENTS.health
] satisfies readonly ComponentName[];

export class BattleSimulation {
  readonly world: World;
  readonly playerBase: Entity;
  readonly enemyBase: Entity;
  #accumulator = 0;
  #targets = new Map<Entity, Entity>();
  #soldiers: Entity[] = [];
  #candidates: Entity[] = [];
  #playerTargets: Entity[] = [];
  #enemyTargets: Entity[] = [];

  constructor() {
    const battle = createInitialBattle();
    this.world = battle.world;
    this.playerBase = battle.playerBase;
    this.enemyBase = battle.enemyBase;
  }

  advance(frameDeltaSeconds: number): void {
    if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds < 0) {
      throw new RangeError('Simulation delta must be a finite, non-negative number');
    }

    this.#accumulator += Math.min(frameDeltaSeconds, MAX_FRAME_DELTA_SECONDS);
    let steps = 0;

    while (this.#accumulator >= FIXED_STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
      this.#advanceMovement(FIXED_STEP_SECONDS);
      this.#accumulator -= FIXED_STEP_SECONDS;
      steps++;
    }

    if (steps === MAX_STEPS_PER_FRAME && this.#accumulator >= FIXED_STEP_SECONDS) {
      this.#accumulator = 0;
    }
  }

  getTarget(entity: Entity): Entity | undefined {
    return this.#targets.get(entity);
  }

  #advanceMovement(deltaSeconds: number): void {
    this.world.queryInto(this.#soldiers, SOLDIER_QUERY);
    this.world.queryInto(this.#candidates, TARGET_QUERY);
    this.#playerTargets.length = 0;
    this.#enemyTargets.length = 0;
    for (const entity of this.#candidates) {
      const faction = this.world.getComponent(entity, COMPONENTS.faction);
      if (faction === 'player') this.#playerTargets.push(entity);
      else if (faction === 'enemy') this.#enemyTargets.push(entity);
    }
    this.#targets.clear();

    for (const soldier of this.#soldiers) {
      const health = this.world.getComponent(soldier, COMPONENTS.health);
      if (!health || health.current <= 0) continue;
      const faction = this.world.getComponent(soldier, COMPONENTS.faction);
      const candidates = faction === 'player' ? this.#enemyTargets : this.#playerTargets;
      const target = findNearestTarget(this.world, soldier, candidates);
      if (target !== undefined) this.#targets.set(soldier, target);
    }

    for (const soldier of this.#soldiers) {
      const target = this.#targets.get(soldier);
      if (target === undefined) continue;
      const targetPosition = this.world.getComponent(target, COMPONENTS.transform);
      if (!targetPosition) continue;
      const health = this.world.getComponent(soldier, COMPONENTS.health);
      if (health && health.current > 0) runMovementSystem(this.world, soldier, targetPosition, deltaSeconds);
    }
  }
}
