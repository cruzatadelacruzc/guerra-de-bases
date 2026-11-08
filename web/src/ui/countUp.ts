export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** The value shown at `progress` (0..1, clamped) of a count from 0 to `target`. */
export function countValueAt(target: number, progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return Math.round(target * easeOutCubic(clamped));
}

/** Seconds in an "mm:ss" match duration (minutes may exceed 99), or null if malformed. */
export function parseClockDuration(text: string): number | null {
  const match = /^(\d+):([0-5]\d)$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Same "mm:ss" format GameApplication uses for the match duration. */
export function formatClockDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export interface CountUpTarget {
  element: { textContent: string | null };
  to: number;
  format(value: number): string;
}

export interface FrameScheduler {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
  now(): number;
}

const browserScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

/** Counts several numbers up from 0 together; a new start cancels the previous one. */
export class CountUpAnimator {
  readonly #scheduler: FrameScheduler;
  #frame: number | undefined;

  constructor(scheduler: FrameScheduler = browserScheduler) {
    this.#scheduler = scheduler;
  }

  start(
    targets: readonly CountUpTarget[],
    options: { durationMs: number; reducedMotion: boolean }
  ): void {
    this.cancel();
    if (options.reducedMotion || options.durationMs <= 0) {
      for (const target of targets) target.element.textContent = target.format(target.to);
      return;
    }
    const startedAt = this.#scheduler.now();
    for (const target of targets) target.element.textContent = target.format(0);
    const tick = (now: number): void => {
      const progress = (now - startedAt) / options.durationMs;
      for (const target of targets) {
        target.element.textContent = target.format(countValueAt(target.to, progress));
      }
      this.#frame = progress < 1 ? this.#scheduler.request(tick) : undefined;
    };
    this.#frame = this.#scheduler.request(tick);
  }

  cancel(): void {
    if (this.#frame === undefined) return;
    this.#scheduler.cancel(this.#frame);
    this.#frame = undefined;
  }
}
