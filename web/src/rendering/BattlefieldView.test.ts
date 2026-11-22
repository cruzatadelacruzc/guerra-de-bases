import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { setGold, snapshotCommandState } from '../game/commands/commandTestState.ts';
import { buildStructure, sellStructure } from '../game/commands/structureCommands.ts';
import { trainUnit } from '../game/commands/trainCommand.ts';
import type { BuildableStructureKind } from '../game/definitions/structures.ts';
import { BattleSimulation } from '../game/ecs/BattleSimulation.ts';
import { COMPONENTS } from '../game/ecs/components.ts';
import type { ComponentName, Entity, Faction, Position, SoldierKind } from '../game/ecs/components.ts';
import { applyDamageSystem } from '../game/ecs/systems.ts';
import type { ProductionCompletedEvent } from '../game/ecs/systems.ts';
import type { World } from '../game/ecs/World.ts';
import type { WorldReader } from '../game/ecs/WorldReader.ts';
import { DeathResolver } from '../game/match/DeathResolver.ts';
import type { MatchEvent } from '../game/match/matchEvents.ts';
import { createMatchState } from '../game/match/MatchState.ts';
import { scheduleStrike } from '../game/match/rewardExecution.ts';
import { BattlefieldView } from './BattlefieldView.ts';
import type { ExplosionCue, VisualKind } from './BattlefieldView.ts';
import type { CombatEffects } from './CombatEffects.ts';
import { PlacementGhost } from './PlacementGhost.ts';
import { ProjectileView } from './ProjectileView.ts';
import type { ShotKind } from './ProjectileView.ts';
import { RewardEffectsView } from './RewardEffectsView.ts';
import { createBattlefieldTestView, createPresentationTestMatch, freezeWorldComponents } from './presentationTestState.ts';
import type { PresentationTestMatch } from './presentationTestState.ts';

const FRAME = 1 / 30;
const at = (x: number, z: number): Position => ({ x, y: 0, z });

interface Harness {
  readonly match: PresentationTestMatch;
  readonly world: World;
  readonly view: BattlefieldView;
  readonly resolver: DeathResolver;
  readonly cues: ExplosionCue[];
  /** The scene's children before the view drew anything. */
  readonly baseline: ReadonlySet<THREE.Object3D>;
}

/** A started match: the view is attached and both Nexuses are represented (C1). */
function setup(): Harness {
  const match = createPresentationTestMatch();
  const baseline = new Set(match.scene.children);
  const view = createBattlefieldTestView(match);
  view.structureBuilt(match.simulation.playerBase);
  view.structureBuilt(match.simulation.enemyBase);
  return { match, world: match.simulation.world, view, resolver: new DeathResolver(), cues: [], baseline };
}

function drawableEntities(world: World): Array<readonly [Entity, VisualKind]> {
  const result: Array<readonly [Entity, VisualKind]> = [];
  for (const entity of world.query(COMPONENTS.building)) {
    const kind = world.getComponent(entity, COMPONENTS.building)?.kind;
    if (kind) result.push([entity, kind]);
  }
  for (const entity of world.query(COMPONENTS.soldier)) {
    const kind = world.getComponent(entity, COMPONENTS.soldierKind);
    if (kind) result.push([entity, kind]);
  }
  return result.sort((a, b) => a[0] - b[0]);
}

/** The local consistency check: one entry per drawable entity, with its kind. */
function assertMatchesEcs(h: Harness): void {
  const entries = [...h.view.entries()].map(([entity, kind]) => [entity, kind] as const).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(entries, drawableEntities(h.world));
}

/** Runs `action` and returns the one group it added to the scene. */
function addedGroup(scene: THREE.Scene, action: () => void): THREE.Group {
  const before = new Set(scene.children);
  action();
  const added = scene.children.filter((child): child is THREE.Group => !before.has(child) && child instanceof THREE.Group);
  assert.equal(added.length, 1);
  return added[0];
}

function rootAt(scene: THREE.Scene, position: Readonly<Position>): THREE.Group {
  const root = scene.children.find((child): child is THREE.Group =>
    child instanceof THREE.Group && child.position.x === position.x && child.position.z === position.z);
  if (!root) throw new Error(`no visual at ${position.x}, ${position.z}`);
  return root;
}

function build(h: Harness, faction: Faction, kind: BuildableStructureKind, position: Position): Entity {
  setGold(h.match.ctx, faction, 10000);
  const result = buildStructure(h.match.ctx, faction, kind, position);
  assert.ok(result.accepted);
  h.view.structureBuilt(result.entity);
  return result.entity;
}

function train(h: Harness, faction: Faction, factory: Entity, kind: SoldierKind, spawn: Position): void {
  setGold(h.match.ctx, faction, 10000);
  assert.equal(trainUnit(h.match.ctx, faction, factory, kind, spawn).accepted, true);
}

/** Advances until `count` production orders completed; returns their events without representing them. */
function advanceUntilProduced(h: Harness, count: number, events: ProductionCompletedEvent[] = []): ProductionCompletedEvent[] {
  for (let frame = 0; frame < 600 && events.length < count; frame++) {
    h.match.simulation.advance(FRAME);
    events.push(...h.match.simulation.drainProductionEvents());
  }
  assert.equal(events.length, count);
  return events;
}

function produce(h: Harness, faction: Faction, factory: Entity, kind: SoldierKind, spawn: Position): Entity {
  train(h, faction, factory, kind, spawn);
  const [event] = advanceUntilProduced(h, 1);
  h.view.unitsProduced([event]);
  return event.soldier;
}

function kill(world: World, entity: Entity): void {
  const health = world.getComponent(entity, COMPONENTS.health);
  if (!health) throw new Error(`entity ${entity} has no health`);
  health.current = 0;
}

function resolve(h: Harness): readonly MatchEvent[] {
  return h.resolver.resolve(h.world, h.match.ctx.match, 'normal', h.match.ctx.bases).events;
}

/** The presentation part of updateCombat, in the frame order of GameApplication. */
function presentationFrame(h: Harness, events: readonly MatchEvent[]): void {
  h.view.deathsResolved(events, 'units', h.cues);
  h.view.syncUnitsAndTurrets(h.match.camera);
  h.view.deathsResolved(events, 'structures', h.cues);
  h.view.syncStructures(h.match.camera);
}

function resourcesOf(root: THREE.Object3D): Array<THREE.BufferGeometry | THREE.Material> {
  const found: Array<THREE.BufferGeometry | THREE.Material> = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    found.push(object.geometry);
    found.push(...(Array.isArray(object.material) ? object.material : [object.material]));
  });
  return found;
}

function countDisposals(resources: Array<THREE.BufferGeometry | THREE.Material>): Map<unknown, number> {
  const counts = new Map<unknown, number>();
  for (const resource of resources) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) ?? 0) + 1));
  }
  return counts;
}

function healthBarOf(root: THREE.Object3D): { group: THREE.Group; fill: THREE.Mesh; width: number } {
  for (const child of root.children) {
    if (!(child instanceof THREE.Group) || child.children.length !== 3) continue;
    const planes = child.children.filter((part): part is THREE.Mesh =>
      part instanceof THREE.Mesh && part.geometry instanceof THREE.PlaneGeometry);
    const fill = planes.find((part) => part.position.z === 0.01);
    if (planes.length !== 3 || !fill || !(fill.geometry instanceof THREE.PlaneGeometry)) continue;
    return { group: child, fill, width: fill.geometry.parameters.width };
  }
  throw new Error('no health bar');
}

function shieldOf(root: THREE.Object3D): THREE.Mesh {
  const shield = root.children.find((child): child is THREE.Mesh =>
    child instanceof THREE.Mesh && child.name === 'nexus-defensive-shield');
  if (!shield) throw new Error('no shield');
  return shield;
}

function instancedBatch(scene: THREE.Scene, matches: (batch: THREE.InstancedMesh) => boolean): THREE.InstancedMesh {
  const batch = scene.children.find((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh && matches(child));
  if (!batch) throw new Error('no batch');
  return batch;
}

function soldierBody(scene: THREE.Scene, color: number): THREE.InstancedMesh {
  return instancedBatch(scene, (batch) => batch.geometry instanceof THREE.CylinderGeometry
    && batch.material instanceof THREE.MeshStandardMaterial && batch.material.color.getHex() === color);
}

function soldierHealthFill(scene: THREE.Scene): THREE.InstancedMesh {
  return instancedBatch(scene, (batch) => batch.geometry instanceof THREE.PlaneGeometry
    && !Array.isArray(batch.material) && batch.material.vertexColors);
}

function instanceTransform(batch: THREE.InstancedMesh, index: number) {
  const matrix = new THREE.Matrix4();
  batch.getMatrixAt(index, matrix);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

function spyEffects(effects: CombatEffects): string[] {
  const log: string[] = [];
  const createExplosion = effects.createExplosion.bind(effects);
  const createNuclearExplosion = effects.createNuclearExplosion.bind(effects);
  const addBurningEmitter = effects.addBurningEmitter.bind(effects);
  effects.createExplosion = (position: THREE.Vector3, scale?: number) => {
    log.push(`explosion:${scale}`);
    createExplosion(position, scale);
  };
  effects.createNuclearExplosion = (position: THREE.Vector3) => {
    log.push('nuclear');
    createNuclearExplosion(position);
  };
  effects.addBurningEmitter = (position: THREE.Vector3, scale?: number) => {
    log.push(`emitter:${scale}`);
    addBurningEmitter(position, scale);
  };
  return log;
}

/** What CombatEffects.createExplosion itself spawns as its burning emitter. */
const explosionEmitter = (scale: number) => `emitter:${Math.max(0.5, scale * 0.8)}`;

function assertSameRotation(actual: THREE.Quaternion, expected: THREE.Quaternion): void {
  assert.ok(actual.angleTo(expected) < 1e-6, `rotation off by ${actual.angleTo(expected)}`);
}

test('attach and the two Nexuses', () => {
  const match = createPresentationTestMatch();
  const view = createBattlefieldTestView(match);
  assert.deepEqual([...view.entries()], []);
  assert.throws(() => view.attach(match.simulation.world), /already/);

  const { playerBase, enemyBase } = match.simulation;
  view.structureBuilt(playerBase);
  view.structureBuilt(enemyBase);
  assert.deepEqual([...view.entries()], [[playerBase, 'hq'], [enemyBase, 'hq']]);
  view.syncStructures(match.camera);

  for (const [base, color] of [[playerBase, 0x22d3ee], [enemyBase, 0xfb7185]] as const) {
    const transform = match.simulation.world.getComponent(base, COMPONENTS.transform);
    assert.ok(transform);
    const root = rootAt(match.scene, transform);
    assert.equal(root.parent, match.scene);
    const bar = healthBarOf(root);
    assert.equal(bar.group.position.y, 5.2);
    assert.equal(bar.width, 4.0);
    assert.equal(bar.fill.scale.x, 1);
    const shield = shieldOf(root);
    assert.equal(shield.parent, root);
    assert.equal(shield.visible, false);
    assert.ok(shield.material instanceof THREE.MeshBasicMaterial);
    assert.equal(shield.material.color.getHex(), color);
  }
  assert.deepEqual(view.stats(), {
    player: { structures: 1, tanks: 0, riflemen: 0 },
    enemy: { structures: 1, tanks: 0, riflemen: 0 },
    remains: 0
  });
});

test('structureBuilt represents each accepted build once', () => {
  const h = setup();
  const builtBefore = h.view.lifecycleCounts().built;
  const turret = build(h, 'player', 'turret', at(-10, 30));
  const barracks = build(h, 'enemy', 'barracks', at(10, -40));
  assertMatchesEcs(h);
  assert.equal(h.view.lifecycleCounts().built, builtBefore + 2);
  assert.equal(healthBarOf(rootAt(h.match.scene, at(-10, 30))).group.position.y, 2.8);
  assert.equal(healthBarOf(rootAt(h.match.scene, at(-10, 30))).width, 2.2);
  assert.equal(healthBarOf(rootAt(h.match.scene, at(10, -40))).group.position.y, 2.5);
  assert.equal(healthBarOf(rootAt(h.match.scene, at(10, -40))).width, 2.2);

  const entries = [...h.view.entries()];
  const children = h.match.scene.children.length;
  assert.throws(() => h.view.structureBuilt(turret), /already/);
  assert.throws(() => h.view.structureBuilt(barracks), /already/);
  assert.deepEqual([...h.view.entries()], entries);
  assert.equal(h.match.scene.children.length, children);

  setGold(h.match.ctx, 'player', 0);
  assert.deepEqual(buildStructure(h.match.ctx, 'player', 'generator', at(20, 30)), { accepted: false, reason: 'insufficient-gold' });
  setGold(h.match.ctx, 'player', 10000);
  assert.deepEqual(buildStructure(h.match.ctx, 'player', 'generator', at(-10, 31)), { accepted: false, reason: 'too-close' });
  assertMatchesEcs(h);
  assert.equal(h.view.lifecycleCounts().built, builtBefore + 2);
});

test('unitsProduced draws riflemen in the instanced batches and tanks as meshes', () => {
  const h = setup();
  const playerBarracks = build(h, 'player', 'barracks', at(0, 40));
  const enemyBarracks = build(h, 'enemy', 'barracks', at(0, -40));
  const producedBefore = h.view.lifecycleCounts().produced;
  train(h, 'enemy', enemyBarracks, 'tank', at(0, -37));
  train(h, 'player', playerBarracks, 'rifleman', at(0, 37));
  const events = advanceUntilProduced(h, 2);
  const playerEvents = events.filter((event) => event.faction === 'player');
  const enemyEvents = events.filter((event) => event.faction === 'enemy');

  assert.equal(h.view.unitsProduced(playerEvents), 1);
  const tankRoot = addedGroup(h.match.scene, () => assert.equal(h.view.unitsProduced(enemyEvents), 0));
  assertMatchesEcs(h);
  assert.equal(h.view.lifecycleCounts().produced, producedBefore + 2);

  h.match.soldiers.sync(h.match.camera.quaternion, 0);
  assert.equal(soldierBody(h.match.scene, 0x00f0ff).count, 1);
  assert.equal(soldierBody(h.match.scene, 0xff3344).count, 0);
  const tank = enemyEvents[0].soldier;
  const transform = h.world.getComponent(tank, COMPONENTS.transform);
  assert.ok(transform);
  assert.deepEqual(tankRoot.position.toArray(), [transform.x, transform.y, transform.z]);
  const bar = healthBarOf(tankRoot);
  assert.equal(bar.group.position.y, 1.8);
  assert.equal(bar.width, 1.4);
  assert.deepEqual(h.view.stats().player, { structures: 2, tanks: 0, riflemen: 1 });
  assert.deepEqual(h.view.stats().enemy, { structures: 2, tanks: 1, riflemen: 0 });
  assert.throws(() => h.view.unitsProduced(enemyEvents), /already/);
});

test('sync follows the ECS: health, movement and aim', () => {
  const h = setup();
  const playerBarracks = build(h, 'player', 'barracks', at(30, 40));
  const enemyBarracks = build(h, 'enemy', 'barracks', at(30, -40));
  const turret = build(h, 'player', 'turret', at(-20, 20));
  const turretRoot = rootAt(h.match.scene, at(-20, 20));
  // The tank takes 5 s and the rifleman 2 s: start the rifleman 3 s later so both appear together.
  train(h, 'enemy', enemyBarracks, 'tank', at(-20, 12));
  const events: ProductionCompletedEvent[] = [];
  for (let frame = 0; frame < 90; frame++) {
    h.match.simulation.advance(FRAME);
    events.push(...h.match.simulation.drainProductionEvents());
  }
  train(h, 'player', playerBarracks, 'rifleman', at(30, 37));
  advanceUntilProduced(h, 2, events);
  const tankRoot = addedGroup(h.match.scene, () => h.view.unitsProduced(events));
  const tank = events.find((event) => event.kind === 'tank')?.soldier;
  const rifleman = events.find((event) => event.kind === 'rifleman')?.soldier;
  assert.ok(tank !== undefined && rifleman !== undefined);

  h.match.simulation.advance(FRAME);
  h.view.syncUnitsAndTurrets(h.match.camera);
  h.view.syncStructures(h.match.camera);
  h.match.soldiers.sync(h.match.camera.quaternion, 0);
  assertMatchesEcs(h);

  // Movement: each mesh is where the ECS says, after every advance.
  const first = h.world.getComponent(tank, COMPONENTS.transform);
  assert.ok(first);
  assert.deepEqual(tankRoot.position.toArray(), [first.x, first.y, first.z]);
  const riflemanStart = instanceTransform(soldierBody(h.match.scene, 0x00f0ff), 0).position;

  // Aim: tank, turret head and rifleman look at their targeting.target.
  const tankTarget = h.world.getComponent(tank, COMPONENTS.targeting)?.target;
  const tankTargetPosition = tankTarget === undefined ? undefined : h.world.getComponent(tankTarget, COMPONENTS.transform);
  assert.ok(tankTargetPosition);
  const tankRotation = tankRoot.quaternion.clone();
  tankRoot.lookAt(tankTargetPosition.x, first.y, tankTargetPosition.z);
  assertSameRotation(tankRotation, tankRoot.quaternion);

  const head = turretRoot.userData.head;
  assert.ok(head instanceof THREE.Object3D);
  const turretTarget = h.world.getComponent(turret, COMPONENTS.targeting)?.target;
  const turretTargetPosition = turretTarget === undefined ? undefined : h.world.getComponent(turretTarget, COMPONENTS.transform);
  assert.ok(turretTargetPosition);
  const headRotation = head.quaternion.clone();
  assert.ok(headRotation.angleTo(new THREE.Quaternion()) > 0.01);
  head.lookAt(turretTargetPosition.x, head.position.y + turretRoot.position.y, turretTargetPosition.z);
  assertSameRotation(headRotation, head.quaternion);

  const riflemanPosition = h.world.getComponent(rifleman, COMPONENTS.transform);
  const riflemanTarget = h.world.getComponent(rifleman, COMPONENTS.targeting)?.target;
  const riflemanTargetPosition = riflemanTarget === undefined
    ? undefined
    : h.world.getComponent(riflemanTarget, COMPONENTS.transform);
  assert.ok(riflemanPosition && riflemanTargetPosition);
  const body = instanceTransform(soldierBody(h.match.scene, 0x00f0ff), 0);
  assert.ok(Math.abs(body.position.x - riflemanPosition.x) < 1e-5);
  assert.ok(Math.abs(body.position.z - riflemanPosition.z) < 1e-5);
  const yaw = Math.atan2(riflemanTargetPosition.x - riflemanPosition.x, riflemanTargetPosition.z - riflemanPosition.z);
  assertSameRotation(body.quaternion, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));

  // Health: damage applied by the domain shows on the mesh bar and on the instanced bar.
  applyDamageSystem(h.world, turret, 100);
  applyDamageSystem(h.world, rifleman, 30);
  for (let frame = 0; frame < 10; frame++) h.match.simulation.advance(FRAME);
  h.view.syncUnitsAndTurrets(h.match.camera);
  h.view.syncStructures(h.match.camera);
  h.match.soldiers.sync(h.match.camera.quaternion, 0);
  const turretHealth = h.world.getComponent(turret, COMPONENTS.health);
  const riflemanHealth = h.world.getComponent(rifleman, COMPONENTS.health);
  assert.ok(turretHealth && riflemanHealth);
  assert.ok(turretHealth.current < turretHealth.max);
  assert.ok(riflemanHealth.current < riflemanHealth.max && riflemanHealth.current > 0);
  assert.equal(healthBarOf(turretRoot).fill.scale.x, turretHealth.current / turretHealth.max);
  const fill = instanceTransform(soldierHealthFill(h.match.scene), 0);
  assert.ok(Math.abs(fill.scale.x - riflemanHealth.current / riflemanHealth.max) < 1e-6);

  const tankNow = h.world.getComponent(tank, COMPONENTS.transform);
  const riflemanNow = h.world.getComponent(rifleman, COMPONENTS.transform);
  assert.ok(tankNow && riflemanNow);
  assert.deepEqual(tankRoot.position.toArray(), [tankNow.x, tankNow.y, tankNow.z]);
  const riflemanDrawn = instanceTransform(soldierBody(h.match.scene, 0x00f0ff), 0).position;
  assert.ok(Math.abs(riflemanDrawn.x - riflemanNow.x) < 1e-5 && Math.abs(riflemanDrawn.z - riflemanNow.z) < 1e-5);
  assert.ok(riflemanDrawn.distanceTo(riflemanStart) > 0.1);
  assertMatchesEcs(h);
});

test('unit deaths: explosion, then wreck or corpse, then removal', () => {
  const h = setup();
  const barracks = build(h, 'player', 'barracks', at(0, 40));
  const rifleman = produce(h, 'player', barracks, 'rifleman', at(-4, 37));
  let tank: Entity | undefined;
  const tankRoot = addedGroup(h.match.scene, () => {
    tank = produce(h, 'player', barracks, 'tank', at(4, 37));
  });
  assert.ok(tank !== undefined);
  h.view.syncUnitsAndTurrets(h.match.camera);
  const tankDisposals = countDisposals(resourcesOf(tankRoot));
  const shared = countDisposals([...h.baseline].flatMap(resourcesOf));
  assert.ok(shared.size > 0);
  const counts = h.view.lifecycleCounts();
  const remains = h.view.stats().remains;

  kill(h.world, rifleman);
  kill(h.world, tank);
  const events = resolve(h);
  const deaths = events.filter((event) => event.type === 'unitDied');
  assert.equal(deaths.length, 2);
  const log = spyEffects(h.match.effects);
  h.view.deathsResolved(events, 'units', h.cues);

  assert.equal(h.view.has(rifleman), false);
  assert.equal(h.view.has(tank), false);
  assert.equal(h.match.scene.children.includes(tankRoot), false);
  assert.equal(h.view.stats().remains, remains + 2);
  assert.deepEqual(h.view.stats().player, { structures: 2, tanks: 0, riflemen: 0 });
  for (const count of tankDisposals.values()) assert.equal(count, 1);
  for (const count of shared.values()) assert.equal(count, 0);
  assert.deepEqual(h.cues, deaths.map((event) => ({
    position: event.position,
    scale: event.kind === 'tank' ? 1.2 : 0.6,
    nuclear: false
  })));
  // Per death: the explosion (with its own emitter) first, the remains' emitter after it.
  assert.deepEqual(log, deaths.flatMap((event) => {
    const scale = event.kind === 'tank' ? 1.2 : 0.6;
    return [`explosion:${scale}`, explosionEmitter(scale), `emitter:${event.kind === 'tank' ? 0.8 : 0.4}`];
  }));
  assert.equal(h.view.lifecycleCounts().unitDied, counts.unitDied + 2);
  h.match.soldiers.sync(h.match.camera.quaternion, 0);
  assert.equal(soldierBody(h.match.scene, 0x00f0ff).count, 0);
  assertMatchesEcs(h);
});

test('structure deaths: ruin, then explosion, then removal, only in the structures phase', () => {
  const h = setup();
  const barracks = build(h, 'player', 'barracks', at(0, 40));
  const root = rootAt(h.match.scene, at(0, 40));
  const disposals = countDisposals(resourcesOf(root));
  const remains = h.view.stats().remains;
  const destroyed = h.view.lifecycleCounts().structureDestroyed;

  kill(h.world, barracks);
  const events = resolve(h);
  const log = spyEffects(h.match.effects);
  h.view.deathsResolved(events, 'units', h.cues);
  assert.equal(h.view.has(barracks), true);
  assert.deepEqual(h.cues, []);
  assert.deepEqual(log, []);

  h.view.deathsResolved(events, 'structures', h.cues);
  assert.equal(h.view.has(barracks), false);
  assert.equal(h.match.scene.children.includes(root), false);
  assert.deepEqual(log, ['emitter:1.5', 'explosion:1.2', explosionEmitter(1.2)]);
  const [event] = events;
  assert.equal(event.type, 'structureDestroyed');
  assert.deepEqual(h.cues, [{ position: event.position, scale: 1.2, nuclear: false }]);
  assert.equal(h.view.stats().remains, remains + 1);
  for (const count of disposals.values()) assert.equal(count, 1);
  assert.equal(h.view.lifecycleCounts().structureDestroyed, destroyed + 1);
  assertMatchesEcs(h);
});

test('Nexus destruction: no ruin, a nuclear cue and the shield disposed once', () => {
  const h = setup();
  const { enemyBase } = h.match.simulation;
  const transform = h.world.getComponent(enemyBase, COMPONENTS.transform);
  assert.ok(transform);
  const root = rootAt(h.match.scene, transform);
  const shieldDisposals = countDisposals(resourcesOf(shieldOf(root)));
  const remains = h.view.stats().remains;

  kill(h.world, enemyBase);
  const events = resolve(h);
  const log = spyEffects(h.match.effects);
  presentationFrame(h, events);

  assert.equal(h.view.has(enemyBase), false);
  assert.equal(h.match.scene.children.includes(root), false);
  assert.deepEqual(log, ['nuclear']);
  assert.deepEqual(h.cues, [{ position: { x: transform.x, y: transform.y, z: transform.z }, scale: 3.0, nuclear: true }]);
  assert.equal(h.view.stats().remains, remains);
  for (const count of shieldDisposals.values()) assert.equal(count, 1);
  h.view.syncShields({ player: true, enemy: true }, 100);
  h.view.clear();
  for (const count of shieldDisposals.values()) assert.equal(count, 1);
});

test('a Nexus falling with other deaths in the same frame removes every visual once', () => {
  const h = setup();
  const { enemyBase } = h.match.simulation;
  const playerBarracks = build(h, 'player', 'barracks', at(0, 40));
  const enemyBarracks = build(h, 'enemy', 'barracks', at(0, -40));
  const rifleman = produce(h, 'enemy', enemyBarracks, 'rifleman', at(0, -37));
  let tank: Entity | undefined;
  const tankRoot = addedGroup(h.match.scene, () => {
    tank = produce(h, 'player', playerBarracks, 'tank', at(0, 37));
  });
  assert.ok(tank !== undefined);
  const nexusTransform = h.world.getComponent(enemyBase, COMPONENTS.transform);
  assert.ok(nexusTransform);
  const roots = [rootAt(h.match.scene, nexusTransform), rootAt(h.match.scene, at(0, -40)), tankRoot];
  const disposals = countDisposals(roots.flatMap(resourcesOf));

  for (const entity of [enemyBase, enemyBarracks, rifleman, tank]) kill(h.world, entity);
  const events = resolve(h);
  assert.equal(events.length, 4);
  presentationFrame(h, events);

  for (const entity of [enemyBase, enemyBarracks, rifleman, tank]) assert.equal(h.view.has(entity), false);
  for (const root of roots) assert.equal(h.match.scene.children.includes(root), false);
  for (const count of disposals.values()) assert.equal(count, 1);
  const drawnGroups = h.match.scene.children.filter((child) => !h.baseline.has(child) && child instanceof THREE.Group);
  // The player's Nexus and barracks plus one ruin, one wreck and one corpse.
  assert.equal(h.view.stats().remains, 3);
  assert.equal(drawnGroups.length, 2 + 3);
  assert.deepEqual(h.cues.map((cue) => [cue.scale, cue.nuclear]).sort(), [[1.2, false], [3, true]]);
  assertMatchesEcs(h);
});

test('a production completing as its barracks falls', () => {
  const h = setup();
  const barracks = build(h, 'player', 'barracks', at(0, 40));
  train(h, 'player', barracks, 'rifleman', at(0, 37));
  let produced: ProductionCompletedEvent[] = [];
  for (let frame = 0; frame < 200 && produced.length === 0; frame++) {
    h.match.simulation.advance(FRAME);
    produced = h.match.simulation.drainProductionEvents();
  }
  assert.equal(produced.length, 1);
  kill(h.world, barracks);
  assert.equal(h.view.unitsProduced(produced), 1);
  presentationFrame(h, resolve(h));

  assert.equal(h.view.has(produced[0].soldier), true);
  assert.equal(h.view.has(barracks), false);
  assertMatchesEcs(h);
});

test('removedWithoutEffects removes sold and discarded visuals without remains or explosions', () => {
  const h = setup();
  const generator = build(h, 'player', 'generator', at(0, 30));
  const generatorRoot = rootAt(h.match.scene, at(0, 30));
  const enemyBarracks = build(h, 'enemy', 'barracks', at(0, -40));
  const enemyBarracksRoot = rootAt(h.match.scene, at(0, -40));
  let tank: Entity | undefined;
  const tankRoot = addedGroup(h.match.scene, () => {
    tank = produce(h, 'enemy', enemyBarracks, 'tank', at(0, -37));
  });
  assert.ok(tank !== undefined);
  const rifleman = produce(h, 'enemy', enemyBarracks, 'rifleman', at(2, -37));
  const disposals = countDisposals([generatorRoot, enemyBarracksRoot, tankRoot].flatMap(resourcesOf));
  const counts = h.view.lifecycleCounts();
  const remains = h.view.stats().remains;
  const log = spyEffects(h.match.effects);

  assert.equal(sellStructure(h.match.ctx, 'player', generator).accepted, true);
  h.view.removedWithoutEffects(generator, 'sold');
  assertMatchesEcs(h);
  for (const entity of [tank, rifleman, enemyBarracks]) {
    h.world.removeEntity(entity);
    h.view.removedWithoutEffects(entity, 'diagnostic');
    assertMatchesEcs(h);
  }
  h.view.removedWithoutEffects(9999, 'sold');
  h.view.removedWithoutEffects(generator, 'sold');

  assert.deepEqual(log, []);
  assert.equal(h.view.stats().remains, remains);
  for (const root of [generatorRoot, enemyBarracksRoot, tankRoot]) assert.equal(h.match.scene.children.includes(root), false);
  for (const count of disposals.values()) assert.equal(count, 1);
  assert.deepEqual(h.view.lifecycleCounts(), { ...counts, sold: counts.sold + 1, discarded: counts.discarded + 3 });
  h.match.soldiers.sync(h.match.camera.quaternion, 0);
  assert.equal(soldierBody(h.match.scene, 0xff3344).count, 0);
});

test('deathsResolved works from event data alone', () => {
  const h = setup();
  const barracks = build(h, 'player', 'barracks', at(0, 40));
  const rifleman = produce(h, 'player', barracks, 'rifleman', at(0, 37));
  h.view.syncUnitsAndTurrets(h.match.camera);
  // The domain moves the soldier and kills it before the view syncs again.
  const transform = h.world.getComponent(rifleman, COMPONENTS.transform);
  assert.ok(transform);
  transform.x = 7;
  transform.z = 33;
  kill(h.world, rifleman);
  const events = resolve(h);
  assert.equal(h.world.getComponent(rifleman, COMPONENTS.faction), undefined);

  const corpse = addedGroup(h.match.scene, () => h.view.deathsResolved(events, 'units', h.cues));
  assert.deepEqual(corpse.position.toArray(), [7, 0, 33]);
  assert.deepEqual(h.cues.map((cue) => cue.position), [{ x: 7, y: 0, z: 33 }]);
  assertMatchesEcs(h);
});

test('a missing component keeps the last visual state, and sync never removes a visual', () => {
  const match = createPresentationTestMatch();
  const world = match.simulation.world;
  const hidden = new Map<Entity, ComponentName>();
  const reader: WorldReader = {
    getComponent: <Name extends ComponentName>(entity: Entity, component: Name) =>
      hidden.get(entity) === component ? undefined : world.getComponent(entity, component),
    queryInto: (result, components) => world.queryInto(result, components)
  };
  const view = new BattlefieldView({ scene: match.scene, soldiers: match.soldiers, effects: match.effects, healthBarsVisible: true });
  view.attach(reader);
  const h: Harness = { match, world, view, resolver: new DeathResolver(), cues: [], baseline: new Set() };
  view.structureBuilt(match.simulation.playerBase);
  view.structureBuilt(match.simulation.enemyBase);
  const barracks = build(h, 'player', 'barracks', at(0, 40));
  const barracksBar = healthBarOf(rootAt(match.scene, at(0, 40)));
  let tank: Entity | undefined;
  const tankRoot = addedGroup(match.scene, () => {
    tank = produce(h, 'player', barracks, 'tank', at(0, 37));
  });
  assert.ok(tank !== undefined);
  view.syncUnitsAndTurrets(match.camera);
  view.syncStructures(match.camera);
  const tankPosition = tankRoot.position.clone();
  const barScale = barracksBar.fill.scale.x;

  applyDamageSystem(world, barracks, 200);
  hidden.set(barracks, COMPONENTS.health);
  for (let frame = 0; frame < 10; frame++) match.simulation.advance(FRAME);
  hidden.set(tank, COMPONENTS.transform);
  assert.doesNotThrow(() => view.syncStructures(match.camera));
  assert.doesNotThrow(() => view.syncUnitsAndTurrets(match.camera));
  assert.equal(barracksBar.fill.scale.x, barScale);
  assert.deepEqual(tankRoot.position.toArray(), tankPosition.toArray());

  world.removeEntity(tank);
  view.syncUnitsAndTurrets(match.camera);
  view.syncStructures(match.camera);
  assert.equal(view.has(tank), true);
});

test('clear, then a new World', () => {
  const h = setup();
  const playerBarracks = build(h, 'player', 'barracks', at(0, 40));
  build(h, 'enemy', 'turret', at(0, -30));
  produce(h, 'player', playerBarracks, 'rifleman', at(-3, 37));
  const tank = produce(h, 'player', playerBarracks, 'tank', at(3, 37));
  kill(h.world, tank);
  presentationFrame(h, resolve(h));
  assert.ok(h.view.stats().remains > 0);
  const exclusive = countDisposals(h.match.scene.children
    .filter((child) => !h.baseline.has(child) && child instanceof THREE.Group)
    .flatMap(resourcesOf));
  const shared = countDisposals([...h.baseline].flatMap(resourcesOf));
  const counts = h.view.lifecycleCounts();

  h.view.clear();
  for (const count of exclusive.values()) assert.equal(count, 1);
  for (const count of shared.values()) assert.equal(count, 0);
  assert.deepEqual([...h.view.entries()], []);
  assert.deepEqual(h.view.stats(), {
    player: { structures: 0, tanks: 0, riflemen: 0 },
    enemy: { structures: 0, tanks: 0, riflemen: 0 },
    remains: 0
  });
  assert.equal(soldierBody(h.match.scene, 0x00f0ff).count, 0);
  h.match.effects.clear();
  assert.deepEqual(h.match.scene.children.filter((child) => !h.baseline.has(child)), []);
  assert.equal(h.match.scene.children.length, h.baseline.size);

  // A new match: its ids start at 1 again, so a leftover entry would collide.
  assert.throws(() => h.view.structureBuilt(1), /World/);
  const next = new BattleSimulation();
  h.view.attach(next.world);
  assert.throws(() => h.view.attach(next.world), /already/);
  assert.equal(next.playerBase, 1);
  h.view.structureBuilt(next.playerBase);
  h.view.structureBuilt(next.enemyBase);
  assert.deepEqual([...h.view.entries()], [[1, 'hq'], [2, 'hq']]);

  h.view.clear();
  h.view.clear();
  assert.deepEqual(h.view.lifecycleCounts(), { ...counts, built: counts.built + 2, clears: counts.clears + 3 });
  assert.throws(() => h.view.structureBuilt(1), /World/);
});

test('clear with live projectiles, a placement ghost and an active strike leaves nothing behind', () => {
  const h = setup();
  const baseline = h.baseline;
  const projectileView = new ProjectileView(h.match.pool, h.match.soldiers);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(110, 150), new THREE.MeshBasicMaterial());
  const ghost = new PlacementGhost(h.match.scene, floor);
  const rewardEffectsView = new RewardEffectsView({ scene: h.match.scene, shellOrigin: () => ({ x: 0, y: 5.5, z: 60 }) });
  const strikes = createMatchState();
  scheduleStrike(strikes, 'player', 'air_strike', { x: 4, z: -6 }, { x: 1, z: 0 }, 'normal', 0);

  const turret = build(h, 'player', 'turret', at(0, 20));
  const enemyBarracks = build(h, 'enemy', 'barracks', at(0, -40));
  produce(h, 'enemy', enemyBarracks, 'tank', at(0, 12));
  const shots: ShotKind[] = [];
  for (let frame = 0; frame < 200 && projectileView.stats().active === 0; frame++) {
    h.match.simulation.advance(FRAME);
    projectileView.fired(h.world, h.match.simulation.drainWeaponEvents(), frame * FRAME, shots);
  }
  assert.ok(projectileView.stats().active > 0);
  assert.ok(h.view.has(turret));
  ghost.show('barracks');
  rewardEffectsView.sync(strikes.strikes);
  assert.ok(rewardEffectsView.stats().strikes > 0);

  h.view.clear();
  projectileView.clear();
  ghost.hide();
  rewardEffectsView.clear();
  assert.deepEqual(h.match.scene.children.filter((child) => !baseline.has(child)), []);
  assert.equal(h.match.scene.children.length, baseline.size);
});

test('pickOwnStructure climbs to the registered root', () => {
  const h = setup();
  const barracks = build(h, 'player', 'barracks', at(10, 40));
  const enemyBarracks = build(h, 'enemy', 'barracks', at(10, -40));
  h.match.scene.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();

  // A ray at the bar's height passes above the 2.2-high barracks: it only cuts the health bar planes.
  raycaster.set(new THREE.Vector3(10.5, 2.5, 50), new THREE.Vector3(0, 0, -1));
  const hits = raycaster.intersectObject(rootAt(h.match.scene, at(10, 40)), true);
  assert.ok(hits.length > 0);
  assert.ok(hits.every((hit) => hit.object instanceof THREE.Mesh && hit.object.geometry instanceof THREE.PlaneGeometry));
  assert.equal(h.view.pickOwnStructure(raycaster, 'player'), barracks);

  raycaster.set(new THREE.Vector3(10, 1, 50), new THREE.Vector3(0, 0, -1));
  assert.equal(h.view.pickOwnStructure(raycaster, 'player'), barracks);

  // The Nexus is never offered for sale.
  const nexus = h.world.getComponent(h.match.simulation.playerBase, COMPONENTS.transform);
  assert.ok(nexus);
  raycaster.set(new THREE.Vector3(nexus.x, 1.5, nexus.z + 30), new THREE.Vector3(0, 0, -1));
  assert.ok(raycaster.intersectObject(rootAt(h.match.scene, nexus), true).length > 0);
  assert.equal(h.view.pickOwnStructure(raycaster, 'player'), undefined);

  raycaster.set(new THREE.Vector3(10, 1, -30), new THREE.Vector3(0, 0, -1));
  assert.equal(h.view.pickOwnStructure(raycaster, 'player'), undefined);
  assert.equal(h.view.pickOwnStructure(raycaster, 'enemy'), enemyBarracks);
});

test('presentation never writes the ECS', () => {
  const h = setup();
  const playerBarracks = build(h, 'player', 'barracks', at(0, 40));
  const tank = produce(h, 'player', playerBarracks, 'tank', at(0, 37));
  setGold(h.match.ctx, 'enemy', 10000);
  const turretBuild = buildStructure(h.match.ctx, 'enemy', 'turret', at(0, -30));
  assert.ok(turretBuild.accepted);
  train(h, 'player', playerBarracks, 'rifleman', at(2, 37));
  const pending = advanceUntilProduced(h, 1);
  kill(h.world, tank);
  const events = resolve(h);
  const before = snapshotCommandState(h.match.ctx);

  freezeWorldComponents(h.world);
  const health = h.world.getComponent(h.match.simulation.playerBase, COMPONENTS.health);
  assert.ok(health);
  assert.throws(() => {
    health.current = 0;
  }, TypeError);

  assert.doesNotThrow(() => {
    h.view.structureBuilt(turretBuild.entity);
    h.view.unitsProduced(pending);
    h.view.deathsResolved(events, 'units', h.cues);
    h.view.syncUnitsAndTurrets(h.match.camera);
    h.view.deathsResolved(events, 'structures', h.cues);
    h.view.syncStructures(h.match.camera);
    h.view.syncShields({ player: true, enemy: false }, 500);
    h.view.pickOwnStructure(new THREE.Raycaster(), 'player');
  });
  assert.deepEqual(snapshotCommandState(h.match.ctx), before);
  assertMatchesEcs(h);
});

test('syncShields follows the active flags and pulses on the gameplay clock', () => {
  const h = setup();
  const shield = (base: Entity) => {
    const transform = h.world.getComponent(base, COMPONENTS.transform);
    assert.ok(transform);
    return shieldOf(rootAt(h.match.scene, transform));
  };
  const player = shield(h.match.simulation.playerBase);
  const enemy = shield(h.match.simulation.enemyBase);

  h.view.syncShields({ player: true, enemy: false }, 1234);
  const scale = 1 + Math.sin(1234 * 0.004) * 0.035;
  assert.equal(player.visible, true);
  assert.equal(enemy.visible, false);
  assert.deepEqual(player.scale.toArray(), [scale, scale, scale]);
  assert.deepEqual(enemy.scale.toArray(), [scale, scale, scale]);

  h.view.syncShields({ player: false, enemy: true }, 0);
  assert.equal(player.visible, false);
  assert.equal(enemy.visible, true);
  assert.deepEqual(player.scale.toArray(), [1, 1, 1]);
});
