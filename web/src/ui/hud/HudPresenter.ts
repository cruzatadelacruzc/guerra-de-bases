import { COMPONENTS } from '../../game/ecs/components.ts';
import type { Entity, Faction } from '../../game/ecs/components.ts';
import type { WorldReader } from '../../game/ecs/WorldReader.ts';
import { SOLDIER_PRODUCTION } from '../../game/ecs/initialBattle.ts';
import { STRUCTURE_DEFINITIONS } from '../../game/definitions/structures.ts';
import { producerAvailability } from '../../game/commands/trainCommand.ts';
import type { InteractionMode } from '../../game/InteractionMode.ts';
import type { MatchState } from '../../game/match/MatchState.ts';
import {
  REWARD_COOLDOWN_MS,
  getRewardDefinitionForDifficulty,
  validateRewardActivation
} from '../../game/rewardSystem.ts';
import type { Difficulty, RewardId, StrikeId } from '../../game/rewardSystem.ts';
import { ACTION_CATALOG, structurePresentation } from './actionCatalog.ts';
import type { ActionPresentation } from './actionCatalog.ts';
import type {
  ActionView,
  FactionSummaryView,
  HudView,
  ModeView,
  ProducerView,
  RewardButtonView
} from './hudView.ts';

export interface HudPresenterInput {
  world: WorldReader;
  bases: Readonly<Record<Faction, Entity>>;
  match: Readonly<MatchState>;
  difficulty: Difficulty;
  /** Gameplay clock in milliseconds. */
  nowMs: number;
  mode: InteractionMode;
  /** Player's reward-target count; called at most every 250 ms. */
  countRewardTargets(): number;
}

const CRITICAL_HEALTH_PERCENT = 30;
const REWARD_REFRESH_MS = 250;
const REWARD_IDS: readonly RewardId[] = ['artillery_strike', 'air_strike', 'defensive_shield'];
const PRODUCTION_COMPONENTS = [COMPONENTS.production, COMPONENTS.faction] as const;
const NONE_MODE: ModeView = { kind: 'none' };
const SELLING_MODE: ModeView = { kind: 'selling' };

function healthPercentOf(world: WorldReader, base: Entity | undefined): number {
  const health = base === undefined ? undefined : world.getComponent(base, COMPONENTS.health);
  if (!health || health.max <= 0 || health.current <= 0) return 0;
  return Math.min(100, Math.max(0, Math.ceil((health.current / health.max) * 100)));
}

function createSummary(): FactionSummaryView {
  return { healthPercent: 0, critical: false, criticalEntered: false, gold: 0, combatPoints: 0 };
}

/** Reads the ECS and match state and fills one reusable HudView; never touches the DOM. */
export class HudPresenter {
  private readonly view: HudView;
  private readonly scratch: Entity[] = [];
  private readonly actionProducers: (ProducerView | undefined)[];
  private playerWasCritical = false;
  private rewardsDue = true;
  private lastRewardMs = 0;
  private rewardTargets = 0;
  private lastMode: InteractionMode | undefined;

  constructor(catalog: readonly ActionPresentation[] = ACTION_CATALOG) {
    const producers: ProducerView[] = [];
    const actions: ActionView[] = [];
    this.actionProducers = [];
    for (const presentation of catalog) {
      let producerView: ProducerView | undefined;
      if (presentation.kind === 'unit') {
        const producerId = SOLDIER_PRODUCTION[presentation.id].producer;
        producerView = producers.find((entry) => entry.producer.id === producerId);
        if (!producerView) {
          producerView = { producer: structurePresentation(producerId), total: 0, free: 0 };
          producers.push(producerView);
        }
      }
      this.actionProducers.push(producerView);
      actions.push({
        key: `${presentation.kind}:${presentation.id}`,
        presentation,
        state: 'available',
        cost: 0,
        productionSeconds: presentation.kind === 'unit' ? SOLDIER_PRODUCTION[presentation.id].durationSeconds : null,
        progressPercent: 0,
        orders: 0,
        missingGold: 0,
        requirement: null
      });
    }
    const rewards: RewardButtonView[] = REWARD_IDS.map((id) => ({
      id,
      title: '',
      state: 'missing-points',
      pointsCost: 0,
      goldCost: 0,
      missingPoints: 0,
      missingGold: 0,
      remainingSeconds: 0,
      ringFraction: 0
    }));
    this.view = { player: createSummary(), enemy: createSummary(), actions, producers, rewards, mode: NONE_MODE };
  }

  /** The next update recomputes rewards even if 250 ms have not passed. */
  invalidateRewards(): void {
    this.rewardsDue = true;
  }

  /** New match: rearms the critical alert and the rewards. */
  reset(): void {
    this.playerWasCritical = false;
    this.rewardsDue = true;
    this.rewardTargets = 0;
    this.lastMode = undefined;
  }

  update(input: HudPresenterInput): HudView {
    const { view } = this;
    this.updateFaction(input, 'player', view.player);
    this.updateFaction(input, 'enemy', view.enemy);
    const critical = view.player.critical;
    view.player.criticalEntered = critical && !this.playerWasCritical;
    this.playerWasCritical = critical;
    view.enemy.criticalEntered = false;

    this.updateProducers(input);
    this.updateActions(input);
    if (this.rewardsDue || input.nowMs < this.lastRewardMs || input.nowMs - this.lastRewardMs >= REWARD_REFRESH_MS) {
      this.updateRewards(input);
    }
    this.updateMode(input.mode);
    return view;
  }

  private updateFaction(input: HudPresenterInput, side: Faction, out: FactionSummaryView): void {
    out.healthPercent = healthPercentOf(input.world, input.bases[side]);
    out.critical = out.healthPercent <= CRITICAL_HEALTH_PERCENT;
    out.gold = Math.floor(input.world.getComponent(input.bases[side], COMPONENTS.economy)?.gold ?? 0);
    out.combatPoints = input.match.combatPoints[side];
  }

  private updateProducers(input: HudPresenterInput): void {
    for (const producer of this.view.producers) {
      producerAvailability(input.world, 'player', producer.producer.id, this.scratch, producer);
    }
  }

  private updateActions(input: HudPresenterInput): void {
    const gold = this.view.player.gold;
    const { actions } = this.view;
    // Orders and closest progress per unit kind, from the player's production orders.
    for (const action of actions) {
      action.orders = 0;
      action.progressPercent = 0;
    }
    input.world.queryInto(this.scratch, PRODUCTION_COMPONENTS);
    for (const entity of this.scratch) {
      if (input.world.getComponent(entity, COMPONENTS.faction) !== 'player') continue;
      const order = input.world.getComponent(entity, COMPONENTS.production)?.order;
      if (!order) continue;
      const progress = order.durationSeconds > 0
        ? Math.floor((1 - order.remainingSeconds / order.durationSeconds) * 100)
        : 100;
      for (const action of actions) {
        if (action.presentation.kind !== 'unit' || action.presentation.id !== order.kind) continue;
        action.orders++;
        if (action.orders === 1 || progress > action.progressPercent) action.progressPercent = progress;
      }
    }

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const { presentation } = action;
      const producer = this.actionProducers[i];
      action.requirement = null;
      if (presentation.kind === 'structure') {
        action.cost = STRUCTURE_DEFINITIONS[presentation.id].cost;
        action.missingGold = Math.max(0, action.cost - gold);
        if (input.mode.kind === 'placing' && input.mode.structure === presentation.id) action.state = 'selected';
        else action.state = gold < action.cost ? 'unaffordable' : 'available';
        continue;
      }
      action.cost = SOLDIER_PRODUCTION[presentation.id].cost;
      action.missingGold = Math.max(0, action.cost - gold);
      if (producer && producer.total === 0) {
        action.state = 'requirement';
        action.requirement = producer.producer;
      } else if (producer && producer.free === 0) {
        action.state = 'busy';
        action.requirement = producer.producer;
      } else {
        action.state = gold < action.cost ? 'unaffordable' : 'available';
      }
    }
  }

  private updateRewards(input: HudPresenterInput): void {
    this.rewardsDue = false;
    this.lastRewardMs = input.nowMs;
    this.rewardTargets = input.countRewardTargets();
    const { nowMs, match } = input;
    const state = match.rewards.player;
    const points = match.combatPoints.player;
    const gold = this.view.player.gold;
    for (const reward of this.view.rewards) {
      const definition = getRewardDefinitionForDifficulty(reward.id, input.difficulty);
      reward.title = definition.title;
      reward.pointsCost = definition.pointsCost;
      reward.goldCost = definition.goldCost;
      reward.missingPoints = Math.max(0, definition.pointsCost - points);
      reward.missingGold = Math.max(0, definition.goldCost - gold);
      reward.remainingSeconds = 0;
      reward.ringFraction = 1;

      const activeUntil = reward.id === 'defensive_shield'
        ? state.shieldUntilMs
        : state.strikeActiveUntilMs[reward.id as StrikeId] ?? 0;
      if (activeUntil > nowMs) {
        reward.state = 'active';
        reward.remainingSeconds = (activeUntil - nowMs) / 1000;
        reward.ringFraction = Math.min(1, Math.max(0, reward.remainingSeconds / definition.durationSeconds));
        continue;
      }
      const result = validateRewardActivation({
        id: reward.id,
        points,
        gold,
        difficulty: input.difficulty,
        validTargetCount: this.rewardTargets,
        activeShield: state.shieldUntilMs > nowMs,
        cooldownMs: REWARD_COOLDOWN_MS,
        now: nowMs,
        expiresAt: state.cooldownUntilMs
      });
      switch (result.reason) {
        case undefined:
          reward.state = 'ready';
          break;
        case 'insufficient-points':
          reward.state = 'missing-points';
          reward.ringFraction = Math.min(1, Math.max(0, points / definition.pointsCost));
          break;
        case 'insufficient-gold':
          reward.state = 'missing-gold';
          break;
        case 'no-valid-target':
          reward.state = 'no-target';
          break;
        case 'shield-active':
          reward.state = 'active';
          break;
        case 'cooldown':
          reward.state = 'cooldown';
          reward.remainingSeconds = Math.max(0, (state.cooldownUntilMs - nowMs) / 1000);
          reward.ringFraction = Math.min(1, Math.max(0, 1 - reward.remainingSeconds / (REWARD_COOLDOWN_MS / 1000)));
          break;
      }
    }
  }

  private updateMode(mode: InteractionMode): void {
    if (mode === this.lastMode) return;
    this.lastMode = mode;
    switch (mode.kind) {
      case 'none':
        this.view.mode = NONE_MODE;
        break;
      case 'selling':
        this.view.mode = SELLING_MODE;
        break;
      case 'placing':
        this.view.mode = { kind: 'placing', structure: structurePresentation(mode.structure) };
        break;
      case 'confirmingSale':
        this.view.mode = {
          kind: 'confirmingSale',
          structure: structurePresentation(mode.structure),
          refund: mode.refund
        };
        break;
    }
  }
}
