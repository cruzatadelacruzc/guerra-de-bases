import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatchState, spendCombatPoints } from './MatchState.ts';

test('a match starts with no points, streaks, losses or result', () => {
  assert.deepEqual(createMatchState(), {
    combatPoints: { player: 0, enemy: 0 },
    killStreak: { player: 0, enemy: 0 },
    playerUnitsDestroyed: 0,
    playerUnitsLost: 0,
    outcome: null
  });
});

test('spending combat points only touches that faction', () => {
  const state = createMatchState();
  state.combatPoints.player = 20;
  state.combatPoints.enemy = 15;
  spendCombatPoints(state, 'player', 10);
  assert.deepEqual(state.combatPoints, { player: 10, enemy: 15 });
});
