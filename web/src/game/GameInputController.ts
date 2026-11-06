/**
 * Standard tap-vs-drag disambiguation: a `pointerup` is only treated as a tap
 * (and allowed to commit a gameplay action) when it lands within
 * `toleranceCssPixels` of the matching `pointerdown`. Anything further is
 * treated as a drag (e.g. a one-finger camera-orbit gesture) and must not
 * commit. Exported as a pure function so the threshold math is unit
 * testable without needing a real pointer/canvas/rendering setup.
 */
export function exceedsTapTolerance(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  toleranceCssPixels: number
): boolean {
  return Math.hypot(endX - startX, endY - startY) > toleranceCssPixels;
}

export interface GameInputActions {
  onPointerMove(event: PointerEvent): void;
  onPointerDown(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;
  onPointerCancel(): void;
  onEscape(): void;
  onCancelPlacement(event: Event): boolean;
  onNativeBack(): boolean;
  onApplicationInactive(): void;
  onApplicationActive(): void;
}

export class GameInputController {
  readonly #surface: HTMLCanvasElement;
  readonly #actions: GameInputActions;
  #controller: AbortController | undefined;

  constructor(surface: HTMLCanvasElement, actions: GameInputActions) {
    this.#surface = surface;
    this.#actions = actions;
  }

  attach(): void {
    if (this.#controller) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    this.#controller = controller;

    this.#surface.addEventListener('pointermove', (event) => {
      this.#actions.onPointerMove(event);
    }, options);
    this.#surface.addEventListener('pointerdown', (event) => {
      if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
      this.#actions.onPointerDown(event);
    }, options);
    this.#surface.addEventListener('pointerup', (event) => {
      if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
      this.#actions.onPointerUp(event);
    }, options);
    this.#surface.addEventListener('pointercancel', () => {
      this.#actions.onPointerCancel();
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
    window.addEventListener('native-app-active', () => {
      this.#actions.onApplicationActive();
    }, options);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.#actions.onApplicationInactive();
      else if (document.visibilityState === 'visible') this.#actions.onApplicationActive();
    }, options);
  }

  detach(): void {
    this.#controller?.abort();
    this.#controller = undefined;
  }
}
