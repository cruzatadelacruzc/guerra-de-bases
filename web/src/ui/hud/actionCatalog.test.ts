import assert from 'node:assert/strict';
import test from 'node:test';
import { STRUCTURE_DEFINITIONS } from '../../game/definitions/structures.ts';
import { SOLDIER_PRODUCTION } from '../../game/ecs/initialBattle.ts';
import { ACTION_CATALOG, structurePresentation } from './actionCatalog.ts';

test('every buildable structure and every unit has exactly one entry', () => {
  const expected = [...Object.keys(STRUCTURE_DEFINITIONS), ...Object.keys(SOLDIER_PRODUCTION)].sort();
  const actual = ACTION_CATALOG.map((entry) => entry.id).sort();
  assert.deepEqual(actual, expected);
});

test('short names have at most 9 characters', () => {
  for (const entry of ACTION_CATALOG) {
    assert.ok(entry.shortName.length <= 9, entry.shortName);
  }
});

test('every unit producer is a catalogued structure', () => {
  for (const definition of Object.values(SOLDIER_PRODUCTION)) {
    assert.equal(structurePresentation(definition.producer).id, definition.producer);
  }
});
