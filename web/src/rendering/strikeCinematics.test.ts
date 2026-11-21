import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AIR_STRIKE_BOMB_OFFSETS,
  artilleryStrikeDurationSeconds,
  nominalBombLandingSeconds
} from '../game/rewardSystem.ts';
import { airStrikeShots, artilleryShots } from './strikeCinematics.ts';

function near(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
}

test('artilleryShots frames the Nexus then the impact with today\'s timings', () => {
  const shots = artilleryShots({ x: 3, z: 70 }, { x: -4, z: -20 });
  assert.equal(shots.length, 2);
  const [nexus, impact] = shots;
  assert.equal(nexus.x, 3);
  assert.equal(nexus.z, 70);
  near(nexus.durationSeconds, 0.7, 'nexus duration');
  near(nexus.holdSeconds, 0.8, 'nexus hold');
  assert.equal(nexus.distance, 38);
  assert.equal(impact.x, -4);
  assert.equal(impact.z, -20);
  near(impact.durationSeconds, (0.7 + 2.2 - 0.15) - 1.5, 'impact duration');
  near(impact.holdSeconds, artilleryStrikeDurationSeconds(3) - 2.75 + 0.8, 'impact hold');
  assert.equal(impact.distance, 50);
});

test('airStrikeShots holds until the last bomb lands', () => {
  for (const heading of [{ x: 1, z: 0 }, { x: 0, z: -1 }, { x: -0.6, z: 0.8 }]) {
    const shots = airStrikeShots({ x: 5, z: -30 }, heading);
    assert.equal(shots.length, 1);
    const [shot] = shots;
    assert.equal(shot.x, 5);
    assert.equal(shot.z, -30);
    assert.equal(shot.durationSeconds, 1);
    const last = Math.max(...AIR_STRIKE_BOMB_OFFSETS.map((offset) => nominalBombLandingSeconds(offset, heading)));
    near(shot.holdSeconds, last + 0.6 - 1, 'hold');
    assert.equal(shot.distance, 45);
  }
});
