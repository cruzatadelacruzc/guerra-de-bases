import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSession } from './GameSession.ts';

test('game session accepts only valid pause and resume transitions', () => {
  const session = new GameSession();
  assert.equal(session.state, 'MENU');
  assert.equal(session.pause(), false);
  session.start();
  assert.equal(session.state, 'PLAYING');
  assert.equal(session.pause(), true);
  assert.equal(session.pause(), false);
  assert.equal(session.state, 'PAUSED');
  assert.equal(session.resume(), true);
  assert.equal(session.resume(), false);
  assert.equal(session.state, 'PLAYING');
  session.finish();
  assert.equal(session.state, 'GAMEOVER');
  session.returnToMenu();
  assert.equal(session.state, 'MENU');
});
