import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createTerrainGrid } from './TerrainGrid.ts';

test('terrain grid covers the full rectangular terrain, not a square', () => {
  const grid = createTerrainGrid(110, 150, 5, 0x00f0ff, 0x1e293b);
  try {
    grid.geometry.computeBoundingBox();
    const box = grid.geometry.boundingBox ?? new THREE.Box3();
    assert.deepEqual([box.min.x, box.max.x, box.min.z, box.max.z], [-55, 55, -75, 75]);
    // 23 lines along z (x = -55..55 every 5) + 31 lines along x (z = -75..75 every 5), 2 vertices each.
    assert.equal(grid.geometry.getAttribute('position').count, (23 + 31) * 2);
  } finally {
    grid.geometry.dispose();
    (grid.material as THREE.Material).dispose();
  }
});

test('only the lines through the origin use the center color', () => {
  const grid = createTerrainGrid(10, 20, 5, 0xff0000, 0x0000ff);
  try {
    const colors = grid.geometry.getAttribute('color');
    let centerVertices = 0;
    for (let i = 0; i < colors.count; i++) if (colors.getX(i) === 1) centerVertices++;
    assert.equal(centerVertices, 4);
  } finally {
    grid.geometry.dispose();
    (grid.material as THREE.Material).dispose();
  }
});
