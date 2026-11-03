import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyShieldReduction,
  getCombatPointsFor,
  getRewardDefinitionForDifficulty,
  selectAirStrikeTarget,
  selectArtilleryTarget,
  validateRewardActivation,
} from './rewardSystem.ts';

test('reward definitions are difficulty-aware and their costs are scaled by profile', () => {
  const easy = getRewardDefinitionForDifficulty('artillery_strike', 'easy');
  const hard = getRewardDefinitionForDifficulty('air_strike', 'hard');

  assert.equal(easy.pointsCost, 10);
  assert.equal(easy.goldCost, 162);
  assert.equal(hard.goldCost, 322);
  assert.equal(hard.pointsCost, 18);
});

test('combat point rewards are tied to unit type and difficulty profile', () => {
  assert.equal(getCombatPointsFor('rifleman', 'easy'), 1);
  assert.equal(getCombatPointsFor('tank', 'normal'), 3);
  assert.equal(getCombatPointsFor('barracks', 'hard'), 6);
});

test('shield recovery and target selection respect the reward rules', () => {
  assert.equal(applyShieldReduction(100, Date.now() + 5000, Date.now()), 50);
  assert.equal(applyShieldReduction(100, Date.now() - 1000, Date.now()), 100);
  assert.equal(applyShieldReduction(100, Date.now() + 5000, Date.now(), 0.75), 25);

  const artilleryTargets = [
    { x: 0, z: 0, value: 4, health: 10 },
    { x: 5, z: 2, value: 9, health: 45 },
    { x: -3, z: 4, value: 2, health: 12 }
  ];
  assert.deepEqual(selectArtilleryTarget(artilleryTargets), artilleryTargets[1]);

  const airTargets = [
    { x: 0, z: 0, value: 3, health: 12 },
    { x: 20, z: 20, value: 7, health: 70 }
  ];
  assert.deepEqual(selectAirStrikeTarget(airTargets), airTargets[1]);
});

test('reward validation rejects invalid activations before any gold or points are spent', () => {
  assert.equal(validateRewardActivation({
    id: 'artillery_strike',
    points: 0,
    gold: 200,
    difficulty: 'normal',
    validTargetCount: 1,
    activeShield: false,
    cooldownMs: 0,
    now: Date.now(),
  }).accepted, false);

  assert.equal(validateRewardActivation({
    id: 'defensive_shield',
    points: 20,
    gold: 200,
    difficulty: 'normal',
    validTargetCount: 0,
    activeShield: true,
    cooldownMs: 0,
    now: Date.now(),
  }).accepted, false);

  assert.equal(validateRewardActivation({
    id: 'air_strike',
    points: 18,
    gold: 280,
    difficulty: 'normal',
    validTargetCount: 1,
    activeShield: false,
    cooldownMs: 1000,
    now: Date.now(),
    expiresAt: Date.now() + 500,
  }).accepted, false);

  assert.equal(validateRewardActivation({
    id: 'air_strike',
    points: 18,
    gold: 280,
    difficulty: 'normal',
    validTargetCount: 1,
    activeShield: false,
    cooldownMs: 0,
    now: Date.now(),
  }).accepted, true);

  assert.deepEqual(validateRewardActivation({
    id: 'artillery_strike',
    points: 10,
    gold: 179,
    difficulty: 'normal',
    validTargetCount: 1,
    activeShield: false,
    cooldownMs: 0,
    now: 0
  }), { accepted: false, reason: 'insufficient-gold' });

  assert.deepEqual(validateRewardActivation({
    id: 'air_strike',
    points: 18,
    gold: 280,
    difficulty: 'normal',
    validTargetCount: 0,
    activeShield: false,
    cooldownMs: 0,
    now: 0
  }), { accepted: false, reason: 'no-valid-target' });
});
