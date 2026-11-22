import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENTS } from '../../game/ecs/components.ts';
import type { Faction, Position } from '../../game/ecs/components.ts';
import { SOLDIER_PRODUCTION } from '../../game/ecs/initialBattle.ts';
import { buildStructure } from '../../game/commands/structureCommands.ts';
import { trainUnit } from '../../game/commands/trainCommand.ts';
import { createCommandTestContext, setGold } from '../../game/commands/commandTestState.ts';
import type { CommandContext } from '../../game/commands/CommandContext.ts';
import { NO_INTERACTION } from '../../game/InteractionMode.ts';
import type { InteractionMode } from '../../game/InteractionMode.ts';
import { REWARD_COOLDOWN_MS, REWARD_DEFINITIONS } from '../../game/rewardSystem.ts';
import { HudPresenter } from './HudPresenter.ts';
import type { HudPresenterInput } from './HudPresenter.ts';

const at = (x: number, z: number): Position => ({ x, y: 0, z });

function input(
  ctx: CommandContext,
  overrides: Partial<HudPresenterInput> = {}
): HudPresenterInput {
  return {
    world: ctx.world,
    bases: ctx.bases,
    match: ctx.match,
    difficulty: 'normal',
    nowMs: 0,
    mode: NO_INTERACTION,
    countRewardTargets: () => 1,
    ...overrides
  };
}

function setHealth(ctx: CommandContext, faction: Faction, current: number): void {
  const health = ctx.world.getComponent(ctx.bases[faction], COMPONENTS.health);
  if (!health) throw new Error('No base health');
  health.current = current;
}

function barracks(ctx: CommandContext, x: number) {
  setGold(ctx, 'player', 10000);
  const built = buildStructure(ctx, 'player', 'barracks', at(x, 40));
  assert.ok(built.accepted);
  return built.entity;
}

function action(view: ReturnType<HudPresenter['update']>, key: string) {
  const found = view.actions.find((entry) => entry.key === key);
  assert.ok(found, key);
  return found;
}

function reward(view: ReturnType<HudPresenter['update']>, id: string) {
  const found = view.rewards.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
}

test('player and enemy summaries come from the same rules', () => {
  const ctx = createCommandTestContext();
  setGold(ctx, 'player', 321.9);
  setGold(ctx, 'enemy', 321.9);
  setHealth(ctx, 'player', 500);
  setHealth(ctx, 'enemy', 500);
  ctx.match.combatPoints.player = 7;
  ctx.match.combatPoints.enemy = 7;
  const view = new HudPresenter().update(input(ctx));
  assert.deepEqual(view.player, view.enemy);
  assert.equal(view.player.gold, 321);
  assert.equal(view.player.combatPoints, 7);
});

test('health percent rounds up and reaches 0 only at 0', () => {
  const ctx = createCommandTestContext();
  const presenter = new HudPresenter();
  const max = ctx.world.getComponent(ctx.bases.player, COMPONENTS.health)?.max;
  assert.equal(max, 1200);
  for (const [current, percent] of [[1, 1], [1199, 100], [0, 0]] as const) {
    setHealth(ctx, 'player', current);
    assert.equal(presenter.update(input(ctx)).player.healthPercent, percent);
  }
});

test('30 percent is critical; criticalEntered fires once', () => {
  const ctx = createCommandTestContext();
  const presenter = new HudPresenter();
  const run = (percent: number): [boolean, boolean] => {
    setHealth(ctx, 'player', (1200 * percent) / 100);
    const view = presenter.update(input(ctx));
    return [view.player.critical, view.player.criticalEntered];
  };
  assert.deepEqual(run(31), [false, false]);
  assert.deepEqual(run(30), [true, true]);
  assert.deepEqual(run(25), [true, false]);
  assert.deepEqual(run(40), [false, false]);
  assert.deepEqual(run(30), [true, true]);
  setHealth(ctx, 'enemy', 100);
  assert.equal(presenter.update(input(ctx)).enemy.criticalEntered, false);
});

test('reset rearms the critical alert', () => {
  const ctx = createCommandTestContext();
  const presenter = new HudPresenter();
  setHealth(ctx, 'player', 300);
  assert.equal(presenter.update(input(ctx)).player.criticalEntered, true);
  assert.equal(presenter.update(input(ctx)).player.criticalEntered, false);
  presenter.reset();
  assert.equal(presenter.update(input(ctx)).player.criticalEntered, true);
});

test('gold equal to cost is available; one less is unaffordable with missingGold 1', () => {
  const ctx = createCommandTestContext();
  const presenter = new HudPresenter();
  setGold(ctx, 'player', 100);
  let generator = action(presenter.update(input(ctx)), 'structure:generator');
  assert.equal(generator.state, 'available');
  assert.equal(generator.missingGold, 0);
  setGold(ctx, 'player', 99);
  generator = action(presenter.update(input(ctx)), 'structure:generator');
  assert.equal(generator.state, 'unaffordable');
  assert.equal(generator.missingGold, 1);
});

test('placing marks only that structure as selected', () => {
  const ctx = createCommandTestContext();
  setGold(ctx, 'player', 10000);
  const mode: InteractionMode = { kind: 'placing', structure: 'turret' };
  const view = new HudPresenter().update(input(ctx, { mode }));
  assert.equal(action(view, 'structure:turret').state, 'selected');
  assert.equal(action(view, 'structure:barracks').state, 'available');
  assert.equal(view.mode.kind, 'placing');
  assert.equal(view.mode.kind === 'placing' && view.mode.structure.id, 'turret');
});

test('units need a live producer, then a free one', () => {
  const ctx = createCommandTestContext();
  const presenter = new HudPresenter();
  setGold(ctx, 'player', 10000);
  let view = presenter.update(input(ctx));
  assert.equal(action(view, 'unit:rifleman').state, 'requirement');
  assert.equal(action(view, 'unit:rifleman').requirement?.id, 'barracks');
  assert.equal(view.producers[0].total, 0);

  const factory = barracks(ctx, 0);
  assert.ok(trainUnit(ctx, 'player', factory, 'rifleman', at(0, 37)).accepted);
  view = presenter.update(input(ctx));
  assert.equal(action(view, 'unit:rifleman').state, 'busy');
  assert.equal(action(view, 'unit:rifleman').requirement?.id, 'barracks');
  assert.deepEqual([view.producers[0].total, view.producers[0].free], [1, 0]);

  barracks(ctx, 20);
  setGold(ctx, 'player', 10000);
  view = presenter.update(input(ctx));
  assert.equal(action(view, 'unit:rifleman').state, 'available');
  assert.equal(action(view, 'unit:rifleman').requirement, null);
  assert.deepEqual([view.producers[0].total, view.producers[0].free], [2, 1]);
});

test('orders and progress per unit kind', () => {
  const ctx = createCommandTestContext();
  const first = barracks(ctx, 0);
  const second = barracks(ctx, 20);
  setGold(ctx, 'player', 10000);
  assert.ok(trainUnit(ctx, 'player', first, 'rifleman', at(0, 37)).accepted);
  assert.ok(trainUnit(ctx, 'player', second, 'rifleman', at(20, 37)).accepted);
  const duration = SOLDIER_PRODUCTION.rifleman.durationSeconds;
  const order = ctx.world.getComponent(first, COMPONENTS.production)?.order;
  assert.ok(order);
  order.remainingSeconds = duration / 2;
  const view = new HudPresenter().update(input(ctx));
  assert.equal(action(view, 'unit:rifleman').orders, 2);
  assert.equal(action(view, 'unit:rifleman').progressPercent, 50);
  assert.equal(action(view, 'unit:tank').orders, 0);
});

test('reward states match validateRewardActivation', () => {
  const ctx = createCommandTestContext();
  const presenter = new HudPresenter();
  const artillery = REWARD_DEFINITIONS.artillery_strike;
  const state = (overrides: Partial<HudPresenterInput> = {}) => {
    presenter.invalidateRewards();
    return reward(presenter.update(input(ctx, overrides)), 'artillery_strike');
  };

  ctx.match.combatPoints.player = artillery.pointsCost - 4;
  setGold(ctx, 'player', 10000);
  let r = state();
  assert.equal(r.state, 'missing-points');
  assert.equal(r.missingPoints, 4);
  assert.equal(r.ringFraction, (artillery.pointsCost - 4) / artillery.pointsCost);

  ctx.match.combatPoints.player = artillery.pointsCost;
  setGold(ctx, 'player', artillery.goldCost - 5);
  r = state();
  assert.equal(r.state, 'missing-gold');
  assert.equal(r.missingGold, 5);
  assert.equal(r.ringFraction, 1);

  setGold(ctx, 'player', artillery.goldCost);
  assert.equal(state({ countRewardTargets: () => 0 }).state, 'no-target');
  assert.equal(state().state, 'ready');

  ctx.match.rewards.player.cooldownUntilMs = 10000;
  r = state({ nowMs: 5000 });
  assert.equal(r.state, 'cooldown');
  assert.equal(r.remainingSeconds, 5);
  assert.equal(r.ringFraction, 1 - 5 / (REWARD_COOLDOWN_MS / 1000));
});

test('active strikes and shield report remaining seconds', () => {
  const ctx = createCommandTestContext();
  ctx.match.rewards.player.strikeActiveUntilMs.air_strike = 15000;
  ctx.match.rewards.player.shieldUntilMs = 8000;
  const view = new HudPresenter().update(input(ctx, { nowMs: 5000 }));
  const air = reward(view, 'air_strike');
  assert.equal(air.state, 'active');
  assert.equal(air.remainingSeconds, 10);
  assert.equal(air.ringFraction, 10 / REWARD_DEFINITIONS.air_strike.durationSeconds);
  const shield = reward(view, 'defensive_shield');
  assert.equal(shield.state, 'active');
  assert.equal(shield.remainingSeconds, 3);
  assert.equal(shield.ringFraction, 3 / REWARD_DEFINITIONS.defensive_shield.durationSeconds);
  assert.equal(reward(view, 'artillery_strike').state, 'missing-points');
});

test('targets are counted at most every 250 ms unless invalidated', () => {
  const ctx = createCommandTestContext();
  const presenter = new HudPresenter();
  let calls = 0;
  const countRewardTargets = () => {
    calls++;
    return 1;
  };
  for (const nowMs of [0, 100, 249, 250]) presenter.update(input(ctx, { nowMs, countRewardTargets }));
  assert.equal(calls, 2);
  presenter.invalidateRewards();
  presenter.update(input(ctx, { nowMs: 251, countRewardTargets }));
  assert.equal(calls, 3);
});

test('update reuses the view', () => {
  const ctx = createCommandTestContext();
  const presenter = new HudPresenter();
  const a = presenter.update(input(ctx));
  const { actions, rewards, producers } = a;
  const b = presenter.update(input(ctx, { nowMs: 1000, mode: { kind: 'selling' } }));
  assert.equal(a, b);
  assert.equal(b.actions, actions);
  assert.equal(b.rewards, rewards);
  assert.equal(b.producers, producers);
  assert.equal(b.mode.kind, 'selling');
});
