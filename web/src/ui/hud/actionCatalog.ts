import type { BuildableStructureKind } from '../../game/definitions/structures.ts';
import type { SoldierKind } from '../../game/ecs/components.ts';
import type { UiIconId } from '../uiIcons.ts';

export type ActionGroup = 'build' | 'army';

export const ACTION_GROUP_ORDER: readonly ActionGroup[] = ['build', 'army'];

export const ACTION_GROUP_ICON: Readonly<Record<ActionGroup, UiIconId>> = {
  build: 'building',
  army: 'swords',
};

export const ACTION_GROUP_LABEL: Readonly<Record<ActionGroup, string>> = {
  build: 'Construir',
  army: 'Ejército',
};

export interface StructurePresentation {
  readonly kind: 'structure';
  readonly id: BuildableStructureKind;
  readonly group: 'build';
  readonly shortName: string;
  readonly fullName: string;
  readonly pluralName: string;
  readonly indefiniteName: string;
  readonly icon: UiIconId;
}

export interface UnitPresentation {
  readonly kind: 'unit';
  readonly id: SoldierKind;
  readonly group: 'army';
  readonly shortName: string;
  readonly fullName: string;
  readonly icon: UiIconId;
}

export type ActionPresentation = StructurePresentation | UnitPresentation;

export const ACTION_CATALOG: readonly ActionPresentation[] = [
  { kind: 'structure', id: 'generator', group: 'build', shortName: 'Generador', fullName: 'Generador', pluralName: 'Generadores', indefiniteName: 'un Generador', icon: 'generator' },
  { kind: 'structure', id: 'barracks', group: 'build', shortName: 'Barraca', fullName: 'Barraca', pluralName: 'Barracas', indefiniteName: 'una Barraca', icon: 'barracks' },
  { kind: 'structure', id: 'turret', group: 'build', shortName: 'Torreta', fullName: 'Torreta láser', pluralName: 'Torretas', indefiniteName: 'una Torreta', icon: 'turret' },
  { kind: 'unit', id: 'rifleman', group: 'army', shortName: 'Soldado', fullName: 'Soldado ráfaga', icon: 'soldier' },
  { kind: 'unit', id: 'tank', group: 'army', shortName: 'Tanque', fullName: 'Tanque blindado', icon: 'tank' },
];

export function structurePresentation(id: BuildableStructureKind): StructurePresentation {
  for (const entry of ACTION_CATALOG) {
    if (entry.kind === 'structure' && entry.id === id) return entry;
  }
  throw new Error(`No presentation for structure "${id}"`);
}
