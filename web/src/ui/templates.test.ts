import assert from 'node:assert/strict';
import test from 'node:test';
import { NEXUS_HEALTH, STRUCTURE_DEFINITIONS } from '../game/definitions/structures.ts';
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

test('both Nexus health readouts start at the shared Nexus health', () => {
  const readouts = gameHudTemplate.match(/hq-hp-text" class="game-hp-value">([^<]+)</g) ?? [];
  assert.equal(readouts.length, 2);
  for (const readout of readouts) assert.ok(readout.includes(`${NEXUS_HEALTH} / ${NEXUS_HEALTH} HP`));
});
