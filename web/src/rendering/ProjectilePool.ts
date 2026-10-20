import * as THREE from 'three';
import type { Position } from '../game/ecs/components.ts';

type ProjectileKey = 'player-light' | 'enemy-light' | 'player-heavy' | 'enemy-heavy';
export type ProjectileAdvanceResult = 'moving' | 'impact' | 'expired';

export interface ProjectileFlight {
  position: Position;
  target: Position;
  remainingSeconds: number;
}

const MAX_CACHED_PROJECTILES_PER_TYPE = 64;
const MAX_ACTIVE_PROJECTILES = 128;

export function advanceProjectile(
  flight: ProjectileFlight,
  deltaSeconds: number,
  speed = 38,
  impactRadius = 1.2
): ProjectileAdvanceResult {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0
    || !Number.isFinite(speed) || speed <= 0
    || !Number.isFinite(impactRadius) || impactRadius < 0
    || !Number.isFinite(flight.remainingSeconds) || flight.remainingSeconds < 0) {
    throw new RangeError('Projectile timing and movement values must be finite and non-negative');
  }

  const deltaX = flight.target.x - flight.position.x;
  const deltaY = flight.target.y - flight.position.y;
  const deltaZ = flight.target.z - flight.position.z;
  const distance = Math.hypot(deltaX, deltaY, deltaZ);
  if (distance <= impactRadius) return 'impact';
  if (flight.remainingSeconds === 0) return 'expired';

  const distanceToTravel = Math.min(speed * deltaSeconds, distance);
  flight.position.x += (deltaX / distance) * distanceToTravel;
  flight.position.y += (deltaY / distance) * distanceToTravel;
  flight.position.z += (deltaZ / distance) * distanceToTravel;
  flight.remainingSeconds = Math.max(0, flight.remainingSeconds - deltaSeconds);
  if (distance - distanceToTravel <= impactRadius) return 'impact';
  return flight.remainingSeconds === 0 ? 'expired' : 'moving';
}

function projectileKey(isPlayer: boolean, isHeavy: boolean): ProjectileKey {
  if (isPlayer) return isHeavy ? 'player-heavy' : 'player-light';
  return isHeavy ? 'enemy-heavy' : 'enemy-light';
}

export class ProjectilePool {
  #scene: THREE.Scene;
  #available = new Map<ProjectileKey, THREE.Mesh[]>();
  #inUse = new Set<THREE.Mesh>();
  #geometries: Record<'light' | 'heavy', THREE.SphereGeometry>;
  #materials: Record<ProjectileKey, THREE.MeshBasicMaterial>;

  constructor(scene: THREE.Scene) {
    this.#scene = scene;
    this.#geometries = {
      light: new THREE.SphereGeometry(0.18, 6, 6),
      heavy: new THREE.SphereGeometry(0.35, 6, 6)
    };
    this.#materials = {
      'player-light': new THREE.MeshBasicMaterial({ color: 0x00f0ff }),
      'enemy-light': new THREE.MeshBasicMaterial({ color: 0xff3344 }),
      'player-heavy': new THREE.MeshBasicMaterial({ color: 0x00f0ff }),
      'enemy-heavy': new THREE.MeshBasicMaterial({ color: 0xff3344 })
    };
    for (const key of Object.keys(this.#materials) as ProjectileKey[]) {
      this.#available.set(key, []);
    }
  }

  acquire(
    position: THREE.Vector3,
    isPlayer: boolean,
    isHeavy: boolean
  ): THREE.Mesh | undefined {
    if (this.#inUse.size >= MAX_ACTIVE_PROJECTILES) return undefined;
    const key = projectileKey(isPlayer, isHeavy);
    const mesh = this.#available.get(key)?.pop()
      ?? new THREE.Mesh(
        isHeavy ? this.#geometries.heavy : this.#geometries.light,
        this.#materials[key]
      );
    mesh.position.copy(position);
    mesh.visible = true;
    this.#inUse.add(mesh);
    this.#scene.add(mesh);
    return mesh;
  }

  release(mesh: THREE.Mesh): void {
    if (!this.#inUse.delete(mesh)) return;
    this.#scene.remove(mesh);
    mesh.visible = false;
    const key = this.#keyFor(mesh);
    const available = this.#available.get(key);
    if (available && available.length < MAX_CACHED_PROJECTILES_PER_TYPE) {
      available.push(mesh);
    } else {
      mesh.clear();
    }
  }

  clear(): void {
    for (const mesh of this.#inUse) this.release(mesh);
  }

  dispose(): void {
    this.clear();
    for (const meshes of this.#available.values()) {
      for (const mesh of meshes) mesh.clear();
      meshes.length = 0;
    }
    for (const geometry of Object.values(this.#geometries)) geometry.dispose();
    for (const material of Object.values(this.#materials)) material.dispose();
    this.#available.clear();
  }

  stats(): { active: number; cached: number } {
    let cached = 0;
    for (const meshes of this.#available.values()) cached += meshes.length;
    return { active: this.#inUse.size, cached };
  }

  #keyFor(mesh: THREE.Mesh): ProjectileKey {
    const isHeavy = mesh.geometry === this.#geometries.heavy;
    const isPlayer = mesh.material === this.#materials['player-light']
      || mesh.material === this.#materials['player-heavy'];
    return projectileKey(isPlayer, isHeavy);
  }
}
