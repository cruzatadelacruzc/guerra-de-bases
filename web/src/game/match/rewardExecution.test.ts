import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENTS } from '../ecs/components.ts';
import type { Entity } from '../ecs/components.ts';
import { ENEMY_BASE_POSITION } from '../ecs/initialBattle.ts';
import {
  AIR_STRIKE_BOMB_OFFSETS,
  ARTILLERY_IMPACT_OFFSETS,
  ENEMY_AIR_STRIKE_HEADING,
  nominalBombLandingSeconds
} from '../rewardSystem.ts';
import type { StrikeAim } from '../rewardSystem.ts';
import { createMatchState } from './MatchState.ts';
import { advanceStrikes, scheduleStrike } from './rewardExecution.ts';
import type { StrikeEvent } from './rewardExecution.ts';
import type { ActiveStrike } from './strikeState.ts';
import { addBuilding, addUnit, createStrikeWorld, DELTA_SEQUENCES, runStrikeScenario, STRIKE_SCENARIOS } from './strikeScenarios.ts';
import type { StrikeDriver, StrikeWorld } from './strikeScenarios.ts';

type ArtilleryStrike = Extract<ActiveStrike, { kind: 'artillery_strike' }>;
type AirStrike = Extract<ActiveStrike, { kind: 'air_strike' }>;

function artillery(strike: ActiveStrike): ArtilleryStrike {
  if (strike.kind !== 'artillery_strike') throw new Error(`Strike ${strike.id} is not artillery`);
  return strike;
}

function air(strike: ActiveStrike): AirStrike {
  if (strike.kind !== 'air_strike') throw new Error(`Strike ${strike.id} is not an air strike`);
  return strike;
}

function health(w: StrikeWorld, entity: Entity): number | undefined {
  return w.world.getComponent(entity, COMPONENTS.health)?.current;
}

function impacts(events: readonly StrikeEvent[]): Array<readonly [number, number]> {
  return events.flatMap((event) => (event.type === 'impact' ? [[event.strikeId, event.index] as const] : []));
}

/**
 * The gameplay clock as `animate` runs it: the frame's delta is added first, then whatever runs
 * inside the frame (the AI), then the strikes advance with `nowMs` at the end of the frame.
 */
function gameplayClock(w: StrikeWorld, startMs = 0) {
  const events: StrikeEvent[] = [];
  let nowMs = startMs;
  return {
    events,
    get nowMs(): number {
      return nowMs;
    },
    frame(deltaSeconds: number, insideFrame?: (frameEndMs: number) => void): StrikeEvent[] {
      nowMs += deltaSeconds * 1000;
      insideFrame?.(nowMs);
      advanceStrikes(w.world, w.match, w.bases, deltaSeconds, nowMs, w.difficulty, events);
      return events;
    }
  };
}

const PLAYER_AIM: StrikeAim = { x: 20, z: -30 };
const ENEMY_AIM: StrikeAim = { x: -20, z: 30 };

test('scheduleStrike places artillery shells at aim + offset with launchAt 0.7, 1.4, 2.1 and sets strikeActiveUntilMs to now + 4300', () => {
  const w = createStrikeWorld();
  const strike = artillery(scheduleStrike(w.match, 'player', 'artillery_strike', { x: 10, z: -20 }, undefined, w.difficulty, 1234));

  assert.deepEqual(
    strike.shells.map((shell) => ({ x: shell.x, z: shell.z, launchAtSeconds: shell.launchAtSeconds })),
    ARTILLERY_IMPACT_OFFSETS.map((offset, i) => ({ x: 10 + offset.x, z: -20 + offset.z, launchAtSeconds: 0.7 + i * 0.7 }))
  );
  strike.shells.forEach((shell, i) => assert.ok(Math.abs(shell.launchAtSeconds - [0.7, 1.4, 2.1][i]) < 1e-12));
  assert.ok(strike.shells.every((shell) => !shell.launched && !shell.landed));
  assert.equal(strike.faction, 'player');
  assert.equal(strike.aimX, 10);
  assert.equal(strike.aimZ, -20);
  assert.equal(strike.damagePerImpact, 120);
  assert.equal(strike.radius, 12);
  assert.equal(strike.startedAtMs, 1234);
  assert.equal(strike.elapsedSeconds, 0);
  assert.deepEqual(w.match.strikes.active, [strike]);
  assert.equal(w.match.rewards.player.strikeActiveUntilMs.artillery_strike, 1234 + 4300);
  assert.deepEqual(w.match.rewards.enemy.strikeActiveUntilMs, {});
});

test('scheduleStrike builds the air run from aim - heading·60 to aim + heading·60 and sets strikeActiveUntilMs to now + 5200', () => {
  const w = createStrikeWorld();
  const heading = { x: 0.6, z: 0.8 };
  const strike = air(scheduleStrike(w.match, 'enemy', 'air_strike', { x: 5, z: -10 }, heading, w.difficulty, 800));

  assert.equal(strike.startX, 5 - heading.x * 60);
  assert.equal(strike.startZ, -10 - heading.z * 60);
  assert.equal(strike.endX, 5 + heading.x * 60);
  assert.equal(strike.endZ, -10 + heading.z * 60);
  assert.deepEqual(
    strike.bombs,
    AIR_STRIKE_BOMB_OFFSETS.map((offset) => ({
      x: 5 + offset.x,
      z: -10 + offset.z,
      released: false,
      releaseX: 0,
      releaseZ: 0,
      releaseProgress: 0,
      fallElapsedSeconds: 0,
      landed: false
    }))
  );
  assert.equal(strike.damagePerImpact, 220);
  assert.equal(strike.radius, 12);
  assert.equal(strike.elapsedSeconds, 0);
  assert.equal(w.match.rewards.enemy.strikeActiveUntilMs.air_strike, 800 + 5200);
});

test('scheduleStrike freezes a copy of the heading', () => {
  const w = createStrikeWorld();
  const heading = { x: 1, z: 0 };
  const strike = air(scheduleStrike(w.match, 'player', 'air_strike', PLAYER_AIM, heading, w.difficulty, 0));
  heading.x = 0;
  heading.z = 1;

  assert.deepEqual(strike.heading, { x: 1, z: 0 });
  assert.notEqual(strike.heading, heading);
  assert.ok(Object.isFrozen(strike.heading));
  assert.doesNotThrow(() => structuredClone(w.match));
});

test('scheduleStrike throws for an air strike without a heading', () => {
  const w = createStrikeWorld();
  assert.throws(() => scheduleStrike(w.match, 'player', 'air_strike', PLAYER_AIM, undefined, w.difficulty, 0));
  assert.equal(w.match.strikes.active.length, 0);
  assert.equal(w.match.strikes.nextId, 1);
  assert.deepEqual(w.match.rewards.player.strikeActiveUntilMs, {});
});

test('strike ids grow within a match and restart with createMatchState', () => {
  const w = createStrikeWorld();
  const ids = [
    scheduleStrike(w.match, 'player', 'artillery_strike', PLAYER_AIM, undefined, w.difficulty, 0).id,
    scheduleStrike(w.match, 'enemy', 'air_strike', ENEMY_AIM, ENEMY_AIR_STRIKE_HEADING, w.difficulty, 0).id,
    scheduleStrike(w.match, 'player', 'air_strike', PLAYER_AIM, { x: 0, z: -1 }, w.difficulty, 0).id
  ];
  assert.deepEqual(ids, [1, 2, 3]);
  assert.equal(w.match.strikes.nextId, 4);

  w.match = createMatchState();
  assert.equal(scheduleStrike(w.match, 'player', 'artillery_strike', PLAYER_AIM, undefined, w.difficulty, 0).id, 1);
});

test('advanceStrikes empties the events array on entry', () => {
  const w = createStrikeWorld();
  const events: StrikeEvent[] = [{ type: 'strike-finished', strikeId: 99 }];
  advanceStrikes(w.world, w.match, w.bases, 1 / 60, 1000 / 60, w.difficulty, events);
  assert.deepEqual(events, []);
});

test('advanceStrikes applies damage when nobody reads the events', () => {
  const w = createStrikeWorld();
  const tank = addUnit(w, 'enemy', PLAYER_AIM.x, PLAYER_AIM.z, 'tank');
  scheduleStrike(w.match, 'player', 'artillery_strike', PLAYER_AIM, undefined, w.difficulty, 0);
  const unread: StrikeEvent[] = [];
  advanceStrikes(w.world, w.match, w.bases, 10, 10_000, w.difficulty, unread);

  // All three shells reach the tank: 380 - 3 · 120.
  assert.equal(health(w, tank), 20);
});

test('advanceStrikes does nothing once the match has an outcome', () => {
  const w = createStrikeWorld();
  const tank = addUnit(w, 'enemy', PLAYER_AIM.x, PLAYER_AIM.z, 'tank');
  const strike = scheduleStrike(w.match, 'player', 'artillery_strike', PLAYER_AIM, undefined, w.difficulty, 0);
  w.match.outcome = 'victory';
  const events: StrikeEvent[] = [{ type: 'strike-finished', strikeId: 99 }];
  advanceStrikes(w.world, w.match, w.bases, 10, 10_000, w.difficulty, events);

  assert.equal(strike.elapsedSeconds, 0);
  assert.equal(health(w, tank), 380);
  assert.deepEqual(events, []);
  assert.deepEqual(w.match.strikes.active, [strike]);
});

test('advanceStrikes applies every due impact exactly once with a 10 s delta', () => {
  const w = createStrikeWorld();
  const tank = addUnit(w, 'enemy', PLAYER_AIM.x, PLAYER_AIM.z, 'tank');
  const airAim = { x: -20, z: -30 };
  const shells = scheduleStrike(w.match, 'player', 'artillery_strike', PLAYER_AIM, undefined, w.difficulty, 0).id;
  const bombs = scheduleStrike(w.match, 'player', 'air_strike', airAim, { x: 1, z: 0 }, w.difficulty, 0).id;
  const clock = gameplayClock(w);

  const events = clock.frame(10);
  assert.deepEqual(
    impacts(events).slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    [[shells, 0], [shells, 1], [shells, 2], [bombs, 0], [bombs, 1], [bombs, 2], [bombs, 3]]
  );
  assert.equal(health(w, tank), 20);
  assert.deepEqual(w.match.strikes.active, []);
  assert.deepEqual(
    events.filter((event) => event.type === 'strike-finished'),
    [{ type: 'strike-finished', strikeId: shells }, { type: 'strike-finished', strikeId: bombs }]
  );
  assert.equal(events.filter((event) => event.type === 'shell-launched').length, 3);
  assert.equal(events.filter((event) => event.type === 'bomb-released').length, 4);

  assert.deepEqual(clock.frame(1 / 60), []);
  assert.equal(health(w, tank), 20);
});

test('an air strike ends when the aircraft finishes its run, on a frame without impacts', () => {
  const w = createStrikeWorld();
  const strike = scheduleStrike(w.match, 'enemy', 'air_strike', ENEMY_AIM, ENEMY_AIR_STRIKE_HEADING, w.difficulty, 0);
  const clock = gameplayClock(w);
  let finishedAt = 0;
  for (let frame = 1; frame <= 1000 && finishedAt === 0; frame++) {
    const events = clock.frame(1 / 60);
    if (events.some((event) => event.type === 'strike-finished')) {
      finishedAt = frame;
      assert.deepEqual(impacts(events), []);
      assert.ok(strike.elapsedSeconds >= 5.2);
    }
  }
  assert.ok(finishedAt > 0);
  assert.deepEqual(w.match.strikes.active, []);
});

test('due impacts in one frame are applied and emitted in nominal order', () => {
  // Frame k starts at T. The player activates between frames k-1 and k (nowMs = T); the AI
  // activates inside frame k (nowMs = T + Δ). Both shells' counters start with frame k, so the
  // first shell of each has nominal time T + 2900 (not T + Δ + 2900 for the AI).
  const T = 1000;
  for (const delta of [1 / 60, 1 / 30]) {
    const w = createStrikeWorld();
    addUnit(w, 'enemy', PLAYER_AIM.x, PLAYER_AIM.z);
    addUnit(w, 'player', ENEMY_AIM.x, ENEMY_AIM.z);
    const clock = gameplayClock(w, T);
    const player = scheduleStrike(w.match, 'player', 'artillery_strike', PLAYER_AIM, undefined, w.difficulty, clock.nowMs);
    let enemyId = 0;
    clock.frame(delta, (nowMs) => {
      enemyId = scheduleStrike(w.match, 'enemy', 'artillery_strike', ENEMY_AIM, undefined, w.difficulty, nowMs).id;
    });
    let landed: Array<readonly [number, number]> = [];
    for (let frame = 0; frame < 1000 && landed.length === 0; frame++) landed = impacts(clock.frame(delta));

    assert.equal(w.match.strikes.active[1]?.startedAtMs, T + delta * 1000);
    assert.deepEqual(landed, [[player.id, 0], [enemyId, 0]]);
  }

  // With Δ = 1 s the rule is observable: the AI's first shell (nominal T + 2900) lands before the
  // player's second shell (T + 3600). Counting from startedAtMs would put it at T + 3900, after.
  const w = createStrikeWorld();
  const clock = gameplayClock(w, T);
  const player = scheduleStrike(w.match, 'player', 'artillery_strike', PLAYER_AIM, undefined, w.difficulty, clock.nowMs);
  let enemyId = 0;
  assert.deepEqual(impacts(clock.frame(1, (nowMs) => {
    enemyId = scheduleStrike(w.match, 'enemy', 'artillery_strike', ENEMY_AIM, undefined, w.difficulty, nowMs).id;
  })), []);
  assert.deepEqual(impacts(clock.frame(3)), [[player.id, 0], [enemyId, 0], [player.id, 1], [enemyId, 1]]);
});

test('impacts with the same nominal time break ties by strikeId, then by impact index', () => {
  // Two artillery strikes scheduled at the same instant have pairwise identical nominal times.
  // One 10 s frame makes all six due at once: nominal time interleaves them shell by shell and,
  // within each tie, the lower strikeId (activated first) goes first, whichever faction it is.
  for (const firstFaction of ['player', 'enemy'] as const) {
    const w = createStrikeWorld();
    const secondFaction = firstFaction === 'player' ? 'enemy' : 'player';
    const aimOf = (faction: 'player' | 'enemy') => (faction === 'player' ? PLAYER_AIM : ENEMY_AIM);
    const first = scheduleStrike(w.match, firstFaction, 'artillery_strike', aimOf(firstFaction), undefined, w.difficulty, 0).id;
    const second = scheduleStrike(w.match, secondFaction, 'artillery_strike', aimOf(secondFaction), undefined, w.difficulty, 0).id;
    assert.ok(first < second);
    assert.deepEqual(impacts(gameplayClock(w).frame(10)), [
      [first, 0], [second, 0],
      [first, 1], [second, 1],
      [first, 2], [second, 2]
    ]);
  }
});

test('a bomb released and landing in the same frame has nominal frame start + 720 ms', () => {
  const w = createStrikeWorld();
  const tank = addUnit(w, 'enemy', PLAYER_AIM.x, PLAYER_AIM.z, 'tank');
  const barracks = addBuilding(w, 'enemy', 'barracks', -20, -30);
  const shells = scheduleStrike(w.match, 'player', 'artillery_strike', PLAYER_AIM, undefined, w.difficulty, 0).id;
  const bombs = scheduleStrike(w.match, 'player', 'air_strike', { x: -20, z: -30 }, { x: 1, z: 0 }, w.difficulty, 0).id;
  const clock = gameplayClock(w);

  // After 2.2 s the aircraft is still short of every bomb and no shell has landed.
  const first = clock.frame(2.2);
  assert.deepEqual(impacts(first), []);
  assert.equal(first.filter((event) => event.type === 'bomb-released').length, 0);

  // Next frame: the shells' nominal times are frame start + 700, 1400 and 2100 ms; every bomb is
  // released and lands at frame start + 720 ms, so the bombs go between the first two shells, by index.
  const second = clock.frame(10);
  assert.deepEqual(impacts(second), [
    [shells, 0],
    [bombs, 0], [bombs, 1], [bombs, 2], [bombs, 3],
    [shells, 1],
    [shells, 2]
  ]);
  assert.deepEqual(
    second.flatMap((event) => (event.type === 'bomb-released' ? [event.index] : [])),
    [0, 1, 2, 3]
  );
  assert.equal(health(w, tank), 20);
  assert.equal(health(w, barracks), 0);
});

test('nominalBombLandingSeconds is within one 1/60 frame of the replicated landing frame', () => {
  for (const heading of [ENEMY_AIR_STRIKE_HEADING, { x: 1, z: 0 }]) {
    const w = createStrikeWorld();
    scheduleStrike(w.match, 'enemy', 'air_strike', { x: 0, z: 0 }, heading, w.difficulty, 0);
    const clock = gameplayClock(w);
    const landedAt: number[] = [];
    for (let frame = 1; frame <= 1000 && w.match.strikes.active.length > 0; frame++) {
      for (const [, index] of impacts(clock.frame(1 / 60))) landedAt[index] = frame / 60;
    }

    assert.equal(landedAt.length, AIR_STRIKE_BOMB_OFFSETS.length);
    AIR_STRIKE_BOMB_OFFSETS.forEach((offset, index) => {
      const nominal = nominalBombLandingSeconds(offset, heading);
      assert.ok(
        Math.abs(landedAt[index] - nominal) <= 1 / 60,
        `bomb ${index} with heading (${heading.x}, ${heading.z}): landed at ${landedAt[index]} s, nominal ${nominal} s`
      );
    });
  }
});

test('strike damage ignores an active shield because the Nexus is never a target', () => {
  const w = createStrikeWorld();
  w.match.rewards.enemy.shieldUntilMs = 1e9;
  const aim = { x: ENEMY_BASE_POSITION.x, z: ENEMY_BASE_POSITION.z };
  const tank = addUnit(w, 'enemy', aim.x, aim.z + 3, 'tank');
  const nexusBefore = health(w, w.bases.enemy);
  scheduleStrike(w.match, 'player', 'artillery_strike', aim, undefined, w.difficulty, 0);
  gameplayClock(w).frame(10);

  assert.equal(health(w, w.bases.enemy), nexusBefore);
  // Full damage despite the shield: 380 - 3 · 120.
  assert.equal(health(w, tank), 20);
});

test('advanceStrikes behaves identically with and without onImpactApplied', () => {
  // S1 and S4d at once, with fixed60: artillery and an air strike with two bombs in one frame.
  const runOnce = (withCallback: boolean) => {
    const events: StrikeEvent[] = [];
    const eventsPerFrame: StrikeEvent[][] = [];
    const strikesPerFrame: unknown[] = [];
    let reported = 0;
    const driver: StrikeDriver = {
      activate(w, faction, kind, aim, heading, nowMs) {
        scheduleStrike(w.match, faction, kind, aim, heading, w.difficulty, nowMs);
      },
      update(w, deltaSeconds, nowMs) {
        if (withCallback) {
          advanceStrikes(w.world, w.match, w.bases, deltaSeconds, nowMs, w.difficulty, events, () => {
            reported++;
          });
        } else {
          advanceStrikes(w.world, w.match, w.bases, deltaSeconds, nowMs, w.difficulty, events);
        }
        eventsPerFrame.push(events.map((event) => ({ ...event })));
        strikesPerFrame.push(structuredClone(w.match.strikes));
      },
      newMatch() {},
      records: () => []
    };
    let world: StrikeWorld | undefined;
    const { frames } = runStrikeScenario((w) => {
      world = w;
      return [...STRIKE_SCENARIOS.S1(w), ...STRIKE_SCENARIOS.S4d(w)];
    }, driver, DELTA_SEQUENCES.fixed60);
    assert.ok(world);
    return { frames, eventsPerFrame, strikesPerFrame, strikes: world.match.strikes, reported };
  };

  const withCallback = runOnce(true);
  const without = runOnce(false);

  assert.equal(withCallback.reported, 3 + 4);
  assert.equal(without.reported, 0);
  assert.deepEqual(without.frames, withCallback.frames);
  assert.deepEqual(without.eventsPerFrame, withCallback.eventsPerFrame);
  assert.equal(impacts(withCallback.eventsPerFrame.flat()).length, 3 + 4);
  assert.deepEqual(without.strikesPerFrame, withCallback.strikesPerFrame);
  assert.deepEqual(without.strikes, withCallback.strikes);
});
