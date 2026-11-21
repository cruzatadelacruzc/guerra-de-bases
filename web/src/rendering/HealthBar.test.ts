import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createHealthBar } from './HealthBar.ts';

test('update scales and shifts the fill', () => {
  const bar = createHealthBar(true);
  bar.update(50, 100);
  assert.equal(bar.fillMesh.scale.x, 0.5);
  assert.equal(bar.fillMesh.position.x, -0.4);

  bar.update(0, 100);
  assert.equal(bar.fillMesh.scale.x, 0);
  bar.update(-20, 100);
  assert.equal(bar.fillMesh.scale.x, 0);
  bar.update(150, 100);
  assert.equal(bar.fillMesh.scale.x, 1);
  assert.equal(bar.fillMesh.position.x + 0, 0);
});

test('billboard copies the camera quaternion', () => {
  const bar = createHealthBar(false);
  const camera = new THREE.PerspectiveCamera();
  camera.quaternion.setFromEuler(new THREE.Euler(-0.7, 0.3, 0.1));
  bar.billboard(camera);
  assert.ok(bar.group.quaternion.equals(camera.quaternion));
});

test('visible false hides the group', () => {
  assert.equal(createHealthBar(true).group.visible, true);
  assert.equal(createHealthBar(true, 2.0, 1.6, true).group.visible, true);
  assert.equal(createHealthBar(true, 2.0, 1.6, false).group.visible, false);
});

test('default height 2.0 and width 1.6', () => {
  const bar = createHealthBar(true);
  assert.equal(bar.group.position.y, 2.0);
  assert.equal(bar.maxWidth, 1.6);
  assert.equal(bar.group.children.length, 3);
  const [background, border, fill] = bar.group.children as THREE.Mesh[];
  assert.deepEqual(
    [background, border, fill].map((mesh) => (mesh.geometry as THREE.PlaneGeometry).parameters.width),
    [1.6, 1.6 + 0.06, 1.6]
  );
  assert.deepEqual(
    [background, border, fill].map((mesh) => (mesh.geometry as THREE.PlaneGeometry).parameters.height),
    [0.22, 0.28, 0.18]
  );
  assert.equal(border.position.z, -0.005);
  assert.equal(fill.position.z, 0.01);
});

test('player and enemy fills use their colors and every material is double sided', () => {
  const colorOf = (isPlayer: boolean): number => {
    const bar = createHealthBar(isPlayer);
    const materials = bar.group.children.map((child) => (child as THREE.Mesh).material as THREE.MeshBasicMaterial);
    assert.deepEqual(materials.map((material) => material.side), [THREE.DoubleSide, THREE.DoubleSide, THREE.DoubleSide]);
    assert.deepEqual(materials.slice(0, 2).map((material) => material.color.getHex()), [0x0f172a, 0x334155]);
    return materials[2].color.getHex();
  };
  assert.equal(colorOf(true), 0x00f0ff);
  assert.equal(colorOf(false), 0xff3344);
});

test('a custom height and width are honoured', () => {
  const bar = createHealthBar(true, 5.2, 4.0);
  assert.equal(bar.group.position.y, 5.2);
  assert.equal(bar.maxWidth, 4.0);
  bar.update(25, 100);
  assert.equal(bar.fillMesh.position.x, -1.5);
});
