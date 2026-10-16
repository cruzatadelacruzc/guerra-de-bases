export default class UnlockManager {
  constructor({ definitions, storage = 'localStorage' }) {
    this.storageMethod = storage;
    this.definitions = definitions;
    this.unlocked = new Set();
    this.activeTemporary = new Map();
    this.listeners = new Map();
    this._loadState();
  }

  _storageKey() {
    return 'gdb_unlocks_v1';
  }

  _loadState() {
    if (this.storageMethod !== 'localStorage' || typeof localStorage === 'undefined') return;

    try {
      const raw = localStorage.getItem(this._storageKey());
      if (!raw) return;

      const parsed = JSON.parse(raw);
      for (const id of parsed.unlocked || []) {
        if (this.definitions.some((definition) => definition.id === id && definition.type === 'permanent')) {
          this.unlocked.add(id);
        }
      }
      for (const reward of parsed.activeTemporary || []) {
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

  _saveState() {
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

  on(eventName, listener) {
    const listeners = this.listeners.get(eventName) || new Set();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
    return () => listeners.delete(listener);
  }

  _emit(eventName, payload) {
    for (const listener of this.listeners.get(eventName) || []) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`Error al procesar el evento de desbloqueo "${eventName}".`, error);
      }
    }
  }

  recordEvent(eventName, payload = {}) {
    for (const definition of this.definitions) {
      if (definition.trigger?.event !== eventName) continue;
      if (definition.type === 'permanent' && this.unlocked.has(definition.id)) continue;
      if (definition.type === 'temporary' && this.activeTemporary.has(definition.id)) continue;
      if (!this._matchesCondition(definition.trigger.condition, payload)) continue;
      this.grant(definition.id);
    }
  }

  _matchesCondition(condition = {}, payload) {
    if (condition.killStreak !== undefined && payload.killStreak !== condition.killStreak) return false;
    if (condition.achievement !== undefined && payload.achievement !== condition.achievement) return false;

    if (condition.custom) {
      const predicate = globalThis[condition.custom];
      if (typeof predicate !== 'function') {
        console.error(`No existe la condición de desbloqueo "${condition.custom}".`);
        return false;
      }
      return Boolean(predicate(payload));
    }
    return true;
  }

  grant(id) {
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

    if (definition.type !== 'temporary' || this.activeTemporary.has(id)) return false;
    const expiresAt = Date.now() + (definition.durationSeconds || 30) * 1000;
    this.activeTemporary.set(id, { id, expiresAt });
    this._saveState();
    this._scheduleExpiration(id, expiresAt);
    this._emit('unlocked', { id, definition, permanent: false, expiresAt });
    return true;
  }

  _scheduleExpiration(id, expiresAt) {
    const timeout = setTimeout(() => {
      const reward = this.activeTemporary.get(id);
      if (!reward || reward.expiresAt !== expiresAt || expiresAt > Date.now()) return;
      this.activeTemporary.delete(id);
      this._saveState();
      this._emit('expired', { id });
    }, Math.max(0, expiresAt - Date.now()));
    timeout.unref?.();
  }

  isUnlocked(id) {
    return this.unlocked.has(id) || this.hasTemporary(id);
  }

  hasTemporary(id) {
    const reward = this.activeTemporary.get(id);
    if (!reward) return false;
    if (reward.expiresAt > Date.now()) return true;

    this.activeTemporary.delete(id);
    this._saveState();
    this._emit('expired', { id });
    return false;
  }

  consumeTemporary(id) {
    if (!this.hasTemporary(id)) return false;
    this.activeTemporary.delete(id);
    this._saveState();
    this._emit('consumed', { id });
    return true;
  }

  getAvailable() {
    for (const id of this.activeTemporary.keys()) this.hasTemporary(id);
    return this.definitions.map((definition) => ({
      ...definition,
      unlocked: this.isUnlocked(definition.id),
      ready: this.hasTemporary(definition.id),
    }));
  }
}
