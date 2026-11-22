import type { BuildableStructureKind } from '../game/definitions/structures.ts';
import type { SoldierKind } from '../game/ecs/components.ts';
import type { HudView } from './hud/hudView.ts';

export type BuildingType = BuildableStructureKind;
export type UnitType = SoldierKind;
export type Difficulty = 'easy' | 'normal' | 'hard';
export type RewardId = 'artillery_strike' | 'air_strike' | 'defensive_shield';
export type RewardStatus =
  | 'LOCKED'
  | 'INSUFFICIENT GOLD'
  | 'READY'
  | 'ACTIVE'
  | 'NO VALID TARGET'
  | 'COOLDOWN';

export interface MissionSettings {
  difficulty: Difficulty;
  mode: 'ai';
}

export interface UnlockView {
  id: string;
  title?: string;
  type: 'permanent' | 'temporary';
  unlocked: boolean;
  ready: boolean;
  description?: string;
}

export interface GameOverSummary {
  victory: boolean;
  soldiersTrained: number;
  losses: number;
  buildingsConstructed: number;
  duration: string;
  enemyBaseDamagePercent: number;
}

export interface BarracksProductionView {
  unit: UnitType;
  remainingSeconds: number;
  durationSeconds: number;
}

export interface GameActions {
  startGame(settings: MissionSettings): void;
  restartGame(): void;
  exitToMenu(): void;
  pauseGame(): void;
  resumeGame(): void;
  toggleDemolishMode(): void;
  selectBuilding(type: BuildingType): void;
  trainUnit(type: UnitType): void;
  /** Returns whether the reward was accepted and its effect started. */
  activateReward(id: RewardId): boolean;
  toggleAutoZoom(): void;
}

export interface RewardCardState {
  id: RewardId;
  status: RewardStatus;
  remainingSeconds: number;
  cooldownSeconds: number;
}

export interface RewardUiState {
  difficulty: Difficulty;
  combatPoints: number;
  gold: number;
  rewards: readonly RewardCardState[];
}

export interface GameUiPort {
  getCanvasContainer(): HTMLElement;
  bindActions(actions: GameActions): void;
  getMissionSettings(): MissionSettings;
  showToast(message: string): void;
  enterGameplay(): void;
  enterMainMenu(): void;
  setPaused(paused: boolean): void;
  /** Draws the HUD from the presenter's view; called once per playing frame. */
  render(view: Readonly<HudView>): void;
  /** Pulses a red screen-edge warning while the player's Nexus is being hit. */
  flashNexusAlert(): void;
  setDemolishMode(active: boolean): void;
  setPlacementActive(active: boolean): void;
  setUnlocks(unlocks: readonly UnlockView[]): void;
  showGameOver(summary: GameOverSummary): void;
  setPermanentUnlockCount(count: number): void;
  setAutoZoom(enabled: boolean): void;
}
