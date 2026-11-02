import type {
  BarracksProductionView,
  BuildingType,
  GameActions,
  UnitType
} from './contracts.ts';

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

  updateResources(
    gold: number,
    barracksCount: number,
    availableFactories: number,
    production: readonly BarracksProductionView[]
  ): void {
    for (const type of Object.keys(BUILDING_IDS) as BuildingType[]) {
      this.#button(BUILDING_IDS[type]).disabled = gold < BUILDING_COSTS[type];
    }

    const status = this.#element<HTMLElement>('barracks-status');
    const rifleman = this.#button('train-rifleman');
    const tank = this.#button('train-tank');
    if (barracksCount > 0) {
      const label = document.createElement('span');
      label.className = 'text-cyan-400 font-bold';
      label.textContent = `${barracksCount} Barraca(s) · ${availableFactories} disponible(s)`;
      status.replaceChildren(label);
      for (const order of production) {
        const progress = document.createElement('progress');
        progress.className = 'w-full h-1.5 accent-cyan-400';
        progress.max = order.durationSeconds;
        progress.value = order.durationSeconds - order.remainingSeconds;
        progress.setAttribute(
          'aria-label',
          `Producción de ${order.unit === 'rifleman' ? 'soldado' : 'tanque'}`
        );
        const details = document.createElement('div');
        details.className = 'flex items-center gap-2 text-[10px] text-slate-300';
        details.append(
          document.createTextNode(
            `${order.unit === 'rifleman' ? 'Soldado' : 'Tanque'} · ${order.remainingSeconds.toFixed(1)} s`
          ),
          progress
        );
        status.append(details);
      }
      rifleman.disabled = availableFactories === 0 || gold < 50;
      tank.disabled = availableFactories === 0 || gold < 180;
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
