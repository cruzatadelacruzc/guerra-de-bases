export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export interface ScrollCueState {
  canScrollUp: boolean;
  canScrollDown: boolean;
}

/** Which directions still hide content; `threshold` absorbs sub-pixel scroll ends. */
export function getScrollCueState(metrics: ScrollMetrics, threshold = 4): ScrollCueState {
  return {
    canScrollUp: metrics.scrollTop > threshold,
    canScrollDown: metrics.scrollTop + metrics.clientHeight < metrics.scrollHeight - threshold,
  };
}

/**
 * Replaces a visible scrollbar with glowing up/down cues: toggles
 * `can-scroll-up` / `can-scroll-down` on `container`, and makes its
 * `[data-scroll-cue]` buttons page the list.
 */
export class ScrollCues {
  readonly #container: HTMLElement;
  readonly #list: HTMLElement;
  readonly #resizeObserver: ResizeObserver | undefined;

  constructor(container: HTMLElement, list: HTMLElement) {
    this.#container = container;
    this.#list = list;
    list.addEventListener('scroll', this.refresh, { passive: true });
    container.addEventListener('click', this.#handleCueClick);
    this.#resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(this.refresh)
      : undefined;
    this.#resizeObserver?.observe(list);
    this.refresh();
  }

  readonly refresh = (): void => {
    const state = getScrollCueState(this.#list);
    this.#container.classList.toggle('can-scroll-up', state.canScrollUp);
    this.#container.classList.toggle('can-scroll-down', state.canScrollDown);
  };

  destroy(): void {
    this.#list.removeEventListener('scroll', this.refresh);
    this.#container.removeEventListener('click', this.#handleCueClick);
    this.#resizeObserver?.disconnect();
  }

  readonly #handleCueClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const cue = event.target.closest<HTMLElement>('[data-scroll-cue]');
    if (!cue || !this.#container.contains(cue)) return;
    event.stopPropagation();
    const direction = cue.dataset.scrollCue === 'up' ? -1 : 1;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.#list.scrollBy({
      top: direction * this.#list.clientHeight * 0.8,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };
}
