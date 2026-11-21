import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotCommandState } from '../game/commands/commandTestState.ts';
import { COMPONENTS } from '../game/ecs/components.ts';
import type { Entity, Faction, Position, SoldierKind } from '../game/ecs/components.ts';
import { createSoldier, createStructure, SOLDIER_PRODUCTION } from '../game/ecs/initialBattle.ts';
import type { ProjectileImpact, WeaponFireEvent } from '../game/ecs/systems.ts';
import { STRUCTURE_DEFINITIONS } from '../game/definitions/structures.ts';
import { ProjectileView } from './ProjectileView.ts';
import type { ShotKind } from './ProjectileView.ts';
import { createPresentationTestMatch, freezeWorldComponents } from './presentationTestState.ts';
import type { PresentationTestMatch } from './presentationTestState.ts';

function addSoldier(match: PresentationTestMatch, faction: Faction, kind: SoldierKind, position: Position): Entity {
  const definition = SOLDIER_PRODUCTION[kind];
  return createSoldier(
    match.simulation.world, faction, position, definition.speed, definition.range, definition.health, kind
  );
}

function setup() {
  const match = createPresentationTestMatch();
  const flashes: Array<[Entity, number]> = [];
  const view = new ProjectileView(match.pool, { showMuzzleFlash: (entity, until) => flashes.push([entity, until]) });
  return { match, view, flashes, shots: [] as ShotKind[], heavy: [] as Position[] };
}

/** Advances until the simulation reports a weapon fire event (from `shooter`, when given); returns the events of that frame. */
function advanceUntilFire(match: PresentationTestMatch, shooter?: Entity, frames = 200): WeaponFireEvent[] {
  for (let frame = 0; frame < frames; frame++) {
    match.simulation.advance(1 / 30);
    const events = match.simulation.drainWeaponEvents();
    if (events.length > 0 && (shooter === undefined || events.some((event) => event.source === shooter))) {
      return events;
    }
  }
  throw new Error('nothing fired');
}

test("a rifleman's shot is a rifle shot with a muzzle flash; tank and turret shots are heavy", () => {
  const { match, view, flashes, shots } = setup();
  const rifleman = addSoldier(match, 'player', 'rifleman', { x: -30, y: 0, z: 0 });
  addSoldier(match, 'enemy', 'rifleman', { x: -30, y: 0, z: -5 });
  view.fired(match.simulation.world, advanceUntilFire(match), 2, shots);
  assert.ok(shots.length > 0);
  assert.ok(shots.every((shot) => shot === 'rifle'));
  assert.ok(flashes.length > 0);
  assert.ok(flashes.every(([, until]) => until === 2 + 0.05));
  assert.ok(flashes.some(([entity]) => entity === rifleman));

  const heavy = setup();
  const tank = addSoldier(heavy.match, 'player', 'tank', { x: 30, y: 0, z: 0 });
  addSoldier(heavy.match, 'enemy', 'rifleman', { x: 30, y: 0, z: -5 });
  const tankEvents = advanceUntilFire(heavy.match, tank).filter((event) => event.source === tank);
  heavy.view.fired(heavy.match.simulation.world, tankEvents, 1, heavy.shots);
  assert.deepEqual(heavy.shots, ['heavy']);
  assert.ok(!heavy.flashes.some(([entity]) => entity === tank));

  const turretSide = setup();
  const world = turretSide.match.simulation.world;
  const turret = createStructure(world, 'player', { x: -30, y: 0, z: 30 }, STRUCTURE_DEFINITIONS.turret.health, 'turret');
  addSoldier(turretSide.match, 'enemy', 'rifleman', { x: -30, y: 0, z: 20 });
  const events = advanceUntilFire(turretSide.match);
  assert.ok(events.some((event) => event.source === turret));
  turretSide.view.fired(world, events, 1, turretSide.shots);
  assert.deepEqual(turretSide.shots, events.map(() => 'heavy'));
  assert.equal(turretSide.flashes.length, 0);
});

test('an impact releases the mesh and reports heavy impacts only', () => {
  const { match, view, shots, heavy } = setup();
  const tank = addSoldier(match, 'player', 'tank', { x: 0, y: 0, z: 0 });
  addSoldier(match, 'enemy', 'rifleman', { x: 0, y: 0, z: -10 });
  const world = match.simulation.world;
  const events = advanceUntilFire(match, tank);
  view.fired(world, events, 0, shots);
  assert.equal(view.stats().active, events.length);
  // Run the simulation until the real impact arrives.
  const impacts: ProjectileImpact[] = [];
  for (let frame = 0; frame < 200 && !impacts.some((impact) => impact.isHeavy); frame++) {
    match.simulation.advance(1 / 30);
    impacts.push(...match.simulation.drainProjectileImpacts());
  }
  assert.ok(impacts.length > 0);
  view.impacts(impacts, heavy);
  assert.equal(heavy.length, impacts.filter((impact) => impact.isHeavy).length);
  assert.ok(heavy.length > 0);
  const inFlight = new Set(events.map((event) => event.projectile));
  assert.equal(view.stats().active, events.length - impacts.filter((impact) => inFlight.has(impact.projectile)).length);
  assert.equal(match.pool.stats().active, view.stats().active);

  const light: ProjectileImpact = { projectile: 9999, target: 1, position: { x: 1, y: 2, z: 3 }, isHeavy: false };
  view.impacts([light], heavy);
  assert.equal(heavy.length, 0);
});

test('a projectile removed without an impact is released by sync', () => {
  const { match, view, shots } = setup();
  addSoldier(match, 'player', 'rifleman', { x: 0, y: 0, z: 0 });
  addSoldier(match, 'enemy', 'rifleman', { x: 0, y: 0, z: -5 });
  const world = match.simulation.world;
  const events = advanceUntilFire(match);
  view.fired(world, events, 0, shots);
  assert.equal(view.stats().active, events.length);
  for (const event of events) world.removeEntity(event.projectile);
  view.sync(world);
  assert.equal(view.stats().active, 0);
  assert.equal(match.pool.stats().active, 0);
});

test('with the pool exhausted the shot still reports its kind and creates no visual', () => {
  const { match, view, shots } = setup();
  const world = match.simulation.world;
  const source = addSoldier(match, 'player', 'tank', { x: 0, y: 0, z: 0 });
  const events: WeaponFireEvent[] = [];
  for (let index = 0; index < 129; index++) {
    const projectile = world.createEntity();
    world.addComponent(projectile, COMPONENTS.transform, { x: index, y: 1, z: 0 });
    world.addComponent(projectile, COMPONENTS.projectile, {
      target: source, targetPosition: { x: 0, y: 0, z: 0 }, damage: 1, speed: 1,
      remainingSeconds: 1, impactRadius: 1, isHeavy: true
    });
    events.push({ source, projectile });
  }
  view.fired(world, events, 0, shots);
  assert.equal(shots.length, 129);
  assert.ok(shots.every((shot) => shot === 'heavy'));
  assert.equal(view.stats().active, 128);
});

test('fired skips a shot whose source has no faction', () => {
  const { match, view, flashes, shots } = setup();
  addSoldier(match, 'player', 'rifleman', { x: 0, y: 0, z: 0 });
  addSoldier(match, 'enemy', 'rifleman', { x: 0, y: 0, z: -5 });
  const world = match.simulation.world;
  const events = advanceUntilFire(match);
  const orphan = world.createEntity();
  world.addComponent(orphan, COMPONENTS.soldierKind, 'rifleman');
  view.fired(world, events.map((event) => ({ source: orphan, projectile: event.projectile })), 0, shots);
  assert.equal(shots.length, 0);
  assert.equal(flashes.length, 0);
  assert.equal(view.stats().active, 0);
});

test('fired, impacts and sync never write the ECS', () => {
  const { match, view, shots, heavy } = setup();
  addSoldier(match, 'player', 'tank', { x: 0, y: 0, z: 0 });
  addSoldier(match, 'enemy', 'rifleman', { x: 0, y: 0, z: -10 });
  const world = match.simulation.world;
  const events = advanceUntilFire(match);
  let impacts: readonly ProjectileImpact[] = [];
  for (let frame = 0; frame < 200 && impacts.length === 0; frame++) {
    match.simulation.advance(1 / 30);
    impacts = match.simulation.drainProjectileImpacts();
  }
  freezeWorldComponents(world);
  const before = snapshotCommandState(match.ctx);
  view.fired(world, events, 0, shots);
  view.impacts(impacts, heavy);
  view.sync(world);
  assert.deepEqual(snapshotCommandState(match.ctx), before);
});

test('clear releases every active projectile', () => {
  const { match, view, shots } = setup();
  addSoldier(match, 'player', 'rifleman', { x: 0, y: 0, z: 0 });
  addSoldier(match, 'enemy', 'rifleman', { x: 0, y: 0, z: -5 });
  view.fired(match.simulation.world, advanceUntilFire(match), 0, shots);
  assert.ok(view.stats().active > 0);
  view.clear();
  assert.equal(view.stats().active, 0);
  assert.equal(match.pool.stats().active, 0);
});
