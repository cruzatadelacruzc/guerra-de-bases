import * as THREE from 'three';
import { COMPONENTS, FACTIONS } from '../game/ecs/components.ts';
import type { Entity, Position } from '../game/ecs/components.ts';
import type { ProjectileImpact, WeaponFireEvent } from '../game/ecs/systems.ts';
import type { WorldReader } from '../game/ecs/WorldReader.ts';
import type { InstancedSoldierRenderer } from './InstancedSoldierRenderer.ts';
import type { ProjectilePool } from './ProjectilePool.ts';

export type ShotKind = 'rifle' | 'heavy';

const MUZZLE_FLASH_SECONDS = 0.05;

/** Draws projectiles from the ECS: it reads gameplay state and never writes it. */
export class ProjectileView {
  #pool: ProjectilePool;
  #soldiers: Pick<InstancedSoldierRenderer, 'showMuzzleFlash'>;
  #projectiles: Entity[] = [];
  #meshes = new Map<Entity, THREE.Mesh>();
  #spawn = new THREE.Vector3();

  constructor(pool: ProjectilePool, soldiers: Pick<InstancedSoldierRenderer, 'showMuzzleFlash'>) {
    this.#pool = pool;
    this.#soldiers = soldiers;
  }

  /** Empties `shots` and adds one per shot that has a projectile, a position and a shooter faction. */
  fired(world: WorldReader, events: readonly WeaponFireEvent[], elapsedSeconds: number, shots: ShotKind[]): void {
    shots.length = 0;
    for (const event of events) {
      const projectile = world.getComponent(event.projectile, COMPONENTS.projectile);
      const position = world.getComponent(event.projectile, COMPONENTS.transform);
      const faction = world.getComponent(event.source, COMPONENTS.faction);
      if (!projectile || !position || !faction) continue;

      if (world.getComponent(event.source, COMPONENTS.soldierKind) === 'rifleman') {
        shots.push('rifle');
        this.#soldiers.showMuzzleFlash(event.source, elapsedSeconds + MUZZLE_FLASH_SECONDS);
      } else {
        shots.push('heavy');
      }

      this.#spawn.set(position.x, position.y, position.z);
      const mesh = this.#pool.acquire(this.#spawn, faction === FACTIONS.player, projectile.isHeavy);
      if (!mesh) continue;
      this.#projectiles.push(event.projectile);
      this.#meshes.set(event.projectile, mesh);
    }
  }

  /** Empties `heavyImpacts` and adds the position of each heavy impact; releases the meshes that hit. */
  impacts(impacts: readonly ProjectileImpact[], heavyImpacts: Position[]): void {
    heavyImpacts.length = 0;
    for (const impact of impacts) {
      const mesh = this.#meshes.get(impact.projectile);
      if (mesh) {
        this.#pool.release(mesh);
        this.#meshes.delete(impact.projectile);
        const index = this.#projectiles.indexOf(impact.projectile);
        if (index !== -1) this.#projectiles.splice(index, 1);
      }
      if (impact.isHeavy) heavyImpacts.push(impact.position);
    }
  }

  /** Moves each mesh to its projectile and releases those that no longer have a transform. */
  sync(world: WorldReader): void {
    for (let index = this.#projectiles.length - 1; index >= 0; index--) {
      const entity = this.#projectiles[index];
      const mesh = this.#meshes.get(entity);
      const position = world.getComponent(entity, COMPONENTS.transform);
      if (!position || !mesh) {
        if (mesh) this.#pool.release(mesh);
        this.#meshes.delete(entity);
        this.#projectiles.splice(index, 1);
        continue;
      }
      mesh.position.set(position.x, position.y, position.z);
    }
  }

  clear(): void {
    this.#projectiles.length = 0;
    this.#meshes.clear();
    this.#pool.clear();
  }

  stats(): { active: number } {
    return { active: this.#projectiles.length };
  }
}
