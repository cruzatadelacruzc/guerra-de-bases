/** Damage (percent of the rival Nexus) from which a defeat counts as "close". */
export const CLOSE_DEFEAT_DAMAGE_PERCENT = 50;

/** A short line that turns a close defeat into a reason to retry, or null. */
export function getRetryHint(victory: boolean, damagePercent: number): string | null {
  if (victory || !Number.isFinite(damagePercent)) return null;
  if (damagePercent < CLOSE_DEFEAT_DAMAGE_PERCENT || damagePercent >= 100) return null;
  return `¡Casi lo tumbas! Te faltó un ${100 - Math.round(damagePercent)}%.`;
}
