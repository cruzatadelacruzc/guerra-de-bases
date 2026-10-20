import type { ComponentData, ComponentName, Entity } from './components.ts';

type ComponentStores = {
  [Name in ComponentName]: Map<Entity, ComponentData[Name]>;
};

function createComponentStores(): ComponentStores {
  return {
    base: new Map(),
    factory: new Map(),
    faction: new Map(),
    health: new Map(),
    movement: new Map(),
    soldier: new Map(),
    structure: new Map(),
    targetable: new Map(),
    transform: new Map()
  };
}

export class World {
  #nextEntityId: Entity = 1;
  #entities = new Set<Entity>();
  #components = createComponentStores();

  createEntity(): Entity {
    const entity = this.#nextEntityId++;
    this.#entities.add(entity);
    return entity;
  }

  addComponent<Name extends ComponentName>(
    entity: Entity,
    component: Name,
    value: ComponentData[Name]
  ): ComponentData[Name] {
    if (!this.#entities.has(entity)) {
      throw new Error(`Cannot add component to unknown entity ${entity}`);
    }

    this.#components[component].set(entity, value);
    return value;
  }

  getComponent<Name extends ComponentName>(
    entity: Entity,
    component: Name
  ): ComponentData[Name] | undefined {
    return this.#components[component].get(entity);
  }

  query(...components: ComponentName[]): Entity[] {
    const result: Entity[] = [];
    this.queryInto(result, components);
    return result;
  }

  queryInto(result: Entity[], components: readonly ComponentName[]): void {
    result.length = 0;
    if (components.length === 0) {
      for (const entity of this.#entities) result.push(entity);
      return;
    }

    let smallestStore = this.#components[components[0]];
    for (let index = 1; index < components.length; index++) {
      const store = this.#components[components[index]];
      if (store.size < smallestStore.size) smallestStore = store;
    }

    for (const entity of smallestStore.keys()) {
      let matches = true;
      for (let index = 0; index < components.length; index++) {
        if (!this.#components[components[index]].has(entity)) {
          matches = false;
          break;
        }
      }
      if (matches) result.push(entity);
    }
  }

  removeEntity(entity: Entity): boolean {
    if (!this.#entities.delete(entity)) return false;
    for (const store of Object.values(this.#components)) store.delete(entity);
    return true;
  }

  clear(): void {
    this.#entities.clear();
    for (const store of Object.values(this.#components)) store.clear();
    this.#nextEntityId = 1;
  }
}
