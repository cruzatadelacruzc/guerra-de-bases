import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

interface ImportRecord {
  specifier: string;
  typeOnly: boolean;
}

/** Presentation modules outside rendering/ that obey the same boundary (Task 7 adds dev/visualConsistency.ts). */
const EXTRA_PRESENTATION_MODULES: string[] = [];

const ENTITY_VIEWS = ['BattlefieldView.ts', 'ProjectileView.ts', 'BattlefieldRemains.ts'];

const MUTATING_MODULES = [
  /(^|\/)commands\//,
  /(^|\/)ecs\/(systems|BattleSimulation|initialBattle|World)\.ts$/,
  /(^|\/)match\/(DeathResolver|rewardExecution|shield|MatchState)\.ts$/,
  /(^|\/)dev\/diagnosticStructures\.ts$/
];

const renderingUrl = new URL('./', import.meta.url);
const gameUrl = new URL('../game/', import.meta.url);

function read(url: URL): string {
  return readFileSync(fileURLToPath(url), 'utf8');
}

function productionFiles(directory: URL, recursive: boolean, skip: (name: string) => boolean): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return recursive ? productionFiles(new URL(`${entry.name}/`, directory), true, skip) : [];
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !skip(entry.name)
      ? [new URL(entry.name, directory)]
      : [];
  });
}

/** Every import: static, re-export, side-effect and dynamic. Type-only when `import type` or every named binding is `type`. */
function importRecords(code: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  for (const match of code.matchAll(/\b(?:import|export)\s+(type\s+)?(\{[^}]*\}|[^'"();]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    const names = match[2].startsWith('{')
      ? match[2].slice(1, -1).split(',').map((name) => name.trim()).filter((name) => name !== '')
      : [];
    const allNamesAreTypes = names.length > 0 && names.every((name) => name.startsWith('type '));
    records.push({ specifier: match[3], typeOnly: match[1] !== undefined || allNamesAreTypes });
  }
  for (const match of code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) records.push({ specifier: match[1], typeOnly: false });
  for (const match of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)) records.push({ specifier: match[1], typeOnly: false });
  return records;
}

const presentationFiles: Array<{ name: string; code: string }> = [
  ...productionFiles(renderingUrl, false, (name) => name === 'presentationTestState.ts')
    .map((url) => ({ name: `rendering/${url.pathname.split('/').pop() ?? ''}`, code: read(url) })),
  ...EXTRA_PRESENTATION_MODULES.map((file) => ({ name: file, code: read(new URL(`../${file}`, import.meta.url)) }))
];

test('presentation modules value-import no ECS-mutating module', () => {
  const offenders = presentationFiles.flatMap(({ name, code }) =>
    importRecords(code)
      .filter((record) => !record.typeOnly && MUTATING_MODULES.some((pattern) => pattern.test(record.specifier)))
      .map((record) => `${name}: ${record.specifier}`));
  assert.deepEqual(offenders, []);
});

test('presentation modules never import World, not even as a type', () => {
  const offenders = presentationFiles.flatMap(({ name, code }) =>
    importRecords(code).filter((record) => /(^|\/)ecs\/World\.ts$/.test(record.specifier)).map((record) => `${name}: ${record.specifier}`));
  assert.deepEqual(offenders, []);
});

test('entity views import neither platform, the camera controller nor audio', () => {
  const offenders = presentationFiles
    .filter(({ name }) => ENTITY_VIEWS.some((view) => name.endsWith(`/${view}`)))
    .flatMap(({ name, code }) =>
      importRecords(code)
        .filter((record) => /(^|\/)platform\//.test(record.specifier)
          || /(^|\/)MapCameraController\.ts$/.test(record.specifier)
          || /(^|\/)audio\//i.test(record.specifier)
          || /Audio[^/]*\.ts$/.test(record.specifier))
        .map((record) => `${name}: ${record.specifier}`));
  assert.deepEqual(offenders, []);
});

test('game modules import neither three, rendering, ui nor platform', () => {
  const offenders = productionFiles(gameUrl, true, () => false).flatMap((url) =>
    importRecords(read(url))
      .filter(({ specifier }) => specifier === 'three' || specifier.startsWith('three/')
        || /(^|\/)(rendering|ui|platform)\//.test(specifier))
      .map((record) => `${url.pathname.split('/game/')[1] ?? url.pathname}: ${record.specifier}`));
  assert.deepEqual(offenders, []);
});

test('the boundary check recognises value, type-only, mixed, re-export, side-effect and dynamic imports', () => {
  const sample = [
    "import { World } from '../game/ecs/World.ts';",
    "import type { Entity } from '../game/ecs/components.ts';",
    "import { type A, type B } from '../game/ecs/types.ts';",
    "import { type C, runIt } from '../game/ecs/mixed.ts';",
    "export { x } from '../game/ecs/reexport.ts';",
    "export type { Y } from '../game/ecs/reexportType.ts';",
    "import '../game/ecs/sideEffect.ts';",
    "const lazy = import('../game/ecs/dynamic.ts');"
  ].join('\n');
  const bySpecifier = new Map(importRecords(sample).map((record) => [record.specifier.split('/').pop(), record.typeOnly]));
  assert.deepEqual([...bySpecifier], [
    ['World.ts', false],
    ['components.ts', true],
    ['types.ts', true],
    ['mixed.ts', false],
    ['reexport.ts', false],
    ['reexportType.ts', true],
    ['sideEffect.ts', false],
    ['dynamic.ts', false]
  ]);
});
