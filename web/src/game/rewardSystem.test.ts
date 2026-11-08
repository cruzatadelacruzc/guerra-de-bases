import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARTILLERY_LAUNCH_DELAY_SECONDS,
  ARTILLERY_SALVO_INTERVAL_SECONDS,
  ARTILLERY_SHELL_FLIGHT_SECONDS,
  applyShieldReduction,
  artilleryStrikeDurationSeconds,
  getCombatPointsFor,
  getRewardDefinitionForDifficulty,
  countStrikeHits,
  getStrikePattern,
  selectStrikeAim,
  STRIKE_MIN_CONCENTRATION_UNITS,
  validateRewardActivation,
  type StrikeAim,
  type StrikeCandidate,
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

test('shield recovery respects the reward rules', () => {
  assert.equal(applyShieldReduction(100, Date.now() + 5000, Date.now()), 50);
  assert.equal(applyShieldReduction(100, Date.now() - 1000, Date.now()), 100);
  assert.equal(applyShieldReduction(100, Date.now() + 5000, Date.now(), 0.75), 25);
});

const artillery = getStrikePattern('artillery_strike', 'normal');
const airStrike = getStrikePattern('air_strike', 'normal');

/** `count` units packed around (x, z), close enough for one strike to reach them all. */
function squad(x: number, z: number, count: number, health = 100): StrikeCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    x: x + (index % 3) * 2,
    z: z + Math.floor(index / 3) * 2,
    health,
    kind: 'unit' as const
  }));
}

function building(x: number, z: number, health = 380): StrikeCandidate {
  return { x, z, health, kind: 'structure' };
}

/** Whether the aim point lies on the group around (x, z). */
function aimsAt(aim: StrikeAim | undefined, x: number, z: number): boolean {
  assert.ok(aim, 'expected an aim point');
  return Math.hypot(aim.x - x, aim.z - z) <= 10;
}

test('strike patterns use the reward damage and the radius the impacts apply', () => {
  assert.equal(artillery.damagePerImpact, 120);
  assert.equal(artillery.impacts.length, 3);
  assert.equal(artillery.radius, 12);
  assert.equal(airStrike.damagePerImpact, 220);
  assert.equal(airStrike.impacts.length, 4);
  assert.equal(airStrike.radius, 12);
});

test('both strikes go for the larger squad when one strike cannot reach both', () => {
  const candidates = [...squad(0, 0, 3), ...squad(60, -10, 6)];
  for (const pattern of [artillery, airStrike]) {
    const aim = selectStrikeAim(candidates, pattern);
    assert.ok(aimsAt(aim, 62, -8), `aim ${JSON.stringify(aim)} should be on the squad of six`);
  }
});

test('two squads close enough for one strike are hit together', () => {
  const candidates = [...squad(0, 0, 3), ...squad(16, 0, 3), ...squad(-50, 0, 4)];
  const aim = selectStrikeAim(candidates, artillery);
  assert.ok(aim);
  const reached = candidates.filter((candidate) => countStrikeHits(aim.x, aim.z, candidate.x, candidate.z, artillery) > 0);
  assert.equal(reached.length, 6, 'both nearby squads (6 units) beat the lone squad of 4');
});

test('a concentration of units comes before a healthier lone structure', () => {
  assert.equal(STRIKE_MIN_CONCENTRATION_UNITS, 3);
  const aim = selectStrikeAim([building(-40, 20), ...squad(30, 0, 3)], artillery);
  assert.ok(aimsAt(aim, 32, 0));
});

test('without a concentration of units the strike falls back to structures', () => {
  const candidates = [
    { x: 30, z: 0, health: 100, kind: 'unit' as const },
    { x: -30, z: 40, health: 100, kind: 'unit' as const },
    building(-40, -20)
  ];
  const aim = selectStrikeAim(candidates, airStrike);
  assert.ok(aimsAt(aim, -40, -20));
});

test('a lone unit is still a valid target when nothing else is left', () => {
  assert.ok(aimsAt(selectStrikeAim([{ x: 12, z: -7, health: 100, kind: 'unit' }], artillery), 12, -7));
  assert.equal(selectStrikeAim([], artillery), undefined);
});

test('remaining health decides between squads of the same size', () => {
  const candidates = [...squad(0, 0, 3, 10), ...squad(60, 0, 3, 100)];
  assert.ok(aimsAt(selectStrikeAim(candidates, artillery), 62, 0));
});

test('enemies outside the reach of every impact add nothing to an aim', () => {
  // Four squads of two, each beyond the other's reach: no aim can make a concentration...
  const spread = [...squad(0, 0, 2), ...squad(60, 0, 2), ...squad(-60, 0, 2), ...squad(0, 60, 2)];
  // ...so the strike goes for the building, even though eight units are on the field.
  const aim = selectStrikeAim([...spread, building(0, -60)], artillery);
  assert.ok(aimsAt(aim, 0, -60));
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

test('an artillery strike lasts until its last staggered shell lands', () => {
  assert.equal(artilleryStrikeDurationSeconds(1), ARTILLERY_LAUNCH_DELAY_SECONDS + ARTILLERY_SHELL_FLIGHT_SECONDS);
  assert.equal(
    artilleryStrikeDurationSeconds(3),
    ARTILLERY_LAUNCH_DELAY_SECONDS + 2 * ARTILLERY_SALVO_INTERVAL_SECONDS + ARTILLERY_SHELL_FLIGHT_SECONDS
  );
  assert.throws(() => artilleryStrikeDurationSeconds(0), RangeError);
});

test('reward titles are shown in Spanish', () => {
  assert.equal(getRewardDefinitionForDifficulty('artillery_strike', 'normal').title, 'Bombardeo de artillería');
  assert.equal(getRewardDefinitionForDifficulty('air_strike', 'normal').title, 'Ataque aéreo');
  assert.equal(getRewardDefinitionForDifficulty('defensive_shield', 'hard').title, 'Escudo defensivo');
});
