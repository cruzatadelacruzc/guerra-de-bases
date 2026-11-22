/** Test-only: a real match without WebGL for presentation tests, and a world that rejects every write. */
import * as THREE from 'three';
import { createCommandTestContext } from '../game/commands/commandTestState.ts';
import type { CommandContext } from '../game/commands/CommandContext.ts';
import { BattleSimulation } from '../game/ecs/BattleSimulation.ts';
import { COMPONENTS } from '../game/ecs/components.ts';
import type { ComponentName } from '../game/ecs/components.ts';
import type { World } from '../game/ecs/World.ts';
import { BattlefieldView } from './BattlefieldView.ts';
import { CombatEffects } from './CombatEffects.ts';
import { InstancedSoldierRenderer } from './InstancedSoldierRenderer.ts';
import { ProjectilePool } from './ProjectilePool.ts';

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
}

/** Freezes every component of every entity deeply: any write throws a TypeError in strict mode. */
export function freezeWorldComponents(world: World): void {
  const names = Object.values(COMPONENTS) as ComponentName[];
  for (const entity of world.query()) {
    for (const name of names) deepFreeze(world.getComponent(entity, name));
  }
}

export interface PresentationTestMatch {
  readonly simulation: BattleSimulation;
  readonly ctx: CommandContext;
  readonly scene: THREE.Scene;
  readonly soldiers: InstancedSoldierRenderer;
  readonly effects: CombatEffects;
  readonly pool: ProjectilePool;
  readonly camera: THREE.PerspectiveCamera;
}

export function createPresentationTestMatch(): PresentationTestMatch {
  const simulation = new BattleSimulation();
  const ctx = createCommandTestContext({
    world: simulation.world,
    bases: { player: simulation.playerBase, enemy: simulation.enemyBase }
  });
  const scene = new THREE.Scene();
  return {
    simulation,
    ctx,
    scene,
    soldiers: new InstancedSoldierRenderer(scene),
    effects: new CombatEffects(scene),
    pool: new ProjectilePool(scene),
    camera: new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
  };
}

/** A battlefield view over the match's scene, renderers and effects, already attached to its world. */
export function createBattlefieldTestView(match: PresentationTestMatch): BattlefieldView {
  const view = new BattlefieldView({
    scene: match.scene,
    soldiers: match.soldiers,
    effects: match.effects,
    healthBarsVisible: true
  });
  view.attach(match.simulation.world);
  return view;
}
