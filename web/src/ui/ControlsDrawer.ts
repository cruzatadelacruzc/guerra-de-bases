export class ControlsDrawer {
  readonly #content: HTMLElement;
  readonly #button: HTMLButtonElement;
  readonly #icon: HTMLElement;
  #rewardCount = 0;

  constructor(root: ParentNode) {
    const content = root.querySelector<HTMLElement>('#game-controls-content');
    const button = root.querySelector<HTMLButtonElement>('#btn-toggle-controls');
    const icon = root.querySelector<HTMLElement>('#controls-toggle-icon');
    if (!content || !button || !icon) throw new Error('Game controls drawer is incomplete');
    this.#content = content;
    this.#button = button;
    this.#icon = icon;
  }

  get expanded(): boolean {
    return !this.#content.classList.contains('hidden');
  }

  setRewardCount(count: number): void {
    this.#rewardCount = count;
    this.#renderLabel();
  }

  setExpanded(expanded: boolean): void {
    this.#content.classList.toggle('hidden', !expanded);
    this.#button.setAttribute('aria-expanded', String(expanded));
    this.#icon.innerText = expanded ? '−' : '＋';
    this.#renderLabel();
  }

  #renderLabel(): void {
    const label = this.#button.querySelector<HTMLElement>('span:first-child');
    if (!label) throw new Error('Game controls toggle label is missing');
    label.innerText = this.expanded
      ? 'CERRAR CENTRO DE MANDO'
      : `CENTRO DE MANDO${this.#rewardCount ? ` · ${this.#rewardCount} RECOMPENSA(S)` : ''}`;
  }
}
