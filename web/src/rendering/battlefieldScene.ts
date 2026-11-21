import * as THREE from 'three';
import { createSoldierMesh, disposeObjectResources } from './battlefieldMeshes.ts';
import { createTerrainGrid } from './TerrainGrid.ts';

export interface BattlefieldTerrain {
  readonly floor: THREE.Mesh;
  dispose(): void;
}

/** Adds floor, outer ground, grid and center line to the scene, in that order. */
export function createBattlefieldTerrain(scene: THREE.Scene): BattlefieldTerrain {
  const planeGeo = new THREE.PlaneGeometry(110, 150);
  const planeMat = new THREE.MeshStandardMaterial({
    color: 0x0a0f1d,
    roughness: 0.8,
    metalness: 0.2
  });
  const floor = new THREE.Mesh(planeGeo, planeMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Plain unlit ground around the map so its edges don't float in a void;
  // it sits below the terrain (which hides it inside the map) and the far
  // fog blends it into the background before its own edge is seen.
  const outerGround = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshBasicMaterial({ color: 0x0c1222 })
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.1;
  scene.add(outerGround);

  const gridHelper = createTerrainGrid(110, 150, 5, 0x00f0ff, 0x1e293b);
  gridHelper.position.y = 0.05;
  scene.add(gridHelper);

  const centerLineGeo = new THREE.BoxGeometry(110, 0.2, 1);
  const centerLineMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6 });
  const centerLine = new THREE.Mesh(centerLineGeo, centerLineMat);
  centerLine.position.set(0, 0.1, 0);
  scene.add(centerLine);

  const objects: THREE.Object3D[] = [floor, outerGround, gridHelper, centerLine];
  return {
    floor,
    dispose(): void {
      for (const object of objects) {
        scene.remove(object);
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
      }
    }
  };
}

/** The idle soldiers shown behind the main menu; they live outside the ECS. */
export class MenuSoldiers {
  readonly #scene: THREE.Scene;
  #soldiers: THREE.Group[] = [];

  constructor(scene: THREE.Scene) {
    this.#scene = scene;
  }

  get count(): number {
    return this.#soldiers.length;
  }

  show(random: () => number = Math.random): void {
    for (let i = 0; i < 8; i++) {
      const s = createSoldierMesh(0x00f0ff);
      s.position.set(-15 + random() * 10, 0, 10 + random() * 10);
      this.#scene.add(s);
      this.#soldiers.push(s);
    }
    for (let i = 0; i < 8; i++) {
      const s = createSoldierMesh(0xff3344);
      s.position.set(-15 + random() * 10, 0, -10 - random() * 10);
      this.#scene.add(s);
      this.#soldiers.push(s);
    }
  }

  clear(): void {
    for (const soldier of this.#soldiers) {
      this.#scene.remove(soldier);
      disposeObjectResources(soldier);
    }
    this.#soldiers = [];
  }
}
