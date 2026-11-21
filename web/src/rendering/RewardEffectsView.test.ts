import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { Faction } from '../game/ecs/components.ts';
import { createMatchState } from '../game/match/MatchState.ts';
import type { MatchState } from '../game/match/MatchState.ts';
import { scheduleStrike } from '../game/match/rewardExecution.ts';
import type { ActiveStrike } from '../game/match/strikeState.ts';
import { apexHeightFor, ballisticPoint } from './ballisticArc.ts';
import { RewardEffectsView } from './RewardEffectsView.ts';

const ORIGIN = Object.freeze({ x: -40, y: 5.5, z: 30 });

function setup(): { scene: THREE.Scene; view: RewardEffectsView; match: MatchState } {
  const scene = new THREE.Scene();
  const view = new RewardEffectsView({
    scene,
    shellOrigin: (faction: Faction, index: number) => ({ x: ORIGIN.x + index, y: ORIGIN.y, z: faction === 'player' ? ORIGIN.z : -ORIGIN.z })
  });
  return { scene, view, match: createMatchState() };
}

function airStrike(match: MatchState, heading = { x: 1, z: 0 }): Extract<ActiveStrike, { kind: 'air_strike' }> {
  const strike = scheduleStrike(match, 'player', 'air_strike', { x: 4, z: -6 }, heading, 'normal', 0);
  if (strike.kind !== 'air_strike') throw new Error('expected an air strike');
  return strike;
}

function artilleryStrike(match: MatchState): Extract<ActiveStrike, { kind: 'artillery_strike' }> {
  const strike = scheduleStrike(match, 'player', 'artillery_strike', { x: 10, z: -20 }, undefined, 'normal', 0);
  if (strike.kind !== 'artillery_strike') throw new Error('expected an artillery strike');
  return strike;
}

function named(scene: THREE.Scene, name: string): THREE.Object3D {
  const object = scene.getObjectByName(name);
  if (!object) throw new Error(`missing ${name}`);
  return object;
}

test('sync creates one aircraft and four hidden bombs for an air strike', () => {
  const { scene, view, match } = setup();
  const strike = airStrike(match);
  view.sync(match.strikes);

  const aircraft = named(scene, `strike-${strike.id}-aircraft`);
  assert.ok(aircraft instanceof THREE.Group);
  assert.equal(aircraft.parent, scene);
  for (let index = 0; index < 4; index++) {
    const bomb = named(scene, `strike-${strike.id}-bomb-${index}`);
    assert.equal(bomb.visible, false);
  }
  assert.equal(scene.getObjectByName(`strike-${strike.id}-bomb-4`), undefined);
  assert.deepEqual(view.stats(), { strikes: 1, sceneObjects: 5 });
  assert.equal(scene.children.length, 5);
});

test('a bomb is visible only between released and landed', () => {
  const { scene, view, match } = setup();
  const strike = airStrike(match);
  const bomb = strike.bombs[1];
  view.sync(match.strikes);
  const mesh = named(scene, `strike-${strike.id}-bomb-1`);
  assert.equal(mesh.visible, false);

  bomb.released = true;
  bomb.releaseX = 9;
  bomb.releaseZ = -3;
  bomb.releaseProgress = 0.5;
  bomb.fallElapsedSeconds = 0.36;
  view.sync(match.strikes);
  assert.equal(mesh.visible, true);
  // Half-way down from the aircraft's height at release toward 0.6 above the impact point.
  const releaseY = 8 + Math.sin(0.5 * Math.PI) * 1.2 - 0.6;
  assert.equal(mesh.position.x, THREE.MathUtils.lerp(9, bomb.x, 0.5));
  assert.equal(mesh.position.y, THREE.MathUtils.lerp(releaseY, 0.6, 0.5));
  assert.equal(mesh.position.z, THREE.MathUtils.lerp(-3, bomb.z, 0.5));

  bomb.fallElapsedSeconds = 0.72;
  bomb.landed = true;
  view.sync(match.strikes);
  assert.equal(mesh.visible, false);
});

test("a shell follows the ballistic arc from its origin to the impact point by the domain's flight progress", () => {
  const { scene, view, match } = setup();
  const strike = artilleryStrike(match);
  view.sync(match.strikes);
  const shell = strike.shells[1];
  const mesh = named(scene, `strike-${strike.id}-shell-1`);
  assert.equal(mesh.visible, false);

  shell.launched = true;
  strike.elapsedSeconds = shell.launchAtSeconds + 1.1;
  view.sync(match.strikes);
  const origin = { x: ORIGIN.x + 1, y: ORIGIN.y, z: ORIGIN.z };
  const point = { x: shell.x, y: 0, z: shell.z };
  const expected = ballisticPoint(origin, point, apexHeightFor(origin, point), 0.5, { x: 0, y: 0, z: 0 });
  assert.equal(mesh.visible, true);
  assert.equal(mesh.position.x, expected.x);
  assert.equal(mesh.position.y, expected.y);
  assert.equal(mesh.position.z, expected.z);

  shell.landed = true;
  view.sync(match.strikes);
  assert.equal(mesh.visible, false);
});

test("the aircraft position depends only on the strike's elapsed time and stored heading", () => {
  const { scene, view, match } = setup();
  const strike = airStrike(match, { x: 0.6, z: -0.8 });
  strike.elapsedSeconds = 1.3;
  view.sync(match.strikes);
  const aircraft = named(scene, `strike-${strike.id}-aircraft`);
  const position = aircraft.position.clone();
  const quaternion = aircraft.quaternion.clone();

  const progress = 1.3 / 5.2;
  assert.equal(position.x, THREE.MathUtils.lerp(strike.startX, strike.endX, progress));
  assert.equal(position.y, 8 + Math.sin(progress * Math.PI) * 1.2);
  assert.equal(position.z, THREE.MathUtils.lerp(strike.startZ, strike.endZ, progress));
  // The nose (+X) points along the run on the ground.
  const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  assert.ok(Math.abs(nose.x / Math.hypot(nose.x, nose.z) - 0.6) < 1e-9);
  assert.ok(Math.abs(nose.z / Math.hypot(nose.x, nose.z) + 0.8) < 1e-9);

  view.sync(match.strikes);
  assert.ok(aircraft.position.equals(position));
  assert.ok(aircraft.quaternion.equals(quaternion));
});

test('strikes missing from the timeline lose their visuals and free their geometries', () => {
  const { scene, view, match } = setup();
  const air = airStrike(match);
  artilleryStrike(match);
  view.sync(match.strikes);
  assert.deepEqual(view.stats(), { strikes: 2, sceneObjects: 8 });

  const disposed = new Set<THREE.BufferGeometry>();
  const geometries = new Set<THREE.BufferGeometry>();
  for (const name of [`strike-${air.id}-aircraft`, ...[0, 1, 2, 3].map((index) => `strike-${air.id}-bomb-${index}`)]) {
    named(scene, name).traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry: THREE.BufferGeometry = object.geometry;
      geometries.add(geometry);
      geometry.addEventListener('dispose', () => disposed.add(geometry));
    });
  }
  assert.ok(geometries.size >= 5);

  match.strikes.active.splice(match.strikes.active.indexOf(air), 1);
  view.sync(match.strikes);
  assert.deepEqual(view.stats(), { strikes: 1, sceneObjects: 3 });
  assert.equal(scene.children.length, 3);
  assert.equal(scene.getObjectByName(`strike-${air.id}-aircraft`), undefined);
  assert.equal(disposed.size, geometries.size);
});

test('clear removes every strike visual from the scene', () => {
  const { scene, view, match } = setup();
  airStrike(match);
  artilleryStrike(match);
  view.sync(match.strikes);
  assert.equal(scene.children.length, 8);

  view.clear();
  assert.deepEqual(view.stats(), { strikes: 0, sceneObjects: 0 });
  assert.equal(scene.children.length, 0);

  // The shared shell resources survive clear() and are released by dispose().
  artilleryStrike(match);
  match.strikes.active.shift();
  match.strikes.active.shift();
  view.sync(match.strikes);
  const shell = scene.children[0];
  assert.ok(shell instanceof THREE.Mesh);
  let sharedDisposed = false;
  shell.geometry.addEventListener('dispose', () => { sharedDisposed = true; });
  view.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(sharedDisposed, true);
});
