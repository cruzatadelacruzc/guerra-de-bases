/**
 * Decides when the enemy AI takes a turn from the gameplay time it is given.
 * It never reads a wall clock, so time that is not passed in (a pause) does
 * not exist for it. At most one decision per call; after deciding, the
 * remainder carries over but is capped at half an interval so a slow frame
 * cannot chain decisions on the frames that follow. Game frames are capped
 * at 0.1 s, below half of every interval, so the cap never alters normal play.
 */
export class DecisionClock {
  readonly #intervalSeconds: number;
  #elapsedSeconds = 0;

  constructor(intervalSeconds: number) {
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      throw new RangeError('Decision interval must be a positive, finite number of seconds');
    }
    this.#intervalSeconds = intervalSeconds;
  }

  /** Adds elapsed gameplay time; true when a decision is due. */
  advance(deltaSeconds: number): boolean {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError('Decision clock delta must be a finite, non-negative number');
    }
    this.#elapsedSeconds += deltaSeconds;
    if (this.#elapsedSeconds < this.#intervalSeconds) return false;
    this.#elapsedSeconds = Math.min(this.#elapsedSeconds - this.#intervalSeconds, this.#intervalSeconds / 2);
    return true;
  }
}
