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
    description: 'Un avión cruza el campo y lanza bombas sobre objetivos terrestres.',
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

export function selectArtilleryTarget<T extends { x: number; z: number; value: number; health: number }>(targets: readonly T[]): T | undefined {
  if (!targets.length) return undefined;

  let best: T | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of targets) {
    const density = candidate.value;
    const threat = candidate.health;
    const score = density * 2.5 + threat;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function selectAirStrikeTarget<T extends { x: number; z: number; value: number; health: number }>(targets: readonly T[]): T | undefined {
  if (!targets.length) return undefined;

  let best: T | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of targets) {
    let score = candidate.value * 2 + candidate.health * 0.8;
    for (const other of targets) {
      if (other === candidate) continue;
      const distance = Math.hypot(other.x - candidate.x, other.z - candidate.z);
      if (distance <= AIR_STRIKE_EFFECTIVE_RADIUS) {
        score += other.value * 2 + other.health * 0.8;
      }
    }

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
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
