import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BattlefieldRemains, MAX_BATTLEFIELD_REMAINS } from './BattlefieldRemains.ts';
import { CombatEffects } from './CombatEffects.ts';

function setup(): { scene: THREE.Scene; effects: CombatEffects; scales: number[]; remains: BattlefieldRemains } {
  const scene = new THREE.Scene();
  const effects = new CombatEffects(scene);
  const scales: number[] = [];
  const addBurningEmitter = effects.addBurningEmitter.bind(effects);
  const spy: Pick<CombatEffects, 'addBurningEmitter'> = {
    addBurningEmitter(position: THREE.Vector3, scale?: number): void {
      scales.push(scale ?? 1);
      addBurningEmitter(position, scale);
    }
  };
  return { scene, effects, scales, remains: new BattlefieldRemains(scene, spy) };
}

const at = { x: 3, y: 0, z: -7 };

test("each remains adds one burning emitter with today's scale", () => {
  const { effects, scales, remains } = setup();
  remains.addBuildingRuin(at, 'generator');
  remains.addBuildingRuin(at, 'barracks');
  remains.addBuildingRuin(at, 'turret');
  remains.addBuildingRuin(at, 'hq');
  remains.addTankWreck(at);
  remains.addSoldierCorpse(at);

  assert.deepEqual(scales, [0.9, 1.5, 1.1, 2.2, 0.8, 0.4]);
  assert.equal(effects.stats().activeEmitters, 6);
  assert.equal(remains.count, 6);
});

test('remains are placed at the given position and the position is not retained', () => {
  const { scene, remains } = setup();
  const source = { x: 3, y: 0, z: -7 };
  remains.addSoldierCorpse(source);
  source.x = 99;
  const group = scene.children.find((child) => child.position.z === -7);
  assert.ok(group);
  assert.equal(group.position.x, 3);
});

test('building ruins keep their structure per kind', () => {
  const childCounts = (kind: 'generator' | 'barracks' | 'turret' | 'hq'): number => {
    const { scene, remains } = setup();
    const before = scene.children.length;
    remains.addBuildingRuin(at, kind);
    const added = scene.children.slice(before).find((child) => child instanceof THREE.Group);
    assert.ok(added);
    return added.children.length;
  };
  assert.equal(childCounts('generator'), 3);
  assert.equal(childCounts('barracks'), 7);
  assert.equal(childCounts('turret'), 3);
  assert.equal(childCounts('hq'), 7);
});

test('the 65th remains disposes the oldest', () => {
  const { scene, remains } = setup();
  assert.equal(MAX_BATTLEFIELD_REMAINS, 64);
  remains.addBuildingRuin(at, 'generator');
  const first = scene.children.find((child) => child instanceof THREE.Group);
  assert.ok(first);
  let disposals = 0;
  first.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.addEventListener('dispose', () => disposals++);
  });

  for (let index = 1; index < MAX_BATTLEFIELD_REMAINS; index++) remains.addSoldierCorpse(at);
  assert.equal(remains.count, 64);
  assert.equal(disposals, 0);
  assert.equal(first.parent, scene);

  remains.addSoldierCorpse(at);
  assert.equal(remains.count, 64);
  assert.equal(disposals, 3);
  assert.equal(first.parent, null);
});

test('clear disposes every remains and leaves the scene without them', () => {
  const { scene, remains } = setup();
  const baseline = scene.children.length;
  remains.addBuildingRuin(at, 'turret');
  remains.addTankWreck(at);
  remains.addSoldierCorpse(at);
  const groups = scene.children.filter((child) => child instanceof THREE.Group);
  assert.equal(groups.length, 3);
  let disposals = 0;
  for (const group of groups) {
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.addEventListener('dispose', () => disposals++);
    });
  }

  remains.clear();

  assert.equal(disposals, 3 + 2 + 2);
  assert.equal(remains.count, 0);
  assert.ok(groups.every((group) => group.parent === null));
  assert.equal(scene.children.filter((child) => child instanceof THREE.Group).length, 0);
  assert.ok(scene.children.length >= baseline);
});
