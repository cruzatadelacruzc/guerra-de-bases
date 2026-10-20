import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CombatEffects } from './CombatEffects.ts';

test('effect meshes and scene objects remain bounded during repeated explosions', () => {
  const scene = new THREE.Scene();
  const effects = new CombatEffects(scene);

  for (let burst = 0; burst < 80; burst++) {
    effects.createExplosion(new THREE.Vector3(burst % 3, 0, 0), 0.6);
    effects.update(0.2);
  }

  const stats = effects.stats();
  assert.ok(stats.activeParticles <= 512);
  assert.ok(stats.particleSlots <= 512);
  assert.ok(stats.activeEmitters <= 12);
  assert.ok(stats.emitterSlots <= 12);
  assert.ok(stats.activeShockwaves <= 32);
  assert.ok(stats.shockwaveSlots <= 32);
  assert.ok(stats.activeLights <= 8);
  assert.ok(stats.lightSlots <= 8);
  assert.equal(stats.geometries, 5);
  assert.equal(scene.children.length, 11 + stats.activeLights);

  effects.clear();
  assert.deepEqual(effects.stats(), {
    activeParticles: 0,
    particleSlots: stats.particleSlots,
    activeEmitters: 0,
    emitterSlots: stats.emitterSlots,
    activeShockwaves: 0,
    shockwaveSlots: stats.shockwaveSlots,
    activeLights: 0,
    lightSlots: stats.lightSlots,
    geometries: 5,
    materials: stats.materials
  });
  assert.equal(scene.children.length, 11);

  effects.dispose();
  assert.equal(scene.children.length, 0);
});

test('expired fire emitters stop spawning smoke and their effects stop updating', () => {
  const scene = new THREE.Scene();
  const effects = new CombatEffects(scene);
  effects.createExplosion(new THREE.Vector3(), 0.6);

  effects.update(8.1);
  assert.equal(effects.stats().activeEmitters, 0);
  assert.equal(effects.stats().activeShockwaves, 0);
  assert.equal(effects.stats().activeLights, 0);

  effects.update(2);
  const expiredStats = effects.stats();
  assert.equal(expiredStats.activeParticles, 0);
  effects.update(1);
  assert.deepEqual(effects.stats(), expiredStats);

  effects.dispose();
  assert.equal(scene.children.length, 0);
});
