export const CAMERA_SHAKE_DECAY_PER_SECOND = 4;

/**
 * Jitters `position` by up to ±shake/2 on each axis and returns the shake left
 * after decaying it for `deltaSeconds`. Zero shake leaves the position untouched.
 */
export function applyCameraShake(
  position: { x: number; y: number; z: number },
  shake: number,
  deltaSeconds: number,
  random: () => number = Math.random
): number {
  if (shake <= 0) return 0;
  position.x += (random() - 0.5) * shake;
  position.y += (random() - 0.5) * shake;
  position.z += (random() - 0.5) * shake;
  return Math.max(0, shake - deltaSeconds * CAMERA_SHAKE_DECAY_PER_SECOND);
}
