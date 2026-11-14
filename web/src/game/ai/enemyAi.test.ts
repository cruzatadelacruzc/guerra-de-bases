import assert from 'node:assert/strict';
import test from 'node:test';
import type { Difficulty } from '../rewardSystem.ts';
import { decideEnemyTurn, rollEnemyAiTargets } from './enemyAi.ts';
import type { EnemyAiSnapshot, EnemyAiTargets } from './enemyAi.ts';
import { getEnemyAiProfile } from './enemyAiProfile.ts';
import { sequenceRng } from './testRng.ts';

const NORMAL = getEnemyAiProfile('normal');
const TARGETS: EnemyAiTargets = { generator: 3, barracks: 2, turret: 2 };
const TARGETS_MET = { generator: 3, barracks: 2, turret: 2 };
const FACTORY = { entity: 7, position: { x: 10, y: 0, z: -40 } };

function snapshot(overrides: Partial<EnemyAiSnapshot> = {}): EnemyAiSnapshot {
  return {
    difficulty: 'normal',
    nowMs: 0,
    gold: 0,
    structureCounts: { generator: 0, barracks: 0, turret: 0 },
    idleFactories: [],
    combatPoints: 0,
    rewardCooldownUntilMs: 0,
    shieldActive: false,
    validRewardTargetCount: 0,
    nexusHealthRatio: 1,
    ...overrides
  };
}

function decide(state: EnemyAiSnapshot, values: readonly number[], difficulty: Difficulty = 'normal') {
  const rng = sequenceRng(values);
  const turn = decideEnemyTurn(state, TARGETS, getEnemyAiProfile(difficulty), rng);
  assert.equal(rng.remaining, 0, 'every scripted random value must be drawn');
  return turn;
}

test('targets are rolled in order within each range', () => {
  assert.deepEqual(rollEnemyAiTargets(NORMAL, sequenceRng([0, 0, 0])), { generator: 3, barracks: 2, turret: 2 });
  const rng = sequenceRng([0.999, 0.999, 0.999]);
  assert.deepEqual(rollEnemyAiTargets(NORMAL, rng), { generator: 4, barracks: 3, turret: 4 });
  assert.equal(rng.remaining, 0);
});

test('a successful roll builds a generator at a zone position', () => {
  const turn = decide(snapshot({ gold: 100 }), [0.5, 0.75, 0.25]);
  assert.deepEqual(turn.commands, [{ type: 'build', kind: 'generator', position: { x: 11, y: 0, z: -46 } }]);
});

test('a failed roll falls through to barracks', () => {
  const turn = decide(snapshot({ gold: 300 }), [0.6, 0.5, 0.5, 0.5]);
  assert.deepEqual(turn.commands, [{ type: 'build', kind: 'barracks', position: { x: 0, y: 0, z: -40 } }]);
});

test('without gold for any structure no build roll is drawn', () => {
  assert.deepEqual(decide(snapshot({ gold: 99 }), []).commands, []);
});

test('at most one structure per turn', () => {
  const turn = decide(snapshot({ gold: 1000 }), [0.1, 0.5, 0.5]);
  assert.equal(turn.commands.length, 1);
  assert.equal(turn.commands[0].type, 'build');
});

test('status reports whether every target is met', () => {
  assert.equal(decide(snapshot({ structureCounts: TARGETS_MET }), []).status, 'satisfied');
  assert.equal(decide(snapshot({ structureCounts: { ...TARGETS_MET, turret: 1 } }), []).status, 'building');
});

test('an idle barracks trains a tank when the roll and gold allow it', () => {
  const turn = decide(snapshot({ gold: 180, structureCounts: TARGETS_MET, idleFactories: [FACTORY] }), [0.3, 0.5]);
  assert.deepEqual(turn.commands, [
    { type: 'train', factory: 7, unit: 'tank', spawnPosition: { x: 10, y: 0, z: -37 } }
  ]);
});

test('a tank roll without gold trains nothing and draws no offset', () => {
  const turn = decide(snapshot({ gold: 179, structureCounts: TARGETS_MET, idleFactories: [FACTORY] }), [0.3]);
  assert.deepEqual(turn.commands, []);
});

test('a rifleman is requested even without gold', () => {
  const turn = decide(snapshot({ gold: 0, structureCounts: TARGETS_MET, idleFactories: [FACTORY] }), [0.5, 0.5]);
  assert.deepEqual(turn.commands, [
    { type: 'train', factory: 7, unit: 'rifleman', spawnPosition: { x: 10, y: 0, z: -37 } }
  ]);
});

test('structure spending reduces the gold left for training', () => {
  const counts = { ...TARGETS_MET, generator: 0 };
  const enough = decide(snapshot({ gold: 280, structureCounts: counts, idleFactories: [FACTORY] }), [0.1, 0.5, 0.5, 0.3, 0.5]);
  assert.deepEqual(enough.commands.map((command) => command.type === 'train' ? command.unit : command.type), ['build', 'tank']);
  const short = decide(snapshot({ gold: 279, structureCounts: counts, idleFactories: [FACTORY] }), [0.1, 0.5, 0.5, 0.3]);
  assert.deepEqual(short.commands.map((command) => command.type), ['build']);
});

test('training spending reduces the gold seen by rewards', () => {
  const base = { gold: 230, structureCounts: TARGETS_MET, combatPoints: 20, validRewardTargetCount: 3 };
  const oneOrder = decide(snapshot({ ...base, idleFactories: [FACTORY] }), [0.5, 0.5]);
  assert.deepEqual(oneOrder.commands.at(-1), { type: 'activateReward', reward: 'artillery_strike' });
  const secondFactory = { entity: 8, position: { x: -10, y: 0, z: -40 } };
  const twoOrders = decide(snapshot({ ...base, idleFactories: [FACTORY, secondFactory] }), [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(twoOrders.commands.map((command) => command.type), ['train', 'train']);
});

test('rewards wait for the cooldown', () => {
  const ready = { gold: 1000, structureCounts: TARGETS_MET, combatPoints: 100, validRewardTargetCount: 3 };
  const turn = decide(snapshot({ ...ready, nowMs: 1000, rewardCooldownUntilMs: 2000 }), []);
  assert.deepEqual(turn.commands, []);
});

test('the shield is only considered at low Nexus health', () => {
  const shieldOnly = { gold: 1000, structureCounts: TARGETS_MET, combatPoints: 100, validRewardTargetCount: 0 };
  assert.deepEqual(decide(snapshot({ ...shieldOnly, nexusHealthRatio: 0.56 }), []).commands, []);
  assert.deepEqual(decide(snapshot({ ...shieldOnly, nexusHealthRatio: 0.55 }), []).commands, [
    { type: 'activateReward', reward: 'defensive_shield' }
  ]);
});

test('each difficulty prefers its own reward', () => {
  const expected = { easy: 'defensive_shield', normal: 'artillery_strike', hard: 'air_strike' } as const;
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const state = snapshot({
      difficulty,
      gold: 1000,
      structureCounts: TARGETS_MET,
      combatPoints: 100,
      validRewardTargetCount: 3,
      nexusHealthRatio: 0.2
    });
    assert.deepEqual(decide(state, [], difficulty).commands, [{ type: 'activateReward', reward: expected[difficulty] }], difficulty);
  }
});
