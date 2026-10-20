export interface UnlockCondition {
  killStreak?: number;
  achievement?: string;
  custom?: string;
}

export interface UnlockDefinition {
  id: string;
  title?: string;
  type: 'permanent' | 'temporary';
  durationSeconds?: number;
  trigger?: {
    event: string;
    condition?: UnlockCondition;
  };
  meta?: { description?: string };
}

interface UnlockDefinitionInput extends Omit<UnlockDefinition, 'type'> {
  type: string;
}

interface ActiveTemporaryUnlock {
  id: string;
  expiresAt: number;
}

interface UnlockEventPayload {
  id: string;
  definition?: UnlockDefinition;
  permanent?: boolean;
  expiresAt?: number;
}

type EventListener = (payload: UnlockEventPayload) => void;

function isUnlockDefinition(definition: UnlockDefinitionInput): definition is UnlockDefinition {
  return definition.type === 'permanent' || definition.type === 'temporary';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTemporaryUnlock(value: unknown): value is ActiveTemporaryUnlock {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.expiresAt === 'number';
}

function isCustomCondition(value: unknown): value is (payload: Record<string, unknown>) => unknown {
  return typeof value === 'function';
}

export default class UnlockManager {
  readonly storageMethod: string;
  readonly definitions: readonly UnlockDefinition[];
  readonly unlocked = new Set<string>();
  readonly activeTemporary = new Map<string, ActiveTemporaryUnlock>();
  readonly listeners = new Map<string, Set<EventListener>>();

  constructor({
    definitions,
    storage = 'localStorage',
  }: {
    definitions: readonly UnlockDefinitionInput[];
    storage?: string;
  }) {
    if (!definitions.every(isUnlockDefinition)) {
      throw new TypeError('Unlock definitions must use a supported type.');
    }
    this.storageMethod = storage;
    this.definitions = definitions;
    this._loadState();
  }

  _storageKey(): string {
    return 'gdb_unlocks_v1';
  }

  _loadState(): void {
    if (this.storageMethod !== 'localStorage' || typeof localStorage === 'undefined') return;

    try {
      const raw = localStorage.getItem(this._storageKey());
      if (!raw) return;

      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return;

      const unlockedIds = Array.isArray(parsed.unlocked) ? parsed.unlocked : [];
      for (const id of unlockedIds) {
        if (typeof id === 'string'
          && this.definitions.some((definition) => definition.id === id && definition.type === 'permanent')) {
          this.unlocked.add(id);
        }
      }
      const activeRewards = Array.isArray(parsed.activeTemporary) ? parsed.activeTemporary : [];
      for (const entry of activeRewards) {
        if (!isTemporaryUnlock(entry)) continue;
        const reward = entry;
        if (reward.expiresAt > Date.now()
          && this.definitions.some((definition) => definition.id === reward.id && definition.type === 'temporary')) {
          this.activeTemporary.set(reward.id, reward);
          this._scheduleExpiration(reward.id, reward.expiresAt);
        }
      }
    } catch (error) {
      console.error('No se pudo cargar el progreso de desbloqueos.', error);
    }
  }

  _saveState(): void {
    if (this.storageMethod !== 'localStorage' || typeof localStorage === 'undefined') return;

    try {
      localStorage.setItem(this._storageKey(), JSON.stringify({
        unlocked: [...this.unlocked],
        activeTemporary: [...this.activeTemporary.values()],
      }));
    } catch (error) {
      console.error('No se pudo guardar el progreso de desbloqueos.', error);
    }
  }

  on(eventName: string, listener: EventListener): () => void {
    const listeners = this.listeners.get(eventName) || new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
    return () => listeners.delete(listener);
  }

  _emit(eventName: string, payload: UnlockEventPayload): void {
    for (const listener of this.listeners.get(eventName) || []) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`Error al procesar el evento de desbloqueo "${eventName}".`, error);
      }
    }
  }

  recordEvent(eventName: string, payload: Record<string, unknown> = {}): void {
    for (const definition of this.definitions) {
      if (definition.trigger?.event !== eventName) continue;
      if (definition.type === 'permanent' && this.unlocked.has(definition.id)) continue;
      if (definition.type === 'temporary' && this.activeTemporary.has(definition.id)) continue;
      if (!this._matchesCondition(definition.trigger.condition, payload)) continue;
      this.grant(definition.id);
    }
  }

  _matchesCondition(
    condition: UnlockCondition = {},
    payload: Record<string, unknown>
  ): boolean {
    if (condition.killStreak !== undefined && payload.killStreak !== condition.killStreak) return false;
    if (condition.achievement !== undefined && payload.achievement !== condition.achievement) return false;

    if (condition.custom) {
      const predicate: unknown = Reflect.get(globalThis, condition.custom);
      if (!isCustomCondition(predicate)) {
        console.error(`No existe la condición de desbloqueo "${condition.custom}".`);
        return false;
      }
      return Boolean(predicate(payload));
    }
    return true;
  }

  grant(id: string): boolean {
    const definition = this.definitions.find((item) => item.id === id);
    if (!definition) {
      console.error(`No existe la recompensa "${id}".`);
      return false;
    }

    if (definition.type === 'permanent') {
      if (this.unlocked.has(id)) return false;
      this.unlocked.add(id);
      this._saveState();
      this._emit('unlocked', { id, definition, permanent: true });
      return true;
    }

    if (this.activeTemporary.has(id)) return false;
    const expiresAt = Date.now() + (definition.durationSeconds || 30) * 1000;
    this.activeTemporary.set(id, { id, expiresAt });
    this._saveState();
    this._scheduleExpiration(id, expiresAt);
    this._emit('unlocked', { id, definition, permanent: false, expiresAt });
    return true;
  }

  _scheduleExpiration(id: string, expiresAt: number): void {
    const timeout = setTimeout(() => {
      const reward = this.activeTemporary.get(id);
      if (!reward || reward.expiresAt !== expiresAt || expiresAt > Date.now()) return;
      this.activeTemporary.delete(id);
      this._saveState();
      this._emit('expired', { id });
    }, Math.max(0, expiresAt - Date.now()));
    timeout.unref?.();
  }

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id) || this.hasTemporary(id);
  }

  hasTemporary(id: string): boolean {
    const reward = this.activeTemporary.get(id);
    if (!reward) return false;
    if (reward.expiresAt > Date.now()) return true;

    this.activeTemporary.delete(id);
    this._saveState();
    this._emit('expired', { id });
    return false;
  }

  consumeTemporary(id: string): boolean {
    if (!this.hasTemporary(id)) return false;
    this.activeTemporary.delete(id);
    this._saveState();
    this._emit('consumed', { id });
    return true;
  }

  resetProgress(): void {
    this.unlocked.clear();
    this.activeTemporary.clear();
    this._saveState();
  }

  getAvailable(): Array<UnlockDefinition & { unlocked: boolean; ready: boolean }> {
    for (const id of this.activeTemporary.keys()) this.hasTemporary(id);
    return this.definitions.map((definition) => ({
      ...definition,
      unlocked: this.isUnlocked(definition.id),
      ready: this.hasTemporary(definition.id),
    }));
  }
}
