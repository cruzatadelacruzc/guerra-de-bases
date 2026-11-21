/**
 * Test-only: the strike timeline as GameApplication.ts had it at f54dc77 (blob 9bff6f4, identical
 * at 71890e9), transcribed line by line so the R5 domain can be compared against it:
 * triggerArtilleryStrike, updateActiveArtillery, triggerAirStrikeForFaction, updateActiveAirStrikes
 * (≈2078-2340), getRewardTargetCandidates and applyDamage (≈1926-1968), and clearActiveRewardEffects.
 *
 * Removed: meshes, scene, combatEffects, createCinematicExplosion, SFX, haptics, ballisticPoint (and
 * the shell's apexHeight, which only fed it), orientAircraftAlongFlightPath and disposeVisualTree.
 * Changed: THREE.Vector3 is a plain { x, y, z }; THREE.MathUtils.lerp is (1 - t) * a + t * b; the
 * aircraft mesh's position is a plain position (the bomb release reads its height); the shell's
 * `if (!impact.projectile)` is the boolean `launched`; the Nexus visual's position is the base's ECS
 * transform. Candidates run the same ECS query, with `targetObjects.get(entity)` replaced by "exists
 * and is not the Nexus" (design §3.4). applyDamage calls applyRewardDamage with the `nowMs` given to
 * `update` and records how much health each hit took. Added: the strike number, impact index and the
 * per-impact record.
 */
import { COMPONENTS, FACTIONS } from '../ecs/components.ts';
import type { Entity, Faction, Position } from '../ecs/components.ts';
import { ENEMY_BASE_POSITION, PLAYER_BASE_POSITION } from '../ecs/initialBattle.ts';
import type { World } from '../ecs/World.ts';
import {
  AIR_STRIKE_BOMB_OFFSETS,
  AIR_STRIKE_EFFECTIVE_RADIUS,
  ARTILLERY_IMPACT_OFFSETS,
  ARTILLERY_IMPACT_RADIUS,
  ARTILLERY_LAUNCH_DELAY_SECONDS,
  ARTILLERY_SALVO_INTERVAL_SECONDS,
  ARTILLERY_SHELL_FLIGHT_SECONDS,
  getRewardDefinitionForDifficulty
} from '../rewardSystem.ts';
import type { Difficulty, StrikeAim } from '../rewardSystem.ts';
import type { MatchState } from './MatchState.ts';
import { applyRewardDamage } from './shield.ts';
import type { StrikeHit } from './strikeState.ts';

export interface StrikeImpactRecord {
  readonly frame: number;
  readonly strike: number;
  readonly kind: 'artillery_strike' | 'air_strike';
  readonly faction: Faction;
  readonly index: number;
  readonly x: number;
  readonly z: number;
  readonly hits: readonly StrikeHit[];
}

/** GameApplication.ts local constants at f54dc77. */
const ARTILLERY_MUZZLE_HEIGHT = 5.5;
const ARTILLERY_MUZZLE_SPACING = 1.2;
const AIR_STRIKE_CRUISE_HEIGHT = 8;
const AIR_STRIKE_FLIGHT_ARC_HEIGHT = 1.2;
const AIR_STRIKE_FLIGHT_SECONDS = 5.2;
const AIR_STRIKE_RUN_HALF_LENGTH = 60;
const AIR_STRIKE_BOMB_FALL_SECONDS = 0.72;

function lerp(a: number, b: number, t: number): number {
  return (1 - t) * a + t * b;
}

type ArtilleryImpact = {
  index: number;
  origin: Position;
  point: Position;
  launchAt: number;
  launched: boolean;
  complete: boolean;
};
type ArtilleryEffect = {
  strike: number;
  faction: 'player' | 'enemy';
  elapsed: number;
  impacts: ArtilleryImpact[];
};
type AirStrikeBomb = {
  index: number;
  x: number;
  y: number;
  z: number;
  target: Position;
  elapsed: number;
  released: boolean;
  landed: boolean;
};
type AirStrikeEffect = {
  strike: number;
  faction: 'player' | 'enemy';
  position: Position;
  target: Position;
  start: Position;
  end: Position;
  elapsed: number;
  duration: number;
  bombs: AirStrikeBomb[];
};

export class LegacyRewardTimeline {
  readonly records: StrikeImpactRecord[] = [];
  readonly #world: World;
  readonly #match: MatchState;
  readonly #bases: Readonly<Record<Faction, Entity>>;
  readonly #difficulty: Difficulty;
  readonly #artilleryEffects: ArtilleryEffect[] = [];
  readonly #airStrikeEffects: AirStrikeEffect[] = [];
  #strikes = 0;
  #nowMs = 0;
  #frame = 0;

  constructor(world: World, match: MatchState, bases: Readonly<Record<Faction, Entity>>, difficulty: Difficulty) {
    this.#world = world;
    this.#match = match;
    this.#bases = bases;
    this.#difficulty = difficulty;
  }

  get activeCount(): number {
    return this.#artilleryEffects.length + this.#airStrikeEffects.length;
  }

  /** `animate`: updateActiveArtillery, then updateActiveAirStrikes. */
  update(deltaSeconds: number, nowMs: number, frame: number): void {
    this.#nowMs = nowMs;
    this.#frame = frame;
    this.#updateActiveArtillery(deltaSeconds);
    this.#updateActiveAirStrikes(deltaSeconds);
  }

  /** clearActiveRewardEffects. */
  clear(): void {
    this.#artilleryEffects.length = 0;
    this.#airStrikeEffects.length = 0;
  }

  /** Visual strike impacts still apply their damage here when they land (R5). */
  #getRewardTargetCandidates(faction: 'player' | 'enemy' = FACTIONS.player) {
    const world = this.#world;
    const enemyFaction = faction === FACTIONS.player ? FACTIONS.enemy : FACTIONS.player;
    const candidates: Array<{ position: Position; entity: Entity }> = [];
    for (const entity of world.query(
      COMPONENTS.targetable,
      COMPONENTS.faction,
      COMPONENTS.transform,
      COMPONENTS.health
    )) {
      if (world.getComponent(entity, COMPONENTS.faction) !== enemyFaction) continue;
      const health = world.getComponent(entity, COMPONENTS.health);
      const position = world.getComponent(entity, COMPONENTS.transform);
      const isNexus = world.getComponent(entity, COMPONENTS.building)?.kind === 'hq';
      if (health && health.current > 0 && position && !isNexus) {
        candidates.push({ position, entity });
      }
    }
    return candidates;
  }

  #applyDamage(entity: Entity, amount: number, hits: StrikeHit[]): void {
    const before = this.#world.getComponent(entity, COMPONENTS.health)?.current ?? 0;
    const after = applyRewardDamage(
      this.#world,
      this.#match,
      this.#bases,
      entity,
      amount,
      this.#nowMs,
      this.#difficulty
    ).current;
    hits.push({ entity, healthLoss: before - after });
  }

  /** Fires one shell per impact offset from the faction's Nexus toward the aim point. */
  triggerArtillery(faction: 'player' | 'enemy', aim: StrikeAim): number {
    const strike = ++this.#strikes;
    const base = this.#world.getComponent(this.#bases[faction], COMPONENTS.transform)
      ?? (faction === FACTIONS.player ? PLAYER_BASE_POSITION : ENEMY_BASE_POSITION);
    const middle = (ARTILLERY_IMPACT_OFFSETS.length - 1) / 2;
    this.#artilleryEffects.push({
      strike,
      faction,
      elapsed: 0,
      impacts: ARTILLERY_IMPACT_OFFSETS.map((offset, index) => {
        const origin = {
          x: base.x + (index - middle) * ARTILLERY_MUZZLE_SPACING,
          y: ARTILLERY_MUZZLE_HEIGHT,
          z: base.z
        };
        const point = { x: aim.x + offset.x, y: 0, z: aim.z + offset.z };
        return {
          index,
          origin,
          point,
          launchAt: ARTILLERY_LAUNCH_DELAY_SECONDS + index * ARTILLERY_SALVO_INTERVAL_SECONDS,
          launched: false,
          complete: false
        };
      })
    });
    return strike;
  }

  #updateActiveArtillery(delta: number): void {
    const damage = getRewardDefinitionForDifficulty('artillery_strike', this.#difficulty).damage ?? 120;
    for (let effectIndex = this.#artilleryEffects.length - 1; effectIndex >= 0; effectIndex--) {
      const strike = this.#artilleryEffects[effectIndex];
      strike.elapsed += delta;
      for (const impact of strike.impacts) {
        const flightElapsed = strike.elapsed - impact.launchAt;
        if (flightElapsed < 0 || impact.complete) continue;
        if (!impact.launched) {
          impact.launched = true;
        }
        const flightProgress = Math.min(1, flightElapsed / ARTILLERY_SHELL_FLIGHT_SECONDS);
        if (flightProgress < 1) continue;

        impact.complete = true;
        impact.launched = false;
        const hits: StrikeHit[] = [];
        const candidates = this.#getRewardTargetCandidates(strike.faction);
        for (const candidate of candidates) {
          if (Math.hypot(candidate.position.x - impact.point.x, candidate.position.z - impact.point.z) <= ARTILLERY_IMPACT_RADIUS) {
            this.#applyDamage(candidate.entity, damage, hits);
          }
        }
        this.#record(strike.strike, 'artillery_strike', strike.faction, impact.index, impact.point, hits);
      }
      if (strike.impacts.every((impact) => impact.complete)) this.#artilleryEffects.splice(effectIndex, 1);
    }
  }

  /** `heading` is the unit ground direction of the run; the aircraft is over `target` halfway through. */
  triggerAirStrike(faction: 'player' | 'enemy', target: StrikeAim, heading: StrikeAim): number {
    const strike = ++this.#strikes;
    const targetPoint = { x: target.x, y: 0, z: target.z };
    const start = {
      x: target.x - heading.x * AIR_STRIKE_RUN_HALF_LENGTH,
      y: AIR_STRIKE_CRUISE_HEIGHT,
      z: target.z - heading.z * AIR_STRIKE_RUN_HALF_LENGTH
    };
    const end = {
      x: target.x + heading.x * AIR_STRIKE_RUN_HALF_LENGTH,
      y: AIR_STRIKE_CRUISE_HEIGHT,
      z: target.z + heading.z * AIR_STRIKE_RUN_HALF_LENGTH
    };
    const position = { ...start };

    const bombs = AIR_STRIKE_BOMB_OFFSETS.map((offset, index) => {
      return {
        index,
        x: targetPoint.x + offset.x,
        y: 0,
        z: targetPoint.z + offset.z,
        target: { x: targetPoint.x + offset.x, y: 0, z: targetPoint.z + offset.z },
        elapsed: 0,
        released: false,
        landed: false
      };
    });
    this.#airStrikeEffects.push({
      strike,
      faction,
      position,
      target: targetPoint,
      start,
      end,
      elapsed: 0,
      duration: AIR_STRIKE_FLIGHT_SECONDS,
      bombs
    });
    return strike;
  }

  #updateActiveAirStrikes(delta: number): void {
    const damage = getRewardDefinitionForDifficulty('air_strike', this.#difficulty).damage ?? 220;
    for (let index = this.#airStrikeEffects.length - 1; index >= 0; index--) {
      const strike = this.#airStrikeEffects[index];
      strike.elapsed += delta;
      const progress = Math.min(1, strike.elapsed / strike.duration);
      const x = lerp(strike.start.x, strike.end.x, progress);
      const z = lerp(strike.start.z, strike.end.z, progress);
      strike.position.x = x;
      strike.position.y = AIR_STRIKE_CRUISE_HEIGHT + Math.sin(progress * Math.PI) * AIR_STRIKE_FLIGHT_ARC_HEIGHT;
      strike.position.z = z;

      for (const bomb of strike.bombs) {
        // Each bomb drops as the aircraft passes over its impact point.
        const overTarget = (x - bomb.target.x) * (strike.end.x - strike.start.x)
          + (z - bomb.target.z) * (strike.end.z - strike.start.z) >= 0;
        if (!bomb.released && overTarget) {
          bomb.released = true;
          bomb.x = x;
          bomb.y = strike.position.y - 0.6;
          bomb.z = z;
        }
        if (!bomb.released || bomb.landed) continue;
        bomb.elapsed += delta;
        const fallProgress = Math.min(1, bomb.elapsed / AIR_STRIKE_BOMB_FALL_SECONDS);
        if (fallProgress < 1) continue;

        bomb.landed = true;
        const impact = { x: bomb.target.x, y: 0, z: bomb.target.z };
        const hits: StrikeHit[] = [];
        for (const candidate of this.#getRewardTargetCandidates(strike.faction)) {
          if (Math.hypot(candidate.position.x - impact.x, candidate.position.z - impact.z) <= AIR_STRIKE_EFFECTIVE_RADIUS) {
            this.#applyDamage(candidate.entity, damage, hits);
          }
        }
        this.#record(strike.strike, 'air_strike', strike.faction, bomb.index, impact, hits);
      }

      if (progress >= 1 && strike.bombs.every((bomb) => bomb.landed)) {
        this.#airStrikeEffects.splice(index, 1);
      }
    }
  }

  #record(
    strike: number,
    kind: StrikeImpactRecord['kind'],
    faction: Faction,
    index: number,
    point: Readonly<Position>,
    hits: readonly StrikeHit[]
  ): void {
    this.records.push({ frame: this.#frame, strike, kind, faction, index, x: point.x, z: point.z, hits });
  }
}
