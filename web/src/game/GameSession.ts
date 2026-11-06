export type GameSessionState = 'MENU' | 'PLAYING' | 'PAUSED' | 'MATCH_ENDING' | 'GAMEOVER';

export class GameSession {
  #state: GameSessionState = 'MENU';

  get state(): GameSessionState {
    return this.#state;
  }

  start(): void {
    this.#state = 'PLAYING';
  }

  pause(): boolean {
    if (this.#state !== 'PLAYING') return false;
    this.#state = 'PAUSED';
    return true;
  }

  resume(): boolean {
    if (this.#state !== 'PAUSED') return false;
    this.#state = 'PLAYING';
    return true;
  }

  beginEnding(): boolean {
    if (this.#state !== 'PLAYING') return false;
    this.#state = 'MATCH_ENDING';
    return true;
  }

  finish(): void {
    this.#state = 'GAMEOVER';
  }

  returnToMenu(): void {
    this.#state = 'MENU';
  }
}
