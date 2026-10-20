import type { GameOverSummary, UnlockView } from './contracts.ts';

export class GameHud {
  readonly #root: ParentNode;
  readonly #unlockPanel: HTMLElement;

  constructor(root: ParentNode) {
    this.#root = root;
    const unlockPanel = root.querySelector<HTMLElement>('#unlock-panel');
    if (!unlockPanel) throw new Error('Unlock panel element is missing');
    this.#unlockPanel = unlockPanel;
  }

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

  setUnlocks(unlocks: readonly UnlockView[]): void {
    const available = unlocks.filter((item) => item.unlocked);
    if (!available.length) {
      this.#unlockPanel.classList.add('hidden');
      this.#unlockPanel.replaceChildren();
      return;
    }

    const wasOpen = this.#unlockPanel.querySelector('details')?.open ?? false;
    const details = document.createElement('details');
    details.className = 'cyber-panel rounded-xl border border-cyan-500/40 bg-slate-950/90 shadow-[0_0_30px_rgba(34,211,238,0.08)]';
    details.open = wasOpen;

    const summary = document.createElement('summary');
    summary.className = 'flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-3';
    const title = document.createElement('span');
    title.className = 'font-orbitron text-[10px] uppercase tracking-[0.22em] text-cyan-400';
    title.textContent = 'premios tácticos';
    const count = document.createElement('span');
    count.className = 'text-[10px] text-slate-300';
    count.textContent = `${available.length} DISPONIBLE(S)`;
    summary.append(title, count);
    details.append(summary);

    const entries = document.createElement('div');
    entries.className = 'space-y-2';
    for (const item of available) entries.append(this.#createUnlockEntry(item));
    details.append(entries);
    this.#unlockPanel.replaceChildren(details);
    this.#unlockPanel.classList.remove('hidden');
  }

  showGameOver(summary: GameOverSummary): void {
    const isVictory = summary.victory;
    this.#element<HTMLElement>('game-over-modal').classList.remove('hidden');
    const card = this.#element<HTMLElement>('game-over-card');
    card.classList.toggle('is-victory', isVictory);
    card.classList.toggle('is-defeat', !isVictory);

    const values = isVictory
      ? {
          status: 'MISIÓN CUMPLIDA // SECTOR 07',
          state: 'SECTOR ASEGURADO',
          badge: 'ASEGURADO',
          title: 'VICTORIA',
          message: 'El Nexo rival ha caído. El sector está bajo tu control.',
        }
      : {
          status: 'ALERTA CRÍTICA // SECTOR 07',
          state: 'NEXO DESTRUIDO',
          badge: 'CRÍTICO',
          title: 'DERROTA OPERATIVA',
          message: 'Tu Nexo principal fue destruido por el asedio enemigo.',
        };
    this.#element<HTMLElement>('game-over-status').innerText = values.status;
    this.#element<HTMLElement>('game-over-state').innerText = values.state;
    this.#element<HTMLElement>('game-over-badge').innerText = values.badge;
    this.#element<HTMLElement>('game-over-title').innerText = values.title;
    this.#element<HTMLElement>('game-over-msg').innerText = values.message;
    this.#element<HTMLElement>('stat-soldiers').innerText = String(summary.soldiersTrained);
    this.#element<HTMLElement>('stat-losses').innerText = String(summary.losses);
    this.#element<HTMLElement>('stat-buildings').innerText = String(summary.buildingsConstructed);
    this.#element<HTMLElement>('stat-time').innerText = summary.duration;
    this.#element<HTMLElement>('stat-enemy-hq-damage').innerText = `${summary.enemyBaseDamagePercent}%`;
    this.#element<HTMLElement>('stat-enemy-hq-damage-bar').style.width =
      `${summary.enemyBaseDamagePercent}%`;
  }

  setGameVisible(visible: boolean): void {
    this.#element<HTMLElement>('game-hud').classList.toggle('hidden', !visible);
  }

  setPauseVisible(visible: boolean): void {
    this.#element<HTMLElement>('pause-modal').classList.toggle('hidden', !visible);
  }

  setGameOverVisible(visible: boolean): void {
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

  #createUnlockEntry(item: UnlockView): HTMLElement {
    const available = item.unlocked;
    const entry = document.createElement('div');
    entry.className = `mx-3 mb-2 rounded-lg border ${available ? 'border-cyan-500/40 bg-cyan-950/20' : 'border-slate-700 bg-slate-900/60'} p-2`;

    const heading = document.createElement('div');
    heading.className = 'flex items-center justify-between gap-2';
    const textGroup = document.createElement('div');
    const type = document.createElement('div');
    type.className = `text-[10px] uppercase tracking-wide ${available ? 'text-cyan-300' : 'text-slate-400'}`;
    type.textContent = item.type === 'temporary' ? 'TEMPORAL' : 'PERMANENTE';
    const title = document.createElement('div');
    title.className = 'text-xs font-bold text-slate-100';
    title.textContent = item.title || item.id;
    textGroup.append(type, title);
    const state = document.createElement('span');
    state.className = `text-[10px] ${available ? 'text-cyan-300' : 'text-slate-500'}`;
    state.textContent = item.ready ? 'Listo' : (available ? 'Desbloqueado' : 'Bloqueado');
    heading.append(textGroup, state);

    const description = document.createElement('div');
    description.className = 'mt-1 text-[10px] text-slate-300 leading-relaxed';
    description.textContent = item.description || 'Recompensa desbloqueada por objetivo.';
    entry.append(heading, description);

    if (item.ready) {
      const button = document.createElement('button');
      button.dataset.unlockId = item.id;
      button.className = 'mt-2 w-full cyber-button px-2 py-1 text-[10px] font-orbitron font-bold text-cyan-300';
      button.textContent = 'Activar ahora';
      entry.append(button);
    }
    return entry;
  }

  #element<ElementType extends Element>(id: string): ElementType {
    const element = this.#root.querySelector<ElementType>(`#${id}`);
    if (!element) throw new Error(`Required game UI element #${id} is missing`);
    return element;
  }
}
