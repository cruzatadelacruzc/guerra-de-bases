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
import { getRewardDefinitionForDifficulty, REWARD_DEFINITIONS } from '../game/rewardSystem.ts';
import type {
  BarracksProductionView,
  GameActions,
  GameOverSummary,
  GameUiPort,
  MissionSettings,
  RewardId,
  RewardUiState,
  UnlockView,
} from './contracts.ts';
import { ToastNotifications } from './ToastNotifications.ts';
import { createRewardIcon, getRewardCategory, getRewardFacts } from './rewardPresentation.ts';
import { ScrollCues } from './ScrollCues.ts';
import { createUiIcon } from './uiIcons.ts';

export class GameUI implements GameUiPort {
  readonly #root: HTMLElement;
  #mounted = false;
  #actions: GameActions | undefined;
  #buildMenu: BuildMenu | undefined;
  #controls: ControlsDrawer | undefined;
  #hud: GameHud | undefined;
  #toast: ToastNotifications | undefined;
  #permanentUnlockCount = 0;
  #rewardCues: ScrollCues | undefined;

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
    this.#renderRewardTeaser();
    this.#renderMissionRules(this.getMissionSettings().difficulty);
    this.#bindRewardsAccordion();
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
    this.#element<HTMLElement>('canvas-container').classList.remove('hidden');
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
    this.#element<HTMLElement>('canvas-container').classList.remove('hidden');
    const mainMenu = this.#element<HTMLElement>('main-menu');
    mainMenu.classList.remove('hidden', 'pointer-events-none');
    window.setTimeout(() => mainMenu.classList.remove('opacity-0'), 50);
  }

  setPaused(paused: boolean): void {
    this.#hud?.setPauseVisible(paused);
  }

  updateResources(
    gold: number,
    enemyGold: number,
    barracksCount: number,
    availableFactories: number,
    production: readonly BarracksProductionView[]
  ): void {
    this.#element<HTMLElement>('res-gold').innerText = String(Math.floor(gold));
    this.#element<HTMLElement>('enemy-gold-text').innerText = String(Math.floor(enemyGold));
    this.#buildMenu?.updateResources(gold, barracksCount, availableFactories, production);
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

  flashNexusAlert(): void {
    this.#hud?.flashNexusAlert();
  }

  setDemolishMode(active: boolean): void {
    this.#buildMenu?.setDemolishMode(active);
  }

  setAutoZoom(enabled: boolean): void {
    const button = this.#element<HTMLButtonElement>('btn-auto-zoom');
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Zoom automático activado' : 'Zoom automático desactivado');
  }

  setPlacementActive(active: boolean): void {
    this.#buildMenu?.setPlacementActive(active);
    // The open drawer covers the bottom of the screen, where the player's own
    // base sits; fold it so the player can tap next to their Nexus.
    if (active) this.#controls?.setExpanded(false);
  }

  setUnlocks(unlocks: readonly UnlockView[]): void {
    this.#permanentUnlockCount = unlocks.filter((item) => item.type === 'permanent' && item.unlocked).length;
  }

  updateRewardState(state: RewardUiState): void {
    this.#hud?.setRewardState(state);
    this.#controls?.setCombatPoints(state.combatPoints);
  }

  showGameOver(summary: GameOverSummary): void {
    this.#hud?.setGameVisible(false);
    this.#element<HTMLElement>('canvas-container').classList.add('hidden');
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
    if (id === 'btn-auto-zoom') {
      event.stopPropagation();
      actions?.toggleAutoZoom();
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
    if (button.dataset.rewardId) {
      event.stopPropagation();
      const rewardId = button.dataset.rewardId;
      if (rewardId === 'artillery_strike' || rewardId === 'air_strike' || rewardId === 'defensive_shield') {
        // Close the drawer so the strike (and its camera move) can be seen.
        if (actions?.activateReward(rewardId)) this.#controls?.setExpanded(false);
      }
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
    const rulesContent = this.#root.querySelector<HTMLElement>('#mission-rules-content');
    if (rulesContent) {
      this.#renderMissionRules(value);
    }
  }

  #showMenuTab(tab: string, button: HTMLButtonElement): void {
    if (tab === 'mission-rules') {
      const rulesContent = this.#root.querySelector<HTMLElement>('#mission-rules-content');
      if (!rulesContent) return;
      button.setAttribute('aria-pressed', 'true');
      rulesContent.classList.toggle('expanded');
      return;
    }
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

  #renderMissionRules(difficulty: MissionSettings['difficulty']): void {
    const panel = this.#root.querySelector<HTMLElement>('#mission-rules-content');
    if (!panel) return;

    const how = document.createElement('p');
    how.className = 'mission-rules-how';
    const howCp = document.createElement('b');
    howCp.textContent = 'CP';
    const howCost = document.createElement('b');
    howCost.textContent = 'CP + oro';
    const howText = document.createElement('span');
    howText.append(
      'Elimina unidades y estructuras enemigas para ganar ',
      howCp,
      '. Gasta ',
      howCost,
      ' para lanzar el ataque cuando tú decidas.'
    );
    how.append(createUiIcon('bolt'), howText);

    const cards = (Object.keys(REWARD_DEFINITIONS) as RewardId[]).map((id) => {
      const definition = getRewardDefinitionForDifficulty(id, difficulty);
      const card = document.createElement('article');
      card.className = `mission-rules-card is-${id}`;

      const tile = document.createElement('span');
      tile.className = 'mission-rules-tile';
      tile.append(createRewardIcon(id));

      const head = document.createElement('div');
      head.className = 'mission-rules-head';
      const name = document.createElement('div');
      const category = document.createElement('span');
      category.className = 'mission-rules-category';
      category.textContent = getRewardCategory(id);
      const title = document.createElement('h3');
      title.textContent = definition.title;
      name.append(category, title);

      const cost = document.createElement('div');
      cost.className = 'mission-rules-cost';
      const points = document.createElement('span');
      points.className = 'is-cp';
      points.append(createUiIcon('bolt'), `${definition.pointsCost} CP`);
      const gold = document.createElement('span');
      gold.className = 'is-gold';
      const goldLabel = document.createElement('span');
      goldLabel.className = 'sr-only';
      goldLabel.textContent = ' oro';
      gold.append(createUiIcon('coin'), String(definition.goldCost), goldLabel);
      cost.append(points, gold);
      head.append(name, cost);

      const description = document.createElement('p');
      description.className = 'mission-rules-desc';
      description.textContent = definition.description;

      const facts = document.createElement('div');
      facts.className = 'mission-rules-facts';
      for (const fact of getRewardFacts(id, difficulty)) {
        const chip = document.createElement('span');
        const value = document.createElement('b');
        value.textContent = fact.value;
        chip.append(createUiIcon(fact.icon), value);
        if (fact.label) chip.append(` ${fact.label}`);
        facts.append(chip);
      }

      card.append(tile, head, description, facts);
      return card;
    });

    panel.replaceChildren(how, ...cards);
    this.#rewardCues?.refresh();
  }

  /** The closed accordion previews the three rewards as coloured hexagons. */
  #renderRewardTeaser(): void {
    const icons = this.#element<HTMLElement>('menu-rewards').querySelector('.menu-rewards-icons');
    if (!icons) return;
    icons.replaceChildren(...(Object.keys(REWARD_DEFINITIONS) as RewardId[]).map((id) => {
      const hex = document.createElement('span');
      hex.className = `menu-reward-hex is-${id}`;
      hex.append(createRewardIcon(id));
      return hex;
    }));
  }

  #bindRewardsAccordion(): void {
    const accordion = this.#element<HTMLDetailsElement>('menu-rewards');
    const wrap = accordion.querySelector<HTMLElement>('.menu-rewards-scroll-wrap');
    const list = this.#element<HTMLElement>('mission-rules-content');
    const shell = this.#root.querySelector<HTMLElement>('.menu-shell');
    if (!wrap || !shell) throw new Error('Rewards accordion markup is incomplete');
    this.#rewardCues = new ScrollCues(wrap, list);
    accordion.addEventListener('toggle', () => {
      shell.classList.toggle('is-rewards-open', accordion.open);
      if (!accordion.open) return;
      list.scrollTop = 0;
      // Measure after the open layout (taller panel, compact title) settles.
      requestAnimationFrame(() => this.#rewardCues?.refresh());
    });
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
