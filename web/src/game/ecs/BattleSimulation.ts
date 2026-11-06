import { COMPONENTS } from './components.ts';
import type { ComponentName, Entity } from './components.ts';
import { createInitialBattle } from './initialBattle.ts';
import type {
  ProjectileImpact,
  ProductionCompletedEvent,
  ResourceIncome,
  WeaponFireEvent
} from './systems.ts';
import {
  findNearestTarget,
  runMovementSystem,
  runProjectileSystem,
  runProductionSystem,
  runResourceGenerationSystem,
  runWeaponSystem
} from './systems.ts';
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
const WEAPON_QUERY = [
  COMPONENTS.weapon,
  COMPONENTS.faction,
  COMPONENTS.transform,
  COMPONENTS.health
] satisfies readonly ComponentName[];
const COLLIDER_QUERY = [
  COMPONENTS.collider,
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
  #weaponOwners: Entity[] = [];
  #generators: Entity[] = [];
  #factories: Entity[] = [];
  #projectiles: Entity[] = [];
  #obstacles: Entity[] = [];
  readonly #modifyDamage: (target: Entity, damage: number) => number;
  #weaponEvents: WeaponFireEvent[] = [];
  #productionEvents: ProductionCompletedEvent[] = [];
  #projectileImpacts: ProjectileImpact[] = [];
  #generatedIncome: ResourceIncome = { player: 0, enemy: 0 };

  constructor(options: {
    enemyBaseIncome?: number;
    modifyDamage?: (target: Entity, damage: number) => number;
  } = {}) {
    const battle = createInitialBattle(options.enemyBaseIncome);
    this.world = battle.world;
    this.playerBase = battle.playerBase;
    this.enemyBase = battle.enemyBase;
    this.#modifyDamage = options.modifyDamage ?? ((_target, damage) => damage);
  }

  advance(frameDeltaSeconds: number): void {
    if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds < 0) {
      throw new RangeError('Simulation delta must be a finite, non-negative number');
    }

    this.#accumulator += Math.min(frameDeltaSeconds, MAX_FRAME_DELTA_SECONDS);
    let steps = 0;

    while (this.#accumulator >= FIXED_STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
      this.#advanceStep(FIXED_STEP_SECONDS);
      this.#accumulator -= FIXED_STEP_SECONDS;
      steps++;
    }

    if (steps === MAX_STEPS_PER_FRAME && this.#accumulator >= FIXED_STEP_SECONDS) {
      this.#accumulator = 0;
    }
  }

  getTarget(entity: Entity): Entity | undefined {
    return this.world.getComponent(entity, COMPONENTS.targeting)?.target;
  }

  drainWeaponEvents(): WeaponFireEvent[] {
    return this.#weaponEvents.splice(0);
  }

  drainProjectileImpacts(): ProjectileImpact[] {
    return this.#projectileImpacts.splice(0);
  }

  drainProductionEvents(): ProductionCompletedEvent[] {
    return this.#productionEvents.splice(0);
  }

  drainGeneratedIncome(): ResourceIncome {
    const income = this.#generatedIncome;
    this.#generatedIncome = { player: 0, enemy: 0 };
    return income;
  }

  #advanceStep(deltaSeconds: number): void {
    this.world.queryInto(this.#soldiers, SOLDIER_QUERY);
    this.world.queryInto(this.#candidates, TARGET_QUERY);
    this.world.queryInto(this.#weaponOwners, WEAPON_QUERY);
    this.world.queryInto(this.#obstacles, COLLIDER_QUERY);
    this.#playerTargets.length = 0;
    this.#enemyTargets.length = 0;
    for (const entity of this.#candidates) {
      const faction = this.world.getComponent(entity, COMPONENTS.faction);
      if (faction === 'player') this.#playerTargets.push(entity);
      else if (faction === 'enemy') this.#enemyTargets.push(entity);
    }
    this.#targets.clear();

    for (const soldier of this.#soldiers) {
      const targeting = this.world.getComponent(soldier, COMPONENTS.targeting);
      if (targeting) targeting.target = undefined;
      const health = this.world.getComponent(soldier, COMPONENTS.health);
      if (!health || health.current <= 0) continue;
      const faction = this.world.getComponent(soldier, COMPONENTS.faction);
      const candidates = faction === 'player' ? this.#enemyTargets : this.#playerTargets;
      const target = findNearestTarget(this.world, soldier, candidates);
      if (target !== undefined) {
        this.#targets.set(soldier, target);
        if (targeting) targeting.target = target;
      }
    }

    for (const weaponOwner of this.#weaponOwners) {
      if (this.world.getComponent(weaponOwner, COMPONENTS.soldier)) continue;
      const targeting = this.world.getComponent(weaponOwner, COMPONENTS.targeting);
      if (targeting) targeting.target = undefined;
      const faction = this.world.getComponent(weaponOwner, COMPONENTS.faction);
      const candidates = faction === 'player' ? this.#enemyTargets : this.#playerTargets;
      const target = findNearestTarget(this.world, weaponOwner, candidates);
      const weapon = this.world.getComponent(weaponOwner, COMPONENTS.weapon);
      const ownerPosition = this.world.getComponent(weaponOwner, COMPONENTS.transform);
      const targetPosition = target === undefined
        ? undefined
        : this.world.getComponent(target, COMPONENTS.transform);
      if (target === undefined || !weapon || !ownerPosition || !targetPosition) continue;
      const distance = Math.hypot(
        targetPosition.x - ownerPosition.x,
        targetPosition.z - ownerPosition.z
      );
      if (distance <= weapon.range) {
        this.#targets.set(weaponOwner, target);
        if (targeting) targeting.target = target;
      }
    }

    for (const soldier of this.#soldiers) {
      const target = this.#targets.get(soldier);
      if (target === undefined) continue;
      const targetPosition = this.world.getComponent(target, COMPONENTS.transform);
      if (!targetPosition) continue;
      const health = this.world.getComponent(soldier, COMPONENTS.health);
      if (health && health.current > 0) {
        runMovementSystem(this.world, soldier, targetPosition, deltaSeconds, this.#obstacles);
      }
    }

    for (const weaponOwner of this.#weaponOwners) {
      const event = runWeaponSystem(
        this.world,
        weaponOwner,
        this.#targets.get(weaponOwner),
        deltaSeconds
      );
      if (event) this.#weaponEvents.push(event);
    }

    runProductionSystem(this.world, deltaSeconds, this.#productionEvents, this.#factories);
    const income = runResourceGenerationSystem(this.world, deltaSeconds, this.#generators, {
      player: this.playerBase,
      enemy: this.enemyBase
    });
    this.#generatedIncome.player += income.player;
    this.#generatedIncome.enemy += income.enemy;
    runProjectileSystem(
      this.world,
      deltaSeconds,
      this.#projectileImpacts,
      this.#projectiles,
      this.#modifyDamage
    );
  }
}
