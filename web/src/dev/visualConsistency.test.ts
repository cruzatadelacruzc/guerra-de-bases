import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENTS, FACTIONS } from '../game/ecs/components.ts';
import type { Entity } from '../game/ecs/components.ts';
import { createSoldier, createSoldierFactory } from '../game/ecs/initialBattle.ts';
import { World } from '../game/ecs/World.ts';
import type { VisualKind } from '../rendering/BattlefieldView.ts';
import { checkVisualConsistency, describeInconsistencies, isConsistent } from './visualConsistency.ts';
import type { ConsistencyView } from './visualConsistency.ts';

const origin = { x: 0, y: 0, z: 0 };

function viewOf(entries: Array<readonly [Entity, VisualKind]>, exempt: Entity[] = []): ConsistencyView {
  return { entries: () => entries, exemptions: () => new Set(exempt) };
}

function scene(): { world: World; barracks: Entity; rifleman: Entity } {
  const world = new World();
  const barracks = createSoldierFactory(world, FACTIONS.player, origin);
  const rifleman = createSoldier(world, FACTIONS.enemy, origin);
  return { world, barracks, rifleman };
}

const consistent = (s: ReturnType<typeof scene>) => viewOf([[s.barracks, 'barracks'], [s.rifleman, 'rifleman']]);

test('a consistent registry gives an empty report', () => {
  const s = scene();
  const report = checkVisualConsistency(s.world, consistent(s));
  assert.ok(isConsistent(report));
  assert.match(describeInconsistencies(report), /^Visual consistency failed:/);
});

test('each category is reported on its own', () => {
  const s = scene();
  let report = checkVisualConsistency(s.world, viewOf([[s.barracks, 'barracks']]));
  assert.deepEqual(report.missingVisual, [s.rifleman]);
  assert.equal(isConsistent(report), false);

  report = checkVisualConsistency(s.world, viewOf([[s.barracks, 'barracks'], [s.rifleman, 'rifleman'], [999, 'tank']]));
  assert.deepEqual(report.orphanVisual, [999]);

  const noHealth = s.world.createEntity();
  s.world.addComponent(noHealth, COMPONENTS.faction, 'player');
  s.world.addComponent(noHealth, COMPONENTS.building, { kind: 'turret' });
  s.world.addComponent(noHealth, COMPONENTS.transform, { ...origin });
  report = checkVisualConsistency(s.world, viewOf([[s.barracks, 'barracks'], [s.rifleman, 'rifleman'], [noHealth, 'turret']]));
  assert.deepEqual(report.missingComponent, [noHealth]);
  assert.deepEqual(report.missingVisual, []);

  report = checkVisualConsistency(s.world, viewOf([[s.barracks, 'turret'], [s.rifleman, 'rifleman']]));
  assert.deepEqual(report.kindMismatch, [s.barracks]);

  report = checkVisualConsistency(s.world, viewOf([[s.barracks, 'barracks'], [s.rifleman, 'rifleman']], [s.rifleman]));
  assert.deepEqual(report.exemptWithVisual, [s.rifleman]);

  report = checkVisualConsistency(s.world, viewOf([[s.barracks, 'barracks'], [s.rifleman, 'rifleman']], [777]));
  assert.deepEqual(report.staleExemption, [777]);
});

test('projectiles and exempt entities without a visual are not reported', () => {
  const s = scene();
  const projectile = s.world.createEntity();
  s.world.addComponent(projectile, COMPONENTS.transform, { ...origin });
  s.world.addComponent(projectile, COMPONENTS.soldier, true);
  s.world.addComponent(projectile, COMPONENTS.projectile, {
    target: s.rifleman, targetPosition: { ...origin }, damage: 1, speed: 1, remainingSeconds: 1, impactRadius: 1, isHeavy: false
  });
  assert.ok(isConsistent(checkVisualConsistency(s.world, consistent(s))));

  const factory = createSoldierFactory(s.world, FACTIONS.enemy, origin);
  const report = checkVisualConsistency(s.world, viewOf([[s.barracks, 'barracks'], [s.rifleman, 'rifleman']], [factory]));
  assert.ok(isConsistent(report));
});

test('in the menu every entry is an orphan', () => {
  const report = checkVisualConsistency(undefined, viewOf([[1, 'hq'], [2, 'rifleman']]));
  assert.deepEqual(report.orphanVisual, [1, 2]);
  assert.ok(isConsistent(checkVisualConsistency(undefined, viewOf([]))));
});

test('describeInconsistencies names the entities', () => {
  const s = scene();
  const text = describeInconsistencies(checkVisualConsistency(s.world, viewOf([[42, 'tank']])));
  assert.match(text, /orphanVisual \[42\]/);
  assert.match(text, new RegExp(`missingVisual \\[${s.barracks}, ${s.rifleman}\\]`));
});
