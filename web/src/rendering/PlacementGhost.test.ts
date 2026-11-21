import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { InstancedSoldierRenderer } from './InstancedSoldierRenderer.ts';
import { createBarracksMesh, disposeObjectResources } from './battlefieldMeshes.ts';
import { PlacementGhost } from './PlacementGhost.ts';

function resourcesOf(root: THREE.Object3D): Array<THREE.BufferGeometry | THREE.Material> {
  const found: Array<THREE.BufferGeometry | THREE.Material> = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    found.push(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    found.push(...materials);
  });
  return found;
}

function countDisposals(resources: Array<THREE.BufferGeometry | THREE.Material>): Map<unknown, number> {
  const counts = new Map<unknown, number>();
  for (const resource of resources) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) ?? 0) + 1));
  }
  return counts;
}

function setup() {
  const scene = new THREE.Scene();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(110, 150), new THREE.MeshBasicMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.updateMatrixWorld();
  return { scene, floor, ghost: new PlacementGhost(scene, floor) };
}

test('hide disposes every geometry and material of the ghost once', () => {
  const { scene, ghost } = setup();
  ghost.show('barracks');
  const visual = ghost.visual;
  assert.ok(visual);
  const counts = countDisposals(resourcesOf(visual));
  assert.ok(counts.size > 0);
  ghost.hide();
  assert.equal(ghost.visual, null);
  assert.equal(scene.children.includes(visual), false);
  for (const count of counts.values()) assert.equal(count, 1);
});

test('show replaces the previous ghost and disposes it first', () => {
  const { scene, ghost } = setup();
  ghost.show('barracks');
  const first = ghost.visual;
  assert.ok(first);
  const counts = countDisposals(resourcesOf(first));
  ghost.show('turret');
  for (const count of counts.values()) assert.equal(count, 1);
  assert.notEqual(ghost.visual, first);
  assert.equal(scene.children.filter((child) => child === ghost.visual).length, 1);
  assert.equal(scene.children.includes(first), false);
  assert.equal(scene.children.length, 1);
});

test('show of the same kind creates a fresh ghost', () => {
  const { ghost } = setup();
  ghost.show('barracks');
  const first = ghost.visual;
  ghost.show('barracks');
  assert.ok(ghost.visual);
  assert.notEqual(ghost.visual, first);
  assert.equal(ghost.visual.position.y, -100);
});

test('hide twice and hide without a ghost do not throw', () => {
  const { ghost } = setup();
  assert.doesNotThrow(() => ghost.hide());
  ghost.show('generator');
  ghost.hide();
  assert.doesNotThrow(() => ghost.hide());
  assert.doesNotThrow(() => ghost.dispose());
});

test("no other object's resources are disposed", () => {
  const { scene, ghost } = setup();
  const building = createBarracksMesh();
  scene.add(building);
  const soldiers = new InstancedSoldierRenderer(scene);
  soldiers.add(1, 'player', { x: 0, y: 0, z: 0 });
  const others = resourcesOf(building);
  for (const child of scene.children) {
    if (child instanceof THREE.InstancedMesh) others.push(child.geometry, child.material as THREE.Material);
  }
  const counts = countDisposals(others);
  ghost.show('turret');
  ghost.track({ x: 1, y: 0, z: 2 });
  ghost.show('barracks');
  ghost.hide();
  ghost.dispose();
  for (const count of counts.values()) assert.equal(count, 0);
  disposeObjectResources(building);
  soldiers.dispose();
});

test('track keeps the same mesh and hides it at y = -100 when undefined', () => {
  const { ghost } = setup();
  ghost.show('turret');
  const visual = ghost.visual;
  ghost.track({ x: 4, y: 0, z: 9 });
  assert.equal(ghost.visual, visual);
  assert.deepEqual(visual?.position.toArray(), [4, 0, 9]);
  ghost.track(undefined);
  assert.equal(ghost.visual, visual);
  assert.deepEqual(visual?.position.toArray(), [0, -100, 0]);
  const empty = setup().ghost;
  assert.doesNotThrow(() => empty.track({ x: 1, y: 0, z: 1 }));
});

test('placementAt rounds inside the zone and rejects the edges', () => {
  const { ghost, floor } = setup();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(0, 100, 60);
  camera.lookAt(0, 0, 40);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  floor.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  const pointerFor = (x: number, z: number): THREE.Vector2 => {
    const ndc = new THREE.Vector3(x, 0, z).project(camera);
    return new THREE.Vector2(ndc.x, ndc.y);
  };
  const at = (x: number, z: number) => ghost.placementAt(raycaster, camera, pointerFor(x, z));
  assert.deepEqual(at(10.4, 20.6), { x: 10, y: 0, z: 21 });
  assert.equal(at(0, 5), undefined);
  assert.equal(at(0, 73), undefined);
  assert.equal(at(53.5, 40), undefined);
  assert.equal(at(-53.5, 40), undefined);
  assert.ok(at(52.4, 72.4));
});
