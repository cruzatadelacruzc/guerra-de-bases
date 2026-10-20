export interface GameInputActions {
  onPointerMove(event: PointerEvent): void;
  onPointerClick(event: MouseEvent): void;
  onEscape(): void;
  onCancelPlacement(event: Event): boolean;
  onNativeBack(): boolean;
  onApplicationInactive(): void;
}

export class GameInputController {
  readonly #actions: GameInputActions;
  #controller: AbortController | undefined;

  constructor(actions: GameInputActions) {
    this.#actions = actions;
  }

  attach(): void {
    if (this.#controller) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    this.#controller = controller;

    window.addEventListener('pointermove', (event) => {
      this.#actions.onPointerMove(event);
    }, options);
    window.addEventListener('click', (event) => {
      this.#actions.onPointerClick(event);
    }, options);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.#actions.onEscape();
    }, options);
    window.addEventListener('contextmenu', (event) => {
      if (this.#actions.onCancelPlacement(event)) event.preventDefault();
    }, options);
    window.addEventListener('native-back-button', (event) => {
      if (this.#actions.onNativeBack()) event.preventDefault();
    }, options);
    window.addEventListener('native-app-inactive', () => {
      this.#actions.onApplicationInactive();
    }, options);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.#actions.onApplicationInactive();
    }, options);
  }

  detach(): void {
    this.#controller?.abort();
    this.#controller = undefined;
  }
}
