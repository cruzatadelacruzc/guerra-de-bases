import { DecisionClock } from './DecisionClock.ts';
import { decideEnemyTurn, rollEnemyAiTargets } from './enemyAi.ts';
import type { EnemyAiSnapshot, EnemyAiTargets, EnemyAiTurn, Rng } from './enemyAi.ts';
import type { EnemyAiProfile } from './enemyAiProfile.ts';

/** The enemy AI of one match: its decision pace, its structure targets and its randomness. */
export class EnemyAiController {
  readonly targets: EnemyAiTargets;
  readonly #profile: EnemyAiProfile;
  readonly #rng: Rng;
  readonly #clock: DecisionClock;

  constructor(profile: EnemyAiProfile, rng: Rng) {
    this.#profile = profile;
    this.#rng = rng;
    this.#clock = new DecisionClock(profile.decisionIntervalSeconds);
    this.targets = rollEnemyAiTargets(profile, rng);
  }

  /** Advances gameplay time; reads the match only when a decision is due. */
  update(deltaSeconds: number, readSnapshot: () => EnemyAiSnapshot): EnemyAiTurn | null {
    if (!this.#clock.advance(deltaSeconds)) return null;
    return decideEnemyTurn(readSnapshot(), this.targets, this.#profile, this.#rng);
  }
}
