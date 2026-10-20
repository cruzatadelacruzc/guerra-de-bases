import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { InstancedSoldierRenderer } from './InstancedSoldierRenderer.ts';

test('instanced soldiers synchronize faction batches and remove by entity id', () => {
  const scene = new THREE.Scene();
  const renderer = new InstancedSoldierRenderer(scene);
  const player = renderer.add(1, 'player', { x: 1, y: 0, z: 2 });
  const enemy = renderer.add(2, 'enemy', { x: -1, y: 0, z: -2 });
  renderer.setHealth(2, 50, 100);
  renderer.showMuzzleFlash(1, 1);
  renderer.sync(new THREE.Quaternion(), 0.5);

  const batches = scene.children.filter(
    (object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh
  );
  assert.equal(batches.length, 9);
  assert.ok(batches.every((batch) => batch.frustumCulled === false));
  assert.equal(player.position.x, 1);
  assert.equal(enemy.position.z, -2);

  const factionBodies = batches.filter((batch) => batch.geometry instanceof THREE.CylinderGeometry);
  assert.deepEqual(factionBodies.map((batch) => batch.count).sort(), [1, 1]);

  renderer.remove(1);
  renderer.sync(new THREE.Quaternion(), 1);
  assert.deepEqual(factionBodies.map((batch) => batch.count).sort(), [0, 1]);

  renderer.dispose();
  assert.equal(scene.children.length, 0);
});

test('instanced batches grow beyond their initial capacity and reuse slots on removal', () => {
  const scene = new THREE.Scene();
  const renderer = new InstancedSoldierRenderer(scene);
  for (let entity = 1; entity <= 130; entity++) {
    renderer.add(entity, entity % 2 === 0 ? 'player' : 'enemy', { x: entity, y: 0, z: 0 });
  }
  renderer.remove(64);
  renderer.sync(new THREE.Quaternion(), 0);

  const batches = scene.children.filter(
    (object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh
  );
  const sharedHead = batches.find((batch) => batch.geometry instanceof THREE.SphereGeometry);
  assert.equal(sharedHead?.count, 129);
  assert.ok(batches.every((batch) => batch.instanceMatrix.count >= 256));
  renderer.dispose();
});
