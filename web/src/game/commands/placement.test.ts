import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialBattle, createStructure } from '../ecs/initialBattle.ts';
import type { Faction, Position } from '../ecs/components.ts';
import { validatePlacement } from './placement.ts';

const at = (x: number, z: number): Position => ({ x, y: 0, z });

function emptyBattle() {
  return createInitialBattle();
}

test('the player builds anywhere inside its zone, borders included', () => {
  const { world } = emptyBattle();
  for (const position of [at(0, 73), at(0, 5), at(53, 40), at(-53, 40)]) {
    assert.deepEqual(validatePlacement(world, 'player', position), { ok: true }, JSON.stringify(position));
  }
});

test('the player cannot build outside its zone', () => {
  const { world } = emptyBattle();
  for (const position of [at(0, 4), at(0, 74), at(54, 40), at(0, -40)]) {
    assert.deepEqual(validatePlacement(world, 'player', position), { ok: false, reason: 'outside-zone' }, JSON.stringify(position));
  }
});

test('the enemy zone mirrors the player zone', () => {
  const { world } = emptyBattle();
  for (const position of [at(0, -73), at(0, -5), at(53, -40), at(-53, -40)]) {
    assert.deepEqual(validatePlacement(world, 'enemy', position), { ok: true }, JSON.stringify(position));
  }
  for (const position of [at(0, -4), at(0, -74), at(54, -40), at(0, 40)]) {
    assert.deepEqual(validatePlacement(world, 'enemy', position), { ok: false, reason: 'outside-zone' }, JSON.stringify(position));
  }
});

for (const faction of ['player', 'enemy'] as const satisfies readonly Faction[]) {
  const z = faction === 'player' ? 40 : -40;
  test(`an own structure keeps ${faction} builds 3.8 away`, () => {
    const { world } = emptyBattle();
    createStructure(world, faction, at(0, z), 380, 'turret');
    assert.deepEqual(validatePlacement(world, faction, at(3.79, z)), { ok: false, reason: 'too-close' });
    assert.deepEqual(validatePlacement(world, faction, at(3.8, z)), { ok: true });
  });
}

test('an enemy structure does not block a build', () => {
  const { world } = emptyBattle();
  createStructure(world, 'enemy', at(0, 40), 380, 'turret');
  assert.deepEqual(validatePlacement(world, 'player', at(1, 40)), { ok: true });
});

test('the own Nexus blocks a build next to it', () => {
  const { world } = emptyBattle();
  assert.deepEqual(validatePlacement(world, 'player', at(2, 60)), { ok: false, reason: 'too-close' });
  assert.deepEqual(validatePlacement(world, 'enemy', at(2, -60)), { ok: false, reason: 'too-close' });
});

test('the zone is checked before the distance', () => {
  const { world } = emptyBattle();
  createStructure(world, 'player', at(0, 4), 380, 'turret');
  assert.deepEqual(validatePlacement(world, 'player', at(0, 3)), { ok: false, reason: 'outside-zone' });
});
