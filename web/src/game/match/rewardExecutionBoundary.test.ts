import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/** The strike domain: gameplay only, so it runs without a renderer, the UI, the platform or the commands. */
const STRIKE_DOMAIN = ['strikeState.ts', 'strikeTargets.ts', 'rewardExecution.ts'];

function source(file: string): string {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
}

/** Every module specifier: static imports and re-exports, side-effect imports and dynamic imports. */
function importSpecifiers(code: string): string[] {
  const specifiers: string[] = [];
  for (const match of code.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) specifiers.push(match[1]);
  return specifiers;
}

function isForbidden(specifier: string): boolean {
  return specifier === 'three'
    || specifier.startsWith('three/')
    || /(^|\/)(commands|rendering|ui|platform)\//.test(specifier);
}

test('the strike domain imports neither the commands, three, rendering, ui nor platform', () => {
  const offenders = STRIKE_DOMAIN.flatMap((file) =>
    importSpecifiers(source(file)).filter(isForbidden).map((specifier) => `${file}: ${specifier}`));
  assert.deepEqual(offenders, []);
});

test('the strike domain does not use the DOM', () => {
  const offenders = STRIKE_DOMAIN.filter((file) => /\b(document|window|navigator)\s*\./.test(source(file)));
  assert.deepEqual(offenders, []);
});

test('strikeState.ts imports neither MatchState.ts nor rewardExecution.ts', () => {
  const offenders = importSpecifiers(source('strikeState.ts'))
    .filter((specifier) => /(^|\/)(MatchState|rewardExecution)\.ts$/.test(specifier));
  assert.deepEqual(offenders, []);
});

test('the boundary check recognises the imports it forbids', () => {
  const sample = [
    "import { activateReward } from '../commands/rewardCommand.ts';",
    "import * as THREE from 'three';",
    "import type { View } from '../../rendering/View.ts';",
    "export { x } from '../ui/hud.ts';",
    "import '../platform/HapticFeedback.ts';",
    "const lazy = import('../commands/CommandContext.ts');"
  ].join('\n');
  assert.deepEqual(importSpecifiers(sample).filter(isForbidden).length, 6);
  assert.deepEqual(importSpecifiers("import { applyRewardDamage } from './shield.ts';").filter(isForbidden), []);
});
