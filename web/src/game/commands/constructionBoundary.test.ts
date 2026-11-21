import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SOURCE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PRIMITIVES = /\b(createBuildableStructure|createStructure|createSoldierFactory)\b/;
/** Where structures may be created: the ECS that defines them, the build command and the dev scenarios. */
const ALLOWED = new Set(['game/ecs/initialBattle.ts', 'game/commands/structureCommands.ts', 'dev/diagnosticStructures.ts']);
/** Test utilities set battles up directly; they never ship. */
const TEST_UTILITIES = new Set([
  'game/match/matchHarness.ts',
  'game/ai/legacyEnemyExecutor.ts',
  'game/ai/aiMatchRunner.ts',
  'game/commands/commandTestState.ts'
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

test('only the build command and the development scenarios create structures', () => {
  const offenders = sourceFiles(SOURCE_ROOT)
    .map((path) => relative(SOURCE_ROOT, path).split('\\').join('/'))
    .filter((path) => !ALLOWED.has(path) && !TEST_UTILITIES.has(path))
    .filter((path) => PRIMITIVES.test(readFileSync(join(SOURCE_ROOT, path), 'utf8')));
  assert.deepEqual(offenders, []);
});
