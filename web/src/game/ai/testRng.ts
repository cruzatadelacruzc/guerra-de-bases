import type { Rng } from './enemyAi.ts';

/** Test-only: returns the given values in order and throws when asked for one more. */
export function sequenceRng(values: readonly number[]): Rng & { remaining: number } {
  const next = Object.assign((): number => {
    if (next.remaining === 0) {
      throw new Error(`The AI drew random value #${values.length + 1}; only ${values.length} were scripted`);
    }
    const value = values[values.length - next.remaining];
    next.remaining--;
    return value;
  }, { remaining: values.length });
  return next;
}
