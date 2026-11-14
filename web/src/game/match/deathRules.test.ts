import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchHarness } from './matchHarness.ts';
import type { ProcessorKind } from './matchHarness.ts';

const PROCESSORS: readonly ProcessorKind[] = ['legacy'];

for (const kind of PROCESSORS) {
  const harness = () => new MatchHarness(kind);

  test(`[${kind}] kills give combat points to the other faction`, () => {
    const match = harness();
    const enemyRifleman = match.addSoldier('enemy', 'rifleman');
    const enemyTank = match.addSoldier('enemy', 'tank');
    const playerRifleman = match.addSoldier('player', 'rifleman');
    const playerTank = match.addSoldier('player', 'tank');

    match.setHealth(enemyRifleman, 0);
    assert.equal(match.processFrame().combatPoints.player, 1);
    match.setHealth(enemyTank, 0);
    assert.equal(match.processFrame().combatPoints.player, 4);
    match.setHealth(playerRifleman, 0);
    assert.equal(match.processFrame().combatPoints.enemy, 1);
    match.setHealth(playerTank, 0);
    assert.equal(match.processFrame().combatPoints.enemy, 4);
  });

  test(`[${kind}] structures give combat points by kind; the Nexus gives none`, () => {
    const match = harness();
    const expected = { turret: 4, generator: 4, barracks: 6 } as const;
    for (const structure of ['turret', 'generator', 'barracks'] as const) {
      const enemy = match.addStructure('enemy', structure);
      const player = match.addStructure('player', structure);
      const before = match.processFrame().combatPoints;
      match.setHealth(enemy, 0);
      match.setHealth(player, 0);
      const after = match.processFrame().combatPoints;
      assert.equal(after.player - before.player, expected[structure], structure);
      assert.equal(after.enemy - before.enemy, expected[structure], structure);
    }
    const before = match.processFrame().combatPoints.player;
    match.setHealth(match.simulation.enemyBase, 0);
    assert.equal(match.processFrame().combatPoints.player, before);
  });

  test(`[${kind}] kill streaks grow and reset`, () => {
    const match = harness();
    for (let kill = 0; kill < 3; kill++) {
      match.setHealth(match.addSoldier('enemy', 'rifleman'), 0);
      match.processFrame();
    }
    assert.equal(match.processFrame().killStreak.player, 3);
    match.setHealth(match.addSoldier('player', 'rifleman'), 0);
    assert.deepEqual(match.processFrame().killStreak, { player: 0, enemy: 1 });
  });

  test(`[${kind}] player units are processed before enemy units`, () => {
    const match = harness();
    match.setHealth(match.addSoldier('player', 'rifleman'), 0);
    match.setHealth(match.addSoldier('enemy', 'rifleman'), 0);
    assert.deepEqual(match.processFrame().killStreak, { player: 1, enemy: 0 });
  });

  test(`[${kind}] unit counters and the twentieth kill`, () => {
    const match = harness();
    match.setHealth(match.addSoldier('player', 'tank'), 0);
    assert.equal(match.processFrame().playerUnitsLost, 1);
    for (let kill = 1; kill <= 21; kill++) {
      match.setHealth(match.addSoldier('enemy', 'rifleman'), 0);
      const frame = match.processFrame();
      const achievements = frame.unlockCalls.filter((call) => call.name === 'achievement');
      assert.equal(frame.playerUnitsDestroyed, kill);
      assert.deepEqual(achievements, kill === 20 ? [{ name: 'achievement', payload: { achievement: 'destroy_20_units' } }] : [], `kill ${kill}`);
    }
  });

  test(`[${kind}] a death is handled once`, () => {
    const match = harness();
    const enemy = match.addSoldier('enemy', 'tank');
    match.setHealth(enemy, 0);
    const first = match.processFrame();
    assert.deepEqual(first.removed, [enemy]);
    assert.equal(match.simulation.world.getComponent(enemy, 'health'), undefined);
    const second = match.processFrame();
    assert.deepEqual(second.removed, []);
    assert.deepEqual(second.unlockCalls, []);
    assert.deepEqual(second.combatPoints, first.combatPoints);
    assert.equal(second.playerUnitsDestroyed, first.playerUnitsDestroyed);
  });

  test(`[${kind}] damage applied outside the fixed step is resolved in the same frame`, () => {
    const match = harness();
    const turret = match.addStructure('enemy', 'turret');
    match.damage(turret, 380);
    assert.equal(match.processFrame().combatPoints.player, 4);
  });

  test(`[${kind}] match result`, () => {
    const victory = harness();
    victory.setHealth(victory.simulation.enemyBase, 0);
    assert.equal(victory.processFrame().ending, 'victory');
    assert.equal(victory.simulation.world.getComponent(victory.simulation.enemyBase, 'health'), undefined);

    const defeat = harness();
    defeat.setHealth(defeat.simulation.playerBase, 0);
    assert.equal(defeat.processFrame().ending, 'defeat');

    const both = harness();
    both.setHealth(both.simulation.playerBase, 0);
    both.setHealth(both.simulation.enemyBase, 0);
    assert.equal(both.processFrame().ending, 'defeat');

    assert.equal(harness().processFrame().ending, null);
  });

  test(`[${kind}] exactly zero health is a death; positive health is not`, () => {
    const match = harness();
    const dead = match.addSoldier('enemy', 'rifleman');
    const alive = match.addSoldier('enemy', 'rifleman');
    match.setHealth(dead, 0);
    match.setHealth(alive, 0.001);
    assert.deepEqual(match.processFrame().removed, [dead]);
  });

  test(`[${kind}] events follow the processing order`, () => {
    const match = harness();
    const player1 = match.addSoldier('player', 'rifleman');
    const player2 = match.addSoldier('player', 'tank');
    const enemy1 = match.addSoldier('enemy', 'rifleman');
    const enemy2 = match.addSoldier('enemy', 'tank');
    const playerStructure = match.addStructure('player', 'generator');
    const enemyStructure = match.addStructure('enemy', 'turret');
    for (const entity of [player1, player2, enemy1, enemy2, playerStructure, enemyStructure]) match.setHealth(entity, 0);
    const frame = match.processFrame();
    assert.deepEqual(frame.removed, [player2, player1, enemy2, enemy1, playerStructure, enemyStructure]);
    assert.deepEqual(
      frame.unlockCalls.filter((call) => call.name === 'unit_killed').map((call) => call.payload.unitType),
      ['tank', 'rifleman', 'tank', 'rifleman']
    );
  });

  test(`[${kind}] unlock calls carry the current payloads`, () => {
    const match = harness();
    match.setHealth(match.addSoldier('enemy', 'rifleman'), 0);
    assert.deepEqual(match.processFrame().unlockCalls, [
      { name: 'unit_killed', payload: { byPlayer: true, killStreak: 1, unitType: 'rifleman' } },
      { name: 'kill_streak', payload: { killStreak: 1 } }
    ]);
    match.setHealth(match.addSoldier('player', 'tank'), 0);
    assert.deepEqual(match.processFrame().unlockCalls, [
      { name: 'unit_killed', payload: { byPlayer: false, killStreak: 1, unitType: 'tank' } }
    ]);
  });
}
