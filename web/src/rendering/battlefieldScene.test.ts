import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createBattlefieldTerrain, MenuSoldiers } from './battlefieldScene.ts';

function colorOf(material: THREE.Material): number {
  assert.ok(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial);
  return material.color.getHex();
}

test('createBattlefieldTerrain adds floor, outer ground, grid and center line in that order', () => {
  const scene = new THREE.Scene();
  const terrain = createBattlefieldTerrain(scene);
  assert.equal(scene.children.length, 4);
  const [floor, outer, grid, centerLine] = scene.children;
  assert.equal(terrain.floor, floor);
  assert.ok(floor instanceof THREE.Mesh);
  assert.ok(floor.geometry instanceof THREE.PlaneGeometry);
  assert.equal(floor.geometry.parameters.width, 110);
  assert.equal(floor.geometry.parameters.height, 150);
  assert.equal(floor.rotation.x, -Math.PI / 2);
  assert.equal(floor.receiveShadow, true);
  assert.ok(outer instanceof THREE.Mesh);
  assert.ok(outer.geometry instanceof THREE.PlaneGeometry);
  assert.equal(outer.geometry.parameters.width, 2000);
  assert.equal(outer.position.y, -0.1);
  assert.ok(grid instanceof THREE.LineSegments);
  assert.equal(grid.position.y, 0.05);
  assert.ok(centerLine instanceof THREE.Mesh);
  assert.ok(centerLine.geometry instanceof THREE.BoxGeometry);
  assert.deepEqual(centerLine.position.toArray(), [0, 0.1, 0]);
  assert.equal(colorOf(centerLine.material as THREE.Material), 0xffaa00);
});

test('createBattlefieldTerrain dispose releases geometries and materials and leaves the scene', () => {
  const scene = new THREE.Scene();
  const terrain = createBattlefieldTerrain(scene);
  const resources: (THREE.BufferGeometry | THREE.Material)[] = [];
  for (const child of scene.children) {
    assert.ok(child instanceof THREE.Mesh || child instanceof THREE.LineSegments);
    resources.push(child.geometry, child.material as THREE.Material);
  }
  let disposed = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => { disposed++; });
  terrain.dispose();
  assert.equal(disposed, 8);
  assert.equal(scene.children.length, 0);
});

test('MenuSoldiers.show places 8 player and 8 enemy soldiers, and clear releases them', () => {
  const scene = new THREE.Scene();
  const menu = new MenuSoldiers(scene);
  assert.equal(menu.count, 0);
  menu.show(() => 0.5);
  assert.equal(menu.count, 16);
  assert.equal(scene.children.length, 16);
  const players = scene.children.slice(0, 8);
  const enemies = scene.children.slice(8);
  for (const soldier of players) assert.deepEqual(soldier.position.toArray(), [-10, 0, 15]);
  for (const soldier of enemies) assert.deepEqual(soldier.position.toArray(), [-10, 0, -15]);
  const firstColor = (soldier: THREE.Object3D): number => {
    let color = -1;
    soldier.traverse((o) => {
      if (color === -1 && o instanceof THREE.Mesh) color = colorOf(o.material as THREE.Material);
    });
    return color;
  };
  assert.equal(firstColor(players[0]), 0x00f0ff);
  assert.equal(firstColor(enemies[0]), 0xff3344);

  let disposed = 0;
  players[0].traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.addEventListener('dispose', () => { disposed++; });
  });
  menu.clear();
  assert.ok(disposed > 0);
  assert.equal(menu.count, 0);
  assert.equal(scene.children.length, 0);
});
