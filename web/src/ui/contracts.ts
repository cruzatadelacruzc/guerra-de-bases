export type BuildingType = 'generator' | 'barracks' | 'turret';
export type UnitType = 'rifleman' | 'tank';
export type Difficulty = 'easy' | 'normal' | 'hard';

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

export interface GameActions {
  startGame(settings: MissionSettings): void;
  restartGame(): void;
  exitToMenu(): void;
  pauseGame(): void;
  resumeGame(): void;
  toggleDemolishMode(): void;
  selectBuilding(type: BuildingType): void;
  trainUnit(type: UnitType): void;
  activateUnlock(id: string | null): void;
}

export interface GameUiPort {
  getCanvasContainer(): HTMLElement;
  bindActions(actions: GameActions): void;
  getMissionSettings(): MissionSettings;
  showToast(message: string): void;
  enterGameplay(): void;
  enterMainMenu(): void;
  setPaused(paused: boolean): void;
  updateResources(gold: number, enemyGold: number, barracksCount: number): void;
  setBaseHealth(
    player: { current: number; maximum: number },
    enemy: { current: number; maximum: number }
  ): void;
  setAiStatus(status: string): void;
  setDemolishMode(active: boolean): void;
  setPlacementActive(active: boolean): void;
  setUnlocks(unlocks: readonly UnlockView[]): void;
  showGameOver(summary: GameOverSummary): void;
  setPermanentUnlockCount(count: number): void;
}
