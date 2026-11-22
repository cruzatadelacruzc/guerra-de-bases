import assert from 'node:assert/strict';
import test from 'node:test';
import { STRUCTURE_DEFINITIONS } from '../game/definitions/structures.ts';
import { gameHudTemplate } from './templates.ts';

test('the build buttons show each structure cost from the shared definitions', () => {
  for (const [id, kind] of [
    ['build-generator', 'generator'],
    ['build-barracks', 'barracks'],
    ['build-turret', 'turret']
  ] as const) {
    const button = gameHudTemplate.slice(gameHudTemplate.indexOf(`id="${id}"`));
    const label = button.slice(0, button.indexOf('</button>'));
    assert.match(label, new RegExp(`⚡ ${STRUCTURE_DEFINITIONS[kind].cost} ORO`), id);
  }
});
