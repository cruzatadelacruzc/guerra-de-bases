import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';

export type VibrateFn = (durationMs: number) => void;

export interface HapticFeedback {
  /** Short pulse for each reward-strike impact (artillery shell or air-strike bomb). */
  strikeImpact(): void;
  /** Long pulse when a Nexus is destroyed. */
  nexusDestroyed(): void;
}

export interface HapticFeedbackOptions {
  vibrate: VibrateFn;
  /** Milliseconds clock; injectable so throttling is testable. */
  now: () => number;
}

export const STRIKE_IMPACT_DURATION_MS = 60;
/** Bombs land a few frames apart; without this gap they merge into one long buzz. */
export const STRIKE_IMPACT_MIN_INTERVAL_MS = 90;
export const NEXUS_DESTROYED_DURATION_MS = 400;

export function createHapticFeedback({ vibrate, now }: HapticFeedbackOptions): HapticFeedback {
  let lastStrikeAt = Number.NEGATIVE_INFINITY;

  const safeVibrate = (durationMs: number): void => {
    try {
      vibrate(durationMs);
    } catch {
      // Haptics are cosmetic; a missing motor must never break the match.
    }
  };

  return {
    strikeImpact() {
      const time = now();
      if (time - lastStrikeAt < STRIKE_IMPACT_MIN_INTERVAL_MS) return;
      lastStrikeAt = time;
      safeVibrate(STRIKE_IMPACT_DURATION_MS);
    },
    nexusDestroyed() {
      lastStrikeAt = now();
      safeVibrate(NEXUS_DESTROYED_DURATION_MS);
    }
  };
}

/**
 * Native builds use the Capacitor Haptics plugin (Android `Vibrator` service, declares
 * the VIBRATE permission). Plain duration vibration is used instead of amplitude-based
 * effects because many low-end Android devices lack amplitude control.
 */
export function createPlatformVibrate(): VibrateFn {
  if (Capacitor.isNativePlatform()) {
    return (durationMs) => {
      void Haptics.vibrate({ duration: durationMs }).catch(() => undefined);
    };
  }
  return (durationMs) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(durationMs);
    }
  };
}
