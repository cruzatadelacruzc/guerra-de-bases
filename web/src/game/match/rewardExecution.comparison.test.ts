/**
 * Design §6.2: every scenario, with every delta sequence, run by the legacy reference and by the
 * domain. Frames, impact identities, points and the game state at the end of every frame must be
 * identical. Per-impact hits must be identical for an impact alone in its frame; inside a group of
 * same-frame impacts that share a target, only the group's aggregate per entity is compared,
 * because the reference applies them in its own list order and the domain in nominal order.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Entity, Faction } from '../ecs/components.ts';
import { AIR_STRIKE_EFFECTIVE_RADIUS, ARTILLERY_IMPACT_RADIUS } from '../rewardSystem.ts';
import type { StrikeImpactRecord } from './legacyRewardTimeline.ts';
import type { StrikeHit } from './strikeState.ts';
import { DELTA_SEQUENCES, domainDriver, legacyDriver, runStrikeScenario, STRIKE_SCENARIOS } from './strikeScenarios.ts';
import type { FrameDelta, FrameState, ScenarioStep, StrikeDriver, StrikeWorld } from './strikeScenarios.ts';

type ScenarioName = keyof typeof STRIKE_SCENARIOS;
type SequenceName = keyof typeof DELTA_SEQUENCES;

const SCENARIOS = Object.keys(STRIKE_SCENARIOS) as ScenarioName[];
const SEQUENCES = Object.keys(DELTA_SEQUENCES) as SequenceName[];

const RADIUS: Readonly<Record<StrikeImpactRecord['kind'], number>> = {
  artillery_strike: ARTILLERY_IMPACT_RADIUS,
  air_strike: AIR_STRIKE_EFFECTIVE_RADIUS
};

interface Run {
  readonly records: readonly StrikeImpactRecord[];
  readonly frames: readonly FrameState[];
  readonly w: StrikeWorld;
}

function run(scenario: ScenarioName, driver: StrikeDriver, deltas: readonly FrameDelta[]): Run {
  let captured: StrikeWorld | undefined;
  const result = runStrikeScenario((w) => {
    captured = w;
    return STRIKE_SCENARIOS[scenario](w);
  }, driver, deltas);
  if (captured === undefined) throw new Error('The scenario was never built');
  return { ...result, w: captured };
}

function identity(record: StrikeImpactRecord) {
  const { frame, strike, kind, faction, index, x, z } = record;
  return { frame, strike, kind, faction, index, x, z };
}

function keyOf(record: StrikeImpactRecord): string {
  return `${record.frame}:${record.strike}:${record.index}`;
}

function compareIdentity(a: ReturnType<typeof identity>, b: ReturnType<typeof identity>): number {
  return a.frame - b.frame || a.strike - b.strike || a.index - b.index
    || a.kind.localeCompare(b.kind) || a.faction.localeCompare(b.faction) || a.x - b.x || a.z - b.z;
}

function byEntity(hits: readonly StrikeHit[]): StrikeHit[] {
  return [...hits].sort((a, b) => a.entity - b.entity || a.healthLoss - b.healthLoss);
}

/** Per damaged entity: how many impacts hit it and the total health they took. */
function aggregate(records: readonly StrikeImpactRecord[]): Array<[Entity, { hits: number; healthLoss: number }]> {
  const totals = new Map<Entity, { hits: number; healthLoss: number }>();
  for (const record of records) {
    for (const hit of record.hits) {
      const total = totals.get(hit.entity) ?? { hits: 0, healthLoss: 0 };
      total.hits++;
      total.healthLoss += hit.healthLoss;
      totals.set(hit.entity, total);
    }
  }
  return [...totals].sort((a, b) => a[0] - b[0]);
}

function attacked(faction: Faction): Faction {
  return faction === 'player' ? 'enemy' : 'player';
}

/**
 * The frame's impacts, grouped: two impacts are in the same group when some target of the attacked
 * faction alive at the frame's start is inside both their circles (transitively). The Nexuses are
 * left out because they are never strike targets, which can only make the groups smaller.
 */
function overlapGroups(
  records: readonly StrikeImpactRecord[],
  frame: FrameState,
  bases: Readonly<Record<Faction, Entity>>
): string[][] {
  const parent = new Map<string, string>(records.map((record) => [keyOf(record), keyOf(record)]));
  const root = (key: string): string => {
    let at = key;
    for (let next = parent.get(at); next !== undefined && next !== at; next = parent.get(at)) at = next;
    return at;
  };
  const reached = new Map<Entity, string>();
  for (const record of records) {
    for (const target of frame.targetsAtFrameStart) {
      if (target.faction !== attacked(record.faction) || target.entity === bases[target.faction]) continue;
      if (Math.hypot(target.x - record.x, target.z - record.z) > RADIUS[record.kind]) continue;
      const other = reached.get(target.entity);
      if (other === undefined) reached.set(target.entity, keyOf(record));
      else parent.set(root(keyOf(record)), root(other));
    }
  }
  const groups = new Map<string, string[]>();
  for (const record of records) {
    const group = groups.get(root(keyOf(record))) ?? [];
    group.push(keyOf(record));
    groups.set(root(keyOf(record)), group);
  }
  return [...groups.values()];
}

/** Counts how the impacts were compared, so a vacuous comparison does not go unnoticed. */
const tally = { cases: 0, impacts: 0, single: 0, grouped: 0 };

function compare(scenario: ScenarioName, sequence: SequenceName): void {
  const label = `${scenario}/${sequence}`;
  const legacy = run(scenario, legacyDriver(), DELTA_SEQUENCES[sequence]);
  const domain = run(scenario, domainDriver(), DELTA_SEQUENCES[sequence]);

  // Strict: the number of impacts, their frames, identities and points, and every frame's state.
  assert.equal(domain.records.length, legacy.records.length, `${label}: number of impacts`);
  assert.deepEqual(
    domain.records.map(identity).sort(compareIdentity),
    legacy.records.map(identity).sort(compareIdentity),
    `${label}: impact frames, identities and points`
  );
  assert.deepEqual(domain.frames, legacy.frames, `${label}: game state at the end of every frame`);

  const legacyByKey = new Map(legacy.records.map((record) => [keyOf(record), record]));
  const domainByKey = new Map(domain.records.map((record) => [keyOf(record), record]));
  const pick = (byKey: Map<string, StrikeImpactRecord>, key: string): StrikeImpactRecord => {
    const record = byKey.get(key);
    if (record === undefined) throw new Error(`${label}: no impact ${key}`);
    return record;
  };
  for (const frame of legacy.frames) {
    const records = legacy.records.filter((record) => record.frame === frame.frame);
    if (records.length === 0) continue;
    for (const group of overlapGroups(records, frame, legacy.w.bases)) {
      const legacyGroup = group.map((key) => pick(legacyByKey, key));
      const domainGroup = group.map((key) => pick(domainByKey, key));
      if (group.length === 1) {
        assert.deepEqual(byEntity(domainGroup[0].hits), byEntity(legacyGroup[0].hits), `${label}: hits of impact ${group[0]}`);
        tally.single++;
      } else {
        assert.deepEqual(aggregate(domainGroup), aggregate(legacyGroup), `${label}: aggregate hits of group ${group.join(', ')}`);
        tally.grouped += group.length;
      }
    }
  }
  tally.cases++;
  tally.impacts += legacy.records.length;
}

for (const scenario of SCENARIOS) {
  test(`${scenario}: the domain matches the legacy reference with every delta sequence`, async (t) => {
    for (const sequence of SEQUENCES) {
      await t.test(sequence, () => compare(scenario, sequence));
    }
  });
}

test('the comparison covered 14 × 6 cases, with impacts both alone and in overlap groups', () => {
  assert.equal(SCENARIOS.length, 14);
  assert.equal(SEQUENCES.length, 6);
  assert.equal(tally.cases, 14 * 6);
  assert.ok(tally.single > 0, 'some impact was alone in its frame');
  assert.ok(tally.grouped > 0, 'some impacts shared a frame and a target');
  assert.equal(tally.single + tally.grouped, tally.impacts);
});

/** The enemy targets other than the Nexus at the first frame, by increasing x. */
function enemySoldiers({ frames, w }: Run): Entity[] {
  return frames[0].targetsAtFrameStart
    .filter((target) => target.faction === 'enemy' && target.entity !== w.bases.enemy)
    .sort((a, b) => a.x - b.x)
    .map((target) => target.entity);
}

function forEveryRun(check: (result: Run, label: string) => void, scenario: ScenarioName): void {
  for (const sequence of SEQUENCES) {
    for (const [name, driver] of [['legacy', legacyDriver], ['domain', domainDriver]] as const) {
      check(run(scenario, driver(), DELTA_SEQUENCES[sequence]), `${scenario}/${sequence}/${name}`);
    }
  }
}

/** The first frame whose step of `when` with `atMs` runs, as `runStrikeScenario` decides it. */
function stepFrame(deltas: readonly FrameDelta[], atMs: number, when: ScenarioStep['when']): number {
  let nowMs = 0;
  for (let frame = 0; frame < deltas.length; frame++) {
    const delta = deltas[frame];
    if (delta === 'paused') continue;
    if (when === 'between-frames' && atMs <= nowMs + delta * 1000) return frame;
    nowMs += delta * 1000;
    if (when === 'inside-frame' && atMs <= nowMs) return frame;
  }
  throw new Error(`No frame reaches ${atMs} ms`);
}

test('S5: the enemy Nexus is never hit; the first shell reaches the soldier at 12 and not the one at 12 + 1e-6', () => {
  forEveryRun((result, label) => {
    const { records, w } = result;
    assert.ok(records.length > 0, label);
    assert.ok(records.every((record) => record.hits.every((hit) => hit.entity !== w.bases.enemy)), label);
    const first = records.find((record) => record.strike === 1 && record.index === 0);
    assert.ok(first, label);
    const hit = new Set(first.hits.map((h) => h.entity));
    const soldiers = enemySoldiers(result);
    assert.equal(soldiers.length, 2, label);
    const [justOutside, atTwelve] = soldiers;
    assert.ok(hit.has(atTwelve), `${label}: the soldier at 12`);
    assert.ok(!hit.has(justOutside), `${label}: the soldier at 12 + 1e-6`);
  }, 'S5');
});

test('S6: the soldier with 10 health is hit only by the first shell', () => {
  forEveryRun((result, label) => {
    const { records } = result;
    const soldiers = enemySoldiers(result);
    assert.equal(soldiers.length, 1, label);
    const [soldier] = soldiers;
    const hitBy = records.filter((record) => record.hits.some((hit) => hit.entity === soldier));
    assert.deepEqual(hitBy.map((record) => record.index), [0], label);
    assert.deepEqual(hitBy[0].hits.filter((hit) => hit.entity === soldier), [{ entity: soldier, healthLoss: 10 }], label);
  }, 'S6');
});

test('S10: no impact lands after the frame where the outcome is set', () => {
  forEveryRun(({ records, frames }, label) => {
    const outcomeFrame = frames.find((frame) => frame.outcome !== null);
    assert.ok(outcomeFrame, label);
    assert.equal(outcomeFrame.outcome, 'victory', label);
    assert.ok(records.every((record) => record.frame <= outcomeFrame.frame), label);
  }, 'S10');
});

test('S11: nothing lands after the new match and no strike is left in flight', () => {
  for (const sequence of SEQUENCES) {
    const newMatchFrame = stepFrame(DELTA_SEQUENCES[sequence], 1000, 'between-frames');
    for (const [name, driver] of [['legacy', legacyDriver], ['domain', domainDriver]] as const) {
      const label = `S11/${sequence}/${name}`;
      const { records, w } = run('S11', driver(), DELTA_SEQUENCES[sequence]);
      assert.ok(records.every((record) => record.frame < newMatchFrame), label);
      assert.deepEqual(w.match.strikes.active, [], label);
    }
  }
});
