import * as THREE from 'three';
import { COMPONENTS, FACTIONS } from '../game/ecs/components.ts';
import type { BuildingKind, Entity, Faction, Position, SoldierKind } from '../game/ecs/components.ts';
import type { ProductionCompletedEvent } from '../game/ecs/systems.ts';
import type { WorldReader } from '../game/ecs/WorldReader.ts';
import type { MatchEvent } from '../game/match/matchEvents.ts';
import { BattlefieldRemains } from './BattlefieldRemains.ts';
import {
  createHQMesh,
  createNexusShieldVisual,
  createTankMesh,
  disposeObjectResources,
  instantiateBuildingMesh
} from './battlefieldMeshes.ts';
import type { CombatEffects } from './CombatEffects.ts';
import { createHealthBar } from './HealthBar.ts';
import type { HealthBar } from './HealthBar.ts';
import type { InstancedSoldierRenderer, SoldierVisualHandle } from './InstancedSoldierRenderer.ts';

/** What GameApplication needs to play an explosion's sound, haptics and camera shake. */
export interface ExplosionCue {
  readonly position: Readonly<Position>;
  readonly scale: number;
  readonly nuclear: boolean;
}

export type VisualKind = BuildingKind | SoldierKind;
export type RemovalCause = 'sold' | 'diagnostic';

export interface LifecycleCounts {
  readonly built: number;
  readonly produced: number;
  readonly unitDied: number;
  readonly structureDestroyed: number;
  readonly sold: number;
  readonly discarded: number;
  readonly clears: number;
}

export interface FactionVisualStats {
  readonly structures: number;
  readonly tanks: number;
  readonly riflemen: number;
}

export interface BattlefieldViewOptions {
  readonly scene: THREE.Scene;
  readonly soldiers: InstancedSoldierRenderer;
  readonly effects: CombatEffects;
  readonly healthBarsVisible: boolean;
}

interface StructureVisual {
  readonly kind: 'structure';
  readonly entity: Entity;
  readonly building: BuildingKind;
  readonly faction: Faction;
  readonly group: THREE.Group;
  readonly healthBar: HealthBar;
  readonly head: THREE.Object3D | undefined;
  readonly shield: THREE.Mesh | undefined;
}

interface TankVisual {
  readonly kind: 'tank';
  readonly entity: Entity;
  readonly faction: Faction;
  readonly group: THREE.Group;
  readonly healthBar: HealthBar;
}

interface RiflemanVisual {
  readonly kind: 'rifleman';
  readonly entity: Entity;
  readonly faction: Faction;
  readonly handle: SoldierVisualHandle;
}

type UnitVisual = TankVisual | RiflemanVisual;
type EntityVisual = StructureVisual | UnitVisual;

const FACTION_ORDER = [FACTIONS.player, FACTIONS.enemy] as const;
const PLAYER_COLOR = 0x00f0ff;
const ENEMY_COLOR = 0xff3344;
const SHIELD_COLORS: Readonly<Record<Faction, number>> = { player: 0x22d3ee, enemy: 0xfb7185 };

/**
 * Owns the visual of every building and soldier, indexed by its ECS entity. It reads the
 * ECS through a WorldReader and never writes gameplay state; each lifecycle path tells
 * it exactly once that an entity appeared or went away.
 */
export class BattlefieldView {
  readonly #scene: THREE.Scene;
  readonly #soldiers: InstancedSoldierRenderer;
  readonly #effects: CombatEffects;
  readonly #remains: BattlefieldRemains;
  readonly #healthBarsVisible: boolean;
  #world: WorldReader | undefined;
  readonly #visuals = new Map<Entity, EntityVisual>();
  readonly #structures: Record<Faction, StructureVisual[]> = { player: [], enemy: [] };
  readonly #units: Record<Faction, UnitVisual[]> = { player: [], enemy: [] };
  readonly #shields: Record<Faction, THREE.Mesh | undefined> = { player: undefined, enemy: undefined };
  /** Registered roots, so a raycast hit on any child climbs back to its entity. */
  readonly #roots = new WeakMap<THREE.Object3D, Entity>();
  readonly #explosionPoint = new THREE.Vector3();
  #counts = { built: 0, produced: 0, unitDied: 0, structureDestroyed: 0, sold: 0, discarded: 0, clears: 0 };

  constructor(options: BattlefieldViewOptions) {
    this.#scene = options.scene;
    this.#soldiers = options.soldiers;
    this.#effects = options.effects;
    this.#healthBarsVisible = options.healthBarsVisible;
    this.#remains = new BattlefieldRemains(options.scene, options.effects);
  }

  attach(world: WorldReader): void {
    if (this.#world) throw new Error('BattlefieldView already has a World attached');
    if (this.#visuals.size > 0) throw new Error('BattlefieldView cannot attach a World while it still holds visuals');
    this.#world = world;
  }

  /** C1-C4: draws a structure the ECS already holds, the Nexus included, from its ECS state. */
  structureBuilt(entity: Entity): void {
    const world = this.#attachedWorld();
    this.#assertNew(entity);
    const building = world.getComponent(entity, COMPONENTS.building)?.kind;
    const faction = world.getComponent(entity, COMPONENTS.faction);
    const position = world.getComponent(entity, COMPONENTS.transform);
    const health = world.getComponent(entity, COMPONENTS.health);
    if (!building || !faction || !position || !health) {
      throw new Error(`Entity ${entity} is not a structure`);
    }
    const isPlayer = faction === FACTIONS.player;
    let group: THREE.Group;
    let healthBar: HealthBar;
    let shield: THREE.Mesh | undefined;
    if (building === 'hq') {
      group = createHQMesh(isPlayer ? PLAYER_COLOR : ENEMY_COLOR);
      group.position.set(position.x, position.y, position.z);
      healthBar = createHealthBar(isPlayer, 5.2, 4.0, this.#healthBarsVisible);
      group.add(healthBar.group);
      shield = createNexusShieldVisual(SHIELD_COLORS[faction]);
      group.add(shield);
      this.#shields[faction] = shield;
    } else {
      group = instantiateBuildingMesh(building, isPlayer);
      group.position.set(position.x, position.y, position.z);
      healthBar = createHealthBar(isPlayer, building === 'turret' ? 2.8 : 2.5, 2.2, this.#healthBarsVisible);
      group.add(healthBar.group);
    }
    const head: unknown = building === 'turret' ? group.userData.head : undefined;
    const visual: StructureVisual = {
      kind: 'structure',
      entity,
      building,
      faction,
      group,
      healthBar,
      head: head instanceof THREE.Object3D ? head : undefined,
      shield
    };
    this.#scene.add(group);
    this.#roots.set(group, entity);
    this.#visuals.set(entity, visual);
    this.#structures[faction].push(visual);
    this.#counts.built++;
  }

  /** C6: draws each completed soldier; returns how many belong to the player. */
  unitsProduced(events: readonly ProductionCompletedEvent[]): number {
    const world = this.#attachedWorld();
    let playerUnits = 0;
    for (const event of events) {
      this.#assertNew(event.soldier);
      const position = world.getComponent(event.soldier, COMPONENTS.transform);
      const health = world.getComponent(event.soldier, COMPONENTS.health);
      const kind = world.getComponent(event.soldier, COMPONENTS.soldierKind);
      if (!position || !health || !kind) {
        throw new Error(`Completed production entity ${event.soldier} is missing soldier state`);
      }
      const isPlayer = event.faction === FACTIONS.player;
      let visual: UnitVisual;
      if (kind === 'rifleman') {
        visual = {
          kind: 'rifleman',
          entity: event.soldier,
          faction: event.faction,
          handle: this.#soldiers.add(event.soldier, event.faction, position)
        };
      } else {
        const group = createTankMesh(isPlayer ? PLAYER_COLOR : ENEMY_COLOR);
        group.position.set(position.x, position.y, position.z);
        const healthBar = createHealthBar(isPlayer, 1.8, 1.4, this.#healthBarsVisible);
        group.add(healthBar.group);
        this.#scene.add(group);
        visual = { kind: 'tank', entity: event.soldier, faction: event.faction, group, healthBar };
      }
      this.#visuals.set(event.soldier, visual);
      this.#units[event.faction].push(visual);
      this.#counts.produced++;
      if (isPlayer) playerUnits++;
    }
    return playerUnits;
  }

  /**
   * C8-C9: plays the visual part of this phase's deaths from the event data alone, in event
   * order, and empties `cues` and fills it with one cue per explosion for audio and shake.
   */
  deathsResolved(events: readonly MatchEvent[], phase: 'units' | 'structures', cues: ExplosionCue[]): void {
    cues.length = 0;
    for (const event of events) {
      if (phase === 'units' && event.type === 'unitDied') this.#unitDied(event, cues);
      else if (phase === 'structures' && event.type === 'structureDestroyed') this.#structureDestroyed(event, cues);
    }
  }

  /** C10-C11: removes and disposes a visual with no remains and no explosion. */
  removedWithoutEffects(entity: Entity, cause: RemovalCause): void {
    const visual = this.#visuals.get(entity);
    if (!visual) return;
    this.#remove(visual);
    if (cause === 'sold') this.#counts.sold++;
    else this.#counts.discarded++;
  }

  /** Moves the units, updates their bars and aim, then aims the turret heads. */
  syncUnitsAndTurrets(camera: THREE.Camera): void {
    const world = this.#world;
    if (!world) return;
    for (const faction of FACTION_ORDER) {
      const units = this.#units[faction];
      for (let index = units.length - 1; index >= 0; index--) {
        const unit = units[index];
        const health = world.getComponent(unit.entity, COMPONENTS.health);
        const transform = world.getComponent(unit.entity, COMPONENTS.transform);
        const object = unit.kind === 'rifleman' ? unit.handle : unit.group;
        if (transform) object.position.set(transform.x, transform.y, transform.z);

        if (unit.kind === 'tank') {
          if (health) unit.healthBar.update(health.current, health.max);
          unit.healthBar.billboard(camera);
        } else if (health) {
          this.#soldiers.setHealth(unit.entity, health.current, health.max);
        }

        const target = world.getComponent(unit.entity, COMPONENTS.targeting)?.target;
        const targetPosition = target === undefined ? undefined : world.getComponent(target, COMPONENTS.transform);
        if (targetPosition && transform) object.lookAt(targetPosition.x, transform.y, targetPosition.z);
      }
    }
    for (const faction of FACTION_ORDER) {
      for (const structure of this.#structures[faction]) {
        if (structure.building === 'turret') this.#aimTurret(world, structure);
      }
    }
  }

  syncStructures(camera: THREE.Camera): void {
    const world = this.#world;
    if (!world) return;
    for (const faction of FACTION_ORDER) {
      for (const structure of this.#structures[faction]) {
        const health = world.getComponent(structure.entity, COMPONENTS.health);
        if (health) structure.healthBar.update(health.current, health.max);
        structure.healthBar.billboard(camera);
      }
    }
  }

  syncShields(active: Readonly<Record<Faction, boolean>>, clockMs: number): void {
    const scale = 1 + Math.sin(clockMs * 0.004) * 0.035;
    for (const faction of FACTION_ORDER) {
      const shield = this.#shields[faction];
      if (!shield) continue;
      shield.visible = active[faction];
      shield.scale.setScalar(scale);
    }
  }

  /** The faction's structure (never its Nexus) under the ray; builds the mesh list per call, as a tap is rare. */
  pickOwnStructure(raycaster: THREE.Raycaster, faction: Faction): Entity | undefined {
    const candidates: THREE.Object3D[] = [];
    for (const structure of this.#structures[faction]) {
      if (structure.building !== 'hq') candidates.push(structure.group);
    }
    const hit = raycaster.intersectObjects(candidates, true)[0];
    let object: THREE.Object3D | null = hit ? hit.object : null;
    while (object) {
      const entity = this.#roots.get(object);
      if (entity !== undefined) return entity;
      object = object.parent;
    }
    return undefined;
  }

  has(entity: Entity): boolean {
    return this.#visuals.has(entity);
  }

  *entries(): IterableIterator<readonly [Entity, VisualKind]> {
    for (const [entity, visual] of this.#visuals) {
      yield [entity, visual.kind === 'structure' ? visual.building : visual.kind] as const;
    }
  }

  stats(): { readonly player: FactionVisualStats; readonly enemy: FactionVisualStats; readonly remains: number } {
    return {
      player: this.#factionStats(FACTIONS.player),
      enemy: this.#factionStats(FACTIONS.enemy),
      remains: this.#remains.count
    };
  }

  /** Accumulated over the view's whole life; clear() does not reset them. */
  lifecycleCounts(): LifecycleCounts {
    return { ...this.#counts };
  }

  /** C12: removes and disposes every exclusive visual and the remains, then detaches the World. Idempotent. */
  clear(): void {
    for (const visual of this.#visuals.values()) {
      if (visual.kind === 'rifleman') continue;
      this.#scene.remove(visual.group);
      disposeObjectResources(visual.group);
    }
    this.#visuals.clear();
    for (const faction of FACTION_ORDER) {
      this.#structures[faction].length = 0;
      this.#units[faction].length = 0;
      this.#shields[faction] = undefined;
    }
    this.#soldiers.clear();
    this.#remains.clear();
    this.#world = undefined;
    this.#counts.clears++;
  }

  #attachedWorld(): WorldReader {
    if (!this.#world) throw new Error('BattlefieldView has no World attached');
    return this.#world;
  }

  #assertNew(entity: Entity): void {
    if (this.#visuals.has(entity)) throw new Error(`Entity ${entity} already has a visual`);
  }

  #unitDied(event: Extract<MatchEvent, { type: 'unitDied' }>, cues: ExplosionCue[]): void {
    const visual = this.#visuals.get(event.entity);
    if (!visual || visual.kind === 'structure') return;
    const object = visual.kind === 'rifleman' ? visual.handle : visual.group;
    object.position.set(event.position.x, event.position.y, event.position.z);
    const scale = event.kind === 'tank' ? 1.2 : 0.6;
    this.#effects.createExplosion(object.position, scale);
    if (event.kind === 'tank') this.#remains.addTankWreck(object.position);
    else this.#remains.addSoldierCorpse(object.position);
    cues.push({ position: event.position, scale, nuclear: false });
    this.#remove(visual);
    this.#counts.unitDied++;
  }

  #structureDestroyed(event: Extract<MatchEvent, { type: 'structureDestroyed' }>, cues: ExplosionCue[]): void {
    const visual = this.#visuals.get(event.entity);
    if (!visual || visual.kind !== 'structure') return;
    const nuclear = event.kind === 'hq';
    if (!nuclear) this.#remains.addBuildingRuin(event.position, event.kind);
    this.#explosionPoint.set(event.position.x, event.position.y, event.position.z);
    if (nuclear) this.#effects.createNuclearExplosion(this.#explosionPoint);
    else this.#effects.createExplosion(this.#explosionPoint, 1.2);
    cues.push({ position: event.position, scale: nuclear ? 3.0 : 1.2, nuclear });
    this.#remove(visual);
    this.#counts.structureDestroyed++;
  }

  #aimTurret(world: WorldReader, turret: StructureVisual): void {
    const { head } = turret;
    if (!head) return;
    const target = world.getComponent(turret.entity, COMPONENTS.targeting)?.target;
    const targetPosition = target === undefined ? undefined : world.getComponent(target, COMPONENTS.transform);
    if (targetPosition) head.lookAt(targetPosition.x, head.position.y + turret.group.position.y, targetPosition.z);
  }

  /** Takes one visual out of the registry, the scene and its lists, disposing what it owns. */
  #remove(visual: EntityVisual): void {
    this.#visuals.delete(visual.entity);
    if (visual.kind === 'rifleman') {
      this.#soldiers.remove(visual.entity);
    } else {
      this.#scene.remove(visual.group);
      disposeObjectResources(visual.group);
    }
    if (visual.kind === 'structure') {
      const list = this.#structures[visual.faction];
      list.splice(list.indexOf(visual), 1);
      if (visual.shield && this.#shields[visual.faction] === visual.shield) this.#shields[visual.faction] = undefined;
    } else {
      const list = this.#units[visual.faction];
      list.splice(list.indexOf(visual), 1);
    }
  }

  #factionStats(faction: Faction): FactionVisualStats {
    let tanks = 0;
    let riflemen = 0;
    for (const unit of this.#units[faction]) {
      if (unit.kind === 'tank') tanks++;
      else riflemen++;
    }
    return { structures: this.#structures[faction].length, tanks, riflemen };
  }
}
