import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_AI_PROFILES, getEnemyAiProfile } from './enemyAiProfile.ts';

const SHARED = {
  buildChance: { generator: 0.6, barracks: 0.65, turret: 0.7 },
  buildZones: {
    generator: { width: 44, nearZ: -38, depth: 32 },
    barracks: { width: 40, nearZ: -25, depth: 30 },
    turret: { width: 42, nearZ: -12, depth: 20 }
  },
  tankChance: 0.45,
  spawnJitter: 5,
  spawnForwardOffset: 3
};

test('profiles keep the current decision values', () => {
  assert.deepEqual(ENEMY_AI_PROFILES, {
    easy: {
      decisionIntervalSeconds: 1.25,
      targets: { generator: { min: 2, max: 3 }, barracks: { min: 1, max: 2 }, turret: { min: 1, max: 2 } },
      ...SHARED,
      shieldHealthThreshold: 0.3,
      rewardPreference: ['defensive_shield', 'artillery_strike', 'air_strike']
    },
    normal: {
      decisionIntervalSeconds: 0.7,
      targets: { generator: { min: 3, max: 4 }, barracks: { min: 2, max: 3 }, turret: { min: 2, max: 4 } },
      ...SHARED,
      shieldHealthThreshold: 0.55,
      rewardPreference: ['artillery_strike', 'air_strike', 'defensive_shield']
    },
    hard: {
      decisionIntervalSeconds: 0.35,
      targets: { generator: { min: 4, max: 5 }, barracks: { min: 3, max: 4 }, turret: { min: 4, max: 6 } },
      ...SHARED,
      shieldHealthThreshold: 0.75,
      rewardPreference: ['air_strike', 'artillery_strike', 'defensive_shield']
    }
  });
  assert.equal(getEnemyAiProfile('hard'), ENEMY_AI_PROFILES.hard);
});

test('profiles are frozen', () => {
  const visit = (value: unknown, path: string) => {
    if (typeof value !== 'object' || value === null) return;
    assert.ok(Object.isFrozen(value), `${path} is not frozen`);
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  };
  visit(ENEMY_AI_PROFILES, 'ENEMY_AI_PROFILES');
});
