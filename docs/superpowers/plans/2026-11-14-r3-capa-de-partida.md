# R3 — Capa de partida independiente — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar de `GameApplication.ts` a `web/src/game/match/`, sin Three.js:
- la detección y resolución de muertes;
- los puntos de combate (CP);
- las rachas y los contadores;
- la victoria y la derrota.

El comportamiento del juego debe seguir siendo exactamente el mismo.

**Architecture:**
- `DeathResolver.resolve` recorre una vez por fotograma las entidades con vida del `World`, en el mismo orden que hoy. Actualiza `MatchState` (CP, rachas, contadores y resultado terminal), borra las entidades muertas y devuelve eventos ordenados y el resultado.
- `unlockEventsFor` traduce cada evento a las llamadas de desbloqueo actuales.
- `GameApplication` solo representa: restos, explosiones, visuales, sonido, hápticos, desbloqueos y `beginMatchEnding`.
- Una copia literal y **temporal** de la lógica actual, con una prueba diferencial, demuestra la equivalencia y se borra al final.

**Tech Stack:** TypeScript estricto, `node:test` vía `tsx` (`npm test`), `tsc --noEmit` (`npm run typecheck`), Vite (`npm run build`), `playwright-cli` para la comprobación en navegador y la medición.

**Spec:**
- `docs/superpowers/specs/2026-11-14-r3-capa-de-partida-design.md` (aprobado, decisiones 1-3).
- Instrucciones del usuario: "Implementation Instructions – R3: Independent Game Core".
- Contexto: `docs/audits/2026-11-14-auditoria-responsabilidades.md` (§4.1, §4.3, R3 en §7 y §8.2) y `docs/performance/2026-11-14-referencia-rendimiento.md`.

## Global Constraints

- TypeScript estricto, sin `any` ni aserciones innecesarias. Sin dependencias nuevas.
- Sin módulos `.js`/`.mjs` en `web/src/`.
- `web/src/game/match/**` solo importa `web/src/game/ecs/**` y `web/src/game/rewardSystem.ts`. Nada de `three`, `ui`, `rendering`, `platform` ni DOM.
- El núcleo no crea ni modifica mallas, materiales, animaciones, sonidos, avisos ni UI.
- El ECS es la única fuente de verdad sobre la vida, la existencia y el ciclo de vida de las entidades. `MatchState` solo guarda CP, rachas, contadores y resultado.
- Las muertes se procesan **una vez por fotograma**, en el punto actual de `updateCombat`, con el orden de §2.1 y §3.2 del diseño:
  - unidades del jugador → unidades enemigas → estructuras del jugador (Nexo incluido) → estructuras enemigas;
  - dentro de cada grupo, de la entidad más nueva a la más antigua.
- Valores exactos de CP (`getCombatPointsFor`, iguales en las tres dificultades): soldado 1, tanque 3, torreta 4, generador 4, barraca 6, Nexo 0. Van a la facción contraria a la que muere.
- Fin de partida: si caen ambos Nexos a la vez, **derrota**. El resultado es terminal y se informa como nuevo una sola vez.
- No se cambia nada de R4 (comandos), R5 (daño de recompensas en el reloj de simulación) ni R6-R8. Tampoco la IA, el balance, las recompensas, los desbloqueos, los dos mecanismos de fin de partida ni la duración con reloj real.
- Un commit por tarea, directo en `main`, con rutas explícitas en `git add`. Pruebas de la tarea y `npm test` antes de cada commit. Cada mensaje termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Orden dentro de un fotograma:** unidades de ambos bandos que mueren a la vez (rachas) y caída simultánea de los dos Nexos (derrota). Pruebas 4 y 8 de la Tarea 1 y la diferencial de la Tarea 2.
2. **Doble procesamiento o visual huérfano:** el dominio borra la entidad y la presentación debe quitar su visual ese mismo fotograma. Prueba de "un evento por muerte" y comprobación en navegador de la Tarea 4: restos, geometrías estables en partidas repetidas.
3. **Partida ya terminada:** después del resultado no hay más CP, eventos ni borrados (prueba 12).
4. **Muertes por recompensa:** el daño aplicado con `applyDamageSystem` fuera del paso fijo se procesa en el mismo fotograma (prueba 7).
5. **El Nexo se borra y con él su monedero**, igual que hoy. Comprobación en navegador de victoria y derrota: la secuencia de fin y el resumen funcionan, y las bajas mostradas coinciden.

---

### Tarea 1: Caracterizar las reglas actuales (pruebas primero, referencia temporal)

**Files:**
- Create: `web/src/game/match/legacyDeathReference.ts` (temporal; se borra en la Tarea 4)
- Create: `web/src/game/match/matchHarness.ts` (utilidad de pruebas)
- Test: `web/src/game/match/deathRules.test.ts`

**Interfaces:**
- Produces (todo solo para pruebas):
  ```ts
  // legacyDeathReference.ts — transcripción literal de GameApplication.ts @ 5b988a8:
  // la parte de juego de updateUnitGroup (≈1757-1840), updateBuildingList (≈2001-2034)
  // y la comprobación de fin de updateCombat, sin nada visual.
  export interface LegacyRuntimeObject { readonly entity: Entity; readonly type: SoldierKind | BuildingKind; }
  export interface LegacyLists {
    playerUnits: LegacyRuntimeObject[]; enemyUnits: LegacyRuntimeObject[];
    playerBuildings: LegacyRuntimeObject[]; enemyBuildings: LegacyRuntimeObject[];
  }
  export interface LegacyCounters {
    playerCombatPoints: number; enemyCombatPoints: number;
    playerKillStreak: number; enemyKillStreak: number;
    playerUnitsDestroyed: number; playerUnitsLost: number;
  }
  export interface UnlockCall { readonly name: string; readonly payload: Readonly<Record<string, unknown>>; }
  export interface LegacyFrame { unlockCalls: UnlockCall[]; removed: Entity[]; matchEnding: 'victory' | 'defeat' | null; }
  export function legacyProcessDeaths(
    world: World, lists: LegacyLists, counters: LegacyCounters, difficulty: Difficulty,
    bases: Readonly<Record<Faction, Entity>>
  ): LegacyFrame;

  // matchHarness.ts
  export type ProcessorKind = 'legacy';   // la Tarea 2 añade 'current'
  export interface FrameResult {
    combatPoints: Record<Faction, number>; killStreak: Record<Faction, number>;
    playerUnitsDestroyed: number; playerUnitsLost: number;
    unlockCalls: UnlockCall[]; removed: Entity[]; ending: 'victory' | 'defeat' | null;
  }
  export class MatchHarness {
    constructor(kind: ProcessorKind, difficulty?: Difficulty);   // createInitialBattle via BattleSimulation
    readonly simulation: BattleSimulation;
    addSoldier(faction: Faction, kind: SoldierKind, position?: Position): Entity;
    addStructure(faction: Faction, kind: 'generator' | 'barracks' | 'turret', position?: Position): Entity;
    setHealth(entity: Entity, current: number): void;
    damage(entity: Entity, amount: number): void;                // applyDamageSystem
    advance(deltaSeconds: number): void;                          // simulation.advance + registra los soldados producidos
    processFrame(): FrameResult;                                  // una pasada de muertes de un fotograma
    readonly ended: boolean;                                      // 'legacy': tras el primer final ya no procesa (como PLAYING→MATCH_ENDING)
  }
  ```
  Notas de transcripción:
  - **Cálculo de `matchEnding`:** se lee la vida ECS de cada base antes de borrarla. La de la derrota se comprueba primero, con la misma prioridad que hoy.
  - **Orden de las listas:** la de unidades sigue el orden de registro (como `createTroopVisual` con los eventos de producción); la de estructuras, la base primero y después las estructuras en orden de creación (como `startNewGame` y `registerStructureTarget`).
  - **Recorrido:** igual que el original, al revés y con `splice`.

- [ ] **Paso 1: Escribir la referencia y el arnés**, transcribiendo línea a línea. Las llamadas de desbloqueo se anotan en `unlockCalls` con los mismos nombres y datos que `unlocks.recordEvent`:
  - `unit_killed` → `{ byPlayer, killStreak, unitType }`;
  - `kill_streak` → `{ killStreak }`;
  - `achievement` → `{ achievement: 'destroy_20_units' }`.

- [ ] **Paso 2: Escribir `deathRules.test.ts`**. Se ejecuta para cada tipo en `const PROCESSORS: ProcessorKind[] = ['legacy']`, con dificultad `normal` salvo que se diga otra cosa. Pruebas (nombres y aserciones):
  1. **`kills give combat points to the other faction`**: muere un soldado enemigo → `combatPoints.player === 1`; un tanque enemigo → `+3`. Un soldado del jugador → `combatPoints.enemy === 1`; un tanque del jugador → `+3`.
  2. **`structures give combat points by kind; the Nexus gives none`**: torreta enemiga → jugador `+4`; generador → `+4`; barraca → `+6`. Nexo enemigo → jugador `+0`. Simétrico para las del jugador.
  3. **`kill streaks grow and reset`**: tres soldados enemigos muertos en tres fotogramas → `killStreak.player === 3`. Después muere un soldado del jugador → `killStreak.player === 0` y `killStreak.enemy === 1`.
  4. **`player units are processed before enemy units`**: en el mismo fotograma muere uno de cada → `killStreak.player === 1` y `killStreak.enemy === 0`.
  5. **`unit counters and the twentieth kill`**: `playerUnitsLost` cuenta las bajas propias. Al morir el vigésimo soldado enemigo hay exactamente una llamada `achievement` con `destroy_20_units`; en la 19 y en la 21 no hay ninguna.
  6. **`a death is handled once`**: tras procesarla, la entidad no está en el `World`. Una segunda llamada sin daño nuevo no cambia CP ni contadores y deja `unlockCalls` y `removed` vacíos.
  7. **`damage applied outside the fixed step is resolved in the same frame`**: `damage(enemyTurret, 380)` y `processFrame()` → `combatPoints.player === 4`.
  8. **`match result`**: Nexo enemigo a 0 → `ending === 'victory'`; Nexo propio a 0 → `'defeat'`; ambos a 0 en el mismo fotograma → `'defeat'`; ninguno → `null`. Tras el final, la base caída no está en el `World`.
  9. **`exactly zero health is a death; positive health is not`**: vida 0 → muere; vida 0,001 → no.
  10. **`events follow the processing order`**: dos unidades del jugador, dos enemigas, una estructura de cada lado, todas a 0 en un fotograma → `removed` es `[jugador₂, jugador₁, enemiga₂, enemiga₁, estructuraJugador, estructuraEnemiga]` (₂ = la más nueva). Las llamadas `unit_killed` siguen ese orden.
  11. **`unlock calls carry the current payloads`**: un soldado enemigo muerto → `[{ name: 'unit_killed', payload: { byPlayer: true, killStreak: 1, unitType: 'rifleman' } }, { name: 'kill_streak', payload: { killStreak: 1 } }]`. Un tanque del jugador → `[{ name: 'unit_killed', payload: { byPlayer: false, killStreak: 1, unitType: 'tank' } }]`.

- [ ] **Paso 3: Ejecutar y ver que pasan contra la referencia** (documentan el comportamiento actual).
  Run: `npx tsx --test web/src/game/match/deathRules.test.ts`
  Expected: 11 pruebas PASS con `legacy`.
  Si alguna falla, la transcripción o la prueba no reflejan el código actual. Hay que corregirlo contra `git show 5b988a8:web/src/GameApplication.ts`, nunca cambiar la regla.

- [ ] **Paso 4: Verificar y commit**
  Run: `npm test && npm run typecheck`
  Expected: todo PASS (169 previas + 11).
  ```bash
  git add web/src/game/match/legacyDeathReference.ts web/src/game/match/matchHarness.ts web/src/game/match/deathRules.test.ts
  git commit -m "test(match): characterize the current death, combat point and result rules"
  ```

---

### Tarea 2: `MatchState`, `DeathResolver` y equivalencia demostrada

**Files:**
- Create: `web/src/game/match/MatchState.ts`, `web/src/game/match/matchEvents.ts`, `web/src/game/match/DeathResolver.ts`, `web/src/game/match/unlockEvents.ts`
- Modify: `web/src/game/match/matchHarness.ts` (añadir `'current'`)
- Modify: `web/src/game/match/deathRules.test.ts` (`PROCESSORS = ['legacy', 'current']` y pruebas 12-14)
- Test: `web/src/game/match/MatchState.test.ts`, `web/src/game/match/deathResolver.differential.test.ts` (temporal; se borra en la Tarea 4)

**Interfaces:**
- Consumes: arnés y referencia de la Tarea 1; `getCombatPointsFor` (`rewardSystem.ts`); `COMPONENTS`, `World`, `Entity`, `Faction`, `Position`, `SoldierKind` y `BuildingKind` (`ecs`).
- Produces:
  ```ts
  // MatchState.ts
  export type MatchOutcome = 'victory' | 'defeat';
  export interface MatchState {
    combatPoints: Record<Faction, number>;
    killStreak: Record<Faction, number>;
    playerUnitsDestroyed: number;
    playerUnitsLost: number;
    outcome: MatchOutcome | null;
  }
  export function createMatchState(): MatchState;                         // todo a 0 y outcome null
  /** Spends points already validated by the reward rules (no check here, as today). */
  export function spendCombatPoints(state: MatchState, faction: Faction, points: number): void;

  // matchEvents.ts
  export type MatchEvent =
    | { readonly type: 'unitDied'; readonly entity: Entity; readonly faction: Faction; readonly kind: SoldierKind;
        readonly position: Position; readonly killerStreak: number; readonly playerReachedTwentyKills: boolean }
    | { readonly type: 'structureDestroyed'; readonly entity: Entity; readonly faction: Faction;
        readonly kind: BuildingKind; readonly position: Position };
  export interface DeathResolution {
    /** Processing order; the array is reused by the next call. */
    readonly events: readonly MatchEvent[];
    readonly outcome: MatchOutcome | null;
    readonly outcomeIsNew: boolean;
  }

  // DeathResolver.ts — clase para reutilizar los arrays de trabajo entre fotogramas
  export class DeathResolver {
    resolve(world: World, state: MatchState, difficulty: Difficulty,
            bases: Readonly<Record<Faction, Entity>>): DeathResolution;
  }

  // unlockEvents.ts
  export interface UnlockCall { readonly name: 'unit_killed' | 'kill_streak' | 'achievement';
                                readonly payload: Readonly<Record<string, unknown>>; }
  export function unlockEventsFor(event: MatchEvent): readonly UnlockCall[];
  ```
- **Algoritmo de `resolve`:**
  1. Si `state.outcome` ya está fijado, devuelve `{ events: [], outcome: state.outcome, outcomeIsNew: false }` sin tocar nada.
  2. `world.queryInto(scratch, [health, faction])`. El orden es el de creación. Se reparten en cuatro listas reutilizadas: soldados del jugador, soldados enemigos, estructuras del jugador (incluida la base) y estructuras enemigas, según tengan `soldier` o `building`.
  3. Se lee si cada base tiene `health.current <= 0` **antes** de borrar nada.
  4. Se recorre cada lista **al revés**, en el orden jugador-unidades, enemigo-unidades, jugador-estructuras, enemigo-estructuras. Para cada entidad con `health.current <= 0`:
     - **soldado:** se aplican los efectos de §2.2 del diseño sobre `state`, se anota `unitDied` con `killerStreak` (la racha de la facción contraria tras sumar) y `playerReachedTwentyKills` (`state.playerUnitsDestroyed === 20` justo tras sumar una baja enemiga) y la posición del `transform`;
     - **estructura:** si no es `hq`, la facción contraria suma `getCombatPointsFor(kind, difficulty)`; se anota `structureDestroyed`;
     - en ambos casos, `world.removeEntity`.
  5. Resultado: si la base del jugador estaba muerta → `'defeat'`; si no, y la enemiga lo estaba → `'victory'`. Si lo hay, se guarda en `state.outcome` y `outcomeIsNew: true`.
- `unlockEventsFor` reproduce exactamente la prueba 11 de la Tarea 1, más `achievement` cuando `playerReachedTwentyKills`. Para `structureDestroyed` devuelve `[]`.
- El modo `'current'` del arnés usa `DeathResolver` + `unlockEventsFor`. `ending` = `outcome` cuando `outcomeIsNew`; si no, `null`.

- [ ] **Paso 1: Pruebas que fallan**
  - `PROCESSORS = ['legacy', 'current']` en `deathRules.test.ts`;
  - `MatchState.test.ts`: `createMatchState` empieza a 0 con `outcome` null; `spendCombatPoints` resta solo a esa facción;
  - en `deathRules.test.ts`, solo para `'current'`:
    - **12 `the result is reported once`**: Nexo enemigo a 0 → primera llamada `outcome 'victory'`, `outcomeIsNew true`; segunda → `'victory'`, `false`.
    - **13 `nothing is processed after the match ended`**: tras la victoria, un soldado enemigo a 0 → sin cambios de CP, rachas ni contadores, sin eventos, y la entidad sigue en el `World`.
    - **14 `one event per death`**: dos llamadas seguidas tras una muerte → la segunda devuelve `events` vacío.
  - **`deathResolver.differential.test.ts`** con un generador con semilla (mulberry32 escrito en la prueba): 100 batallas por dificultad (el tamaño se ajusta para que la prueba dure menos de ~15 s).
    - **Montaje:** dos `MatchHarness` en paralelo (`legacy` y `current`) con el mismo montaje aleatorio: 0-6 estructuras por bando y 0-12 soldados por bando en posiciones aleatorias de la franja central.
    - **Fotogramas:** hasta 400 por batalla, con `advance(delta ∈ [0.016, 0.1])` y, con probabilidad 0,05, `damage` aleatorio de 50-400 a una entidad viva cualquiera, bases incluidas (imita recompensas).
    - **Comparación por fotograma:** `deepEqual` del `FrameResult` y del conjunto de entidades del `World`.
    - **Final:** cuando una termina, la otra también, el mismo fotograma y con el mismo resultado.
    - **Criterio:** 0 diferencias. Además, al menos un 20 % de las batallas deben terminar en victoria o derrota y la mayoría deben tener muertes, para comprobar que se ejercitan los casos.
- [ ] **Paso 2: Ver que fallan** (`npx tsx --test web/src/game/match/*.test.ts`): falla porque no existen los módulos de `'current'`.
- [ ] **Paso 3: Implementar** `MatchState.ts`, `matchEvents.ts`, `DeathResolver.ts`, `unlockEvents.ts` y el modo `'current'` del arnés.
- [ ] **Paso 4: Ver que pasan**
  Run: `npx tsx --test web/src/game/match/*.test.ts`
  Expected: todo PASS, incluida la diferencial con 0 diferencias.
- [ ] **Paso 5: Verificar fronteras y commit**
  Run: `npm test && npm run typecheck && grep -rnE "from '(three|\.\./\.\./(ui|rendering|platform))" web/src/game/match/`
  Expected: todo PASS y sin resultados en el `grep`.
  ```bash
  git add web/src/game/match/MatchState.ts web/src/game/match/MatchState.test.ts web/src/game/match/matchEvents.ts web/src/game/match/DeathResolver.ts web/src/game/match/unlockEvents.ts web/src/game/match/matchHarness.ts web/src/game/match/deathRules.test.ts web/src/game/match/deathResolver.differential.test.ts
  git commit -m "feat(match): resolve deaths, combat points and the match result outside the view"
  ```

---

### Tarea 3: `GameApplication` consume eventos; se borra la lógica antigua

**Files:**
- Modify: `web/src/GameApplication.ts`:
  - estado suelto (≈195-198 y ≈439-440) y su reinicio en `startNewGame` (≈1039-1044);
  - `updateRewardUI` (≈1227);
  - resumen de la IA (≈1699);
  - `updateUnitGroup` (≈1757);
  - `updateCombat` y `updateBuildingList` (≈1953-2045);
  - `awardCombatPointsForDestruction` (≈2055, se elimina);
  - `validateRewardForFaction` y `spendRewardForFaction` (≈2121-2155);
  - `endGame` (≈2662);
  - diagnóstico (`read`, ≈2905; `prepareRewardScenario`, ≈3063).

**Interfaces:**
- Consumes: `createMatchState`, `spendCombatPoints`, `MatchState` (Tarea 2); `DeathResolver`, `MatchEvent` y `DeathResolution`; `unlockEventsFor`.

- [ ] **Paso 1: Estado**
  - Sustituir `playerKillStreak`, `enemyKillStreak`, `playerUnitsDestroyed`, `playerUnitsLost`, `playerCombatPoints` y `enemyCombatPoints` por `let matchState = createMatchState();` (reiniciado en `startNewGame`) y `const deathResolver = new DeathResolver();`.
  - Cada lectura o escritura de CP pasa a `matchState.combatPoints[faction]`: UI de recompensas, resumen de la IA, validación, diagnóstico y escenario de recompensas.
  - El gasto en `spendRewardForFaction` usa `spendCombatPoints`.
  - El resumen final usa `matchState.playerUnitsLost`.

- [ ] **Paso 2: Muertes en `updateCombat`**, conservando el orden visual de hoy:
  1. Aviso del Nexo y `setBaseHealth`, sin cambios.
  2. `const resolution = deathResolver.resolve(simulation.world, matchState, aiDifficulty, { player: simulation.playerBase, enemy: simulation.enemyBase });`
  3. **Eventos `unitDied`**, en orden:
     - visual en `targetObjects`;
     - `createCinematicExplosion(posición del evento, tanque 1.2 / soldado 0.6, false)`;
     - `createTankWreck` (color según facción) o `createSoldierCorpse`;
     - `targetObjects.delete`;
     - `soldierRenderer.remove` o quitar y liberar la malla;
     - sacarlo de `playerUnits` o `enemyUnits`;
     - `for (const call of unlockEventsFor(event)) unlocks.recordEvent(call.name, call.payload)`.
  4. `updateUnitGroup` queda **solo** como sincronización de vida, posición y orientación, sin rama de muerte.
  5. `updateTurrets()` y `combatEffects.update(delta)`, sin cambios.
  6. **Eventos `structureDestroyed`**, en orden:
     - si no es `hq`, `createBuildingRuin`;
     - `createCinematicExplosion(posición, hq ? 3.0 : 1.2, hq)`;
     - `scene.remove` y `disposeObjectResources`;
     - `targetObjects.delete`;
     - sacarlo de su lista.
  7. `updateBuildingList` queda solo como sincronización de barras de vida, sin rama de muerte.
  8. Si `resolution.outcomeIsNew && !hqExplodingSequence` → `beginMatchEnding(resolution.outcome === 'victory')`.
  - Eliminar `awardCombatPointsForDestruction` y la comprobación de fin basada en `playerHQ.hp` / `enemyHQ.hp`.

- [ ] **Paso 3: Verificar**
  Run: `npm test && npm run typecheck && npm run build`
  Expected: todo PASS.

  Run: `grep -nE "playerKillStreak|enemyKillStreak|playerUnitsDestroyed|playerUnitsLost|playerCombatPoints|enemyCombatPoints|awardCombatPointsForDestruction|hp <= 0" web/src/GameApplication.ts`
  Expected: sin resultados.

- [ ] **Paso 4: Comprobación rápida en el navegador** (perfil móvil emulado): `runCombatScenario({ warmupSeconds: 5, durationSeconds: 15 })`.
  Expected: CP del jugador > 0, restos visibles, entidades estables y sin errores de consola.

- [ ] **Paso 5: Commit**
  ```bash
  git add web/src/GameApplication.ts
  git commit -m "refactor(match): GameApplication represents death events instead of deciding them"
  ```

---

### Tarea 4: Navegador, medición, retirada de la referencia y entrega

**Files:**
- Modify: `web/src/GameApplication.ts`: diagnóstico, nuevo `setNexusHealth(faction, value)` solo para desarrollo, que escribe la vida ECS de una base para forzar victoria o derrota.
- Delete: `web/src/game/match/legacyDeathReference.ts`, `web/src/game/match/deathResolver.differential.test.ts`
- Modify: `web/src/game/match/matchHarness.ts` y `deathRules.test.ts` (solo `'current'`)
- Modify: `README.md` (línea de arquitectura de `game/match/`, y `setNexusHealth` en la tabla del diagnóstico), `docs/performance/2026-11-14-referencia-rendimiento.md` (§8.3), `docs/audits/2026-11-14-auditoria-responsabilidades.md` (R3 hecho en §7), `docs/superpowers/specs/2026-11-14-r3-capa-de-partida-design.md` (§10, informe de entrega)

- [ ] **Paso 1: Última pasada de la diferencial**, antes de borrarla.
  Run: `npx tsx --test web/src/game/match/deathResolver.differential.test.ts`
  Expected: PASS. Se anota el número de batallas, fotogramas y finales.

- [ ] **Paso 2: Comprobación en navegador** (perfil móvil emulado):
  - **Combate guionizado:** CP crecientes, restos y geometrías estables en tres repeticiones.
  - **Partida contra la IA con el jugador inactivo hasta la derrota** (`runMatchScenario({ durationSeconds: 60 })`): resumen con bajas igual a `playerUnitsLost`.
  - **Victoria forzada** (`setNexusHealth('enemy', 0)`): secuencia de fin y resumen de victoria.
  - Sin errores de consola en ninguno.

- [ ] **Paso 3: Batería de medición** de §6 del informe, en los dos perfiles. Comparación con R0 y R2 en §8.3:
  - métricas estructurales iguales;
  - `simulationMs` y `gameplayOtherMs` sin aumento claro;
  - no se presenta como mejora nada que no esté respaldado.

- [ ] **Paso 4: Retirar la referencia temporal.** Borrar los dos archivos, dejar `PROCESSORS = ['current']` y el tipo `ProcessorKind = 'current'`.
  Run: `npm test && npm run typecheck && npm run build`
  Expected: todo PASS.

- [ ] **Paso 5: Documentación e informe de entrega** (§10 del diseño), con los siete puntos de las instrucciones de R3:
  - archivos;
  - responsabilidades extraídas;
  - lo que queda en `GameApplication` y por qué;
  - pruebas y resultados;
  - dependencias visuales restantes (daño de recompensas guiado por animación, R5);
  - asuntos para R4 y R5;
  - confirmación de alcance.

- [ ] **Paso 6: Commit**
  ```bash
  git add web/src/GameApplication.ts web/src/game/match/matchHarness.ts web/src/game/match/deathRules.test.ts README.md docs/performance/2026-11-14-referencia-rendimiento.md docs/audits/2026-11-14-auditoria-responsabilidades.md docs/superpowers/specs/2026-11-14-r3-capa-de-partida-design.md docs/superpowers/plans/2026-11-14-r3-capa-de-partida.md
  git rm web/src/game/match/legacyDeathReference.ts web/src/game/match/deathResolver.differential.test.ts
  git commit -m "docs(match): verify R3 in the browser, measure it and retire the legacy reference"
  ```

---

### Después de la Tarea 4: revisión independiente

- **Revisión:** un revisor nuevo, sobre el diff completo de R3, con el diseño, este plan y el Review Focus.
- **Qué comprueba además:**
  - que la transcripción de la Tarea 1 (visible en el historial) era fiel al código de `5b988a8`;
  - que no hay cambios fuera del alcance.
- **Hallazgos:**
  - los críticos e importantes se corrigen con una prueba que falle primero;
  - los menores se anotan.
- **Al terminar R3 no se empieza R4.**
