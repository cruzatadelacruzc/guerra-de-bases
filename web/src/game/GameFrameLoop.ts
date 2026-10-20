export interface FrameTiming {
  deltaSeconds: number;
  elapsedSeconds: number;
}

export interface FrameScheduler {
  request(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
}

const MAX_FRAME_DELTA_SECONDS = 0.1;

const browserScheduler: FrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle),
};

export class GameFrameLoop {
  readonly #scheduler: FrameScheduler;
  readonly #onFrame: (timing: FrameTiming) => void;
  #running = false;
  #frameHandle: number | undefined;
  #previousTimestamp: number | undefined;
  #elapsedSeconds = 0;

  constructor(onFrame: (timing: FrameTiming) => void, scheduler = browserScheduler) {
    this.#onFrame = onFrame;
    this.#scheduler = scheduler;
  }

  get running(): boolean {
    return this.#running;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#schedule();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    if (this.#frameHandle !== undefined) {
      this.#scheduler.cancel(this.#frameHandle);
      this.#frameHandle = undefined;
    }
    this.#previousTimestamp = undefined;
  }

  resetDelta(): void {
    this.#previousTimestamp = undefined;
  }

  #schedule(): void {
    this.#frameHandle = this.#scheduler.request(this.#handleFrame);
  }

  #handleFrame = (timestamp: number): void => {
    this.#frameHandle = undefined;
    if (!this.#running) return;

    const deltaSeconds = this.#previousTimestamp === undefined
      ? 0
      : Math.min((timestamp - this.#previousTimestamp) / 1000, MAX_FRAME_DELTA_SECONDS);
    this.#previousTimestamp = timestamp;
    this.#elapsedSeconds += deltaSeconds;
    this.#onFrame({ deltaSeconds, elapsedSeconds: this.#elapsedSeconds });

    if (this.#running) this.#schedule();
  };
}
