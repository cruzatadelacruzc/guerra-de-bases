import {
  canvasTemplate,
  gameHudTemplate,
  gameOverTemplate,
  mainMenuTemplate,
  pauseModalTemplate,
} from './templates.ts';
import { BuildMenu } from './BuildMenu.ts';
import { ControlsDrawer } from './ControlsDrawer.ts';
import { GameHud } from './GameHud.ts';
import type {
  GameActions,
  GameOverSummary,
  GameUiPort,
  MissionSettings,
  UnlockView,
} from './contracts.ts';
import { ToastNotifications } from './ToastNotifications.ts';

export class GameUI implements GameUiPort {
  readonly #root: HTMLElement;
  #mounted = false;
  #actions: GameActions | undefined;
  #buildMenu: BuildMenu | undefined;
  #controls: ControlsDrawer | undefined;
  #hud: GameHud | undefined;
  #toast: ToastNotifications | undefined;
  #permanentUnlockCount = 0;

  constructor(root: HTMLElement) {
    this.#root = root;
  }

  mount(): void {
    if (this.#mounted) return;
    this.#root.innerHTML = [
      canvasTemplate,
      mainMenuTemplate,
      gameHudTemplate,
      pauseModalTemplate,
      gameOverTemplate,
    ].join('\n');
    this.#buildMenu = new BuildMenu(this.#root);
    this.#controls = new ControlsDrawer(this.#root);
    this.#hud = new GameHud(this.#root);
    this.#toast = new ToastNotifications(this.#root);
    this.#root.addEventListener('click', this.#handleClick);
    this.#mounted = true;
  }

  bindActions(actions: GameActions): void {
    this.#requireMounted();
    if (this.#actions) throw new Error('Game UI actions have already been bound');
    this.#actions = actions;
  }

  getCanvasContainer(): HTMLElement {
    return this.#element<HTMLElement>('canvas-container');
  }

  getMissionSettings(): MissionSettings {
    const difficulty = this.#element<HTMLSelectElement>('select-difficulty').value;
    if (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard') {
      throw new Error(`Unsupported game difficulty: ${difficulty}`);
    }
    const mode = this.#element<HTMLSelectElement>('select-mode').value;
    if (mode !== 'ai') throw new Error(`Unsupported game mode: ${mode}`);
    return { difficulty, mode };
  }

  showToast(message: string): void {
    this.#requireMounted();
    this.#toast?.show(message);
  }

  enterGameplay(): void {
    this.#element<HTMLElement>('main-menu').classList.add('opacity-0', 'pointer-events-none');
    this.#hud?.setPauseVisible(false);
    this.#hud?.setGameOverVisible(false);
    this.#controls?.setExpanded(false);
    window.setTimeout(() => {
      this.#element<HTMLElement>('main-menu').classList.add('hidden');
      this.#hud?.setGameVisible(true);
    }, 700);
  }

  enterMainMenu(): void {
    this.#hud?.setPauseVisible(false);
    this.#hud?.setGameOverVisible(false);
    this.#hud?.setGameVisible(false);
    this.#hud?.setUnlocks([]);
    const mainMenu = this.#element<HTMLElement>('main-menu');
    mainMenu.classList.remove('hidden', 'pointer-events-none');
    window.setTimeout(() => mainMenu.classList.remove('opacity-0'), 50);
  }

  setPaused(paused: boolean): void {
    this.#hud?.setPauseVisible(paused);
  }

  updateResources(gold: number, enemyGold: number, barracksCount: number): void {
    this.#element<HTMLElement>('res-gold').innerText = String(Math.floor(gold));
    this.#element<HTMLElement>('enemy-gold-text').innerText =
      `ORO ENEMIGO: ${Math.floor(enemyGold)}`;
    this.#buildMenu?.updateResources(gold, barracksCount);
  }

  setBaseHealth(
    player: { current: number; maximum: number },
    enemy: { current: number; maximum: number }
  ): void {
    this.#hud?.setBaseHealth(player, enemy);
  }

  setAiStatus(status: string): void {
    this.#hud?.setAiStatus(status);
  }

  setDemolishMode(active: boolean): void {
    this.#buildMenu?.setDemolishMode(active);
  }

  setPlacementActive(active: boolean): void {
    this.#buildMenu?.setPlacementActive(active);
  }

  setUnlocks(unlocks: readonly UnlockView[]): void {
    this.#hud?.setUnlocks(unlocks);
    this.#controls?.setRewardCount(unlocks.filter((item) => item.unlocked).length);
  }

  showGameOver(summary: GameOverSummary): void {
    this.#hud?.showGameOver(summary);
  }

  setPermanentUnlockCount(count: number): void {
    this.#permanentUnlockCount = count;
  }

  #handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button) return;

    const actions = this.#actions;
    const id = button.id;
    if (id === 'btn-start-game') {
      event.preventDefault();
      event.stopPropagation();
      actions?.startGame(this.getMissionSettings());
      return;
    }
    if (id === 'btn-restart-game' || id === 'btn-pause-restart') {
      event.stopPropagation();
      actions?.restartGame();
      return;
    }
    if (id === 'btn-gameover-menu' || id === 'btn-exit-menu') {
      event.stopPropagation();
      actions?.exitToMenu();
      return;
    }
    if (id === 'btn-pause-game') {
      event.stopPropagation();
      this.#controls?.setExpanded(false);
      actions?.pauseGame();
      return;
    }
    if (id === 'btn-resume-game') {
      event.stopPropagation();
      actions?.resumeGame();
      return;
    }
    if (id === 'btn-toggle-controls') {
      event.stopPropagation();
      this.#controls?.setExpanded(!this.#controls.expanded);
      return;
    }
    if (button.dataset.difficulty) {
      event.stopPropagation();
      this.#setDifficulty(button.dataset.difficulty);
      return;
    }
    if (button.dataset.menuTab) {
      this.#showMenuTab(button.dataset.menuTab, button);
      return;
    }
    if (button.dataset.unlockId) {
      event.stopPropagation();
      actions?.activateUnlock(button.dataset.unlockId);
      return;
    }
    if (actions && this.#buildMenu?.dispatchAction(id, actions)) {
      event.stopPropagation();
      this.#controls?.setExpanded(false);
    }
  };

  #setDifficulty(value: string): void {
    if (value !== 'easy' && value !== 'normal' && value !== 'hard') return;
    const select = this.#element<HTMLSelectElement>('select-difficulty');
    select.value = value;
    this.#root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.difficulty === value));
    });
    const labels: Record<'easy' | 'normal' | 'hard', string> = {
      easy: 'AMENAZA: BAJA',
      normal: 'AMENAZA: ESTÁNDAR',
      hard: 'AMENAZA: CRÍTICA',
    };
    this.#element<HTMLElement>('difficulty-threat').innerText = labels[value];
  }

  #showMenuTab(tab: string, button: HTMLButtonElement): void {
    const panel = this.#element<HTMLElement>('menu-intel-panel');
    const wasSelected = button.getAttribute('aria-pressed') === 'true';
    this.#root.querySelectorAll<HTMLButtonElement>('[data-menu-tab]').forEach((item) => {
      item.setAttribute('aria-pressed', 'false');
    });
    if (wasSelected) {
      panel.classList.add('hidden');
      panel.replaceChildren();
      return;
    }
    const contents: Record<string, string[]> = {
      arsenal: [
        'ARSENAL DE CAMPAÑA',
        'Apoyo de helicóptero · racha de 5 bajas',
        'Bombardeo · racha de 10 bajas',
        'Blindaje veterano · 20 bajas acumuladas',
      ],
      profile: [
        'PERFIL LOCAL',
        'Progreso guardado en este dispositivo.',
        `Desbloqueos permanentes: ${this.#permanentUnlockCount}`,
      ],
      system: [
        'SISTEMA LISTO',
        'Calidad gráfica adaptada automáticamente al dispositivo.',
        'Gestos de cámara y controles táctiles activados.',
      ],
    };
    const lines = contents[tab];
    if (!lines) return;
    button.setAttribute('aria-pressed', 'true');
    const [heading, ...details] = lines;
    const strong = document.createElement('strong');
    strong.textContent = heading;
    panel.replaceChildren(strong, ...details.map((line) => {
      const span = document.createElement('span');
      span.textContent = line;
      return span;
    }));
    panel.classList.remove('hidden');
  }

  #element<ElementType extends Element>(id: string): ElementType {
    const element = this.#root.querySelector<ElementType>(`#${id}`);
    if (!element) throw new Error(`Required game UI element #${id} is missing`);
    return element;
  }

  #requireMounted(): void {
    if (!this.#mounted) throw new Error('Game UI must be mounted before it is used');
  }
}
