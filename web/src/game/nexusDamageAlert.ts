export const NEXUS_DAMAGE_ALERT_COOLDOWN_MS = 6000;

export interface NexusDamageAlert {
  /** Returns true when the Nexus lost health and the alert is off cooldown. */
  report(previousHp: number, currentHp: number, nowMs: number): boolean;
  reset(): void;
}

export function createNexusDamageAlert(cooldownMs = NEXUS_DAMAGE_ALERT_COOLDOWN_MS): NexusDamageAlert {
  let lastAlertAt = Number.NEGATIVE_INFINITY;
  return {
    report(previousHp, currentHp, nowMs) {
      if (currentHp >= previousHp) return false;
      if (nowMs - lastAlertAt < cooldownMs) return false;
      lastAlertAt = nowMs;
      return true;
    },
    reset() {
      lastAlertAt = Number.NEGATIVE_INFINITY;
    }
  };
}
