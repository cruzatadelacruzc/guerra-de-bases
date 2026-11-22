import type { Entity } from './ecs/components.ts';
import type { BuildableStructureKind } from './definitions/structures.ts';

/** What the player's next tap on the battlefield means. UI state, not ECS state. */
export type InteractionMode =
  | { readonly kind: 'none' }
  | { readonly kind: 'placing'; readonly structure: BuildableStructureKind }
  | { readonly kind: 'selling' }
  | {
      readonly kind: 'confirmingSale';
      readonly entity: Entity;
      readonly structure: BuildableStructureKind;
      readonly refund: number;
    };

export type InteractionEvent =
  | { readonly type: 'selectStructure'; readonly structure: BuildableStructureKind }
  | { readonly type: 'toggleSell' }
  | {
      readonly type: 'pickStructure';
      readonly entity: Entity;
      readonly structure: BuildableStructureKind;
      readonly refund: number;
    }
  | { readonly type: 'built' }
  | { readonly type: 'saleConfirmed' }
  | { readonly type: 'targetGone' }
  | { readonly type: 'cancel' } // close button, Esc, right click
  | { readonly type: 'back' } // Android back button
  | { readonly type: 'reset' }; // start, restart, exit, match end

export const NO_INTERACTION: InteractionMode = Object.freeze({ kind: 'none' });

const SELLING: InteractionMode = Object.freeze({ kind: 'selling' });

/** Pure transition function. Returns the same object when the event changes nothing. */
export function nextInteractionMode(mode: InteractionMode, event: InteractionEvent): InteractionMode {
  switch (event.type) {
    case 'cancel':
    case 'reset':
      return mode.kind === 'none' ? mode : NO_INTERACTION;
    case 'selectStructure':
      if (mode.kind !== 'placing') return { kind: 'placing', structure: event.structure };
      return mode.structure === event.structure
        ? NO_INTERACTION
        : { kind: 'placing', structure: event.structure };
    case 'toggleSell':
      return mode.kind === 'none' || mode.kind === 'placing' ? SELLING : NO_INTERACTION;
    case 'pickStructure':
      if (mode.kind !== 'selling' && mode.kind !== 'confirmingSale') return mode;
      return {
        kind: 'confirmingSale',
        entity: event.entity,
        structure: event.structure,
        refund: event.refund
      };
    case 'built':
      return mode.kind === 'placing' ? NO_INTERACTION : mode;
    case 'saleConfirmed':
    case 'targetGone':
      return mode.kind === 'confirmingSale' ? SELLING : mode;
    case 'back':
      if (mode.kind === 'confirmingSale') return SELLING;
      return mode.kind === 'placing' || mode.kind === 'selling' ? NO_INTERACTION : mode;
  }
}
