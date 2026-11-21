import assert from 'node:assert/strict';
import test from 'node:test';
import type { Faction } from '../ecs/components.ts';
import { ENEMY_BASE_POSITION } from '../ecs/initialBattle.ts';
import {
  AIR_STRIKE_BOMB_OFFSETS,
  ARTILLERY_IMPACT_OFFSETS,
  getRewardDefinitionForDifficulty
} from '../rewardSystem.ts';
import type { Difficulty, StrikeAim } from '../rewardSystem.ts';
import type { StrikeImpactRecord } from './legacyRewardTimeline.ts';
import { addUnit, DELTA_SEQUENCES, legacyDriver, runStrikeScenario } from './strikeScenarios.ts';
import type { FrameDelta, ScenarioStep, StrikeWorld } from './strikeScenarios.ts';

type StrikeKind = 'artillery_strike' | 'air_strike';

const AIM: StrikeAim = { x: 10, z: -20 };
const AI_HEADING: StrikeAim = { x: -1, z: 0 };
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

function activateAt(
  atMs: number,
  faction: Faction,
  kind: StrikeKind,
  aim: StrikeAim,
  heading?: StrikeAim
): ScenarioStep {
  return { atMs, when: 'between-frames', action: { type: 'activate', faction, kind, aim, heading } };
}

function run(
  build: (w: StrikeWorld) => readonly ScenarioStep[],
  deltas: readonly FrameDelta[] = DELTA_SEQUENCES.fixed60,
  difficulty?: Difficulty
) {
  return runStrikeScenario(build, legacyDriver(), deltas, difficulty);
}

/** Gameplay seconds at the end of each frame, summed in the same order as the scenario loop. */
function frameEndSeconds(deltas: readonly FrameDelta[]): number[] {
  let total = 0;
  return deltas.map((delta) => {
    if (delta !== 'paused') total += delta;
    return total;
  });
}

function firstFrameReaching(deltas: readonly FrameDelta[], seconds: number): number {
  return frameEndSeconds(deltas).findIndex((total, frame) => deltas[frame] !== 'paused' && total >= seconds);
}

test('legacy artillery lands three shells at the frames where the summed delta reaches 2.9, 3.6 and 4.3 s', () => {
  const deltas = DELTA_SEQUENCES.fixed60;
  const { records } = run(() => [activateAt(0, 'player', 'artillery_strike', AIM)], deltas);

  assert.deepEqual(
    records.map(({ frame, strike, kind, faction, index, x, z }) => ({ frame, strike, kind, faction, index, x, z })),
    [2.9, 3.6, 4.3].map((seconds, index) => ({
      frame: firstFrameReaching(deltas, seconds),
      strike: 1,
      kind: 'artillery_strike',
      faction: 'player',
      index,
      x: AIM.x + ARTILLERY_IMPACT_OFFSETS[index].x,
      z: AIM.z + ARTILLERY_IMPACT_OFFSETS[index].z
    }))
  );
  assert.deepEqual(ARTILLERY_IMPACT_OFFSETS, [{ x: 0, z: 0 }, { x: 6, z: 4 }, { x: -5, z: -3 }]);
});

/** Bombs drop as the aircraft (over the aim at 2.6 s, 120 / 5.2 units per second) passes each one, then fall 0.72 s. */
function assertAirStrike(heading: StrikeAim, expectedOrder: readonly number[]): void {
  const deltas = DELTA_SEQUENCES.fixed60;
  const { records } = run(() => [activateAt(0, 'player', 'air_strike', AIM, heading)], deltas);
  const ends = frameEndSeconds(deltas);
  const speed = 120 / 5.2;

  assert.deepEqual(records.map((record) => record.index), expectedOrder);
  for (const record of records) {
    const offset = AIR_STRIKE_BOMB_OFFSETS[record.index];
    assert.equal(record.kind, 'air_strike');
    assert.equal(record.strike, 1);
    assert.equal(record.x, AIM.x + offset.x);
    assert.equal(record.z, AIM.z + offset.z);
    const landedAt = ends[record.frame];
    const analytic = 2.6 + (offset.x * heading.x + offset.z * heading.z) / speed + 0.72;
    assert.ok(landedAt <= 5.2, `bomb ${record.index} landed at ${landedAt} s`);
    // It drops on the first frame past its point and its fall counts that frame's whole delta,
    // so it lands within one frame of the analytic time.
    assert.ok(Math.abs(landedAt - analytic) <= 1 / 60, `bomb ${record.index}: ${landedAt} vs ${analytic}`);
  }
  for (let i = 1; i < records.length; i++) assert.ok(records[i].frame >= records[i - 1].frame);
}

test('legacy air strike drops four bombs within 5.2 s at aim + offset', () => {
  assertAirStrike(AI_HEADING, [3, 1, 0, 2]);
});

test('legacy air strike release order follows the heading', () => {
  assertAirStrike({ x: 1, z: 0 }, [2, 0, 1, 3]);
});

test('legacy strikes hit at radius 12 and miss at 12 + 1e-6', () => {
  for (const kind of ['artillery_strike', 'air_strike'] as const) {
    let inside = -1;
    let outside = -1;
    const { records } = run((w) => {
      inside = addUnit(w, 'enemy', 12, 0);
      outside = addUnit(w, 'enemy', -(12 + 1e-6), 0);
      // Other impacts reach both units too; they must survive them to be candidates for the centre one.
      return [
        { atMs: 0, when: 'between-frames', action: { type: 'set-health', entity: inside, current: 10000 } },
        { atMs: 0, when: 'between-frames', action: { type: 'set-health', entity: outside, current: 10000 } },
        activateAt(0, 'player', kind, { x: 0, z: 0 }, AI_HEADING)
      ];
    });
    // Offset (0, 0) is index 0 for both strikes, so that impact lands exactly on the aim.
    const centre = records.find((record) => record.index === 0);
    assert.ok(centre, `${kind} never landed its centre impact`);
    const hit = centre.hits.map((h) => h.entity);
    assert.ok(hit.includes(inside), `${kind} missed the unit at 12`);
    assert.ok(!hit.includes(outside), `${kind} hit the unit at 12 + 1e-6`);
  }
});

test('legacy damage per impact is 120 for artillery and 220 for the air strike on every difficulty', () => {
  for (const difficulty of DIFFICULTIES) {
    for (const [kind, damage, impacts] of [
      ['artillery_strike', 120, ARTILLERY_IMPACT_OFFSETS.length],
      ['air_strike', 220, AIR_STRIKE_BOMB_OFFSETS.length]
    ] as const) {
      assert.equal(getRewardDefinitionForDifficulty(kind, difficulty).damage, damage);
      let target = -1;
      const { records, frames } = run((w) => {
        target = addUnit(w, 'enemy', AIM.x, AIM.z, 'tank');
        return [
          { atMs: 0, when: 'between-frames', action: { type: 'set-health', entity: target, current: 10000 } },
          activateAt(0, 'player', kind, AIM, AI_HEADING)
        ];
      }, DELTA_SEQUENCES.fixed60, difficulty);

      assert.equal(records.length, impacts, `${difficulty} ${kind}`);
      for (const record of records) assert.deepEqual(record.hits, [{ entity: target, healthLoss: damage }]);
      const last = frames[frames.length - 1].health.find(([entity]) => entity === target);
      assert.deepEqual(last, [target, 10000 - impacts * damage]);
    }
  }
});

test('legacy timeline does not advance while paused', () => {
  const paused = DELTA_SEQUENCES.paused;
  const pauseStart = paused.indexOf('paused');
  assert.equal(pauseStart, 120);
  assert.equal(paused.filter((delta) => delta === 'paused').length, 90);

  const build = (w: StrikeWorld): readonly ScenarioStep[] => {
    addUnit(w, 'enemy', AIM.x, AIM.z, 'tank');
    addUnit(w, 'enemy', AIM.x + 6, AIM.z + 4);
    return [
      activateAt(0, 'player', 'artillery_strike', AIM),
      { atMs: 500, when: 'inside-frame', action: { type: 'activate', faction: 'enemy', kind: 'air_strike', aim: { x: 0, z: 40 }, heading: AI_HEADING } },
      activateAt(1000, 'player', 'air_strike', AIM, { x: 0, z: -1 })
    ];
  };
  const steady = run(build, DELTA_SEQUENCES.fixed60).records;
  const withPause = run(build, paused).records;

  assert.ok(steady.length > 0);
  assert.ok(steady.every((record) => record.frame >= pauseStart), 'every impact should land after the pause starts');
  const shifted = (records: readonly StrikeImpactRecord[], by: number) =>
    records.map((record) => ({ ...record, frame: record.frame + by }));
  assert.deepEqual(withPause, shifted(steady, 90));
});

test('legacy strikes never hit the Nexus', () => {
  for (const kind of ['artillery_strike', 'air_strike'] as const) {
    let guard = -1;
    let nexus = -1;
    const nexusAim = { x: ENEMY_BASE_POSITION.x, z: ENEMY_BASE_POSITION.z };
    const { records, frames } = run((w) => {
      nexus = w.bases.enemy;
      guard = addUnit(w, 'enemy', nexusAim.x + 2, nexusAim.z, 'tank');
      return [activateAt(0, 'player', kind, nexusAim, AI_HEADING)];
    });

    assert.ok(records.length > 0);
    const hitEntities = records.flatMap((record) => record.hits.map((h) => h.entity));
    assert.ok(hitEntities.includes(guard), `${kind} should still hit the unit next to the Nexus`);
    assert.equal(hitEntities.includes(nexus), false);
    assert.deepEqual(frames[frames.length - 1].health.find(([entity]) => entity === nexus), [nexus, 1200]);
  }
});
