import assert from 'node:assert/strict';
import test from 'node:test';
import UnlockManager from './UnlockManager.ts';

test('resetProgress clears permanent and temporary unlocks from memory and storage', () => {
  const storage = new Map<string, string>();
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  const definitions = [
    { id: 'permanent', type: 'permanent' },
    { id: 'temporary', type: 'temporary', durationSeconds: 60 },
  ];
  const manager = new UnlockManager({ definitions, storage: 'localStorage' });

  try {
    manager.grant('permanent');
    manager.grant('temporary');
    manager.resetProgress();

    assert.equal(manager.unlocked.size, 0);
    assert.equal(manager.isUnlocked('permanent'), false);
    assert.equal(manager.isUnlocked('temporary'), false);
    assert.deepEqual(JSON.parse(storage.get('gdb_unlocks_v1') ?? '{}'), {
      unlocked: [],
      activeTemporary: [],
    });

    const reloadedManager = new UnlockManager({ definitions, storage: 'localStorage' });
    assert.equal(reloadedManager.isUnlocked('permanent'), false);
    assert.equal(reloadedManager.isUnlocked('temporary'), false);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
