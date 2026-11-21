import { COMPONENTS } from '../ecs/components.ts';
import type { Entity, Faction } from '../ecs/components.ts';
import type { World } from '../ecs/World.ts';
import {
  AIR_STRIKE_BOMB_FALL_SECONDS,
  AIR_STRIKE_BOMB_OFFSETS,
  AIR_STRIKE_FLIGHT_SECONDS,
  AIR_STRIKE_RUN_HALF_LENGTH,
  ARTILLERY_IMPACT_OFFSETS,
  ARTILLERY_LAUNCH_DELAY_SECONDS,
  ARTILLERY_SALVO_INTERVAL_SECONDS,
  ARTILLERY_SHELL_FLIGHT_SECONDS,
  artilleryStrikeDurationSeconds,
  getRewardDefinitionForDifficulty,
  getStrikePattern
} from '../rewardSystem.ts';
import type { Difficulty, StrikeAim, StrikeId } from '../rewardSystem.ts';
import type { MatchState } from './MatchState.ts';
import { applyRewardDamage } from './shield.ts';
import type { ActiveStrike } from './strikeState.ts';
import { isStrikeTarget } from './strikeTargets.ts';

/** What happened to the strikes in one frame, for the presentation; the damage never depends on it. */
export type StrikeEvent =
  | { type: 'shell-launched'; strikeId: number; faction: Faction; index: number }
  | { type: 'bomb-released'; strikeId: number; faction: Faction; index: number }
  | { type: 'impact'; strikeId: number; faction: Faction; kind: StrikeId; index: number; x: number; z: number }
  | { type: 'strike-finished'; strikeId: number };

/** Damage per impact when the reward definition does not give one (the values GameApplication used). */
const FALLBACK_DAMAGE: Readonly<Record<StrikeId, number>> = Object.freeze({ artillery_strike: 120, air_strike: 220 });

/** THREE.MathUtils.lerp, literally. */
function lerp(a: number, b: number, t: number): number {
  return (1 - t) * a + t * b;
}

/**
 * Starts a strike on the gameplay clock and marks until when it shows as active. Aim, heading,
 * impact points, damage and radius are fixed here. An air strike needs the unit heading of its run.
 */
export function scheduleStrike(
  match: MatchState,
  faction: Faction,
  id: StrikeId,
  aim: StrikeAim,
  heading: Readonly<StrikeAim> | undefined,
  difficulty: Difficulty,
  nowMs: number
): ActiveStrike {
  const base = {
    id: match.strikes.nextId,
    faction,
    aimX: aim.x,
    aimZ: aim.z,
    damagePerImpact: getRewardDefinitionForDifficulty(id, difficulty).damage ?? FALLBACK_DAMAGE[id],
    radius: getStrikePattern(id, difficulty).radius,
    startedAtMs: nowMs,
    elapsedSeconds: 0
  };
  let strike: ActiveStrike;
  let durationSeconds: number;
  if (id === 'artillery_strike') {
    strike = {
      ...base,
      kind: 'artillery_strike',
      shells: ARTILLERY_IMPACT_OFFSETS.map((offset, index) => ({
        x: aim.x + offset.x,
        z: aim.z + offset.z,
        launchAtSeconds: ARTILLERY_LAUNCH_DELAY_SECONDS + index * ARTILLERY_SALVO_INTERVAL_SECONDS,
        launched: false,
        landed: false
      }))
    };
    durationSeconds = artilleryStrikeDurationSeconds(ARTILLERY_IMPACT_OFFSETS.length);
  } else {
    // Nothing has been written to the match yet, so a missing heading leaves it untouched.
    if (heading === undefined) throw new Error('An air strike needs a heading');
    strike = {
      ...base,
      kind: 'air_strike',
      heading: Object.freeze({ x: heading.x, z: heading.z }),
      startX: aim.x - heading.x * AIR_STRIKE_RUN_HALF_LENGTH,
      startZ: aim.z - heading.z * AIR_STRIKE_RUN_HALF_LENGTH,
      endX: aim.x + heading.x * AIR_STRIKE_RUN_HALF_LENGTH,
      endZ: aim.z + heading.z * AIR_STRIKE_RUN_HALF_LENGTH,
      bombs: AIR_STRIKE_BOMB_OFFSETS.map((offset) => ({
        x: aim.x + offset.x,
        z: aim.z + offset.z,
        released: false,
        releaseX: 0,
        releaseZ: 0,
        releaseProgress: 0,
        fallElapsedSeconds: 0,
        landed: false
      }))
    };
    durationSeconds = AIR_STRIKE_FLIGHT_SECONDS;
  }
  match.strikes.nextId++;
  match.strikes.active.push(strike);
  match.rewards[faction].strikeActiveUntilMs[id] = nowMs + durationSeconds * 1000;
  return strike;
}

interface DueImpact {
  readonly strike: ActiveStrike;
  readonly index: number;
  /** When, inside the frame, the impact's counter crossed its threshold. */
  readonly nominalMs: number;
}

function compareDue(a: DueImpact, b: DueImpact): number {
  return a.nominalMs - b.nominalMs || a.strike.id - b.strike.id || a.index - b.index;
}

function isFinished(strike: ActiveStrike): boolean {
  if (strike.kind === 'artillery_strike') {
    for (const shell of strike.shells) if (!shell.landed) return false;
    return true;
  }
  if (Math.min(1, strike.elapsedSeconds / AIR_STRIKE_FLIGHT_SECONDS) < 1) return false;
  for (const bomb of strike.bombs) if (!bomb.landed) return false;
  return true;
}

function applyImpact(
  world: World,
  match: MatchState,
  bases: Readonly<Record<Faction, Entity>>,
  strike: ActiveStrike,
  x: number,
  z: number,
  nowMs: number,
  difficulty: Difficulty
): void {
  for (const entity of world.query(COMPONENTS.targetable, COMPONENTS.faction, COMPONENTS.transform, COMPONENTS.health)) {
    if (!isStrikeTarget(world, entity, strike.faction)) continue;
    const position = world.getComponent(entity, COMPONENTS.transform);
    if (!position) continue;
    if (Math.hypot(position.x - x, position.z - z) <= strike.radius) {
      applyRewardDamage(world, match, bases, entity, strike.damagePerImpact, nowMs, difficulty);
    }
  }
}

/**
 * Advances every strike in flight by one frame of `deltaSeconds`, which ends at `nowMs`, the way
 * GameApplication's animation did: each impact lands on the same frame as before, exactly once.
 * The impacts that fall due in the frame are applied in nominal-time order (then strike id, then
 * index) against the targets of that moment. `events` is emptied and then filled for the
 * presentation, after the damage.
 */
export function advanceStrikes(
  world: World,
  match: MatchState,
  bases: Readonly<Record<Faction, Entity>>,
  deltaSeconds: number,
  nowMs: number,
  difficulty: Difficulty,
  events: StrikeEvent[]
): void {
  events.length = 0;
  if (match.outcome !== null) return;
  const active = match.strikes.active;
  if (active.length === 0) return;
  const frameStartMs = nowMs - deltaSeconds * 1000;
  let due: DueImpact[] | undefined;

  for (const strike of active) {
    const before = strike.elapsedSeconds;
    strike.elapsedSeconds += deltaSeconds;
    if (strike.kind === 'artillery_strike') {
      for (let index = 0; index < strike.shells.length; index++) {
        const shell = strike.shells[index];
        const flight = strike.elapsedSeconds - shell.launchAtSeconds;
        if (flight < 0 || shell.landed) continue;
        if (!shell.launched) {
          shell.launched = true;
          events.push({ type: 'shell-launched', strikeId: strike.id, faction: strike.faction, index });
        }
        if (Math.min(1, flight / ARTILLERY_SHELL_FLIGHT_SECONDS) < 1) continue;
        shell.landed = true;
        (due ??= []).push({
          strike,
          index,
          nominalMs: frameStartMs + (shell.launchAtSeconds + ARTILLERY_SHELL_FLIGHT_SECONDS - before) * 1000
        });
      }
      continue;
    }
    const progress = Math.min(1, strike.elapsedSeconds / AIR_STRIKE_FLIGHT_SECONDS);
    const x = lerp(strike.startX, strike.endX, progress);
    const z = lerp(strike.startZ, strike.endZ, progress);
    for (let index = 0; index < strike.bombs.length; index++) {
      const bomb = strike.bombs[index];
      // Each bomb drops as the aircraft passes over its impact point.
      if (!bomb.released
        && (x - bomb.x) * (strike.endX - strike.startX) + (z - bomb.z) * (strike.endZ - strike.startZ) >= 0) {
        bomb.released = true;
        bomb.releaseX = x;
        bomb.releaseZ = z;
        bomb.releaseProgress = progress;
        events.push({ type: 'bomb-released', strikeId: strike.id, faction: strike.faction, index });
      }
      if (!bomb.released || bomb.landed) continue;
      const fallBefore = bomb.fallElapsedSeconds;
      bomb.fallElapsedSeconds += deltaSeconds;
      if (Math.min(1, bomb.fallElapsedSeconds / AIR_STRIKE_BOMB_FALL_SECONDS) < 1) continue;
      bomb.landed = true;
      (due ??= []).push({
        strike,
        index,
        nominalMs: frameStartMs + (AIR_STRIKE_BOMB_FALL_SECONDS - fallBefore) * 1000
      });
    }
  }

  if (due !== undefined) {
    due.sort(compareDue);
    for (const { strike, index } of due) {
      const point = strike.kind === 'artillery_strike' ? strike.shells[index] : strike.bombs[index];
      applyImpact(world, match, bases, strike, point.x, point.z, nowMs, difficulty);
      events.push({ type: 'impact', strikeId: strike.id, faction: strike.faction, kind: strike.kind, index, x: point.x, z: point.z });
    }
  }

  // An air strike also ends on a frame without impacts: when the aircraft finishes its run.
  let kept = 0;
  for (const strike of active) {
    if (isFinished(strike)) events.push({ type: 'strike-finished', strikeId: strike.id });
    else active[kept++] = strike;
  }
  active.length = kept;
}

/** Drops every strike in flight; nothing pending lands afterwards. */
export function clearStrikes(match: MatchState): void {
  match.strikes.active.length = 0;
}
