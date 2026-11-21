import assert from 'node:assert/strict';
import test from 'node:test';
import { BattleSimulation } from '../ecs/BattleSimulation.ts';
import { COMPONENTS } from '../ecs/components.ts';
import { createSoldier, createStructure, SOLDIER_PRODUCTION } from '../ecs/initialBattle.ts';
import { createMatchState } from './MatchState.ts';
import { applyFactionShield, applyRewardDamage } from './shield.ts';

test('a projectile hitting a shielded Nexus loses half its damage, once', () => {
  const match = createMatchState();
  const nowMs = 1000;
  match.rewards.player.shieldUntilMs = nowMs + 10000;
  let bases = { player: -1, enemy: -1 };
  const simulation = new BattleSimulation({
    modifyDamage: (target, amount) => applyFactionShield(match, bases, target, amount, nowMs, 'normal')
  });
  bases = { player: simulation.playerBase, enemy: simulation.enemyBase };
  const rifleman = SOLDIER_PRODUCTION.rifleman;
  createSoldier(simulation.world, 'enemy', { x: 0, y: 0, z: 54 }, 0, rifleman.range, rifleman.health, 'rifleman');

  let impacts = 0;
  for (let frame = 0; frame < 600 && impacts === 0; frame++) {
    simulation.advance(1 / 30);
    impacts += simulation.drainProjectileImpacts().filter((impact) => impact.target === simulation.playerBase).length;
  }
  assert.ok(impacts > 0, 'the soldier never hit the Nexus');
  const health = simulation.world.getComponent(simulation.playerBase, COMPONENTS.health);
  assert.equal(health?.current, 1200 - impacts * rifleman.weapon.damage * 0.5);
});

test('reward damage to a shielded Nexus loses half, once', () => {
  const simulation = new BattleSimulation();
  const bases = { player: simulation.playerBase, enemy: simulation.enemyBase };
  const match = createMatchState();
  match.rewards.enemy.shieldUntilMs = 5000;
  const result = applyRewardDamage(simulation.world, match, bases, simulation.enemyBase, 100, 0, 'normal');
  assert.deepEqual(result, { current: 1150, destroyed: false });
});

test('the shield only protects its own active Nexus', () => {
  const simulation = new BattleSimulation();
  const bases = { player: simulation.playerBase, enemy: simulation.enemyBase };
  const match = createMatchState();
  const turret = createStructure(simulation.world, 'player', { x: 0, y: 0, z: 40 }, 380, 'turret');
  match.rewards.player.shieldUntilMs = 5000;
  assert.equal(applyFactionShield(match, bases, turret, 100, 0, 'normal'), 100);
  assert.equal(applyFactionShield(match, bases, simulation.enemyBase, 100, 0, 'normal'), 100);
  assert.equal(applyFactionShield(match, bases, simulation.playerBase, 100, 5000, 'normal'), 100);
  assert.equal(applyFactionShield(match, bases, simulation.playerBase, 100, 4999, 'normal'), 50);
});
