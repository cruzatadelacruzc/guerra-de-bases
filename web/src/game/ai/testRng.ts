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

/** Test-only: a seeded mulberry32 generator, so long AI runs repeat exactly. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
