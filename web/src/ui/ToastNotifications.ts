export class ToastNotifications {
  readonly #element: HTMLElement;
  #timeout: number | undefined;

  constructor(root: ParentNode) {
    const element = root.querySelector<HTMLElement>('#game-toast');
    if (!element) throw new Error('Game toast element is missing');
    this.#element = element;
  }

  show(message: string): void {
    if (this.#timeout !== undefined) window.clearTimeout(this.#timeout);
    this.#element.innerText = message;
    this.#element.classList.remove('opacity-0');
    this.#timeout = window.setTimeout(() => {
      this.#element.classList.add('opacity-0');
      this.#timeout = undefined;
    }, 2500);
  }
}
