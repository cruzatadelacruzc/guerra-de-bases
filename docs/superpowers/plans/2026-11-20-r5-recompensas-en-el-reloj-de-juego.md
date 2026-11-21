# R5 — Recompensas independientes de las animaciones — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La artillería y el ataque aéreo aplican su daño desde el dominio, con `gameplayClockMs` y el delta del fotograma, en los mismos fotogramas que hoy. La vista solo dibuja el estado del dominio.

**Architecture:**
- La línea de tiempo de los ataques vive en `MatchState.strikes`. `game/match/rewardExecution.ts` la programa (`scheduleStrike`), la avanza (`advanceStrikes`) y la vacía (`clearStrikes`), repitiendo fotograma a fotograma la aritmética actual (enfoque A1).
- `activateReward` programa el ataque tras cobrarlo, con el rumbo que pasa quien llama.
- `RewardEffectsView` (Three.js) se sincroniza con ese estado. `GameApplication` traduce los eventos de presentación en explosiones, sonido y hápticos.
- Una referencia heredada, fijada **antes** de tocar producción, se compara con el dominio usando secuencias de delta idénticas.

**Tech Stack:** TypeScript estricto, `node:test` vía `tsx` (`npm test`), `tsc --noEmit` (`npm run typecheck`), Vite (`npm run build`), `playwright-cli` para el navegador y la medición.

**Spec:**
- `docs/superpowers/specs/2026-11-20-r5-recompensas-en-el-reloj-de-juego-design.md` (aprobado, revisión 2, commit `71890e9`). Las referencias `§` de este plan son de ese documento.
- Contexto: `docs/audits/2026-11-14-auditoria-responsabilidades.md` (R5 en §7 y §8.2, problema en §4.2), diseño de R4 §5.6 y `docs/performance/2026-11-14-referencia-rendimiento.md`.

## Aclaraciones de la revisión del plan (2026-11-20)

1. **Commit de la referencia heredada.** `web/src/GameApplication.ts` es **idéntico** en `f54dc77` (commit de partida del diseño) y en `71890e9` (commit del diseño). Comprobado:
   - `git rev-parse f54dc77:web/src/GameApplication.ts 71890e9:web/src/GameApplication.ts` da el mismo blob, `9bff6f4a5d3f24ab26c50bae2a7fdf4dbb4282a9`, en los dos;
   - `git diff --quiet f54dc77 71890e9 -- web/src` sale con 0, y el único cambio entre los dos commits es el documento de diseño.

   La transcripción de la Tarea 1 sale de `GameApplication.ts` @ `f54dc77`, el código de producción que identifica el diseño. Las líneas citadas (≈2078-2340) valen para los dos commits.
2. **Comparación del banco** (Tarea 6):
   - se comparan el **oro gastado acumulado** y los **CP gastados acumulados**, no el saldo de CP tras el primer impacto. Un impacto letal puede dar CP en ese mismo fotograma, cuando corre `DeathResolver`;
   - `state.nowMs` se suma al **principio** de cada fotograma del corredor (`state.nowMs += FRAME_SECONDS * 1000`, antes del turno de la IA). Al pasarlo a `advanceStrikes` representa el **final** del fotograma actual, igual que `gameplayClockMs`, que `animate` incrementa antes de la IA y de las recompensas (§3.3). Así `frameStartMs = nowMs - delta·1000` es el inicio del fotograma en los dos bucles.
3. **Instrumentación de pruebas** (Tarea 3):
   - `onImpactApplied` es opcional;
   - si se omite, no se crea ningún array de golpes ni ningún registro por impacto, y la ejecución y el daño son idénticos;
   - el parámetro **se queda en el código de producción** como parámetro inerte, y no se afirma que desaparezca del bundle;
   - lo que debe quedar fuera del bundle son las utilidades de prueba (`legacyRewardTimeline.ts`, `strikeScenarios.ts`). Eso se demuestra con el grafo de importaciones (Tarea 7, paso 3), no buscando un identificador en `dist/`.

## Global Constraints

- TypeScript estricto, sin `any` ni aserciones innecesarias. Sin dependencias nuevas. Sin `.js` ni `.mjs` en `web/src/`.
- **Límites:**
  - `game/match/rewardExecution.ts`, `game/match/strikeState.ts` y `game/match/strikeTargets.ts` no importan `game/commands/`, `three`, `rendering/`, `ui/`, `platform/` ni el DOM;
  - las dependencias van en un solo sentido: `commands/rewardCommand.ts → match/rewardExecution.ts → match/shield.ts`, y los dos primeros importan además `match/strikeTargets.ts`. Sin ciclos, tampoco de solo tipos.
- **Reloj (opción A):** `advanceStrikes` se llama una vez por fotograma, solo en `PLAYING`, entre `advanceBattleSimulation` y `updateCombat`, con el mismo `delta` que suma `gameplayClockMs`. Nada se mueve al paso fijo.
- **Valores exactos** (§3.1, §3.2):
  - **artillería:** `launchAt = 0.7 + i·0.7`, vuelo `2.2` s, radio `12`, desfases `(0,0) (6,4) (-5,-3)`;
  - **ataque aéreo:** vuelo `5.2` s, media pasada `60`, `AIR_STRIKE_SPEED = 120 / 5.2`, caída `0.72` s, radio `12`, desfases `(0,0) (5,3) (-4,-3) (8,-5)`;
  - **rumbo de la IA:** `{ x: -1, z: 0 }`;
  - **daño:** `getRewardDefinitionForDifficulty(id, d).damage ?? 120` (artillería) y `?? 220` (avión);
  - **`strikeActiveUntilMs`:** `nowMs + 4300` (artillería, `artilleryStrikeDurationSeconds(3)`) y `nowMs + 5200` (avión);
  - `lerp(a, b, t) = (1 - t) * a + t * b`, literal.
- **Hora nominal** (aclaración 7): `nominalMs = (nowMs - delta·1000) + (umbral - contadorAntes)·1000`. Nunca desde `startedAtMs`.
- **Sin cambios de comportamiento** (§7): mismos fotogramas, puntos, objetivos y daño. El escudo sigue sin afectar al daño de los ataques. Sin cambios de equilibrio, de la IA ni del paso fijo.
- **Fuera de alcance** (§8): fase 3 de la IA, banco de partidas, R6-R8, desbloqueos, los dos mecanismos de fin de partida y la duración con reloj real.
- **Commits:**
  - un commit por tarea, directo en `main`, con rutas explícitas en `git add`;
  - la prueba de la tarea y `npm test` se ejecutan antes de cada commit;
  - cada mensaje termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - **al terminar R5 no se empieza R6.**

## Review Focus

1. **Activar el avión con la cámara casi vertical:** `cameraGroundHeading()` devuelve `{0,-1}` si la proyección es casi nula. El rumbo sigue siendo unitario y el comando no lanza error. Prueba en la Tarea 4 con ese rumbo de respaldo y comprobación en el navegador (Tarea 7).
2. **Pausa o segundo plano a mitad de un ataque:** al reanudar, `resetDelta` evita un salto. Los impactos caen con el tiempo de juego, no con el de pared. Secuencia `paused` de la comparación (Tarea 3) y comprobación en el navegador (Tarea 7).
3. **Volver al menú o empezar partida con un ataque en vuelo:** no queda ningún visual ni cae daño en la partida nueva, y el panel no muestra geometrías huérfanas. Escenario S11 (Tarea 3), `clear()` de la vista (Tarea 5) y partidas seguidas en el navegador (Tarea 7).
4. **Victoria o derrota a mitad de un ataque:** ningún impacto cae durante `MATCH_ENDING`. Escenario S10 (Tarea 3) y guarda de `outcome` (Tarea 2).
5. **Activación de la IA en el mismo fotograma que un impacto del jugador:** el orden y la hora nominal coinciden para los dos caminos. Escenario S9 con activaciones dentro y entre fotogramas (Tarea 3) y prueba de hora nominal (Tarea 2).

---

### Task 1: Referencia heredada y pruebas que la fijan (solo pruebas, antes de tocar producción)

**Files:**
- Create: `web/src/game/match/legacyRewardTimeline.ts` (utilidad de prueba, transcripción de `GameApplication.ts` @ `f54dc77`, blob `9bff6f4`, idéntico en `71890e9`; líneas ≈2078-2340)
- Create: `web/src/game/match/strikeScenarios.ts` (utilidad de prueba: mundos, secuencias de delta y bucle de fotogramas)
- Modify: `web/src/game/commands/constructionBoundary.test.ts` (añadir los dos ficheros a `TEST_UTILITIES`)
- Test: `web/src/game/match/legacyRewardTimeline.test.ts`

**Interfaces:**
- Produces (todo solo para pruebas):
  ```ts
  // legacyRewardTimeline.ts
  export interface StrikeHit { readonly entity: Entity; readonly healthLoss: number }   // vida antes − después
  export interface StrikeImpactRecord {
    readonly frame: number; readonly strike: number; readonly kind: 'artillery_strike' | 'air_strike';
    readonly faction: Faction; readonly index: number; readonly x: number; readonly z: number;
    readonly hits: readonly StrikeHit[];
  }
  export class LegacyRewardTimeline {
    constructor(world: World, match: MatchState, bases: Readonly<Record<Faction, Entity>>, difficulty: Difficulty);
    triggerArtillery(faction: Faction, aim: StrikeAim): number;                  // devuelve el nº de ataque (1, 2, …)
    triggerAirStrike(faction: Faction, aim: StrikeAim, heading: StrikeAim): number;
    update(deltaSeconds: number, nowMs: number, frame: number): void;            // artillería y después avión, como `animate`
    clear(): void;                                                               // `clearActiveRewardEffects`
    readonly records: StrikeImpactRecord[];
    get activeCount(): number;
  }

  // strikeScenarios.ts
  export type FrameDelta = number | 'paused';                                    // 'paused': fotograma sin llamada ni reloj
  export const DELTA_SEQUENCES: Readonly<Record<'fixed60' | 'fixed30' | 'clamp' | 'jitter' | 'paused' | 'huge', readonly FrameDelta[]>>;
  export interface StrikeWorld {
    readonly world: World; readonly bases: Readonly<Record<Faction, Entity>>;
    match: MatchState; readonly difficulty: Difficulty;
  }
  export function createStrikeWorld(difficulty?: Difficulty): StrikeWorld;      // BattleSimulation nuevo; nunca se avanza
  export function addUnit(w: StrikeWorld, faction: Faction, x: number, z: number, kind?: SoldierKind): Entity;
  export function addBuilding(w: StrikeWorld, faction: Faction, kind: 'generator' | 'barracks' | 'turret', x: number, z: number): Entity;
  export interface FrameState {
    readonly frame: number;
    readonly health: ReadonlyArray<readonly [Entity, number]>;                  // entidades vivas tras resolver muertes
    readonly combatPoints: Record<Faction, number>; readonly killStreak: Record<Faction, number>;
    readonly outcome: MatchOutcome | null;
    readonly targetsAtFrameStart: ReadonlyArray<{ entity: Entity; faction: Faction; x: number; z: number }>;
  }
  export interface StrikeDriver {                                                // una implementación (referencia o dominio)
    activate(w: StrikeWorld, faction: Faction, kind: 'artillery_strike' | 'air_strike', aim: StrikeAim, heading: StrikeAim | undefined, nowMs: number): void;
    update(w: StrikeWorld, deltaSeconds: number, nowMs: number, frame: number): void;
    newMatch(w: StrikeWorld): void;
    records(): readonly StrikeImpactRecord[];
  }
  export interface ScenarioStep {
    /** Tiempo de juego: el paso ocurre en el primer fotograma cuyo reloj, tras sumar su delta, alcanza `atMs`. */
    readonly atMs: number;
    readonly when: 'between-frames' | 'inside-frame';                             // jugador: antes de sumar el reloj; IA: después
    readonly action:
      | { type: 'activate'; faction: Faction; kind: 'artillery_strike' | 'air_strike'; aim: StrikeAim; heading?: StrikeAim }
      | { type: 'move'; entity: Entity; x: number; z: number }
      | { type: 'add-unit'; faction: Faction; x: number; z: number }
      | { type: 'set-health'; entity: Entity | 'player-hq' | 'enemy-hq'; current: number }
      | { type: 'new-match' };
  }
  export function runStrikeScenario(
    build: (w: StrikeWorld) => readonly ScenarioStep[], driver: StrikeDriver,
    deltas: readonly FrameDelta[], difficulty?: Difficulty
  ): { records: readonly StrikeImpactRecord[]; frames: readonly FrameState[] };
  export function legacyDriver(): StrikeDriver;
  ```

- [ ] **Paso 1: Transcripción.** `LegacyRewardTimeline` copia `triggerArtilleryStrike`, `updateActiveArtillery`, `triggerAirStrikeForFaction`, `updateActiveAirStrikes`, `getRewardTargetCandidates` y `applyDamage` línea a línea. Solo cambia esto:
  - **se quitan** mallas, `scene`, `combatEffects`, `createCinematicExplosion`, `SFX`, `haptics`, `ballisticPoint`, `orientAircraftAlongFlightPath` y `disposeVisualTree`;
  - `THREE.Vector3` pasa a `{ x, y, z }` y `THREE.MathUtils.lerp` a `(1 - t) * a + t * b`;
  - el `if (!impact.projectile)` pasa a un booleano `launched`;
  - **candidatos:** la misma consulta ECS, con `targetObjects.get(entity)` sustituido por "existe y no es `building.kind === 'hq'`" (§3.4);
  - **`applyDamage`:** llama a `applyRewardDamage` igual que hoy (`nowMs` del `update`) y anota `healthLoss`.

  Se conserva el recorrido inverso de las listas (`for (let i = length - 1; i >= 0; i--)`), el orden por índice de impactos y bombas, y el orden explosión → daño del avión (sin explosión).

  **Cabecera del fichero:** qué se transcribió, de qué commit (`f54dc77`, blob `9bff6f4`, idéntico en `71890e9`) y qué se quitó.
- [ ] **Paso 2: Utilidades de escenario.**
  - **`DELTA_SEQUENCES`:** cada secuencia cubre al menos 8 s de juego.
    - `fixed60`: `1/60`;
    - `fixed30`: `1/30`;
    - `clamp`: `0.1`;
    - `jitter`: `seededRng(5)`, con valores en `[1/240, 0.1]`;
    - `paused`: `1/60` con 90 entradas `'paused'` a partir del fotograma 120;
    - `huge`: `[1/60, 10, 1/60 × 30]`.
  - **`runStrikeScenario`** repite el orden de `animate` (§3.3) en cada entrada de la secuencia:
    1. si la entrada es `'paused'`, no se hace nada (los pasos esperan);
    2. pasos `between-frames` pendientes con `atMs ≤ nowMs + delta * 1000`, con el reloj todavía sin sumar;
    3. `nowMs += delta * 1000`;
    4. pasos `inside-frame` pendientes con `atMs ≤ nowMs`;

    Los pasos van por tiempo de juego y no por número de fotograma, para que tengan sentido con las seis secuencias. Un paso `between-frames` y otro `inside-frame` con el mismo `atMs` caen en el mismo fotograma.
    5. se anota `targetsAtFrameStart`: entidades targetables vivas con facción y posición;
    6. `driver.update` si `match.outcome === null`;
    7. `new DeathResolver().resolve(...)`, con un único resolver por partida;
    8. se anota `FrameState`.

    `activate` anota `nowMs` actual. Un paso `new-match` llama a `driver.newMatch` y crea `createMatchState()`.
  - **`legacyDriver()`** envuelve `LegacyRewardTimeline`. `newMatch` llama a `clear()` y crea una timeline nueva sobre el nuevo `match`.
- [ ] **Paso 3: Pruebas que fijan la referencia** (§6.1), en `legacyRewardTimeline.test.ts`:
  - `legacy artillery lands three shells at the frames where the summed delta reaches 2.9, 3.6 and 4.3 s`: con `fixed60`, los fotogramas son el primero con `Σdelta ≥ t`, calculado en la prueba con la misma suma en coma flotante. Puntos `aim + (0,0)`, `(6,4)` y `(-5,-3)`.
  - `legacy air strike drops four bombs within 5.2 s at aim + offset`: rumbo `{x:-1,z:0}`. Las bombas caen en orden de proyección creciente sobre el rumbo: índices 3, 1, 0, 2.
  - `legacy air strike release order follows the heading`: con `{x:1,z:0}`, el orden es 2, 0, 1, 3.
  - `legacy strikes hit at radius 12 and miss at 12 + 1e-6`.
  - `legacy damage per impact is 120 for artillery and 220 for the air strike on every difficulty`.
  - `legacy timeline does not advance while paused`: `paused` da los mismos impactos que `fixed60`, desplazados exactamente 90 fotogramas.
  - `legacy strikes never hit the Nexus`.
- [ ] **Paso 4: Ejecutar.**
  Run: `npx tsx --test web/src/game/match/legacyRewardTimeline.test.ts web/src/game/commands/constructionBoundary.test.ts`
  Expected: PASS. Ningún fichero de producción cambia (`git status` solo muestra los cuatro de esta tarea).
- [ ] **Paso 5: `npm test`, `npm run typecheck`, y commit.**
  ```bash
  git add web/src/game/match/legacyRewardTimeline.ts web/src/game/match/strikeScenarios.ts web/src/game/match/legacyRewardTimeline.test.ts web/src/game/commands/constructionBoundary.test.ts
  git commit -m "test(rewards): pin the current strike timing with a legacy reference"
  ```

---

### Task 2: Ejecución de ataques en el dominio

**Files:**
- Modify: `web/src/game/rewardSystem.ts` (constantes, `StrikeId`, `ENEMY_AIR_STRIKE_HEADING`, `nominalBombLandingSeconds`)
- Modify: `web/src/GameApplication.ts` (solo quitar `AIR_STRIKE_FLIGHT_SECONDS`, `AIR_STRIKE_RUN_HALF_LENGTH`, `AIR_STRIKE_SPEED` y `AIR_STRIKE_BOMB_FALL_SECONDS` locales e importarlos)
- Create: `web/src/game/match/strikeState.ts`
- Create: `web/src/game/match/strikeTargets.ts`
- Create: `web/src/game/match/rewardExecution.ts`
- Modify: `web/src/game/match/MatchState.ts`
- Test: `web/src/game/match/rewardExecution.test.ts`, `web/src/game/match/rewardExecutionBoundary.test.ts`, `web/src/game/match/MatchState.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // rewardSystem.ts
  export type StrikeId = 'artillery_strike' | 'air_strike';
  export const AIR_STRIKE_FLIGHT_SECONDS = 5.2;
  export const AIR_STRIKE_RUN_HALF_LENGTH = 60;
  export const AIR_STRIKE_SPEED = (2 * AIR_STRIKE_RUN_HALF_LENGTH) / AIR_STRIKE_FLIGHT_SECONDS;
  export const AIR_STRIKE_BOMB_FALL_SECONDS = 0.72;
  export const ENEMY_AIR_STRIKE_HEADING: Readonly<StrikeAim>;                    // Object.freeze({ x: -1, z: 0 })
  /** Solo para encuadrar la cámara; el orden de impactos no lo usa. */
  export function nominalBombLandingSeconds(offset: StrikeOffset, heading: Readonly<StrikeAim>): number;
  //   = AIR_STRIKE_FLIGHT_SECONDS / 2 + (offset.x * heading.x + offset.z * heading.z) / AIR_STRIKE_SPEED + AIR_STRIKE_BOMB_FALL_SECONDS

  // strikeState.ts — tipos de §5.2 (ArtilleryShellState, BombState, ActiveStrike, StrikeTimeline) tal cual
  export function createStrikeTimeline(): StrikeTimeline;                        // { active: [], nextId: 1 }

  // strikeTargets.ts
  /** Targetable, de la facción contraria a `attacker`, con vida > 0 y posición, y que no es un Nexo. */
  export function isStrikeTarget(world: World, entity: Entity, attacker: Faction): boolean;

  // MatchState.ts
  //   MatchState.strikes: StrikeTimeline
  //   FactionRewardState.strikeActiveUntilMs: Partial<Record<StrikeId, number>>   (createMatchState: {})

  // rewardExecution.ts
  export type StrikeEvent = /* las cuatro variantes de §5.4, tal cual */;
  export function scheduleStrike(
    match: MatchState, faction: Faction, id: StrikeId, aim: StrikeAim,
    heading: Readonly<StrikeAim> | undefined, difficulty: Difficulty, nowMs: number
  ): ActiveStrike;
  export function advanceStrikes(
    world: World, match: MatchState, bases: Readonly<Record<Faction, Entity>>,
    deltaSeconds: number, nowMs: number, difficulty: Difficulty, events: StrikeEvent[]
  ): void;
  export function clearStrikes(match: MatchState): void;                         // solo vacía `strikes.active`
  ```

- [ ] **Paso 1: Pruebas que fallan** (`rewardExecution.test.ts`), con mundos de `strikeScenarios.ts`:
  - `scheduleStrike places artillery shells at aim + offset with launchAt 0.7, 1.4, 2.1 and sets strikeActiveUntilMs to now + 4300`.
  - `scheduleStrike builds the air run from aim - heading·60 to aim + heading·60 and sets strikeActiveUntilMs to now + 5200`.
  - `scheduleStrike freezes a copy of the heading`: cambiar el objeto original después no cambia `strike.heading`, y `Object.isFrozen(strike.heading)`.
  - `scheduleStrike throws for an air strike without a heading`.
  - `strike ids grow within a match and restart with createMatchState`.
  - `advanceStrikes empties the events array on entry`.
  - `advanceStrikes applies damage when nobody reads the events`: se pasa un array y no se lee; la vida baja igual.
  - `advanceStrikes does nothing once the match has an outcome`: ni `elapsed`, ni daño, ni eventos.
  - `advanceStrikes applies every due impact exactly once with a 10 s delta`: 3 impactos de artillería y 4 bombas, en un solo fotograma. Después, `active` queda vacío y llegan dos `strike-finished`.
  - `due impacts in one frame are applied and emitted in nominal order` (aclaración 7):
    - el fotograma k empieza en `T`;
    - la artillería del jugador se activa entre los fotogramas k−1 y k (`nowMs = T`, `startedAtMs = T`);
    - la artillería de la IA se activa dentro del fotograma k (`nowMs = T + Δ`, `startedAtMs = T + Δ`);
    - las dos dan al primer proyectil la hora nominal `T + 2900`, no `T + Δ + 2900` en la IA, y se aplican en orden de `strikeId`. Para comprobarlo, se registra el orden de los eventos `impact`.
  - `a bomb released and landing in the same frame has nominal frame start + 720 ms`: dos bombas con el mismo valor se aplican en orden de índice.
  - `nominalBombLandingSeconds is within one 1/60 frame of the replicated landing frame`: los cuatro desfases con el rumbo de la IA y con `{x:1,z:0}`.
  - `strike damage ignores an active shield because the Nexus is never a target`.
- [ ] **Paso 2: Prueba de límites** (`rewardExecutionBoundary.test.ts`), con el patrón de `constructionBoundary.test.ts`:
  - los ficheros `strikeState.ts`, `strikeTargets.ts` y `rewardExecution.ts` no contienen imports de `commands/`, `'three'`, `rendering/`, `ui/` ni `platform/`;
  - `strikeState.ts` no importa `MatchState.ts` ni `rewardExecution.ts`.
- [ ] **Paso 3: Ejecutar y ver que fallan.**
  Run: `npx tsx --test web/src/game/match/rewardExecution.test.ts web/src/game/match/rewardExecutionBoundary.test.ts`
  Expected: FAIL (los módulos no existen).
- [ ] **Paso 4: Implementar.**
  - **Tipos y estado:** `strikeState.ts` con los tipos de §5.2. `MatchState` importa sus tipos con `import type` y `createMatchState` añade `strikes: createStrikeTimeline()` y `strikeActiveUntilMs: {}` por facción. Se actualiza el `deepEqual` de `MatchState.test.ts`.
  - **`isStrikeTarget`:** recibe la condición que hoy está en el bucle de `rewardTargetCandidates`.
  - **`scheduleStrike`:** según §5.3. El daño sale de `getRewardDefinitionForDifficulty`, con el respaldo de las restricciones globales, y el radio de `getStrikePattern(id, d).radius`.
  - **`advanceStrikes`:** este algoritmo fija el orden de las operaciones en coma flotante, porque la comparación de la Tarea 3 exige igualdad estricta.
    ```
    events.length = 0
    if match.outcome !== null: return
    frameStartMs = nowMs - deltaSeconds * 1000
    due = []                                            // se crea solo si vence algo
    for strike of match.strikes.active (orden de activación):
      before = strike.elapsedSeconds
      strike.elapsedSeconds += deltaSeconds
      if artillery:
        for shell i:
          flight = strike.elapsedSeconds - shell.launchAtSeconds
          if flight < 0 || shell.landed: continue
          if !shell.launched: shell.launched = true; push shell-launched
          if Math.min(1, flight / ARTILLERY_SHELL_FLIGHT_SECONDS) < 1: continue
          shell.landed = true
          due.push({ strike, i, nominalMs: frameStartMs + (shell.launchAtSeconds + ARTILLERY_SHELL_FLIGHT_SECONDS - before) * 1000 })
      if air:
        progress = Math.min(1, strike.elapsedSeconds / AIR_STRIKE_FLIGHT_SECONDS)
        x = lerp(startX, endX, progress); z = lerp(startZ, endZ, progress)
        for bomb i:
          if !bomb.released && (x - bomb.x) * (endX - startX) + (z - bomb.z) * (endZ - startZ) >= 0:
            bomb.released = true; bomb.releaseX = x; bomb.releaseZ = z; bomb.releaseProgress = progress; push bomb-released
          if !bomb.released || bomb.landed: continue
          fallBefore = bomb.fallElapsedSeconds
          bomb.fallElapsedSeconds += deltaSeconds
          if Math.min(1, bomb.fallElapsedSeconds / AIR_STRIKE_BOMB_FALL_SECONDS) < 1: continue
          bomb.landed = true
          due.push({ strike, i, nominalMs: frameStartMs + (AIR_STRIKE_BOMB_FALL_SECONDS - fallBefore) * 1000 })
    sort due by (nominalMs, strike.id, i)
    for each due: for entity of world.query(targetable, faction, transform, health)
                    if isStrikeTarget(world, entity, strike.faction) && Math.hypot(dx, dz) <= strike.radius:
                      applyRewardDamage(world, match, bases, entity, strike.damagePerImpact, nowMs, difficulty)
                  push impact { x, z del impacto }
    quitar de active los terminados (artillería: todos landed; avión: progress >= 1 y todas landed) y push strike-finished
    ```
  - **`clearStrikes`:** `match.strikes.active.length = 0`.
  - **Constantes:** se mueven a `rewardSystem.ts` y `GameApplication` las importa, sin otro cambio.
- [ ] **Paso 5: Ejecutar.**
  Run: `npx tsx --test web/src/game/match/rewardExecution.test.ts web/src/game/match/rewardExecutionBoundary.test.ts web/src/game/match/MatchState.test.ts`
  Expected: PASS.
- [ ] **Paso 6: `npm test`, `npm run typecheck`, y commit.**
  ```bash
  git add web/src/game/rewardSystem.ts web/src/GameApplication.ts web/src/game/match/strikeState.ts web/src/game/match/strikeTargets.ts web/src/game/match/rewardExecution.ts web/src/game/match/MatchState.ts web/src/game/match/rewardExecution.test.ts web/src/game/match/rewardExecutionBoundary.test.ts web/src/game/match/MatchState.test.ts
  git commit -m "feat(rewards): schedule and resolve strikes on the gameplay clock in the domain"
  ```

---

### Task 3: Comparación referencia ↔ dominio

**Files:**
- Modify: `web/src/game/match/strikeScenarios.ts` (añadir `domainDriver` y los escenarios)
- Modify: `web/src/game/match/rewardExecution.ts` (parámetro de prueba `onImpactApplied`)
- Modify: `web/src/game/match/strikeState.ts` y `web/src/game/match/legacyRewardTimeline.ts` (`StrikeHit` pasa a `strikeState.ts`)
- Test: `web/src/game/match/rewardExecution.comparison.test.ts`, `web/src/game/match/rewardExecution.test.ts` (prueba con y sin `onImpactApplied`)

**Interfaces:**
- Consumes: Tarea 1 (`runStrikeScenario`, `legacyDriver`, `DELTA_SEQUENCES`) y Tarea 2 (`scheduleStrike`, `advanceStrikes`).
- Produces:
  ```ts
  export function domainDriver(): StrikeDriver;          // scheduleStrike + advanceStrikes; anota StrikeImpactRecord a partir de los eventos `impact`
  export const STRIKE_SCENARIOS: Readonly<Record<'S1' | 'S2' | 'S3' | 'S4a' | 'S4b' | 'S4c' | 'S4d' | 'S5' | 'S6' | 'S7' | 'S8' | 'S9' | 'S10' | 'S11',
    (w: StrikeWorld) => readonly ScenarioStep[]>>;
  ```

- [ ] **Paso 1: `domainDriver`.** Para anotar `hits` hay que atribuir cada golpe a su impacto, y desde fuera de `advanceStrikes` solo se ve la vida al final del fotograma.
  - `advanceStrikes` recibe un último parámetro opcional `onImpactApplied?: (strikeId: number, index: number, hits: readonly StrikeHit[]) => void`, documentado como solo para pruebas. Se llama después de aplicar el daño de cada impacto, con la vida perdida por cada objetivo.
  - `StrikeHit` pasa de `legacyRewardTimeline.ts` a `strikeState.ts`, y la referencia lo importa de ahí.
  - **Si no se pasa el parámetro** (aclaración 3), no se crea ningún array de golpes ni ningún registro por impacto. La lista se crea solo dentro de `if (onImpactApplied)`, y la vida previa se lee solo en esa rama.
  - **Prueba** `advanceStrikes behaves identically with and without onImpactApplied`, en `rewardExecution.test.ts`. Se ejecuta dos veces un escenario S1 + S4d con `fixed60`, con y sin el parámetro, y se exigen idénticos:
    - la vida de cada entidad en cada fotograma;
    - los eventos (tipo, ataque, índice, punto);
    - `match.strikes` al final.
  - **Revisión:** que la rama sin parámetro no asigna nada es un punto de la revisión de la tarea, porque una prueba no puede medir asignaciones.

  Es la única concesión del dominio a las pruebas. El daño no depende de él.
- [ ] **Paso 2: Escenarios** (tabla de §6.2):
  - **S1:** artillería del jugador sobre 5 soldados enemigos repartidos en los tres radios.
  - **S2:** artillería de la IA (`inside-frame`) sobre una torreta, un generador y una barraca del jugador.
  - **S3:** avión de la IA con `ENEMY_AIR_STRIKE_HEADING`.
  - **S4a-d:** avión del jugador con rumbos `{1,0}`, `{0,-1}`, `normalize(1,1)` y `normalize(-6,9)`. El último es perpendicular a `(9,6)`, con un soldado en `aim + (0.5, 0)`, dentro del radio de las bombas 1 y 2.
  - **S5:** soldados a distancia 12 y `12 + 1e-6` del primer impacto, y el Nexo enemigo a 2.
  - **S6:** un soldado con vida 10 dentro de los radios de los impactos 0 y 1 de la artillería.
  - **S7:** un soldado entra en el radio (`move`) entre la activación y el primer impacto, otro sale, y un tercero aparece (`add-unit`).
  - **S8:** escudo enemigo activo (`match.rewards.enemy.shieldUntilMs = 1e9`) y S1.
  - **S9:** artillería del jugador (`between-frames`) y avión de la IA (`inside-frame`) con el mismo `atMs`, es decir, en el mismo fotograma.
  - **S10:** artillería del jugador en `atMs = 0` y `set-health enemy-hq 0` en `atMs = 4000`, entre el segundo impacto (3,6 s) y el tercero (4,3 s).
  - **S11:** artillería del jugador en `atMs = 0`, y `new-match` en `atMs = 1000`.
- [ ] **Paso 3: Comparación** (aclaración 10). Para cada escenario y cada secuencia de `DELTA_SEQUENCES`, `runStrikeScenario` con `legacyDriver()` y con `domainDriver()`, y después:
  - **igualdad estricta:**
    - mismo número de registros;
    - el multiconjunto de `(frame, strike, kind, faction, index, x, z)`;
    - todos los `FrameState` (vida, entidades vivas, CP, rachas, resultado);
  - **grupos:** en cada fotograma, se agrupan los impactos cuyos círculos (radio del tipo) contienen alguna misma entidad de `targetsAtFrameStart` de la facción atacada. Es una unión transitiva;
  - **grupo de uno:** `hits` idénticos, ordenados por entidad;
  - **grupo de varios:** idénticos el conjunto de entidades dañadas y, por entidad, el número de golpes y la suma de `healthLoss`.

  Si algo no coincide, se corrige el dominio. **No se relaja la prueba** (§6.2).
- [ ] **Paso 4: Comprobaciones propias de algunos escenarios:**
  - S5: el Nexo no aparece en ningún `hits`;
  - S6: el soldado aparece solo en el impacto 0;
  - S10: ningún registro después del fotograma del resultado;
  - S11: ningún registro después del `new-match` y `match.strikes.active` vacío.
- [ ] **Paso 5: Ejecutar.**
  Run: `npx tsx --test web/src/game/match/rewardExecution.comparison.test.ts`
  Expected: PASS en los 14 × 6 casos.
- [ ] **Paso 6: `npm test`, `npm run typecheck`, y commit.**
  ```bash
  git add web/src/game/match/strikeScenarios.ts web/src/game/match/rewardExecution.ts web/src/game/match/strikeState.ts web/src/game/match/legacyRewardTimeline.ts web/src/game/match/rewardExecution.comparison.test.ts web/src/game/match/rewardExecution.test.ts
  git commit -m "test(rewards): compare the domain strike timeline with the legacy reference"
  ```

---

### Task 4: El comando programa el ataque con el rumbo del llamador

**Files:**
- Modify: `web/src/game/commands/rewardCommand.ts`
- Modify: `web/src/game/ai/executeEnemyTurn.ts`
- Modify: `web/src/GameApplication.ts` (solo `activateRewardForFaction`: pasar el rumbo)
- Test: `web/src/game/commands/rewardCommand.test.ts`, `web/src/game/ai/executeEnemyTurn.test.ts`

**Interfaces:**
- Consumes: `scheduleStrike` e `isStrikeTarget` (Tarea 2), `ENEMY_AIR_STRIKE_HEADING`.
- Produces:
  ```ts
  export function activateReward(
    ctx: CommandContext, faction: Faction, id: RewardId,
    options?: { readonly heading?: Readonly<StrikeAim> }
  ): CommandResult<{ aim?: StrikeAim; definition: RewardDefinition; strikeId?: number }, RewardRejection>;
  // rewardTargetCandidates: misma firma, filtra con isStrikeTarget
  ```

- [ ] **Paso 1: Pruebas que fallan** (`rewardCommand.test.ts`):
  - `an accepted strike schedules exactly one strike with the aim and the caller's heading`: `strikeId` coincide con `match.strikes.active[0].id`.
  - `the shield schedules no strike`.
  - `every rejection schedules nothing`: se amplía la tabla de rechazos de R4 con `match.strikes.active.length === 0`. `snapshotCommandState` ya compara `match` completo.
  - `an air strike without a heading or with a non-unit heading throws before charging`: el oro, los CP y la recarga no cambian. Casos: `undefined`, `{x:2,z:0}`, `{x:NaN,z:0}`; tolerancia `|‖h‖ − 1| > 1e-6`.
  - `the camera fallback heading {x:0,z:-1} is accepted` (Review Focus 1).
  - La prueba de R4 que activa `air_strike` sin rumbo (línea ≈91) pasa a dar `{ heading: { x: 0, z: -1 } }`. El punto de mira esperado no cambia.
  - En `executeEnemyTurn.test.ts`: `enemy air strikes use ENEMY_AIR_STRIKE_HEADING`.
- [ ] **Paso 2: Ejecutar y ver que fallan.**
  Run: `npx tsx --test web/src/game/commands/rewardCommand.test.ts web/src/game/ai/executeEnemyTurn.test.ts`
  Expected: FAIL.
- [ ] **Paso 3: Implementar.**
  - **`activateReward`:**
    - para `air_strike`, valida el rumbo **antes** de `checkMatchPlaying` (es un error de programación, §5.3);
    - tras cobrar y fijar la recarga, llama a `scheduleStrike(match, faction, id, aim, options?.heading, difficulty, nowMs)` y devuelve `strikeId`;
    - el comentario de la función deja de decir "applied by the view (R5)".
  - **`executeEnemyTurn`** pasa `{ heading: ENEMY_AIR_STRIKE_HEADING }`.
  - **`activateRewardForFaction`** pasa `{ heading: faction === 'player' ? cameraGroundHeading() : ENEMY_AIR_STRIKE_HEADING }` solo para `air_strike`. `representRewardActivation` usa el rumbo guardado en el ataque (`matchState.strikes.active` por `strikeId`) para lanzar el visual heredado.

  **Estado intermedio aceptado hasta la Tarea 5:** el dominio programa ataques que nadie avanza, y la vista heredada sigue aplicando el daño. No hay daño doble, y `createMatchState` los borra en cada partida.
- [ ] **Paso 4: Ejecutar.**
  Run: `npx tsx --test web/src/game/commands/rewardCommand.test.ts web/src/game/ai/executeEnemyTurn.test.ts web/src/game/ai/aiExecutor.comparison.test.ts`
  Expected: PASS. La comparación de R4 queda sin cambios.
- [ ] **Paso 5: `npm test`, `npm run typecheck`, y commit.**
  ```bash
  git add web/src/game/commands/rewardCommand.ts web/src/game/ai/executeEnemyTurn.ts web/src/GameApplication.ts web/src/game/commands/rewardCommand.test.ts web/src/game/ai/executeEnemyTurn.test.ts
  git commit -m "feat(commands): activating a strike schedules it with the caller's heading"
  ```

---

### Task 5: La vista dibuja el dominio y deja de aplicar daño

**Files:**
- Create: `web/src/rendering/RewardEffectsView.ts`
- Modify: `web/src/GameApplication.ts`
- Test: `web/src/rendering/RewardEffectsView.test.ts`

**Interfaces:**
- Consumes: `StrikeTimeline` y `ActiveStrike` (Tarea 2), `StrikeEvent`, `advanceStrikes`, `clearStrikes`, `nominalBombLandingSeconds`.
- Produces:
  ```ts
  export interface RewardEffectsViewOptions {
    readonly scene: THREE.Scene;
    /** Origen visual del proyectil i de la facción (sobre su Nexo); solo se lee al crear el visual. */
    readonly shellOrigin: (faction: Faction, index: number, shellCount: number) => Readonly<{ x: number; y: number; z: number }>;
  }
  export class RewardEffectsView {
    constructor(options: RewardEffectsViewOptions);
    sync(strikes: StrikeTimeline): void;
    clear(): void;
    stats(): { strikes: number; sceneObjects: number };
    dispose(): void;   // libera también la geometría y el material compartidos del proyectil
  }
  ```

- [ ] **Paso 1: Pruebas que fallan** (`RewardEffectsView.test.ts`, con `THREE.Scene` en Node como `CombatEffects.test.ts`):
  - `sync creates one aircraft and four hidden bombs for an air strike`.
  - `a bomb is visible only between released and landed`.
  - `a shell follows the ballistic arc from its origin to the impact point by the domain's flight progress`: con progreso 0,5, la posición es `ballisticPoint(origin, point, apexHeightFor(origin, point), 0.5)`.
  - `the aircraft position depends only on the strike's elapsed time and stored heading`: dos `sync` con el mismo estado dan la misma posición y orientación. La vista no recibe la cámara.
  - `strikes missing from the timeline lose their visuals and free their geometries`.
  - `clear removes every strike visual from the scene`.

  La vista no importa `game/match/rewardExecution.ts` (solo tipos de `strikeState.ts`).
- [ ] **Paso 2: Ejecutar y ver que fallan.**
  Run: `npx tsx --test web/src/rendering/RewardEffectsView.test.ts`
  Expected: FAIL.
- [ ] **Paso 3: Implementar `RewardEffectsView`** con el código visual que hoy está en `GameApplication`:
  - `createAttackAircraft`, `orientAircraftAlongFlightPath`, `disposeVisualTree`;
  - las mallas del proyectil y de la bomba;
  - las constantes `AIR_STRIKE_CRUISE_HEIGHT` (8) y `AIR_STRIKE_FLIGHT_ARC_HEIGHT` (1.2), y las de la boca del cañón.

  **Cómo se coloca cada cosa** (§5.5):
  - la bomba cae desde `releaseX/Z` y la altura `8 + sin(releaseProgress·π)·1.2 − 0.6` hasta `(x, 0.6, z)`, con `lerp` y progreso `min(1, fallElapsed / 0.72)`;
  - el proyectil es visible si `launched && !landed`.

  Los visuales se indexan en un `Map<number, …>` por `strike.id`.
- [ ] **Paso 4: Conectar en `GameApplication`** (§5.6):
  - **Orden en `animate`:** `advanceBattleSimulation` → `advanceStrikes(world, matchState, bases, delta, gameplayClockMs, aiDifficulty, strikeEvents)` → `representStrikeEvents(strikeEvents)` → `rewardEffectsView.sync(matchState.strikes)` → `updateNexusShieldVisuals` → `updateCombat`. `strikeEvents` es un único array del cierre.
  - **`representStrikeEvents`:**
    - `shell-launched`: `combatEffects.createExplosion(origen, 0.3)`, `SFX.playHeavyCannon()` y `SFX.playShellWhistle(ARTILLERY_SHELL_FLIGHT_SECONDS)`;
    - `impact`: `createCinematicExplosion(new THREE.Vector3(x, 0, z), 0.85 | 0.82, false)` y `haptics.strikeImpact()`.
  - **`representRewardActivation`:** deja la cinemática, los avisos, la sirena y `SFX.playJetFlyby(AIR_STRIKE_FLIGHT_SECONDS)` del avión. Quita `trigger*` y `activeRewardUntil`. `playAirStrikeCinematic` usa `Math.max(...offsets.map((o) => nominalBombLandingSeconds(o, heading)))` en lugar de su fórmula.
  - **`updateRewardUI`** lee `matchState.rewards.player.strikeActiveUntilMs[id] ?? 0` para los ataques.
  - **Diagnóstico:**
    - `activeArtilleryStrikes` y `activeAirStrikes` cuentan `matchState.strikes.active` por tipo;
    - `prepareRewardScenario` llama a `clearStrikes(matchState)`, vacía `matchState.rewards.player.strikeActiveUntilMs` y llama a `rewardEffectsView.clear()`.
  - **Desmontaje:** `teardownMatch` llama a `rewardEffectsView.clear()`. La liberación de la escena llama a `dispose()` donde hoy se liberan los recursos compartidos.
  - **Se eliminan:**
    - `updateActiveArtillery`, `updateActiveAirStrikes`, `triggerArtilleryStrike`, `triggerAirStrikeForFaction`;
    - `getRewardTargetCandidates`, `applyDamage`, `clearActiveRewardEffects`;
    - los tipos `Artillery*` y `AirStrike*`, `artilleryEffects` y `airStrikeEffects`;
    - `playerActiveRewardUntil` y `enemyActiveRewardUntil`.
- [ ] **Paso 5: Comprobar que no queda daño en la vista.**
  Run: `grep -nE "applyRewardDamage|getRewardTargetCandidates|ActiveRewardUntil|updateActive(Artillery|AirStrikes)" web/src/GameApplication.ts web/src/rendering/RewardEffectsView.ts`
  Expected: sin resultados.
- [ ] **Paso 6: Ejecutar.**
  Run: `npx tsx --test web/src/rendering/RewardEffectsView.test.ts && npm test && npm run typecheck && npm run build`
  Expected: todo en verde.
- [ ] **Paso 7: Comprobación rápida en el navegador** (perfil móvil emulado):
  - `prepareRewardScenario('ready')`;
  - artillería y avión del jugador, el segundo con la cámara girada;
  - un ataque de la IA.

  Expected: explosiones en los puntos de impacto, bajada de vida en el mismo momento y sin errores de consola.
- [ ] **Paso 8: Commit.**
  ```bash
  git add web/src/rendering/RewardEffectsView.ts web/src/rendering/RewardEffectsView.test.ts web/src/GameApplication.ts
  git commit -m "refactor(rewards): the view draws the domain strike timeline and no longer applies damage"
  ```

---

### Task 6: Ataques sin render en `aiMatchRunner`

**Files:**
- Modify: `web/src/game/ai/aiMatchRunner.ts`
- Test: `web/src/game/ai/aiMatchRunner.strikes.test.ts`

**Interfaces:**
- Consumes: `advanceStrikes` y `clearStrikes` (Tarea 2).
- Produces:
  ```ts
  runAiMatch(
    options: { difficulty: Difficulty; seed: number; durationSeconds: number; strikes?: boolean;
               setup?: (state: AiRunState) => void },   // `setup`: coloca objetivos del jugador antes del primer fotograma
    strategy: AiStrategy
  ): { metrics: AiRunMetrics; log: AiTurnRecord[] };
  // AiRunMetrics.strikeImpacts: number      (0 con strikes apagado)
  // AiRunMetrics.combatPointsSpent: number  (CP de la IA antes − después de `strategy.execute`, acumulado; allí no se resuelven muertes)
  ```

- [ ] **Paso 1: Pruebas que fallan:**
  - `with strikes on, enemy strikes land and damage player targets without rendering`:
    - `setup` coloca un grupo de soldados y estructuras del jugador;
    - `hard`, semilla fija y 120 s;
    - se dan CP a la IA (`state.match.combatPoints.enemy = 1e4`) en `setup`;
    - resultado: `strikeImpacts > 0`, la vida de algún objetivo del jugador baja y, si hay resultado, ningún impacto después.
  - `with strikes off, pending strikes never exceed one and no strike damage is applied`:
    - mismo `setup`;
    - en cada turno se observa que `match.strikes.active.length ≤ 1`, con un `AiStrategy` envoltorio que lo anota;
    - `strikeImpacts === 0`;
    - hasta el fotograma del primer impacto de la ejecución `strikes: true`, coinciden en las dos ejecuciones `goldSpentTotal` y `combatPointsSpent` **acumulados**, fotograma a fotograma. No se comparan saldos de CP, porque un impacto letal da CP en ese mismo fotograma (aclaración 2).
  - `the runner passes the end-of-frame clock to advanceStrikes`: una artillería activada por la IA en el fotograma k tiene la hora nominal del primer proyectil en `k·(1000/60) + 2900`, es decir, el inicio del fotograma k más 2,9 s, con el fotograma k empezando en `k·1000/60`. Se lee con `onImpactApplied` o con el registro de eventos.
  - La comparación de R4 (`aiExecutor.comparison.test.ts`) se ejecuta **sin cambios**.
- [ ] **Paso 2: Ejecutar y ver que fallan.**
  Run: `npx tsx --test web/src/game/ai/aiMatchRunner.strikes.test.ts`
  Expected: FAIL.
- [ ] **Paso 3: Implementar** (§5.7):
  - tras el turno de la IA, si `!strikes`, `clearStrikes(state.match)`;
  - después de `simulation.advance`, si `strikes`, `advanceStrikes(..., FRAME_SECONDS, state.nowMs, ...)`, sumando los eventos `impact` a `strikeImpacts`. `state.nowMs` ya incluye este fotograma, así que es su final (aclaración 2);
  - `combatPointsSpent` se acumula alrededor de `strategy.execute`, igual que `goldSpentTotal`;
  - después, `resolver.resolve` como hoy;
  - `setup` se llama una vez, antes del primer fotograma.
- [ ] **Paso 4: Ejecutar.**
  Run: `npx tsx --test web/src/game/ai/aiMatchRunner.strikes.test.ts web/src/game/ai/aiExecutor.comparison.test.ts`
  Expected: PASS, y la comparación de R4 con las mismas cifras.
- [ ] **Paso 5: `npm test`, `npm run typecheck`, y commit.**
  ```bash
  git add web/src/game/ai/aiMatchRunner.ts web/src/game/ai/aiMatchRunner.strikes.test.ts
  git commit -m "feat(ai): run reward strikes headless in the AI match runner"
  ```

---

### Task 7: Navegador, recursos, medición y entrega

**Files:**
- Modify: `README.md` (arquitectura: `game/match/rewardExecution.ts`, `rendering/RewardEffectsView.ts`)
- Modify: `docs/audits/2026-11-14-auditoria-responsabilidades.md` (R5 hecho en §7)
- Modify: `docs/performance/2026-11-14-referencia-rendimiento.md` (nueva sección de R5)
- Modify: `docs/superpowers/specs/2026-11-20-r5-recompensas-en-el-reloj-de-juego-design.md` (nueva §10, informe de entrega)
- Modify: este plan (casillas)
- Test: `web/src/game/match/testUtilitiesBoundary.test.ts` (grafo de importaciones, paso 3)

- [ ] **Paso 1: Navegador** (perfil móvil emulado y, si hay, el teléfono de R0), §6.4:
  - `prepareRewardScenario('ready')`;
  - artillería y ataque aéreo del jugador con dos rumbos de cámara, uno casi vertical (Review Focus 1);
  - mover la cámara a mitad del vuelo (la trayectoria no cambia);
  - pausa y reanudación a mitad del ataque (Review Focus 2);
  - un ataque de la IA (sirena y daño);
  - victoria forzada (`setNexusHealth('enemy', 0)`) a mitad de un ataque (Review Focus 4);
  - volver al menú y partida nueva con un ataque en vuelo (Review Focus 3).

  Expected: sin errores de consola, sin visuales sueltos y sin daño en la partida nueva.
- [ ] **Paso 2: Recursos.** Con el panel 0b, geometrías y texturas antes y después de 5 ataques y de dos partidas seguidas.
  Expected: vuelven al mismo valor.
- [ ] **Paso 3: Bundle** (aclaración 3).
  - **Prueba principal, el grafo de importaciones:** una prueba de límites, `testUtilitiesBoundary.test.ts` en `web/src/game/match/`, recorre desde `web/src/main.ts` todas las importaciones relativas de ficheros que no son `.test.ts` y falla si alcanza `legacyRewardTimeline.ts`, `strikeScenarios.ts`, `matchHarness.ts`, `legacyEnemyExecutor.ts`, `aiMatchRunner.ts` o `commandTestState.ts`.

    Es la prueba principal: lo que no se alcanza desde `main.ts` no entra en el bundle de Vite.
  - **Comprobación complementaria, no una prueba:** `npm run build`, y una búsqueda en `dist/` de dos literales que solo existen en las utilidades, como el texto de sus errores. Los nombres de identificadores no sirven, porque el minificador los cambia.
  - **`onImpactApplied` sigue en el bundle** como parámetro inerte de `advanceStrikes`, y así se documenta.

  Expected: la prueba del grafo en verde, `build` con código 0 y las dos búsquedas sin resultados.
- [ ] **Paso 4: Medición.**
  - Batería de §6 del informe de rendimiento, con el escenario de recompensas, en los dos perfiles.
  - Se compara con R0, R3 y R4: métricas estructurales iguales y `gameplayOtherMs` sin aumento claro.
  - Sin dispositivo real, se dice.
- [ ] **Paso 5: Informe de entrega** (§10 del diseño):
  - commits;
  - pruebas ejecutadas y su número;
  - resultado de la comparación (14 escenarios × 6 secuencias);
  - medición y recursos;
  - limitaciones: la fidelidad de la referencia descansa en la revisión y el navegador, sin dispositivo real si no lo hubo, y equilibrio no evaluado;
  - confirmación de alcance con `git diff 71890e9 --stat`.

  Se actualizan también el README y la auditoría.
- [ ] **Paso 6: Commit.**
  ```bash
  git add README.md docs/audits/2026-11-14-auditoria-responsabilidades.md docs/performance/2026-11-14-referencia-rendimiento.md docs/superpowers/specs/2026-11-20-r5-recompensas-en-el-reloj-de-juego-design.md docs/superpowers/plans/2026-11-20-r5-recompensas-en-el-reloj-de-juego.md web/src/game/match/testUtilitiesBoundary.test.ts
  git commit -m "docs(rewards): verify R5 in the browser, check resources and measure it"
  ```

---

### Después de la Tarea 7: revisión independiente

- **Revisión:** un revisor nuevo, sobre el diff completo de R5, con el diseño, este plan y el Review Focus.
- **Qué comprueba además:**
  - que la transcripción de la Tarea 1 es fiel a `GameApplication.ts` @ `71890e9`, líneas ≈2078-2340, y que la Tarea 1 no tocó producción;
  - que ninguna prueba de comparación se relajó;
  - que `onImpactApplied`, si se usó, no afecta al daño;
  - que no hay ciclos de importación;
  - que no hay cambios fuera del alcance.
- **Hallazgos:** los críticos e importantes se corrigen con una prueba que falle primero; los menores se anotan.
- **Al terminar R5 no se empieza R6.**
