import type { RewardId } from '../../game/rewardSystem.ts';
import type { ActionPresentation, StructurePresentation } from './actionCatalog.ts';

export interface FactionSummaryView {
  healthPercent: number;
  critical: boolean;
  /** True only in the update where `critical` turns on (player only). */
  criticalEntered: boolean;
  gold: number;
  combatPoints: number;
}

export type ActionState = 'available' | 'unaffordable' | 'requirement' | 'busy' | 'selected';

export interface ActionView {
  readonly key: string;
  readonly presentation: ActionPresentation;
  state: ActionState;
  cost: number;
  productionSeconds: number | null;
  progressPercent: number;
  orders: number;
  missingGold: number;
  /** The producer that is missing ('requirement') or busy ('busy'); null otherwise. */
  requirement: StructurePresentation | null;
}

export interface ProducerView {
  readonly producer: StructurePresentation;
  total: number;
  free: number;
}

export type RewardButtonState = 'missing-points' | 'missing-gold' | 'no-target' | 'cooldown' | 'active' | 'ready';

export interface RewardButtonView {
  readonly id: RewardId;
  title: string;
  state: RewardButtonState;
  pointsCost: number;
  goldCost: number;
  missingPoints: number;
  missingGold: number;
  remainingSeconds: number;
  ringFraction: number;
}

export type ModeView =
  | { kind: 'none' }
  | { kind: 'placing'; structure: StructurePresentation }
  | { kind: 'selling' }
  | { kind: 'confirmingSale'; structure: StructurePresentation; refund: number };

export interface HudView {
  player: FactionSummaryView;
  enemy: FactionSummaryView;
  actions: ActionView[];
  producers: ProducerView[];
  rewards: RewardButtonView[];
  mode: ModeView;
}
