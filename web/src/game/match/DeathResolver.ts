import { COMPONENTS, FACTIONS } from '../ecs/components.ts';
import type { ComponentName, Entity, Faction } from '../ecs/components.ts';
import type { World } from '../ecs/World.ts';
import { getCombatPointsFor } from '../rewardSystem.ts';
import type { Difficulty } from '../rewardSystem.ts';
import type { DeathResolution, MatchEvent } from './matchEvents.ts';
import type { MatchOutcome, MatchState } from './MatchState.ts';

const LIVING_QUERY = [COMPONENTS.health, COMPONENTS.faction] satisfies readonly ComponentName[];

function opponent(faction: Faction): Faction {
  return faction === FACTIONS.player ? FACTIONS.enemy : FACTIONS.player;
}

/**
 * Resolves the deaths of one frame: scores them in `MatchState`, removes the
 * dead entities from the ECS and reports what happened so the view can show it.
 * Order (it decides kill streaks and the tie-break): player units, enemy
 * units, player structures (Nexus included), enemy structures; newest entity
 * first within each group. If both Nexuses fall in the same frame the result
 * is a defeat. Once the match has a result, nothing else is resolved.
 */
export class DeathResolver {
  readonly #living: Entity[] = [];
  readonly #playerUnits: Entity[] = [];
  readonly #enemyUnits: Entity[] = [];
  readonly #playerStructures: Entity[] = [];
  readonly #enemyStructures: Entity[] = [];
  readonly #events: MatchEvent[] = [];

  resolve(
    world: World,
    state: MatchState,
    difficulty: Difficulty,
    bases: Readonly<Record<Faction, Entity>>
  ): DeathResolution {
    this.#events.length = 0;
    if (state.outcome !== null) {
      return { events: this.#events, outcome: state.outcome, outcomeIsNew: false };
    }

    this.#collect(world);
    const playerNexusFallen = this.#isDead(world, bases.player);
    const enemyNexusFallen = this.#isDead(world, bases.enemy);

    this.#resolveUnits(world, state, difficulty, this.#playerUnits);
    this.#resolveUnits(world, state, difficulty, this.#enemyUnits);
    this.#resolveStructures(world, state, difficulty, this.#playerStructures);
    this.#resolveStructures(world, state, difficulty, this.#enemyStructures);

    const outcome: MatchOutcome | null = playerNexusFallen ? 'defeat' : enemyNexusFallen ? 'victory' : null;
    state.outcome = outcome;
    return { events: this.#events, outcome, outcomeIsNew: outcome !== null };
  }

  /** Splits living soldiers and structures by faction, in entity creation order. */
  #collect(world: World): void {
    this.#playerUnits.length = 0;
    this.#enemyUnits.length = 0;
    this.#playerStructures.length = 0;
    this.#enemyStructures.length = 0;
    world.queryInto(this.#living, LIVING_QUERY);
    for (const entity of this.#living) {
      const faction = world.getComponent(entity, COMPONENTS.faction);
      if (world.getComponent(entity, COMPONENTS.soldier)) {
        (faction === FACTIONS.player ? this.#playerUnits : this.#enemyUnits).push(entity);
      } else if (world.getComponent(entity, COMPONENTS.building)) {
        (faction === FACTIONS.player ? this.#playerStructures : this.#enemyStructures).push(entity);
      }
    }
  }

  #isDead(world: World, entity: Entity): boolean {
    const health = world.getComponent(entity, COMPONENTS.health);
    return health !== undefined && health.current <= 0;
  }

  #resolveUnits(world: World, state: MatchState, difficulty: Difficulty, units: readonly Entity[]): void {
    for (let index = units.length - 1; index >= 0; index--) {
      const entity = units[index];
      if (!this.#isDead(world, entity)) continue;
      const faction = world.getComponent(entity, COMPONENTS.faction);
      const kind = world.getComponent(entity, COMPONENTS.soldierKind);
      const position = world.getComponent(entity, COMPONENTS.transform);
      if (!faction || !kind || !position) continue;

      const scorer = opponent(faction);
      state.killStreak[scorer]++;
      state.killStreak[faction] = 0;
      if (faction === FACTIONS.enemy) state.playerUnitsDestroyed++;
      else state.playerUnitsLost++;
      state.combatPoints[scorer] += getCombatPointsFor(kind, difficulty);

      this.#events.push({
        type: 'unitDied',
        entity,
        faction,
        kind,
        position: { x: position.x, y: position.y, z: position.z },
        killerStreak: state.killStreak[scorer],
        playerReachedTwentyKills: faction === FACTIONS.enemy && state.playerUnitsDestroyed === 20
      });
      world.removeEntity(entity);
    }
  }

  #resolveStructures(world: World, state: MatchState, difficulty: Difficulty, structures: readonly Entity[]): void {
    for (let index = structures.length - 1; index >= 0; index--) {
      const entity = structures[index];
      if (!this.#isDead(world, entity)) continue;
      const faction = world.getComponent(entity, COMPONENTS.faction);
      const kind = world.getComponent(entity, COMPONENTS.building)?.kind;
      const position = world.getComponent(entity, COMPONENTS.transform);
      if (!faction || !kind || !position) continue;

      if (kind !== 'hq') state.combatPoints[opponent(faction)] += getCombatPointsFor(kind, difficulty);
      this.#events.push({
        type: 'structureDestroyed',
        entity,
        faction,
        kind,
        position: { x: position.x, y: position.y, z: position.z }
      });
      world.removeEntity(entity);
    }
  }
}
