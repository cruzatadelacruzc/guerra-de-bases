/**
 * Test-only: strike worlds, frame-delta sequences and a frame loop that repeats the order of
 * `animate` (design §3.3), so a strike implementation can be run and compared frame by frame.
 * The battle simulation is created but never advanced: only the strikes change health.
 */
import { seededRng } from '../ai/testRng.ts';
import { BattleSimulation } from '../ecs/BattleSimulation.ts';
import { COMPONENTS } from '../ecs/components.ts';
import type { Entity, Faction, SoldierKind } from '../ecs/components.ts';
import { createSoldier, createSoldierFactory, createStructure, SOLDIER_PRODUCTION } from '../ecs/initialBattle.ts';
import type { World } from '../ecs/World.ts';
import { STRUCTURE_DEFINITIONS } from '../definitions/structures.ts';
import type { Difficulty, StrikeAim } from '../rewardSystem.ts';
import { DeathResolver } from './DeathResolver.ts';
import { LegacyRewardTimeline } from './legacyRewardTimeline.ts';
import type { StrikeImpactRecord } from './legacyRewardTimeline.ts';
import { createMatchState } from './MatchState.ts';
import type { MatchOutcome, MatchState } from './MatchState.ts';

type StrikeKind = 'artillery_strike' | 'air_strike';

/** A frame's gameplay delta in seconds; 'paused' is a frame with no update and no clock. */
export type FrameDelta = number | 'paused';

const MIN_SEQUENCE_SECONDS = 8;

/** Repeats `next()` until the non-paused deltas cover at least `MIN_SEQUENCE_SECONDS`. */
function sequence(start: readonly FrameDelta[], next: () => number): readonly FrameDelta[] {
  const deltas = [...start];
  let total = 0;
  for (const delta of deltas) if (delta !== 'paused') total += delta;
  while (total < MIN_SEQUENCE_SECONDS) {
    const delta = next();
    deltas.push(delta);
    total += delta;
  }
  return Object.freeze(deltas);
}

function jitter(): () => number {
  const rng = seededRng(5);
  return () => 1 / 240 + rng() * (0.1 - 1 / 240);
}

function pausedSixty(): readonly FrameDelta[] {
  const deltas: FrameDelta[] = Array.from({ length: 120 }, () => 1 / 60);
  for (let i = 0; i < 90; i++) deltas.push('paused');
  return sequence(deltas, () => 1 / 60);
}

export const DELTA_SEQUENCES: Readonly<Record<'fixed60' | 'fixed30' | 'clamp' | 'jitter' | 'paused' | 'huge', readonly FrameDelta[]>> =
  Object.freeze({
    fixed60: sequence([], () => 1 / 60),
    fixed30: sequence([], () => 1 / 30),
    clamp: sequence([], () => 0.1),
    jitter: sequence([], jitter()),
    paused: pausedSixty(),
    huge: Object.freeze([1 / 60, 10, ...Array.from({ length: 30 }, () => 1 / 60)])
  });

export interface StrikeWorld {
  readonly world: World;
  readonly bases: Readonly<Record<Faction, Entity>>;
  match: MatchState;
  readonly difficulty: Difficulty;
}

/** A fresh battle (both Nexuses) that is never advanced, with a new match. */
export function createStrikeWorld(difficulty: Difficulty = 'normal'): StrikeWorld {
  const simulation = new BattleSimulation();
  return {
    world: simulation.world,
    bases: { player: simulation.playerBase, enemy: simulation.enemyBase },
    match: createMatchState(),
    difficulty
  };
}

export function addUnit(w: StrikeWorld, faction: Faction, x: number, z: number, kind: SoldierKind = 'rifleman'): Entity {
  const definition = SOLDIER_PRODUCTION[kind];
  return createSoldier(w.world, faction, { x, y: 0, z }, definition.speed, definition.range, definition.health, kind);
}

export function addBuilding(
  w: StrikeWorld,
  faction: Faction,
  kind: 'generator' | 'barracks' | 'turret',
  x: number,
  z: number
): Entity {
  const at = { x, y: 0, z };
  const health = STRUCTURE_DEFINITIONS[kind].health;
  return kind === 'barracks'
    ? createSoldierFactory(w.world, faction, at, health)
    : createStructure(w.world, faction, at, health, kind);
}

export interface FrameState {
  readonly frame: number;
  /** Entities alive after the frame's deaths were resolved, with their health. */
  readonly health: ReadonlyArray<readonly [Entity, number]>;
  readonly combatPoints: Record<Faction, number>;
  readonly killStreak: Record<Faction, number>;
  readonly outcome: MatchOutcome | null;
  readonly targetsAtFrameStart: ReadonlyArray<{ entity: Entity; faction: Faction; x: number; z: number }>;
}

/** One strike implementation (the legacy reference or the domain). */
export interface StrikeDriver {
  activate(
    w: StrikeWorld,
    faction: Faction,
    kind: StrikeKind,
    aim: StrikeAim,
    heading: StrikeAim | undefined,
    nowMs: number
  ): void;
  update(w: StrikeWorld, deltaSeconds: number, nowMs: number, frame: number): void;
  newMatch(w: StrikeWorld): void;
  records(): readonly StrikeImpactRecord[];
}

export interface ScenarioStep {
  /** Gameplay time: the step runs on the first frame whose clock, after adding its delta, reaches `atMs`. */
  readonly atMs: number;
  /** 'between-frames' (the player): before the clock is advanced; 'inside-frame' (the AI): after. */
  readonly when: 'between-frames' | 'inside-frame';
  readonly action:
    | { type: 'activate'; faction: Faction; kind: StrikeKind; aim: StrikeAim; heading?: StrikeAim }
    | { type: 'move'; entity: Entity; x: number; z: number }
    | { type: 'add-unit'; faction: Faction; x: number; z: number }
    | { type: 'set-health'; entity: Entity | 'player-hq' | 'enemy-hq'; current: number }
    | { type: 'new-match' };
}

const TARGET_QUERY = [COMPONENTS.targetable, COMPONENTS.faction, COMPONENTS.transform, COMPONENTS.health] as const;

function livingTargets(world: World): FrameState['targetsAtFrameStart'] {
  const targets: Array<{ entity: Entity; faction: Faction; x: number; z: number }> = [];
  for (const entity of world.query(...TARGET_QUERY)) {
    const health = world.getComponent(entity, COMPONENTS.health);
    const faction = world.getComponent(entity, COMPONENTS.faction);
    const position = world.getComponent(entity, COMPONENTS.transform);
    if (!health || health.current <= 0 || !faction || !position) continue;
    targets.push({ entity, faction, x: position.x, z: position.z });
  }
  return targets;
}

function livingHealth(world: World): FrameState['health'] {
  const health: Array<readonly [Entity, number]> = [];
  for (const entity of world.query(COMPONENTS.health)) {
    const current = world.getComponent(entity, COMPONENTS.health)?.current ?? 0;
    health.push([entity, current]);
  }
  return health;
}

/**
 * Runs `deltas` in the order of `animate`, frame by frame:
 * 1. a 'paused' entry does nothing (pending steps wait);
 * 2. pending 'between-frames' steps with `atMs ≤ nowMs + delta·1000` run, the clock not yet advanced;
 * 3. `nowMs += delta·1000`;
 * 4. pending 'inside-frame' steps with `atMs ≤ nowMs` run;
 * 5. the living targets are recorded;
 * 6. the driver updates while the match has no outcome;
 * 7. the frame's deaths are resolved (one DeathResolver per match);
 * 8. the frame state is recorded.
 * A 'new-match' step replaces `match` with a new one and then calls `driver.newMatch`; the world
 * and its bases stay the same.
 */
export function runStrikeScenario(
  build: (w: StrikeWorld) => readonly ScenarioStep[],
  driver: StrikeDriver,
  deltas: readonly FrameDelta[],
  difficulty?: Difficulty
): { records: readonly StrikeImpactRecord[]; frames: readonly FrameState[] } {
  const w = createStrikeWorld(difficulty);
  const steps = build(w);
  const done = new Array<boolean>(steps.length).fill(false);
  let resolver = new DeathResolver();
  let nowMs = 0;
  const frames: FrameState[] = [];

  const apply = (action: ScenarioStep['action']): void => {
    switch (action.type) {
      case 'activate':
        driver.activate(w, action.faction, action.kind, action.aim, action.heading, nowMs);
        return;
      case 'move': {
        const position = w.world.getComponent(action.entity, COMPONENTS.transform);
        if (!position) throw new Error(`Entity ${action.entity} has no position`);
        position.x = action.x;
        position.z = action.z;
        return;
      }
      case 'add-unit':
        addUnit(w, action.faction, action.x, action.z);
        return;
      case 'set-health': {
        const entity = action.entity === 'player-hq' ? w.bases.player
          : action.entity === 'enemy-hq' ? w.bases.enemy
          : action.entity;
        const health = w.world.getComponent(entity, COMPONENTS.health);
        if (!health) throw new Error(`Entity ${entity} has no health`);
        health.current = action.current;
        return;
      }
      case 'new-match':
        w.match = createMatchState();
        resolver = new DeathResolver();
        driver.newMatch(w);
        return;
    }
  };
  const runSteps = (when: ScenarioStep['when'], untilMs: number): void => {
    steps.forEach((step, index) => {
      if (done[index] || step.when !== when || step.atMs > untilMs) return;
      done[index] = true;
      apply(step.action);
    });
  };

  deltas.forEach((delta, frame) => {
    if (delta === 'paused') return;
    runSteps('between-frames', nowMs + delta * 1000);
    nowMs += delta * 1000;
    runSteps('inside-frame', nowMs);
    const targetsAtFrameStart = livingTargets(w.world);
    if (w.match.outcome === null) driver.update(w, delta, nowMs, frame);
    resolver.resolve(w.world, w.match, w.difficulty, w.bases);
    frames.push({
      frame,
      health: livingHealth(w.world),
      combatPoints: { ...w.match.combatPoints },
      killStreak: { ...w.match.killStreak },
      outcome: w.match.outcome,
      targetsAtFrameStart
    });
  });
  return { records: driver.records(), frames };
}

/** The AI's air strike heading; a player air strike must say its own. */
const AI_HEADING: StrikeAim = { x: -1, z: 0 };

/** The legacy reference as a driver; a new match clears it and starts a new timeline on the new match. */
export function legacyDriver(): StrikeDriver {
  let timeline: LegacyRewardTimeline | undefined;
  const finished: StrikeImpactRecord[] = [];
  const timelineFor = (w: StrikeWorld): LegacyRewardTimeline =>
    timeline ??= new LegacyRewardTimeline(w.world, w.match, w.bases, w.difficulty);

  return {
    activate(w, faction, kind, aim, heading) {
      if (kind === 'artillery_strike') {
        timelineFor(w).triggerArtillery(faction, aim);
        return;
      }
      if (heading === undefined && faction === 'player') throw new Error('A player air strike needs a heading');
      timelineFor(w).triggerAirStrike(faction, aim, heading ?? AI_HEADING);
    },
    update(w, deltaSeconds, nowMs, frame) {
      timelineFor(w).update(deltaSeconds, nowMs, frame);
    },
    newMatch(w) {
      if (timeline) {
        finished.push(...timeline.records);
        timeline.clear();
      }
      timeline = new LegacyRewardTimeline(w.world, w.match, w.bases, w.difficulty);
    },
    records() {
      return [...finished, ...(timeline?.records ?? [])];
    }
  };
}
