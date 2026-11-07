export interface ArcPoint {
  x: number;
  y: number;
  z: number;
}

const APEX_PER_DISTANCE = 0.35;
const MIN_APEX_HEIGHT = 10;
const MAX_APEX_HEIGHT = 40;

/** Height a shell climbs above the straight line between its ends, growing with the horizontal range. */
export function apexHeightFor(origin: Readonly<ArcPoint>, target: Readonly<ArcPoint>): number {
  const distance = Math.hypot(target.x - origin.x, target.z - origin.z);
  return Math.min(MAX_APEX_HEIGHT, Math.max(MIN_APEX_HEIGHT, distance * APEX_PER_DISTANCE));
}

/**
 * Position along a parabolic arc at `t` in [0, 1]: straight across the ground,
 * rising `apexHeight` above the line between the ends at the midpoint.
 */
export function ballisticPoint<T extends ArcPoint>(
  origin: Readonly<ArcPoint>,
  target: Readonly<ArcPoint>,
  apexHeight: number,
  t: number,
  out: T
): T {
  const progress = Math.min(1, Math.max(0, t));
  out.x = origin.x + (target.x - origin.x) * progress;
  out.z = origin.z + (target.z - origin.z) * progress;
  out.y = origin.y + (target.y - origin.y) * progress + 4 * apexHeight * progress * (1 - progress);
  return out;
}
