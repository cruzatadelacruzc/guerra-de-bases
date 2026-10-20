import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { advanceProjectile, ProjectilePool } from './ProjectilePool.ts';

test('projectiles report impact without overshooting and expire when their lifetime ends', () => {
  const position = { x: 0, y: 0, z: 0 };
  const flight = {
    position,
    target: { x: 10, y: 0, z: 0 },
    remainingSeconds: 2
  };

  assert.equal(advanceProjectile(flight, 1, 5), 'moving');
  assert.equal(position.x, 5);
  assert.equal(advanceProjectile(flight, 1, 5), 'impact');
  assert.ok(position.x <= 10);

  const expired = {
    position: { x: 0, y: 0, z: 0 },
    target: { x: 1000, y: 0, z: 0 },
    remainingSeconds: 0.1
  };
  assert.equal(advanceProjectile(expired, 0.1), 'expired');
  assert.ok(expired.position.x > 0);
  assert.ok(expired.position.x < 1000);
});

test('projectiles reuse pooled meshes and release renderer resources explicitly', () => {
  const scene = new THREE.Scene();
  const pool = new ProjectilePool(scene);
  const first = pool.acquire(new THREE.Vector3(1, 2, 3), true, false);
  assert.ok(first);
  pool.release(first);

  const reused = pool.acquire(new THREE.Vector3(4, 5, 6), true, false);
  assert.ok(reused);
  assert.equal(reused, first);
  assert.deepEqual(reused.position.toArray(), [4, 5, 6]);
  assert.equal(scene.children.length, 1);
  assert.deepEqual(pool.stats(), { active: 1, cached: 0 });

  pool.dispose();
  assert.equal(scene.children.length, 0);
});

test('projectile cache is bounded when all pooled meshes are returned', () => {
  const scene = new THREE.Scene();
  const pool = new ProjectilePool(scene);
  const acquired = Array.from(
    { length: 70 },
    () => pool.acquire(new THREE.Vector3(), false, true)
  );
  const meshes = acquired.filter((mesh): mesh is THREE.Mesh => mesh !== undefined);
  assert.equal(meshes.length, 70);
  for (const mesh of meshes) pool.release(mesh);

  assert.deepEqual(pool.stats(), { active: 0, cached: 64 });
  assert.equal(scene.children.length, 0);
  pool.dispose();
});

test('active projectiles have a hard ceiling', () => {
  const scene = new THREE.Scene();
  const pool = new ProjectilePool(scene);
  const acquired = Array.from(
    { length: 128 },
    () => pool.acquire(new THREE.Vector3(), true, false)
  );

  const meshes = acquired.filter((mesh): mesh is THREE.Mesh => mesh !== undefined);
  assert.equal(meshes.length, 128);
  assert.equal(pool.acquire(new THREE.Vector3(), true, false), undefined);
  assert.deepEqual(pool.stats(), { active: 128, cached: 0 });
  pool.clear();
  pool.dispose();
});
