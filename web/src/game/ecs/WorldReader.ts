import type { ComponentData, ComponentName, Entity } from './components.ts';

export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

export type ReadonlyComponentData = { readonly [Name in ComponentName]: DeepReadonly<ComponentData[Name]> };

/** The read-only view of the world that presentation code receives; it cannot write components. */
export interface WorldReader {
  getComponent<Name extends ComponentName>(entity: Entity, component: Name): ReadonlyComponentData[Name] | undefined;
  queryInto(result: Entity[], components: readonly ComponentName[]): void;
}
