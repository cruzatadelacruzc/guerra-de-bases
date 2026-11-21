import * as THREE from 'three';
import type { BuildableStructureKind } from '../game/definitions/structures.ts';
import type { Position } from '../game/ecs/components.ts';
import { disposeObjectResources, instantiateBuildingMesh } from './battlefieldMeshes.ts';

/**
 * Player build zone: own half of the 110 x 150 terrain, from just behind the
 * center line up to 2 units short of the side and back edges (exclusive bounds).
 */
export const BUILD_ZONE = Object.freeze({ minZ: 5, maxZ: 73, maxAbsX: 53 });

const HIDDEN_Y = -100;

/** Owns the translucent building that follows the pointer while placing, and releases it. */
export class PlacementGhost {
  private ghost: THREE.Group | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly terrain: THREE.Object3D
  ) {}

  get visual(): THREE.Object3D | null {
    return this.ghost;
  }

  show(kind: BuildableStructureKind): void {
    this.hide();
    const ghost = instantiateBuildingMesh(kind, true);
    ghost.position.set(0, HIDDEN_Y, 0);
    this.scene.add(ghost);
    this.ghost = ghost;
  }

  placementAt(
    raycaster: THREE.Raycaster,
    camera: THREE.Camera,
    pointer: THREE.Vector2
  ): Position | undefined {
    raycaster.setFromCamera(pointer, camera);
    const point = raycaster.intersectObject(this.terrain)[0]?.point;
    if (!point
      || point.z <= BUILD_ZONE.minZ
      || point.z >= BUILD_ZONE.maxZ
      || Math.abs(point.x) >= BUILD_ZONE.maxAbsX) return undefined;
    return { x: Math.round(point.x), y: 0, z: Math.round(point.z) };
  }

  track(position: Readonly<Position> | undefined): void {
    if (!this.ghost) return;
    if (position) this.ghost.position.set(position.x, position.y, position.z);
    else this.ghost.position.set(0, HIDDEN_Y, 0);
  }

  hide(): void {
    if (!this.ghost) return;
    this.scene.remove(this.ghost);
    disposeObjectResources(this.ghost);
    this.ghost = null;
  }

  dispose(): void {
    this.hide();
  }
}
