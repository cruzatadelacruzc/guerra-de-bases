export type Difficulty = 'easy' | 'normal' | 'hard';
export type RewardId = 'artillery_strike' | 'air_strike' | 'defensive_shield';

export interface DifficultyProfile {
  label: string;
  enemyBaseIncome: number;
  rewardCostMultiplier: number;
  combatPointValues: {
    rifleman: number;
    tank: number;
    turret: number;
    generator: number;
    barracks: number;
    nexus: number;
  };
}

export interface RewardDefinition {
  id: RewardId;
  title: string;
  pointsCost: number;
  goldCost: number;
  durationSeconds: number;
  description: string;
  type: 'offensive' | 'defensive';
  damage?: number;
  reduction?: number;
}

export const AIR_STRIKE_EFFECTIVE_RADIUS = 12;

/** Artillery shells are fired from the activating faction's Nexus and arc to their impact points. */
export const ARTILLERY_IMPACT_RADIUS = 12;
/** Wait before the first shell leaves the Nexus (lets the camera reach it first). */
export const ARTILLERY_LAUNCH_DELAY_SECONDS = 0.7;
export const ARTILLERY_SALVO_INTERVAL_SECONDS = 0.7;
export const ARTILLERY_SHELL_FLIGHT_SECONDS = 2.2;

/** Seconds from activation until the last of `shellCount` shells lands. */
export function artilleryStrikeDurationSeconds(shellCount: number): number {
  if (!Number.isInteger(shellCount) || shellCount < 1) {
    throw new RangeError('Artillery strike needs at least one shell');
  }
  return ARTILLERY_LAUNCH_DELAY_SECONDS
    + (shellCount - 1) * ARTILLERY_SALVO_INTERVAL_SECONDS
    + ARTILLERY_SHELL_FLIGHT_SECONDS;
}

export interface StrikeOffset {
  readonly x: number;
  readonly z: number;
}

/** Where a strike's impacts land around its aim point, how far each reaches and how hard it hits. */
export interface StrikePattern {
  readonly impacts: readonly StrikeOffset[];
  readonly radius: number;
  readonly damagePerImpact: number;
}

export const ARTILLERY_IMPACT_OFFSETS: readonly StrikeOffset[] = Object.freeze([
  { x: 0, z: 0 },
  { x: 6, z: 4 },
  { x: -5, z: -3 }
]);
export const AIR_STRIKE_BOMB_OFFSETS: readonly StrikeOffset[] = Object.freeze([
  { x: 0, z: 0 },
  { x: 5, z: 3 },
  { x: -4, z: -3 },
  { x: 8, z: -5 }
]);
/** A strike prefers enemy units only when one aim reaches at least this many of them. */
export const STRIKE_MIN_CONCENTRATION_UNITS = 3;

export const DIFFICULTY_PROFILES: Readonly<Record<Difficulty, DifficultyProfile>> = Object.freeze({
  easy: {
    label: 'BAJA',
    enemyBaseIncome: 6,
    rewardCostMultiplier: 0.9,
    combatPointValues: {
      rifleman: 1,
      tank: 3,
      turret: 4,
      generator: 4,
      barracks: 6,
      nexus: 0
    }
  },
  normal: {
    label: 'ESTÁNDAR',
    enemyBaseIncome: 11,
    rewardCostMultiplier: 1,
    combatPointValues: {
      rifleman: 1,
      tank: 3,
      turret: 4,
      generator: 4,
      barracks: 6,
      nexus: 0
    }
  },
  hard: {
    label: 'CRÍTICA',
    enemyBaseIncome: 18,
    rewardCostMultiplier: 1.15,
    combatPointValues: {
      rifleman: 1,
      tank: 3,
      turret: 4,
      generator: 4,
      barracks: 6,
      nexus: 0
    }
  }
});

export const REWARD_DEFINITIONS: Readonly<Record<RewardId, RewardDefinition>> = Object.freeze({
  artillery_strike: {
    id: 'artillery_strike',
    title: 'Artillery Strike',
    pointsCost: 10,
    goldCost: 180,
    durationSeconds: 20,
    description: 'Una descarga de artillería sobre la concentración enemiga más peligrosa.',
    type: 'offensive',
    damage: 120
  },
  air_strike: {
    id: 'air_strike',
    title: 'Air Strike',
    pointsCost: 18,
    goldCost: 280,
    durationSeconds: 20,
    description: 'Un avión cruza el campo y bombardea la mayor concentración enemiga.',
    type: 'offensive',
    damage: 220
  },
  defensive_shield: {
    id: 'defensive_shield',
    title: 'Defensive Shield',
    pointsCost: 14,
    goldCost: 220,
    durationSeconds: 10,
    description: 'Refuerza el Nexo para reducir temporalmente el daño recibido.',
    type: 'defensive',
    reduction: 0.5
  }
});

export function getDifficultyProfile(level: Difficulty): DifficultyProfile {
  return DIFFICULTY_PROFILES[level];
}

export function getRewardDefinition(id: RewardId): RewardDefinition {
  return REWARD_DEFINITIONS[id];
}

export function getRewardDefinitionForDifficulty(id: RewardId, level: Difficulty): RewardDefinition {
  const profile = getDifficultyProfile(level);
  const definition = getRewardDefinition(id);
  return {
    ...definition,
    goldCost: Math.round(definition.goldCost * profile.rewardCostMultiplier),
    pointsCost: definition.pointsCost
  };
}

export function getCombatPointsFor(entityKind: 'rifleman' | 'tank' | 'turret' | 'generator' | 'barracks' | 'nexus', difficulty: Difficulty): number {
  return getDifficultyProfile(difficulty).combatPointValues[entityKind];
}

export function applyShieldReduction(
  damage: number,
  shieldActiveUntil: number,
  now: number,
  reduction = 0.5
): number {
  if (!Number.isFinite(damage) || damage < 0) {
    throw new RangeError('Damage must be finite and non-negative');
  }
  if (!Number.isFinite(reduction) || reduction < 0 || reduction > 1) {
    throw new RangeError('Shield reduction must be between zero and one');
  }
  if (shieldActiveUntil <= now) return damage;
  return damage * (1 - reduction);
}

export function getStrikePattern(id: 'artillery_strike' | 'air_strike', level: Difficulty): StrikePattern {
  const damagePerImpact = getRewardDefinitionForDifficulty(id, level).damage ?? 0;
  return id === 'artillery_strike'
    ? { impacts: ARTILLERY_IMPACT_OFFSETS, radius: ARTILLERY_IMPACT_RADIUS, damagePerImpact }
    : { impacts: AIR_STRIKE_BOMB_OFFSETS, radius: AIR_STRIKE_EFFECTIVE_RADIUS, damagePerImpact };
}

export interface StrikeCandidate {
  readonly x: number;
  readonly z: number;
  readonly health: number;
  readonly kind: 'unit' | 'structure';
}

export interface StrikeAim {
  x: number;
  z: number;
}

interface ScoredAim extends StrikeAim {
  /** Health the strike would take away, capped per target at its remaining health. */
  value: number;
  unitsHit: number;
  structuresHit: number;
}

/** How many of the pattern's impacts reach the point (x, z) when aimed at (aimX, aimZ). */
export function countStrikeHits(aimX: number, aimZ: number, x: number, z: number, pattern: StrikePattern): number {
  const radiusSquared = pattern.radius * pattern.radius;
  let hits = 0;
  for (const impact of pattern.impacts) {
    const dx = x - (aimX + impact.x);
    const dz = z - (aimZ + impact.z);
    if (dx * dx + dz * dz <= radiusSquared) hits++;
  }
  return hits;
}

function scoreStrikeAim(
  aimX: number,
  aimZ: number,
  candidates: readonly StrikeCandidate[],
  pattern: StrikePattern,
  out: ScoredAim
): ScoredAim {
  out.x = aimX;
  out.z = aimZ;
  out.value = 0;
  out.unitsHit = 0;
  out.structuresHit = 0;
  for (const candidate of candidates) {
    const hits = countStrikeHits(aimX, aimZ, candidate.x, candidate.z, pattern);
    if (hits === 0) continue;
    out.value += Math.min(Math.max(0, candidate.health), hits * pattern.damagePerImpact);
    if (candidate.kind === 'unit') out.unitsHit++;
    else out.structuresHit++;
  }
  return out;
}

function keepBetter(best: ScoredAim | undefined, scored: ScoredAim): ScoredAim {
  if (best && (scored.value < best.value || (scored.value === best.value && scored.unitsHit <= best.unitsHit))) {
    return best;
  }
  return { ...scored };
}

/**
 * Picks where an offensive strike should aim, using the reach of its impacts:
 * a concentration of enemy units (`STRIKE_MIN_CONCENTRATION_UNITS` or more
 * within one strike) comes first, then structures, then any lone unit. Among
 * those, the aim that takes away the most health wins. Aims are tried on
 * every candidate and on the centre of the enemies around it.
 */
export function selectStrikeAim(
  candidates: readonly StrikeCandidate[],
  pattern: StrikePattern
): StrikeAim | undefined {
  if (!candidates.length) return undefined;

  const scored: ScoredAim = { x: 0, z: 0, value: 0, unitsHit: 0, structuresHit: 0 };
  const radiusSquared = pattern.radius * pattern.radius;
  let bestConcentration: ScoredAim | undefined;
  let bestStructure: ScoredAim | undefined;
  let bestAny: ScoredAim | undefined;
  const consider = (x: number, z: number) => {
    scoreStrikeAim(x, z, candidates, pattern, scored);
    if (scored.unitsHit >= STRIKE_MIN_CONCENTRATION_UNITS) bestConcentration = keepBetter(bestConcentration, scored);
    if (scored.structuresHit > 0) bestStructure = keepBetter(bestStructure, scored);
    bestAny = keepBetter(bestAny, scored);
  };

  for (const candidate of candidates) {
    consider(candidate.x, candidate.z);
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    for (const other of candidates) {
      const dx = other.x - candidate.x;
      const dz = other.z - candidate.z;
      if (dx * dx + dz * dz > radiusSquared) continue;
      sumX += other.x;
      sumZ += other.z;
      count++;
    }
    if (count > 1) consider(sumX / count, sumZ / count);
  }

  const best = bestConcentration ?? bestStructure ?? bestAny;
  return best ? { x: best.x, z: best.z } : undefined;
}

export function validateRewardActivation(input: {
  id: RewardId;
  points: number;
  gold: number;
  difficulty: Difficulty;
  validTargetCount: number;
  activeShield: boolean;
  cooldownMs: number;
  now: number;
  expiresAt?: number;
}): { accepted: boolean; reason?: 'insufficient-points' | 'insufficient-gold' | 'no-valid-target' | 'shield-active' | 'cooldown' } {
  const definition = getRewardDefinitionForDifficulty(input.id, input.difficulty);
  if (input.points < definition.pointsCost) return { accepted: false, reason: 'insufficient-points' };
  if (input.gold < definition.goldCost) return { accepted: false, reason: 'insufficient-gold' };
  if (input.id !== 'defensive_shield' && input.validTargetCount <= 0) return { accepted: false, reason: 'no-valid-target' };
  if (input.id === 'defensive_shield' && input.activeShield) return { accepted: false, reason: 'shield-active' };
  if (input.cooldownMs > 0 && input.now < (input.expiresAt ?? 0)) return { accepted: false, reason: 'cooldown' };
  return { accepted: true };
}
