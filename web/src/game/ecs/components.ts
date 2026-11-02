export type Entity = number;
export type Faction = 'player' | 'enemy';
export type BuildingKind = 'hq' | 'generator' | 'barracks' | 'turret';
export type SoldierKind = 'rifleman' | 'tank';

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Health {
  current: number;
  max: number;
}

export interface Movement {
  speed: number;
  range: number;
}

export interface Building {
  kind: BuildingKind;
}

export interface ResourceGenerator {
  incomePerSecond: number;
}

export interface Economy {
  gold: number;
}

export interface ProductionOrder {
  kind: SoldierKind;
  durationSeconds: number;
  remainingSeconds: number;
  health: number;
  speed: number;
  range: number;
  spawnPosition: Position;
  weapon: Omit<Weapon, 'cooldownRemaining'>;
}

export interface Production {
  order: ProductionOrder | undefined;
}

export interface Weapon {
  damage: number;
  range: number;
  cooldownSeconds: number;
  cooldownRemaining: number;
  projectileSpeed: number;
  projectileLifetime: number;
  impactRadius: number;
  isHeavy: boolean;
  originHeight: number;
}

export interface Projectile {
  target: Entity;
  targetPosition: Position;
  damage: number;
  speed: number;
  remainingSeconds: number;
  impactRadius: number;
  isHeavy: boolean;
}

export interface Targeting {
  target: Entity | undefined;
}

export interface ComponentData {
  base: true;
  building: Building;
  economy: Economy;
  factory: true;
  faction: Faction;
  health: Health;
  movement: Movement;
  production: Production;
  projectile: Projectile;
  resourceGenerator: ResourceGenerator;
  soldier: true;
  soldierKind: SoldierKind;
  structure: true;
  targeting: Targeting;
  targetable: true;
  transform: Position;
  weapon: Weapon;
}

export type ComponentName = keyof ComponentData;

export const COMPONENTS: { readonly [Name in ComponentName]: Name } = Object.freeze({
  base: 'base',
  building: 'building',
  economy: 'economy',
  factory: 'factory',
  faction: 'faction',
  health: 'health',
  movement: 'movement',
  production: 'production',
  projectile: 'projectile',
  resourceGenerator: 'resourceGenerator',
  soldier: 'soldier',
  soldierKind: 'soldierKind',
  structure: 'structure',
  targeting: 'targeting',
  targetable: 'targetable',
  transform: 'transform',
  weapon: 'weapon'
});

export const FACTIONS = Object.freeze({
  player: 'player',
  enemy: 'enemy'
} satisfies Record<string, Faction>);
