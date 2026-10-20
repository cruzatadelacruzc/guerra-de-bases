import type { BuildingType, GameActions, UnitType } from './contracts.ts';

const BUILDING_IDS: Record<BuildingType, string> = {
  generator: 'build-generator',
  barracks: 'build-barracks',
  turret: 'build-turret',
};

const BUILDING_COSTS: Record<BuildingType, number> = {
  generator: 100,
  barracks: 150,
  turret: 125,
};

export class BuildMenu {
  readonly #root: ParentNode;

  constructor(root: ParentNode) {
    this.#root = root;
  }

  updateResources(gold: number, barracksCount: number): void {
    for (const type of Object.keys(BUILDING_IDS) as BuildingType[]) {
      this.#button(BUILDING_IDS[type]).disabled = gold < BUILDING_COSTS[type];
    }

    const status = this.#element<HTMLElement>('barracks-status');
    const rifleman = this.#button('train-rifleman');
    const tank = this.#button('train-tank');
    if (barracksCount > 0) {
      const label = document.createElement('span');
      label.className = 'text-cyan-400 font-bold';
      label.textContent = `${barracksCount} Barraca(s) (${barracksCount}x Tropas)`;
      status.replaceChildren(label);
      rifleman.disabled = gold < 50 * barracksCount;
      tank.disabled = gold < 180 * barracksCount;
    } else {
      const label = document.createElement('span');
      label.className = 'text-red-400 font-bold';
      label.textContent = 'No construida';
      status.replaceChildren(document.createTextNode('Barracas: '), label);
      rifleman.disabled = true;
      tank.disabled = true;
    }
  }

  setDemolishMode(active: boolean): void {
    const button = this.#button('demolish-mode');
    const status = this.#element<HTMLElement>('demolish-status');
    if (active) {
      button.classList.add('bg-red-900/60', 'border-red-400');
      status.innerText = 'ACTIVADO';
      status.className = 'text-[10px] font-mono text-red-400 font-bold mt-1 animate-pulse';
    } else {
      button.classList.remove('bg-red-900/60', 'border-red-400');
      status.innerText = 'INACTIVO';
      status.className = 'text-[10px] font-mono text-slate-400 mt-1';
    }
  }

  setPlacementActive(active: boolean): void {
    this.#element<HTMLElement>('cancel-build-hint').classList.toggle('hidden', !active);
  }

  dispatchAction(id: string, actions: GameActions): boolean {
    if (id === 'demolish-mode') {
      actions.toggleDemolishMode();
      return true;
    }
    for (const [type, buttonId] of Object.entries(BUILDING_IDS) as [BuildingType, string][]) {
      if (id === buttonId) {
        actions.selectBuilding(type);
        return true;
      }
    }
    const unitById: Record<string, UnitType> = {
      'train-rifleman': 'rifleman',
      'train-tank': 'tank',
    };
    const unit = unitById[id];
    if (unit) {
      actions.trainUnit(unit);
      return true;
    }
    return false;
  }

  #button(id: string): HTMLButtonElement {
    return this.#element<HTMLButtonElement>(id);
  }

  #element<ElementType extends Element>(id: string): ElementType {
    const element = this.#root.querySelector<ElementType>(`#${id}`);
    if (!element) throw new Error(`Required game UI element #${id} is missing`);
    return element;
  }
}
