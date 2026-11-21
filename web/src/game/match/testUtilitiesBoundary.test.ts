import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SOURCE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Vite bundles only what `main.ts` reaches; these test utilities must stay out of that graph. */
const TEST_UTILITIES = [
  'game/match/legacyRewardTimeline.ts',
  'game/match/strikeScenarios.ts',
  'game/match/matchHarness.ts',
  'game/ai/legacyEnemyExecutor.ts',
  'game/ai/aiMatchRunner.ts',
  'game/commands/commandTestState.ts'
];

/** Every relative module specifier: static imports and re-exports, side-effect imports and dynamic imports. */
function relativeSpecifiers(code: string): string[] {
  const specifiers: string[] = [];
  for (const match of code.matchAll(/\b(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) specifiers.push(match[1]);
  return specifiers;
}

/** The TypeScript modules reachable from `entry` through relative imports, skipping `.test.ts` files. */
function reachableModules(entry: string): Set<string> {
  const reached = new Set<string>();
  const pending = [join(SOURCE_ROOT, entry)];
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined) break;
    const name = relative(SOURCE_ROOT, path).split('\\').join('/');
    // A specifier without `.ts` would hide a module from the walk; only stylesheets and JSON may be skipped.
    if (!name.endsWith('.ts')) assert.match(name, /\.(css|json)$/, `the walk cannot follow ${name}`);
    if (reached.has(name) || !name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
    reached.add(name);
    for (const specifier of relativeSpecifiers(readFileSync(path, 'utf8'))) {
      pending.push(join(dirname(path), specifier));
    }
  }
  return reached;
}

test('main.ts reaches none of the test utilities, so they never ship in the bundle', () => {
  const reached = reachableModules('main.ts');
  assert.ok(reached.has('GameApplication.ts') && reached.has('game/match/rewardExecution.ts'),
    'the walk must follow main.ts into the game');
  assert.deepEqual(TEST_UTILITIES.filter((utility) => reached.has(utility)), []);
});

test('the walk finds a test utility when a module imports one', () => {
  assert.ok(reachableModules('game/match/strikeScenarios.ts').has('game/match/legacyRewardTimeline.ts'));
});

test('the walk recognises every kind of relative import and skips packages', () => {
  const sample = [
    "import { a } from './a.ts';",
    "import type { B } from '../b.ts';",
    "export { c } from './c.ts';",
    "import './d.css';",
    "const lazy = import('../e.ts');",
    "import {\n  f,\n  g\n} from './f.ts';",
    "import * as THREE from 'three';"
  ].join('\n');
  assert.deepEqual(relativeSpecifiers(sample), ['./a.ts', '../b.ts', './c.ts', './d.css', '../e.ts', './f.ts']);
});
