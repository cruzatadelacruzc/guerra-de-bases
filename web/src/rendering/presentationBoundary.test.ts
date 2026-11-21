import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ImportRecord {
  specifier: string;
  typeOnly: boolean;
}

/** Presentation modules outside rendering/ that obey the same boundary (Task 7 adds dev/visualConsistency.ts). */
const EXTRA_PRESENTATION_MODULES: string[] = [];

const ENTITY_VIEWS = ['BattlefieldView.ts', 'ProjectileView.ts', 'BattlefieldRemains.ts'];

/** Rules match on the import path resolved against web/src, so `./x.ts` and `../dev/x.ts` are caught alike. */
const MUTATING_MODULES = [
  /^game\/commands\//,
  /^game\/ecs\/(systems|BattleSimulation|initialBattle|World)\.ts$/,
  /^game\/match\/(DeathResolver|rewardExecution|shield|MatchState)\.ts$/,
  /^dev\/diagnosticStructures\.ts$/
];

/** Resolves a relative specifier against the importing file (both relative to web/src); bare specifiers are returned as is. */
function resolveImport(from: string, specifier: string): string {
  return specifier.startsWith('.') ? posix.normalize(posix.join(posix.dirname(from), specifier)) : specifier;
}

function isMutatingValueImport(from: string, record: ImportRecord): boolean {
  const resolved = resolveImport(from, record.specifier);
  return !record.typeOnly && MUTATING_MODULES.some((pattern) => pattern.test(resolved));
}

function isWorldImport(from: string, record: ImportRecord): boolean {
  return resolveImport(from, record.specifier) === 'game/ecs/World.ts';
}

function isForbiddenForEntityView(from: string, record: ImportRecord): boolean {
  const resolved = resolveImport(from, record.specifier);
  return /^platform\//.test(resolved) || /(^|\/)MapCameraController\.ts$/.test(resolved)
    || /(^|\/)audio\//i.test(resolved) || /(^|\/)Audio[^/]*\.ts$/.test(resolved);
}

function isForbiddenForGame(from: string, record: ImportRecord): boolean {
  const resolved = resolveImport(from, record.specifier);
  return resolved === 'three' || resolved.startsWith('three/') || /^(rendering|ui|platform)\//.test(resolved);
}

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
      .filter((record) => isMutatingValueImport(name, record))
      .map((record) => `${name}: ${record.specifier}`));
  assert.deepEqual(offenders, []);
});

test('presentation modules never import World, not even as a type', () => {
  const offenders = presentationFiles.flatMap(({ name, code }) =>
    importRecords(code).filter((record) => isWorldImport(name, record)).map((record) => `${name}: ${record.specifier}`));
  assert.deepEqual(offenders, []);
});

test('entity views import neither platform, the camera controller nor audio', () => {
  const offenders = presentationFiles
    .filter(({ name }) => ENTITY_VIEWS.some((view) => name.endsWith(`/${view}`)))
    .flatMap(({ name, code }) =>
      importRecords(code)
        .filter((record) => isForbiddenForEntityView(name, record))
        .map((record) => `${name}: ${record.specifier}`));
  assert.deepEqual(offenders, []);
});

test('game modules import neither three, rendering, ui nor platform', () => {
  const offenders = productionFiles(gameUrl, true, () => false).flatMap((url) => {
    const name = `game/${url.pathname.split('/game/')[1] ?? url.pathname}`;
    return importRecords(read(url)).filter((record) => isForbiddenForGame(name, record)).map((record) => `${name}: ${record.specifier}`);
  });
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

test('the rules reject sibling-relative and parent-relative imports and accept legitimate ones', () => {
  const value = (specifier: string): ImportRecord => ({ specifier, typeOnly: false });
  const type = (specifier: string): ImportRecord => ({ specifier, typeOnly: true });
  assert.ok(isMutatingValueImport('dev/visualConsistency.ts', value('./diagnosticStructures.ts')));
  assert.ok(isMutatingValueImport('rendering/X.ts', value('../game/commands/rewardCommand.ts')));
  assert.ok(isMutatingValueImport('rendering/X.ts', value('../game/match/shield.ts')));
  assert.ok(!isMutatingValueImport('dev/visualConsistency.ts', type('./diagnosticStructures.ts')));
  assert.ok(!isMutatingValueImport('rendering/X.ts', value('../game/ecs/WorldReader.ts')));
  assert.ok(isWorldImport('game/ecs/Other.ts', type('./World.ts')));
  assert.ok(isWorldImport('rendering/X.ts', type('../game/ecs/World.ts')));
  assert.ok(!isWorldImport('rendering/X.ts', value('../game/ecs/WorldReader.ts')));
  assert.ok(isForbiddenForEntityView('rendering/BattlefieldView.ts', value('../platform/HapticFeedback.ts')));
  assert.ok(isForbiddenForEntityView('rendering/BattlefieldView.ts', value('./MapCameraController.ts')));
  assert.ok(!isForbiddenForEntityView('rendering/BattlefieldView.ts', value('./TerrainGrid.ts')));
  assert.ok(isForbiddenForGame('game/ecs/x.ts', value('../../rendering/TerrainGrid.ts')));
  assert.ok(isForbiddenForGame('game/x.ts', value('three')));
  assert.ok(!isForbiddenForGame('game/ecs/x.ts', value('./World.ts')));
});
