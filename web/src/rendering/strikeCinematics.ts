import {
  AIR_STRIKE_BOMB_OFFSETS,
  ARTILLERY_IMPACT_OFFSETS,
  ARTILLERY_LAUNCH_DELAY_SECONDS,
  ARTILLERY_SALVO_INTERVAL_SECONDS,
  ARTILLERY_SHELL_FLIGHT_SECONDS,
  artilleryStrikeDurationSeconds,
  nominalBombLandingSeconds,
  type StrikeAim
} from '../game/rewardSystem.ts';
import type { CameraShot } from './MapCameraController.ts';

export const ARTILLERY_CAMERA_NEXUS_DISTANCE = 38;
export const ARTILLERY_CAMERA_IMPACT_DISTANCE = 50;
export const AIR_STRIKE_CAMERA_LEAD_SECONDS = 1;
export const AIR_STRIKE_CAMERA_DISTANCE = 45;

/** Show the salvo leaving the Nexus, then follow it to the impact zone. */
export function artilleryShots(
  nexus: Readonly<{ x: number; z: number }>,
  impactCenter: Readonly<StrikeAim>
): CameraShot[] {
  const shellCount = ARTILLERY_IMPACT_OFFSETS.length;
  const firstImpactAt = ARTILLERY_LAUNCH_DELAY_SECONDS + ARTILLERY_SHELL_FLIGHT_SECONDS;
  // Stay on the Nexus until the second shell is out, then arrive just before the first lands.
  const leaveNexusAt = ARTILLERY_LAUNCH_DELAY_SECONDS + ARTILLERY_SALVO_INTERVAL_SECONDS + 0.1;
  const arriveAt = firstImpactAt - 0.15;
  return [
    {
      x: nexus.x,
      z: nexus.z,
      durationSeconds: ARTILLERY_LAUNCH_DELAY_SECONDS,
      holdSeconds: leaveNexusAt - ARTILLERY_LAUNCH_DELAY_SECONDS,
      distance: ARTILLERY_CAMERA_NEXUS_DISTANCE
    },
    {
      x: impactCenter.x,
      z: impactCenter.z,
      durationSeconds: arriveAt - leaveNexusAt,
      holdSeconds: artilleryStrikeDurationSeconds(shellCount) - arriveAt + 0.8,
      distance: ARTILLERY_CAMERA_IMPACT_DISTANCE
    }
  ];
}

/** Reach the target before the aircraft so its bombs are seen leaving it. */
export function airStrikeShots(target: Readonly<StrikeAim>, heading: Readonly<StrikeAim>): CameraShot[] {
  // The bomb furthest along the run drops, and lands, last.
  const lastLandingAt = Math.max(...AIR_STRIKE_BOMB_OFFSETS.map((offset) => nominalBombLandingSeconds(offset, heading)));
  return [
    {
      x: target.x,
      z: target.z,
      durationSeconds: AIR_STRIKE_CAMERA_LEAD_SECONDS,
      holdSeconds: lastLandingAt + 0.6 - AIR_STRIKE_CAMERA_LEAD_SECONDS,
      distance: AIR_STRIKE_CAMERA_DISTANCE
    }
  ];
}
