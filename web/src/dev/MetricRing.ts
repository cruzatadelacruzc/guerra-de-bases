export interface MetricSummary {
  count: number;
  average: number;
  p95: number;
  maximum: number;
  last: number;
}

interface Series {
  values: Float64Array;
  /** Index the next sample is written to. */
  next: number;
  count: number;
}

/**
 * Fixed-capacity sample history per metric. Each metric allocates its buffer
 * once, on its first sample, so recording every frame allocates nothing.
 */
export class MetricRing {
  readonly capacity: number;
  readonly #series = new Map<string, Series>();
  readonly #scratch: Float64Array;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('Metric capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.#scratch = new Float64Array(capacity);
  }

  record(name: string, value: number): void {
    let series = this.#series.get(name);
    if (!series) {
      series = { values: new Float64Array(this.capacity), next: 0, count: 0 };
      this.#series.set(name, series);
    }
    series.values[series.next] = value;
    series.next = (series.next + 1) % this.capacity;
    if (series.count < this.capacity) series.count++;
  }

  /** Summarizes the latest `latest` samples (all stored samples by default). */
  summary(name: string, latest = this.capacity): MetricSummary {
    const series = this.#series.get(name);
    const count = series ? Math.min(series.count, Math.max(0, Math.floor(latest))) : 0;
    if (!series || count === 0) return { count: 0, average: 0, p95: 0, maximum: 0, last: 0 };

    let sum = 0;
    let maximum = -Infinity;
    for (let offset = 1; offset <= count; offset++) {
      const value = series.values[(series.next - offset + this.capacity) % this.capacity];
      this.#scratch[offset - 1] = value;
      sum += value;
      if (value > maximum) maximum = value;
    }
    const sorted = this.#scratch.subarray(0, count).sort();
    return {
      count,
      average: sum / count,
      p95: sorted[Math.min(count - 1, Math.floor(count * 0.95))],
      maximum,
      last: series.values[(series.next - 1 + this.capacity) % this.capacity]
    };
  }

  names(): string[] {
    return [...this.#series.keys()];
  }

  clear(): void {
    for (const series of this.#series.values()) {
      series.next = 0;
      series.count = 0;
    }
  }
}
