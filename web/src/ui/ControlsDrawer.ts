export class ControlsDrawer {
  readonly #content: HTMLElement;
  readonly #button: HTMLButtonElement;
  readonly #icon: HTMLElement;
  #combatPoints = 0;

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

  setCombatPoints(points: number): void {
    this.#combatPoints = points;
    this.#renderLabel();
  }

  setExpanded(expanded: boolean): void {
    this.#content.classList.toggle('hidden', !expanded);
    this.#button.setAttribute('aria-expanded', String(expanded));
    this.#button.setAttribute('aria-label', expanded
      ? 'Cerrar Centro de Mando'
      : `Abrir Centro de Mando. Apoyo táctico: ${this.#combatPoints} puntos de combate`);
    this.#icon.innerText = expanded ? '−' : '＋';
    this.#renderLabel();
  }

  #renderLabel(): void {
    const label = this.#button.querySelector<HTMLElement>('.game-controls-label');
    if (!label) throw new Error('Game controls toggle label is missing');
    label.innerText = this.expanded
      ? 'CERRAR CENTRO DE MANDO'
      : `ABRIR CENTRO DE MANDO · APOYO ${this.#combatPoints} CP`;
  }
}
