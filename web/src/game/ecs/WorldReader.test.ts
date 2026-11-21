import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENTS } from './components.ts';
import { createInitialBattle } from './initialBattle.ts';
import { NEXUS_HEALTH } from '../definitions/structures.ts';
import { World } from './World.ts';
import type { WorldReader } from './WorldReader.ts';

test('a World is a WorldReader without an adapter', () => {
  const { world, playerBase } = createInitialBattle();
  const reader: WorldReader = world;
  assert.equal(reader.getComponent(playerBase, COMPONENTS.health)?.current, NEXUS_HEALTH);
  assert.ok(new World() satisfies WorldReader);
});

/** Never called: the writes below are compile-time assertions enforced by `npm run typecheck`. */
export function writesThroughAReaderDoNotCompile(reader: WorldReader, base: number): void {
  const health = reader.getComponent(base, COMPONENTS.health);
  const production = reader.getComponent(base, COMPONENTS.production);
  if (health === undefined || production?.order === undefined) return;
  // @ts-expect-error health is deeply read-only
  health.current = 0;
  // @ts-expect-error nested production data is deeply read-only
  production.order.spawnPosition.x = 0;
}

test('writes through a WorldReader do not compile', () => {
  assert.equal(typeof writesThroughAReaderDoNotCompile, 'function');
});
