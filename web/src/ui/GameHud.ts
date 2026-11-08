import { getRewardDefinitionForDifficulty } from '../game/rewardSystem.ts';
import type { GameOverSummary, RewardUiState } from './contracts.ts';
import { CountUpAnimator, formatClockDuration, parseClockDuration, type CountUpTarget } from './countUp.ts';
import { getRetryHint } from './gameOverHints.ts';
import { createRewardIcon, getRewardCategory } from './rewardPresentation.ts';

/** How long the game-over actions ignore taps after the screen appears. */
const GAME_OVER_ARMING_MS = 600;

export class GameHud {
  readonly #root: ParentNode;
  readonly #rewardCards: HTMLElement;
  #rewardStructureKey = '';
  readonly #countUp = new CountUpAnimator();
  #armTimer: number | undefined;

  constructor(root: ParentNode) {
    this.#root = root;
    const rewardCards = root.querySelector<HTMLElement>('#tactical-reward-cards');
    if (!rewardCards) throw new Error('Tactical reward card container is missing');
    this.#rewardCards = rewardCards;
    this.#element<HTMLElement>('game-over-modal').addEventListener('keydown', this.#trapGameOverFocus);
  }

  /** Keeps Tab cycling between the two game-over actions while the dialog is open. */
  readonly #trapGameOverFocus = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const restart = this.#element<HTMLButtonElement>('btn-restart-game');
    const menu = this.#element<HTMLButtonElement>('btn-gameover-menu');
    const active = document.activeElement;
    if (event.shiftKey && active === restart) {
      event.preventDefault();
      menu.focus();
    } else if (!event.shiftKey && active === menu) {
      event.preventDefault();
      restart.focus();
    }
  };

  setBaseHealth(
    player: { current: number; maximum: number },
    enemy: { current: number; maximum: number }
  ): void {
    this.#setHealth('player', player);
    this.#setHealth('enemy', enemy);
  }

  setAiStatus(status: string): void {
    this.#element<HTMLElement>('ai-strat-tag').innerText = status;
  }

  setRewardState(state: RewardUiState): void {
    this.#element<HTMLElement>('reward-combat-points').innerText = String(state.combatPoints);
    this.#element<HTMLElement>('reward-gold-balance').innerText = String(Math.floor(state.gold));
    this.#element<HTMLElement>('res-combat-points').innerText = `${state.combatPoints} CP`;
    this.#element<HTMLElement>('res-gold').innerText = String(Math.floor(state.gold));
    const structureKey = `${state.difficulty}:${state.rewards.map((reward) => `${reward.id}-${reward.status}`).join('|')}`;
    if (structureKey === this.#rewardStructureKey) {
      this.#updateRewardTimers(state);
      return;
    }
    this.#rewardStructureKey = structureKey;
    const cards: HTMLElement[] = [];

    for (const rewardState of state.rewards) {
      const definition = getRewardDefinitionForDifficulty(rewardState.id, state.difficulty);
      const card = document.createElement('article');
      card.className = `tactical-reward-card is-${rewardState.status.toLowerCase().replaceAll(' ', '-')}`;
      card.dataset.rewardCard = rewardState.id;
      const heading = document.createElement('header');
      heading.className = 'tactical-reward-card-heading';
      const identity = document.createElement('div');
      identity.className = 'tactical-reward-identity';
      identity.append(createRewardIcon(rewardState.id));
      const titleGroup = document.createElement('div');
      const category = document.createElement('span');
      category.className = 'tactical-reward-category';
      category.textContent = getRewardCategory(rewardState.id);
      const title = document.createElement('h3');
      title.textContent = definition.title;
      titleGroup.append(category, title);
      identity.append(titleGroup);
      const status = document.createElement('span');
      status.className = 'tactical-reward-status';
      status.textContent = rewardState.status;
      heading.append(identity, status);

      const description = document.createElement('p');
      description.className = 'tactical-reward-description';
      description.textContent = definition.description;
      const costs = document.createElement('div');
      costs.className = 'tactical-reward-costs';
      const points = document.createElement('span');
      const pointsValue = document.createElement('b');
      pointsValue.textContent = String(definition.pointsCost);
      points.append(pointsValue, ' CP');
      const gold = document.createElement('span');
      const goldValue = document.createElement('b');
      goldValue.textContent = String(definition.goldCost);
      gold.append(goldValue, ' ORO');
      costs.append(points, gold);
      card.append(heading, description, costs);

      if (rewardState.status === 'ACTIVE') {
        const timer = document.createElement('p');
        timer.className = 'tactical-reward-timer';
        timer.textContent = `ACTIVA · ${rewardState.remainingSeconds.toFixed(1)} s`;
        card.append(timer);
      } else if (rewardState.status === 'COOLDOWN') {
        const timer = document.createElement('p');
        timer.className = 'tactical-reward-timer';
        timer.textContent = `RECARGA · ${rewardState.cooldownSeconds.toFixed(1)} s`;
        card.append(timer);
      }

      if (rewardState.status === 'READY') {
        const activate = document.createElement('button');
        activate.type = 'button';
        activate.dataset.rewardId = rewardState.id;
        activate.className = 'cyber-button tactical-reward-action';
        activate.textContent = 'ACTIVAR APOYO';
        card.append(activate);
      }
      cards.push(card);
    }

    this.#rewardCards.replaceChildren(...cards);
    this.#updateRewardTimers(state);
  }

  #updateRewardTimers(state: RewardUiState): void {
    for (const rewardState of state.rewards) {
      const card = this.#rewardCards.querySelector<HTMLElement>(
        `[data-reward-card="${rewardState.id}"]`
      );
      if (!card) continue;
      const timer = card.querySelector<HTMLElement>('.tactical-reward-timer');
      if (!timer) continue;
      if (rewardState.status === 'ACTIVE') {
        timer.textContent = `ACTIVA · ${rewardState.remainingSeconds.toFixed(1)} s`;
      } else if (rewardState.status === 'COOLDOWN') {
        timer.textContent = `RECARGA · ${rewardState.cooldownSeconds.toFixed(1)} s`;
      }
    }
  }

  showGameOver(summary: GameOverSummary): void {
    const isVictory = summary.victory;
    const modal = this.#element<HTMLElement>('game-over-modal');
    modal.classList.remove('hidden');
    // Ignore taps for a moment so a tap still in flight from the battle
    // can't hit JUGAR DE NUEVO and skip the report.
    window.clearTimeout(this.#armTimer);
    modal.classList.add('is-arming');
    this.#armTimer = window.setTimeout(() => modal.classList.remove('is-arming'), GAME_OVER_ARMING_MS);
    // The modal's frame and backdrop glow follow the result colour too.
    modal.classList.toggle('is-victory', isVictory);
    const card = this.#element<HTMLElement>('game-over-card');
    card.classList.toggle('is-victory', isVictory);
    card.classList.toggle('is-defeat', !isVictory);

    const values = isVictory
      ? {
          badge: '¡GANASTE!',
          title: 'VICTORIA',
          message: 'El Nexo rival ha caído. El sector está bajo tu control.',
        }
      : {
          badge: 'NEXO PERDIDO',
          title: 'DERROTA',
          message: 'Tu Nexo principal fue destruido por el asedio enemigo.',
        };
    this.#element<HTMLElement>('game-over-badge').innerText = values.badge;
    this.#element<HTMLElement>('game-over-title').innerText = values.title;
    this.#element<HTMLElement>('game-over-msg').innerText = values.message;
    const hint = this.#element<HTMLElement>('game-over-hint');
    const hintText = getRetryHint(isVictory, summary.enemyBaseDamagePercent);
    hint.textContent = hintText ?? '';
    hint.hidden = hintText === null;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const damage = summary.enemyBaseDamagePercent;
    const bar = this.#element<HTMLElement>('stat-enemy-hq-damage-bar');
    const fill = `scaleX(${damage / 100})`;
    if (reducedMotion) {
      bar.style.transform = fill;
    } else {
      // Commit the empty bar before filling it, so the CSS transition runs
      // even when this is called outside an animation frame (e.g. a timer).
      bar.style.transform = 'scaleX(0)';
      void bar.offsetWidth;
      bar.style.transform = fill;
    }

    const time = this.#element<HTMLElement>('stat-time');
    const durationSeconds = parseClockDuration(summary.duration);
    const targets: CountUpTarget[] = [
      { element: this.#element<HTMLElement>('stat-soldiers'), to: summary.soldiersTrained, format: String },
      { element: this.#element<HTMLElement>('stat-losses'), to: summary.losses, format: String },
      { element: this.#element<HTMLElement>('stat-buildings'), to: summary.buildingsConstructed, format: String },
      { element: this.#element<HTMLElement>('stat-enemy-hq-damage'), to: damage, format: (value) => `${value}%` },
    ];
    if (durationSeconds === null) {
      time.textContent = summary.duration;
    } else {
      targets.push({ element: time, to: durationSeconds, format: formatClockDuration });
    }
    this.#countUp.start(targets, { durationMs: 1100, reducedMotion });
    // Move focus into the dialog so its title and message are announced.
    this.#element<HTMLButtonElement>('btn-restart-game').focus({ preventScroll: true });
  }

  flashNexusAlert(): void {
    const vignette = this.#element<HTMLElement>('nexus-alert-vignette');
    vignette.classList.remove('is-active');
    // Force a reflow so re-adding the class restarts the animation.
    void vignette.offsetWidth;
    vignette.classList.add('is-active');
    vignette.addEventListener('animationend', () => vignette.classList.remove('is-active'), { once: true });
  }

  setGameVisible(visible: boolean): void {
    this.#element<HTMLElement>('game-hud').classList.toggle('hidden', !visible);
  }

  setPauseVisible(visible: boolean): void {
    this.#element<HTMLElement>('pause-modal').classList.toggle('hidden', !visible);
  }

  setGameOverVisible(visible: boolean): void {
    if (!visible) {
      this.#countUp.cancel();
      window.clearTimeout(this.#armTimer);
      this.#element<HTMLElement>('game-over-modal').classList.remove('is-arming');
    }
    this.#element<HTMLElement>('game-over-modal').classList.toggle('hidden', !visible);
  }

  #setHealth(
    side: 'player' | 'enemy',
    health: { current: number; maximum: number }
  ): void {
    const percentage = health.maximum > 0
      ? Math.max(0, Math.min(100, (health.current / health.maximum) * 100))
      : 0;
    this.#element<HTMLElement>(`${side}-hq-bar`).style.width = `${percentage}%`;
    this.#element<HTMLElement>(`${side}-hq-hp-text`).innerText =
      `${Math.ceil(health.current)} / ${health.maximum} HP`;
  }

  #element<ElementType extends Element>(id: string): ElementType {
    const element = this.#root.querySelector<ElementType>(`#${id}`);
    if (!element) throw new Error(`Required game UI element #${id} is missing`);
    return element;
  }
}
