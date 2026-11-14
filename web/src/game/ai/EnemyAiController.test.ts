import assert from 'node:assert/strict';
import test from 'node:test';
import { EnemyAiController } from './EnemyAiController.ts';
import type { EnemyAiSnapshot } from './enemyAi.ts';
import { getEnemyAiProfile } from './enemyAiProfile.ts';
import { sequenceRng } from './testRng.ts';

const IDLE_SNAPSHOT: EnemyAiSnapshot = {
  difficulty: 'easy',
  nowMs: 0,
  gold: 0,
  structureCounts: { generator: 0, barracks: 0, turret: 0 },
  idleFactories: [],
  combatPoints: 0,
  rewardCooldownUntilMs: 0,
  shieldActive: false,
  validRewardTargetCount: 0,
  nexusHealthRatio: 1
};

test('the controller rolls its targets on creation', () => {
  const controller = new EnemyAiController(getEnemyAiProfile('easy'), sequenceRng([0, 0, 0]));
  assert.deepEqual(controller.targets, { generator: 2, barracks: 1, turret: 1 });
});

test('the snapshot is read only when a decision is due', () => {
  const controller = new EnemyAiController(getEnemyAiProfile('easy'), sequenceRng([0, 0, 0]));
  let reads = 0;
  const read = () => {
    reads++;
    return IDLE_SNAPSHOT;
  };
  for (let frame = 0; frame < 4; frame++) assert.equal(controller.update(0.25, read), null);
  assert.equal(reads, 0);
  assert.deepEqual(controller.update(0.25, read), { status: 'building', commands: [] });
  assert.equal(reads, 1);
});
