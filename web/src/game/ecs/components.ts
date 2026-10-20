export type Entity = number;
export type Faction = 'player' | 'enemy';

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

export interface ComponentData {
  base: true;
  factory: true;
  faction: Faction;
  health: Health;
  movement: Movement;
  soldier: true;
  structure: true;
  targetable: true;
  transform: Position;
}

export type ComponentName = keyof ComponentData;

export const COMPONENTS: { readonly [Name in ComponentName]: Name } = Object.freeze({
  base: 'base',
  factory: 'factory',
  faction: 'faction',
  health: 'health',
  movement: 'movement',
  soldier: 'soldier',
  structure: 'structure',
  targetable: 'targetable',
  transform: 'transform'
});

export const FACTIONS = Object.freeze({
  player: 'player',
  enemy: 'enemy'
} satisfies Record<string, Faction>);
