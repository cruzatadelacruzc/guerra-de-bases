import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameSessionState } from '../GameSession.ts';
import { createInitialBattle } from '../ecs/initialBattle.ts';
import { createMatchState } from '../match/MatchState.ts';
import type { MatchOutcome } from '../match/MatchState.ts';
import { checkMatchPlaying } from './CommandContext.ts';
import type { CommandContext } from './CommandContext.ts';

function contextWith(sessionPhase: GameSessionState, outcome: MatchOutcome | null): CommandContext {
  const { world, playerBase, enemyBase } = createInitialBattle();
  const match = createMatchState();
  match.outcome = outcome;
  return { world, bases: { player: playerBase, enemy: enemyBase }, match, sessionPhase, difficulty: 'normal', nowMs: 0 };
}

test('a playing session without a result accepts commands', () => {
  assert.deepEqual(checkMatchPlaying(contextWith('PLAYING', null)), { ok: true });
});

test('a terminal result rejects commands even while the session still plays', () => {
  assert.deepEqual(checkMatchPlaying(contextWith('PLAYING', 'victory')), { ok: false, reason: 'match-over' });
  assert.deepEqual(checkMatchPlaying(contextWith('PLAYING', 'defeat')), { ok: false, reason: 'match-over' });
});

test('a terminal result wins over a session that is not playing', () => {
  assert.deepEqual(checkMatchPlaying(contextWith('PAUSED', 'defeat')), { ok: false, reason: 'match-over' });
});

test('a session outside PLAYING rejects commands', () => {
  for (const phase of ['PAUSED', 'MATCH_ENDING', 'MENU', 'GAMEOVER'] as const) {
    assert.deepEqual(checkMatchPlaying(contextWith(phase, null)), { ok: false, reason: 'not-playing' }, phase);
  }
});
