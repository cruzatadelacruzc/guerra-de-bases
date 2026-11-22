import { COMPONENTS } from '../game/ecs/components.ts';
import type { Entity } from '../game/ecs/components.ts';
import type { WorldReader } from '../game/ecs/WorldReader.ts';
import type { VisualKind } from '../rendering/BattlefieldView.ts';

/** What the check needs from the visual registry. */
export interface ConsistencyView {
  entries(): Iterable<readonly [Entity, VisualKind]>;
  exemptions(): ReadonlySet<Entity>;
}

export interface ConsistencyReport {
  /** Drawable ECS entities with no visual. */
  readonly missingVisual: readonly Entity[];
  /** Visuals whose entity no longer exists. */
  readonly orphanVisual: readonly Entity[];
  /** Visuals whose entity lacks a transform or health. */
  readonly missingComponent: readonly Entity[];
  /** Visuals of a different kind than the entity's ECS kind. */
  readonly kindMismatch: readonly Entity[];
  /** Exempt entities that nevertheless have a visual. */
  readonly exemptWithVisual: readonly Entity[];
  /** Exempt entities that no longer exist. */
  readonly staleExemption: readonly Entity[];
}

const CATEGORIES = [
  'missingVisual',
  'orphanVisual',
  'missingComponent',
  'kindMismatch',
  'exemptWithVisual',
  'staleExemption'
] as const;

/** `world` undefined = the menu: the registry must be empty, so every entry is an orphan. */
export function checkVisualConsistency(world: WorldReader | undefined, view: ConsistencyView): ConsistencyReport {
  const missingVisual: Entity[] = [];
  const orphanVisual: Entity[] = [];
  const missingComponent: Entity[] = [];
  const kindMismatch: Entity[] = [];
  const exemptWithVisual: Entity[] = [];
  const staleExemption: Entity[] = [];
  const exemptions = view.exemptions();
  const registered = new Set<Entity>();

  for (const [entity, kind] of view.entries()) {
    registered.add(entity);
    if (exemptions.has(entity)) exemptWithVisual.push(entity);
    if (!world || world.getComponent(entity, COMPONENTS.faction) === undefined) {
      orphanVisual.push(entity);
      continue;
    }
    if (!world.getComponent(entity, COMPONENTS.transform) || !world.getComponent(entity, COMPONENTS.health)) {
      missingComponent.push(entity);
    }
    const expected = world.getComponent(entity, COMPONENTS.building)?.kind ?? world.getComponent(entity, COMPONENTS.soldierKind);
    if (expected !== kind) kindMismatch.push(entity);
  }

  for (const entity of exemptions) {
    if (!world || world.getComponent(entity, COMPONENTS.faction) === undefined) staleExemption.push(entity);
  }

  if (world) {
    const drawable: Entity[] = [];
    world.queryInto(drawable, [COMPONENTS.building]);
    const soldiers: Entity[] = [];
    world.queryInto(soldiers, [COMPONENTS.soldier]);
    for (const entity of drawable.concat(soldiers)) {
      if (registered.has(entity) || exemptions.has(entity)) continue;
      if (world.getComponent(entity, COMPONENTS.projectile)) continue;
      missingVisual.push(entity);
    }
  }

  return { missingVisual, orphanVisual, missingComponent, kindMismatch, exemptWithVisual, staleExemption };
}

export function isConsistent(report: ConsistencyReport): boolean {
  return CATEGORIES.every((category) => report[category].length === 0);
}

export function describeInconsistencies(report: ConsistencyReport): string {
  const parts = CATEGORIES.filter((category) => report[category].length > 0)
    .map((category) => `${category} [${report[category].join(', ')}]`);
  return `Visual consistency failed: ${parts.join('; ')}`;
}
