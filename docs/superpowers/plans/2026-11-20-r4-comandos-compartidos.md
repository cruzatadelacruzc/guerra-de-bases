# R4 — Comandos compartidos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El jugador y la IA construyen, venden, entrenan y activan recompensas con los mismos comandos de juego, sin Three.js, en `web/src/game/commands/`. La entidad ECS nace del comando validado y el escudo se aplica por un solo camino.

**Architecture:**
- Funciones síncronas que reciben un `CommandContext` (mundo, bases, `MatchState`, `sessionPhase`, dificultad, reloj). Primero comprueban que la partida está activa, después validan todo y solo entonces escriben.
- `GameApplication` construye el contexto en cada llamada y representa los resultados aceptados: malla, sonido, aviso y desbloqueo.
- La IA pasa por un ejecutor de dominio (`executeEnemyTurn`) y lee un resumen construido desde el ECS.
- Una línea base con semilla, fijada **antes** de tocar producción, separa el efecto de la nueva regla de distancia de cualquier cambio accidental.

**Tech Stack:** TypeScript estricto, `node:test` vía `tsx` (`npm test`), `tsc --noEmit` (`npm run typecheck`), Vite (`npm run build`), `playwright-cli` para la comprobación en navegador y la medición.

**Spec:**
- `docs/superpowers/specs/2026-11-20-r4-comandos-compartidos-design.md` (aprobado, revisión 3, commit `cee5941`). Las referencias `§` de este plan son de ese documento.
- Contexto: `docs/audits/2026-11-14-auditoria-responsabilidades.md` (R4 en §7 y §8.2), `docs/superpowers/specs/2026-11-14-ia-enemiga-ordenes-niebla-design.md` (fase 2) y `docs/performance/2026-11-14-referencia-rendimiento.md`.

## Global Constraints

- TypeScript estricto, sin `any` ni aserciones innecesarias. Sin dependencias nuevas. Sin módulos `.js` ni `.mjs` en `web/src/`.
- `web/src/game/commands/**` solo importa `game/ecs/`, `game/match/`, `game/definitions/` y `game/rewardSystem.ts`, más `import type` de `game/GameSession.ts`. Nada de `three`, `ui/`, `rendering/`, `platform/` ni DOM. Sin dependencias circulares.
- **Partida activa:** se acepta solo con `sessionPhase === 'PLAYING'` **y** `match.outcome === null`. Si no, se rechaza con `match-over` (si hay resultado, con prioridad) o `not-playing`, antes de cualquier otra comprobación. Sin un `isPlaying` guardado en ningún sitio.
- **Atomicidad:** un rechazo deja intactos las entidades y componentes ECS, los monederos, los CP, las órdenes de producción y `match.rewards` de ambas facciones.
- **Ubicación:**
  - jugador `5 ≤ z ≤ 73`, `|x| ≤ 53`; enemigo `−73 ≤ z ≤ −5`, `|x| ≤ 53`, con límites inclusivos;
  - distancia mínima `3.8` horizontal (`dx² + dz² < 3.8²` rechaza) contra las entidades con `building` de la misma facción, Nexo incluido;
  - orden: zona → distancia → oro.
- **Valores exactos:**
  - costes 100 / 150 / 125 (generador / barraca / torreta), de `STRUCTURE_DEFINITIONS`;
  - reembolso `Math.floor(coste × 0.7)` = 70 / 105 / 87;
  - recarga de recompensas `15000` ms por facción;
  - reducción del escudo de `getRewardDefinitionForDifficulty('defensive_shield', d).reduction` (0.5).
- **IA (condición 1):** no se cambian `decideEnemyTurn`, `enemyAiProfile.ts`, `EnemyAiController`, los intervalos, las zonas, los costes ni el ingreso. La IA no reacciona a sus rechazos.
- **Fuera de alcance:**
  - R5 (daño de recompensas guiado por el visual y `activeRewardUntil` de los ataques) y R6-R8;
  - desbloqueos (`veteran_armor` incluido), los dos mecanismos de fin de partida, la duración con reloj real y `enemyAIEnabled`;
  - los espejos `gold` y `enemyGold` siguen existiendo y se refrescan.
- **Commits:**
  - un commit por tarea, directo en `main`, con rutas explícitas en `git add`;
  - las pruebas de la tarea y `npm test` se ejecutan antes de cada commit;
  - cada mensaje termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - **al terminar R4 no se empieza R5.**

## Review Focus

1. **Toque en el borde de la zona:** la posición redondeada puede valer `z = 73` o `|x| = 53`. Debe seguir construyendo, como hoy. Pruebas de bordes de la Tarea 2 y comprobación en navegador de la Tarea 8.
2. **Pausa o secuencia final con órdenes pendientes:** un turno de la IA o un toque que llega con la sesión en `PAUSED` o `MATCH_ENDING` no cambia nada. Prueba de la tabla de partida activa por comando (Tareas 2-5) y prueba del ejecutor con `sessionPhase: 'PAUSED'` (Tarea 6).
3. **Partidas seguidas:** la recarga y el escudo de la partida anterior no pasan a la siguiente. Prueba de `createMatchState` (Tarea 5) y segunda partida en el navegador (Tarea 8).
4. **El Nexo propio bloquea la construcción cercana,** también para la IA, cuyas zonas de generador rozan su Nexo. Prueba de ubicación (Tarea 2) y conteo de rechazos en la comparación (Tarea 6).
5. **Escenarios de diagnóstico con estructuras fuera de zona:** siguen funcionando en desarrollo y desaparecen del bundle de producción. Comprobación en navegador y búsqueda en `dist/` (Tarea 8).

---

### Tarea 1: Línea base del ejecutor antiguo (solo pruebas, antes de tocar producción)

**Files:**
- Modify: `web/src/game/ai/testRng.ts` (añadir `seededRng`)
- Create: `web/src/game/ai/legacyEnemyExecutor.ts` (utilidad de prueba, transcripción de `GameApplication.ts` @ `bf2c4a7`)
- Create: `web/src/game/ai/aiMatchRunner.ts` (utilidad de prueba)
- Test: `web/src/game/ai/aiExecutor.comparison.test.ts`

**Interfaces:**
- Produces (todo solo para pruebas):
  ```ts
  // testRng.ts
  export function seededRng(seed: number): Rng;          // mulberry32

  // aiMatchRunner.ts
  export interface AiRunState {
    readonly world: World; readonly bases: Readonly<Record<Faction, Entity>>;
    readonly match: MatchState; readonly difficulty: Difficulty; nowMs: number;
  }
  export interface ExecutedCommand {
    readonly command: EnemyAiCommand; readonly accepted: boolean;
    readonly reason?: string; readonly entity?: Entity;
  }
  export interface AiStrategy {
    snapshot(state: AiRunState): EnemyAiSnapshot;
    execute(state: AiRunState, turn: EnemyAiTurn): readonly ExecutedCommand[];
  }
  export interface AiTurnRecord {
    readonly frame: number; readonly goldBefore: number; readonly goldAfter: number;
    readonly executed: readonly ExecutedCommand[];
  }
  export interface AiRunMetrics {
    buildAttempts: number; tooCloseRejections: number; outsideZoneRejections: number;
    acceptedBuilds: Record<BuildableStructureKind, number>;
    overlappingAcceptedBuilds: number;   // aceptadas a < 3.8 de una estructura propia ya existente
    goldSpentOnStructures: number; goldSpentTotal: number; acceptedTrainOrders: number;
    rewardCommands: number; outcome: MatchOutcome | null; outcomeAtSeconds: number | null;
  }
  export function runAiMatch(
    options: { difficulty: Difficulty; seed: number; durationSeconds: number },
    strategy: AiStrategy
  ): { metrics: AiRunMetrics; log: AiTurnRecord[] };

  // legacyEnemyExecutor.ts
  export const LEGACY_STRATEGY: AiStrategy;
  ```

- [ ] **Paso 1: Utilidades.**
  - **`seededRng`:** mulberry32 (unas diez líneas, sin dependencias).
  - **`runAiMatch`** monta `new BattleSimulation({ enemyBaseIncome: getDifficultyProfile(d).enemyBaseIncome })`, `createMatchState()`, `new DeathResolver()` y `new EnemyAiController(getEnemyAiProfile(d), seededRng(seed))`. Cada fotograma de `1/60` s, en el orden de `animate`:
    1. `nowMs += 1000/60`;
    2. `turn = controller.update(1/60, () => strategy.snapshot(state))`;
    3. si hay turno, guarda el oro enemigo antes y después de `strategy.execute` y suma las métricas;
    4. `simulation.advance(1/60)`;
    5. `deathResolver.resolve(world, match, difficulty, bases)`;
    6. si hay `outcome`, para y anota el segundo.

    `overlappingAcceptedBuilds` se calcula en el corredor, con la fórmula de distancia de las restricciones, **antes** de ejecutar cada `build`. El corredor no conoce `placement.ts`.
  - **`LEGACY_STRATEGY`** transcribe `buildEnemyAiSnapshot` (≈1678-1705) y `executeEnemyAiTurn` (≈1707-1726) leyendo el ECS:
    - **`build`:** `trySpendResources(world, bases.enemy, cost)` y, si se acepta, `createSoldierFactory` o `createStructure` con `STRUCTURE_DEFINITIONS[kind].health`, como `registerStructureTarget`. El motivo de rechazo es `'insufficient-gold'`.
    - **`train`:** `requestUnitProduction(world, factory, bases.enemy, unit, spawnPosition)`, y su `accepted` se anota.
    - **`activateReward`:** `throw new Error('legacy reward activation is outside the comparison scenario')`. Con el jugador inactivo la IA no gana CP, y la prueba lo afirma.
    - **Snapshot:**
      - barracas = entidades enemigas con `factory`, `building.kind === 'barracks'` y vida > 0, en orden de `world.query`;
      - recuentos de generadores y torretas vivos;
      - `rewardCooldownUntilMs: 0`, `shieldActive: false`;
      - `validRewardTargetCount` = enemigos del jugador atacables vivos que no son `hq`;
      - `nexusHealthRatio` = vida actual / máxima de la base, o `1` si falta.

- [ ] **Paso 2: Escribir la prueba con la línea base vacía.** En `aiExecutor.comparison.test.ts`:
  - `const BASELINE: Record<Difficulty, AiRunMetrics>`, que se rellena en el paso 3;
  - `const CONTROL = { difficulty, seed, durationSeconds }`, que se elige en el paso 3.

  Pruebas:
  - `legacy executor reproduces its pinned baseline (<difficulty>)`: semilla `1`, `300` s, `deepEqual(metrics, BASELINE[d])` y `metrics.rewardCommands === 0`;
  - `the control run has no overlapping builds`: `runAiMatch(CONTROL, LEGACY_STRATEGY)` da `overlappingAcceptedBuilds === 0` y `buildAttempts >= 3`;
  - `the run is deterministic`: dos ejecuciones iguales dan `log` y `metrics` idénticos.

- [ ] **Paso 3: Fijar la línea base.**
  Run: `npx tsx --test web/src/game/ai/aiExecutor.comparison.test.ts`. Falla e imprime las métricas reales.
  - Se copian a `BASELINE`.
  - Para `CONTROL` se elige la primera semilla de `1..50` (y, si hace falta, la duración más larga ≤ 300 s) con `overlappingAcceptedBuilds === 0` y al menos 3 intentos.
  - Si ninguna cumple, se avisa al usuario antes de seguir: el diseño prevé entonces un guion de turnos.

  Expected tras rellenar: PASS. La prueba debe tardar menos de ~15 s; si no, se baja la duración y se anota.

- [ ] **Paso 4: Commit (solo pruebas).** `npm test` en verde y `git diff --stat` sin archivos de producción.
  ```bash
  git add web/src/game/ai/testRng.ts web/src/game/ai/legacyEnemyExecutor.ts web/src/game/ai/aiMatchRunner.ts web/src/game/ai/aiExecutor.comparison.test.ts
  git commit -m "test(ai): pin the current enemy executor with a seeded baseline"
  ```

---

### Tarea 2: Ubicación y contexto de comandos

**Files:**
- Create: `web/src/game/commands/CommandContext.ts`, `web/src/game/commands/placement.ts`
- Test: `web/src/game/commands/CommandContext.test.ts`, `web/src/game/commands/placement.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // CommandContext.ts
  export interface CommandContext {
    readonly world: World; readonly bases: Readonly<Record<Faction, Entity>>;
    readonly match: MatchState; readonly sessionPhase: GameSessionState;   // import type
    readonly difficulty: Difficulty; readonly nowMs: number;
  }
  export type MatchNotPlaying = 'match-over' | 'not-playing';
  export type CommandResult<Accepted extends object, Reason extends string> =
    | ({ readonly accepted: true } & Accepted) | { readonly accepted: false; readonly reason: Reason };
  export function checkMatchPlaying(ctx: CommandContext):
    { readonly ok: true } | { readonly ok: false; readonly reason: MatchNotPlaying };

  // placement.ts
  export const BUILD_ZONE: Readonly<{ minDepth: 5; maxDepth: 73; maxAbsX: 53 }>;
  export const MIN_STRUCTURE_SPACING = 3.8;
  export type PlacementRejection = 'outside-zone' | 'too-close';
  export function validatePlacement(world: World, faction: Faction, position: Position):
    { readonly ok: true } | { readonly ok: false; readonly reason: PlacementRejection };
  ```

- [ ] **Paso 1: Pruebas que fallan.**
  - **`CommandContext.test.ts`,** con la tabla de §5.6:
    - `PLAYING` + `null` → `ok`;
    - `PLAYING` + `'victory'` → `match-over`;
    - `PAUSED` + `'defeat'` → `match-over`;
    - `PAUSED`, `MATCH_ENDING`, `MENU` y `GAMEOVER` con `null` → `not-playing`.
  - **`placement.test.ts`:**
    - jugador en `(0, 0, 73)`, `(0, 0, 5)`, `(53, 0, 40)` y `(-53, 0, 40)` → `ok`;
    - jugador en `(0, 0, 4)`, `(0, 0, 74)`, `(54, 0, 40)` y `(0, 0, -40)` → `outside-zone`;
    - los espejos del enemigo (`z = -73`, `z = -5`, `|x| = 53`; `z = 40` fuera);
    - una torreta propia en `(0, 0, 40)`: a `3.79` → `too-close` y a `3.8` → `ok`;
    - una torreta enemiga a 1 de distancia no bloquea;
    - el Nexo propio (`createInitialBattle`) bloquea a 2 de su posición;
    - zona antes que distancia: una posición fuera de zona y pegada a una estructura da `outside-zone`.
- [ ] **Paso 2: Ver que fallan.** `npx tsx --test web/src/game/commands/*.test.ts` falla porque los módulos no existen.
- [ ] **Paso 3: Implementar.** Para la distancia, `world.query(COMPONENTS.building, COMPONENTS.faction, COMPONENTS.transform)` filtrado por facción.
- [ ] **Paso 4: Ver que pasan.** Mismo comando, todo PASS.
- [ ] **Paso 5: Commit.**
  ```bash
  git add web/src/game/commands/CommandContext.ts web/src/game/commands/CommandContext.test.ts web/src/game/commands/placement.ts web/src/game/commands/placement.test.ts
  git commit -m "feat(commands): validate placement and the match phase in the game domain"
  ```

---

### Tarea 3: Construir y vender

**Files:**
- Modify: `web/src/game/ecs/initialBattle.ts` (añadir `createBuildableStructure` junto a `createStructure`)
- Create: `web/src/game/commands/structureCommands.ts`, `web/src/dev/diagnosticStructures.ts`
- Test: `web/src/game/commands/structureCommands.test.ts`, `web/src/game/commands/commandTestState.ts` (utilidad de prueba)

**Interfaces:**
- Consumes: `CommandContext`, `CommandResult`, `MatchNotPlaying`, `checkMatchPlaying` y `validatePlacement` (Tarea 2).
- Produces:
  ```ts
  // initialBattle.ts
  export function createBuildableStructure(world: World, faction: Faction,
    kind: BuildableStructureKind, position: Position): Entity;   // vida de STRUCTURE_DEFINITIONS
  // structureCommands.ts
  export type BuildRejection = MatchNotPlaying | PlacementRejection | 'insufficient-gold';
  export function buildStructure(ctx: CommandContext, faction: Faction, kind: BuildableStructureKind,
    position: Position): CommandResult<{ entity: Entity; cost: number }, BuildRejection>;
  export type SellRejection = MatchNotPlaying | 'not-found' | 'not-owned' | 'not-sellable';
  export function sellStructure(ctx: CommandContext, faction: Faction, entity: Entity):
    CommandResult<{ refund: number; kind: BuildableStructureKind; position: Position }, SellRejection>;
  // dev/diagnosticStructures.ts
  export function placeDiagnosticStructure(world: World, faction: Faction,
    kind: BuildableStructureKind, position: Position): Entity;
  // commandTestState.ts (solo pruebas)
  export function createCommandTestContext(overrides?: Partial<CommandContext>): CommandContext;  // createInitialBattle + createMatchState, PLAYING, 'normal', nowMs 0
  export interface CommandStateSnapshot { /* entidades y componentes, oro, CP, órdenes, rewards */ }
  export function snapshotCommandState(ctx: CommandContext): CommandStateSnapshot;   // para deepEqual
  ```

- [ ] **Paso 1: Pruebas que fallan** (`structureCommands.test.ts`):
  - `building spends the cost and creates the structure`: con 1000 de oro, generador, barraca y torreta → oro −100 / −150 / −125. La entidad tiene `building.kind`, `faction`, `transform`, vida 380 / 380 y collider. La barraca tiene `factory` y `production`; el generador, `resourceGenerator` con 12; la torreta, `weapon` y `targeting`.
  - **Rechazos sin cambios** (`deepEqual(snapshotCommandState(ctx), antes)`), cada uno con un comando por lo demás válido:
    - `insufficient-gold` con 99 de oro y un generador;
    - `too-close`;
    - `outside-zone`;
    - `match-over` y `not-playing` según la tabla de §5.6.
  - `the AI and the player share the rule`: el enemigo con 1000 de oro y una torreta propia en `(0, 0, -40)` recibe `too-close` a 2 de distancia.
  - `selling refunds 70 % and removes the entity`: 70 / 105 / 87, la entidad sale del `World` y el resultado lleva `kind` y `position`.
  - `selling rejects`, sin cambios: el Nexo → `not-sellable`; una estructura enemiga vendida por el jugador → `not-owned`; una entidad borrada → `not-found`; partida no activa → `match-over` o `not-playing`.
- [ ] **Paso 2: Ver que fallan.** `npx tsx --test web/src/game/commands/structureCommands.test.ts` falla porque los módulos no existen.
- [ ] **Paso 3: Implementar.**
  - **`buildStructure`,** en este orden: `checkMatchPlaying` → `validatePlacement` → oro ≥ coste → `trySpendResources` → `createBuildableStructure`.
  - **`sellStructure`:**
    - sin componente `faction` → `not-found`;
    - de otra facción → `not-owned`;
    - sin `building` o con `kind === 'hq'` → `not-sellable`;
    - si se acepta, abona al `economy` de `ctx.bases[faction]` y llama a `removeEntity`.
  - **`placeDiagnosticStructure`:** su primera línea es exactamente `if (!import.meta.env.DEV) throw new Error('placeDiagnosticStructure: development only');` y después llama a `createBuildableStructure`. No lleva prueba con `tsx`, porque `import.meta.env` solo existe con Vite. Se verifica en la Tarea 8.
- [ ] **Paso 4: Ver que pasan.** `npx tsx --test web/src/game/commands/*.test.ts` y `npm run typecheck`, todo PASS.
- [ ] **Paso 5: Commit.**
  ```bash
  git add web/src/game/ecs/initialBattle.ts web/src/game/commands/structureCommands.ts web/src/game/commands/structureCommands.test.ts web/src/game/commands/commandTestState.ts web/src/dev/diagnosticStructures.ts
  git commit -m "feat(commands): build and sell structures through validated commands"
  ```

---

### Tarea 4: Entrenar

**Files:**
- Create: `web/src/game/commands/trainCommand.ts`
- Test: `web/src/game/commands/trainCommand.test.ts`

**Interfaces:**
- Consumes: `CommandContext` y `checkMatchPlaying` (Tarea 2); `createCommandTestContext` y `snapshotCommandState` (Tarea 3).
- Produces:
  ```ts
  export function trainUnit(ctx: CommandContext, faction: Faction, factory: Entity, unit: SoldierKind,
    spawnPosition: Position, overrides?: ProductionOverrides):
    ProductionOrderResult | { readonly accepted: false; readonly reason: MatchNotPlaying };
  export function liveFactories(world: World, faction: Faction): readonly Entity[];   // barracas vivas, orden de creación
  export function idleFactories(world: World, faction: Faction): readonly Entity[];   // vivas y sin orden
  ```

- [ ] **Paso 1: Pruebas que fallan.**
  - **Aceptado:** gasta el coste de `SOLDIER_PRODUCTION[unit]` y deja la orden con `spawnPosition`.
  - **Rechazos sin cambios:**
    - `factory-busy`;
    - `insufficient-resources`;
    - `invalid-factory` para la barraca de la otra facción;
    - `invalid-factory` para una barraca con vida 0;
    - `match-over` y `not-playing`.
  - **Consultas:** `liveFactories` e `idleFactories` en orden de creación. Excluyen barracas muertas y de la otra facción, y `idleFactories` excluye las ocupadas.
- [ ] **Paso 2: Ver que fallan.** `npx tsx --test web/src/game/commands/trainCommand.test.ts` falla porque el módulo no existe.
- [ ] **Paso 3: Implementar.** `checkMatchPlaying` y después `requestUnitProduction(ctx.world, factory, ctx.bases[faction], unit, spawnPosition, overrides)`, que ya rechaza una barraca de otra facción.
- [ ] **Paso 4: Ver que pasan.** Mismo comando, PASS.
- [ ] **Paso 5: Commit.**
  ```bash
  git add web/src/game/commands/trainCommand.ts web/src/game/commands/trainCommand.test.ts
  git commit -m "feat(commands): train units through a shared command"
  ```

---

### Tarea 5: Estado de recompensas, escudo único y activación

**Files:**
- Modify: `web/src/game/match/MatchState.ts` y `MatchState.test.ts`; `web/src/game/rewardSystem.ts` (`REWARD_COOLDOWN_MS`)
- Create: `web/src/game/match/shield.ts`, `web/src/game/commands/rewardCommand.ts`
- Test: `web/src/game/match/shield.test.ts`, `web/src/game/commands/rewardCommand.test.ts`

**Interfaces:**
- Consumes: Tarea 2 y `createCommandTestContext` / `snapshotCommandState` (Tarea 3).
- Produces:
  ```ts
  // MatchState.ts
  export interface FactionRewardState { cooldownUntilMs: number; shieldUntilMs: number; }
  // MatchState gana: rewards: Record<Faction, FactionRewardState>   (todo a 0 en createMatchState)
  // rewardSystem.ts
  export const REWARD_COOLDOWN_MS = 15000;
  // shield.ts
  export function applyFactionShield(match: MatchState, bases: Readonly<Record<Faction, Entity>>,
    target: Entity, damage: number, nowMs: number, difficulty: Difficulty): number;
  export function applyRewardDamage(world: World, match: MatchState, bases: Readonly<Record<Faction, Entity>>,
    target: Entity, damage: number, nowMs: number, difficulty: Difficulty): DamageResult;   // escudo + applyDamageSystem
  // rewardCommand.ts
  export type RewardRejection = MatchNotPlaying | 'insufficient-points' | 'insufficient-gold'
    | 'no-valid-target' | 'shield-active' | 'cooldown';
  export function rewardTargetCandidates(world: World, faction: Faction): StrikeCandidate[];
  export function activateReward(ctx: CommandContext, faction: Faction, id: RewardId):
    CommandResult<{ aim?: StrikeAim; definition: RewardDefinition }, RewardRejection>;
  ```
  `applyFactionShield` no recibe `world`, al contrario que el esbozo de §5.7, porque no lo necesita.

- [ ] **Paso 1: Pruebas que fallan.**
  - **`MatchState.test.ts`:** el `deepEqual` de la partida nueva incluye `rewards: { player: { cooldownUntilMs: 0, shieldUntilMs: 0 }, enemy: { cooldownUntilMs: 0, shieldUntilMs: 0 } }`.
  - **`shield.test.ts`:**
    - **Proyectiles:** `BattleSimulation` con `modifyDamage: (t, a) => applyFactionShield(match, bases, t, a, nowMs, 'normal')`, el escudo del jugador hasta `nowMs + 10000` y un soldado enemigo junto a la base del jugador. Tras `advance` hasta el primer impacto en la base (`drainProjectileImpacts`), la base pierde exactamente `daño del arma × 0.5`, no `× 0.25`.
    - **Recompensas:** `applyRewardDamage(…, base del enemigo, 100, …)` con el escudo enemigo activo resta 50.
    - **Sin efecto:** en una torreta con el escudo activo, con el escudo caducado (`shieldUntilMs === nowMs`) y con el escudo de la otra facción.
  - **`rewardCommand.test.ts`:**
    - **Orden de motivos,** cada uno sin cambios en `snapshotCommandState`: `insufficient-points` antes que `insufficient-gold`, antes que `no-valid-target` (ataques) o `shield-active` (escudo), antes que `cooldown`. Partida no activa → `match-over` o `not-playing`, aunque todo lo demás sea válido.
    - **Aceptado** (por dificultad): resta `pointsCost` y `goldCost` de `getRewardDefinitionForDifficulty` y fija `cooldownUntilMs = nowMs + 15000` solo en esa facción. Una activación del enemigo no toca la recarga del jugador ni a la inversa.
    - **Escudo aceptado:** `shieldUntilMs = nowMs + durationSeconds × 1000` y sin `aim`.
    - **Ataque aceptado:** el `aim` es igual a `selectStrikeAim(rewardTargetCandidates(world, faction), getStrikePattern(id, d))`.
    - **Candidatos:** solo enemigos atacables vivos que no son `hq`, con `health` del ECS tras aplicar daño, y `kind 'unit'` para entidades con `soldier`.
- [ ] **Paso 2: Ver que fallan.** `npx tsx --test web/src/game/match/*.test.ts web/src/game/commands/*.test.ts` falla porque faltan `rewards`, `shield.ts` y `rewardCommand.ts`.
- [ ] **Paso 3: Implementar.** `activateReward` sigue este orden, con todas las comprobaciones antes de la primera escritura:
  1. `checkMatchPlaying`;
  2. `validateRewardActivation`, con `cooldownMs = max(0, cooldownUntilMs − nowMs)`, `expiresAt = cooldownUntilMs` y `activeShield = shieldUntilMs > nowMs`;
  3. el punto de mira (ataques) y, sin él, `no-valid-target`;
  4. `trySpendResources`, `spendCombatPoints`, la recarga y el escudo.
- [ ] **Paso 4: Ver que pasan.** Mismo comando y `npm run typecheck`, todo PASS. `GameApplication.ts` todavía no usa nada nuevo; el campo añadido a `MatchState` no rompe a quien solo lo lee.
- [ ] **Paso 5: Commit.**
  ```bash
  git add web/src/game/match/MatchState.ts web/src/game/match/MatchState.test.ts web/src/game/rewardSystem.ts web/src/game/match/shield.ts web/src/game/match/shield.test.ts web/src/game/commands/rewardCommand.ts web/src/game/commands/rewardCommand.test.ts
  git commit -m "feat(commands): validate and spend rewards in the domain with a single shield path"
  ```

---

### Tarea 6: Resumen y ejecutor de la IA en el dominio, comparación con la línea base

**Files:**
- Create: `web/src/game/ai/aiSnapshot.ts`, `web/src/game/ai/executeEnemyTurn.ts`
- Test: `web/src/game/ai/executeEnemyTurn.test.ts`; Modify: `web/src/game/ai/aiExecutor.comparison.test.ts`

**Interfaces:**
- Consumes: `buildStructure` (Tarea 3), `trainUnit` (Tarea 4), `activateReward` y `rewardTargetCandidates` (Tarea 5), `runAiMatch` y `LEGACY_STRATEGY` (Tarea 1).
- Produces:
  ```ts
  // aiSnapshot.ts
  export function buildEnemyAiSnapshot(ctx: CommandContext): EnemyAiSnapshot;   // facción enemiga
  // executeEnemyTurn.ts
  export type EnemyCommandOutcome =
    | { readonly command: Extract<EnemyAiCommand, { type: 'build' }>; readonly result: ReturnType<typeof buildStructure> }
    | { readonly command: Extract<EnemyAiCommand, { type: 'train' }>; readonly result: ReturnType<typeof trainUnit> }
    | { readonly command: Extract<EnemyAiCommand, { type: 'activateReward' }>; readonly result: ReturnType<typeof activateReward> };
  export function executeEnemyTurn(ctx: CommandContext, turn: EnemyAiTurn): readonly EnemyCommandOutcome[];   // en orden
  ```
  Es una decisión del plan: el ejecutor vive en el dominio para que la comparación use el código real. `GameApplication` solo representa sus resultados (§5.8).

- [ ] **Paso 1: Pruebas que fallan.**
  - **`executeEnemyTurn.test.ts`** (prueba de conexión):
    - con `EnemyAiController(getEnemyAiProfile('normal'), sequenceRng([...]))` y un mundo con oro, la decisión del primer turno produce exactamente las entidades, órdenes y gastos esperados;
    - el resultado tiene un `EnemyCommandOutcome` por comando, en orden;
    - con `sessionPhase: 'PAUSED'`, todos se rechazan con `not-playing` y `snapshotCommandState` no cambia;
    - `buildEnemyAiSnapshot` da los mismos valores que `LEGACY_STRATEGY.snapshot` en un mundo con barracas libres, ocupadas y muertas, generadores, torretas y daño en el Nexo, salvo `rewardCooldownUntilMs` y `shieldActive`, que salen de `match.rewards`.
  - **`aiExecutor.comparison.test.ts`:** añadir `CURRENT_STRATEGY`, que construye el contexto con `sessionPhase: 'PLAYING'` sobre `AiRunState`. Su `execute` traduce `executeEnemyTurn` a `ExecutedCommand`.
    - `CURRENT` vacío y `current executor reproduces its pinned results (<difficulty>)`;
    - `current matches legacy turn by turn until the first too-close rejection`: `deepEqual` de `log.slice(0, k)`, donde `k` es el primer turno con un `too-close`, y en ese turno los comandos anteriores al rechazado coinciden;
    - `control run is identical end to end`: `deepEqual` de `log` y `metrics` de las dos estrategias sobre `CONTROL`;
    - `current never builds too close`: `overlappingAcceptedBuilds === 0` y `outsideZoneRejections === 0`;
    - `a rejected build changes nothing`: en cada turno, un `build` rechazado no tiene `entity` y su coste no figura en `goldBefore − goldAfter`.
- [ ] **Paso 2: Ver que fallan.** `npx tsx --test web/src/game/ai/*.test.ts` falla porque los módulos no existen.
- [ ] **Paso 3: Implementar** los dos módulos. La correspondencia de campos del resumen está en §5.8 y en el `LEGACY_STRATEGY` de la Tarea 1.
- [ ] **Paso 4: Fijar `CURRENT`.** Se ejecuta y se copian las métricas impresas, igual que en la Tarea 1.
  - La línea base de la Tarea 1 **no se toca**. Si cambia, es un cambio accidental y se investiga.
  - Expected: todo PASS.
- [ ] **Paso 5: Commit.**
  ```bash
  git add web/src/game/ai/aiSnapshot.ts web/src/game/ai/executeEnemyTurn.ts web/src/game/ai/executeEnemyTurn.test.ts web/src/game/ai/aiExecutor.comparison.test.ts
  git commit -m "feat(ai): execute enemy turns through the shared commands and compare with the baseline"
  ```

---

### Tarea 7: `GameApplication` usa los comandos

**Files:**
- Modify: `web/src/GameApplication.ts`:
  - estado de recompensas (≈446-455) y su reinicio (≈1044-1050);
  - `modifyDamage` (≈1099-1119);
  - `updateRewardUI` (≈1226);
  - `onPointerUp` (≈1431-1544);
  - `registerStructureTarget` (≈1546), que se elimina;
  - `trainUnit` (≈1611);
  - `spawnAIBuilding`, `buildEnemyAiSnapshot` y `executeEnemyAiTurn` (≈1657-1726), que se sustituyen;
  - `applyDamage`, `getRewardTargetCandidates`, `toStrikeCandidates`, `validateRewardForFaction` y `spendRewardForFaction` (≈2023-2116);
  - `activateRewardForFaction` (≈2489);
  - los escenarios de diagnóstico (≈2890-3110).
- Test: `web/src/game/commands/constructionBoundary.test.ts`

**Interfaces:**
- Consumes: todo lo producido en las Tareas 2-6, más `placeDiagnosticStructure`.
- Produces (dentro de `createGameRuntime`): `commandContext(): CommandContext` (nuevo en cada llamada, con `sessionPhase: session.state` y `nowMs: gameplayClockMs`), `representStructure(entity: Entity): RuntimeStructure` y `syncGoldMirrors(): void`.

- [ ] **Paso 1: Prueba de frontera que falla** (`constructionBoundary.test.ts`):
  - recorre `web/src` con `node:fs` (recursión manual), sin `*.test.ts` ni `matchHarness.ts`, `legacyEnemyExecutor.ts`, `aiMatchRunner.ts` ni `commandTestState.ts`;
  - falla si `createBuildableStructure`, `createStructure` o `createSoldierFactory` aparecen fuera de `game/ecs/initialBattle.ts`, `game/commands/structureCommands.ts` y `dev/diagnosticStructures.ts`.

  Run: `npx tsx --test web/src/game/commands/constructionBoundary.test.ts`
  Expected: FAIL, con `GameApplication.ts` como infractor.
- [ ] **Paso 2: Estado y escudo.**
  - Se eliminan `rewardCooldownUntil`, `enemyRewardCooldownUntil`, `defensiveShieldUntil`, `enemyDefensiveShieldUntil` y `rewardCooldownMs`; se lee y escribe `matchState.rewards[faction]`.
  - `modifyDamage` llama a `applyFactionShield` y `applyDamage` llama a `applyRewardDamage`, y luego copia la vida en `target.hp`.
  - `isShieldActiveForFaction` lee `shieldUntilMs`.
  - `updateRewardUI` toma el escudo activo de `shieldUntilMs` y el recuento de objetivos de `rewardTargetCandidates`.
- [ ] **Paso 3: Construir y vender.**
  - **`representStructure(entity)`** crea la malla (`instantiateBuildingMesh(kind, faction === 'player')`), con la barra a `turret ? 2.8 : 2.5` y ancho `2.2`. Copia la posición y la vida del ECS, la registra en `targetObjects` y en su lista y la devuelve.
  - **Toque del jugador:** `buildStructure(commandContext(), 'player', type, {x, y, z})`.
    - `too-close` → "⚠️ Ubicación ocupada. Elige otro punto." y `return`, sin cancelar;
    - `insufficient-gold` → "¡Recursos insuficientes!";
    - aceptado → lo de §3.1 con `representStructure`;
    - en los dos últimos casos, `cancelPlacement()` y `updateResourceUI()`;
    - `outside-zone`, `match-over` y `not-playing` → `return` sin aviso.
  - **Vender:** `sellStructure(commandContext(), 'player', b.ecsEntityId)`. Si se acepta, se quitan y liberan la malla, la entrada de `targetObjects` y la de la lista, con el sonido y el aviso de siempre y el reembolso del resultado.
  - Tras cada comando, `syncGoldMirrors()`.
- [ ] **Paso 4: Entrenar.**
  - "Sin barracas" sale de `liveFactories(world, 'player').length === 0` y "todas ocupadas", de `idleFactories`.
  - La barraca elegida es `idleFactories(...)[0]`. La aparición y `veteran_armor` no cambian; la posición de la barraca se lee del `transform` ECS.
  - La llamada es `trainUnit(commandContext(), 'player', ...)`.
  - Mensajes de rechazo: `match-over` y `not-playing`, ninguno; el resto, los de §3.4.
- [ ] **Paso 5: Recompensas.**
  - `activateRewardForFaction(faction, id)` conserva su guarda `session.state` y llama a `activateReward(commandContext(), faction, id)`.
  - **Rechazo:**
    - jugador → `getRewardFailureMessage(reason)` (ahora recibe el motivo), salvo `match-over` y `not-playing`, que no muestran aviso;
    - después, `updateRewardUI()`.
  - **Aceptado:** el resto de §3.5 pasos 5-7 sin cambios, con `result.aim` y `result.definition`. `activeRewardUntil` del escudo = `shieldUntilMs`; el de los ataques, como hoy.
- [ ] **Paso 6: IA.**
  - `updateEnemyAI` usa `enemyAi.update(delta, () => buildEnemyAiSnapshot(commandContext()))` y `executeEnemyTurn(commandContext(), turn)`.
  - `ui.setAiStatus` no cambia.
  - Por cada resultado aceptado:
    - `build` → `representStructure(entity)`;
    - `activateReward` → la misma representación del paso 5 (sirena y aviso enemigo);
    - `train` → nada.
  - Después, `syncGoldMirrors()`. Se eliminan `spawnAIBuilding` y el resumen antiguo.
- [ ] **Paso 7: Diagnóstico.**
  - Cada `spawnAIBuilding(...)` y el creador genérico (≈2890) pasan a `representStructure(placeDiagnosticStructure(world, faction, kind, pos))`.
  - Las barracas invisibles del estrés pasan a `placeDiagnosticStructure(world, faction, 'barracks', pos)`, sin visual.
  - `prepareRewardScenario` escribe `matchState.rewards.player.cooldownUntilMs = gameplayClockMs` y `shieldUntilMs = 0`.
- [ ] **Paso 8: Verificar.**
  Run: `npm test && npm run typecheck && npm run build`
  Expected: todo PASS, incluida la frontera.

  Run: `grep -nE "spawnAIBuilding|registerStructureTarget|rewardCooldownUntil\b|enemyRewardCooldownUntil|defensiveShieldUntil|enemyDefensiveShieldUntil|< 3\.8" web/src/GameApplication.ts && grep -rnE "from '(three|\.\./\.\./(ui|rendering|platform))" web/src/game/commands/`
  Expected: sin resultados. Los límites estrictos del raycast (`BUILD_ZONE_*` en `getPlacementPosition`) se quedan, por §5.3.
- [ ] **Paso 9: Comprobación rápida en el navegador** (perfil móvil emulado):
  - construir los tres tipos;
  - un toque a menos de 3,8 (aviso, el modo sigue);
  - vender;
  - entrenar soldado y tanque;
  - activar el escudo.

  Expected: los mismos avisos que hoy y sin errores de consola.
- [ ] **Paso 10: Commit.**
  ```bash
  git add web/src/GameApplication.ts web/src/game/commands/constructionBoundary.test.ts
  git commit -m "refactor(commands): the player, the AI and diagnostics act through the shared commands"
  ```

---

### Tarea 8: Navegador, bundle, medición y entrega

**Files:**
- Modify: `README.md` (arquitectura: `game/commands/` y `dev/diagnosticStructures.ts`)
- Modify: `docs/audits/2026-11-14-auditoria-responsabilidades.md` (R4 hecho en §7)
- Modify: `docs/performance/2026-11-14-referencia-rendimiento.md` (nueva sección de R4)
- Modify: `docs/superpowers/specs/2026-11-20-r4-comandos-compartidos-design.md` (§9, informe de entrega)
- Modify: este plan (casillas)

- [ ] **Paso 1: Navegador** (perfil móvil emulado y, si hay, el teléfono de R0):
  - toques en el borde de la zona (Review Focus 1);
  - pausa con el botón de recompensa (no hace nada);
  - partida contra la IA con `runMatchScenario({ durationSeconds: 60 })` (la IA construye y no solapa);
  - las tres recompensas;
  - victoria forzada con `setNexusHealth('enemy', 0)`;
  - **segunda partida** (recarga y escudo a cero);
  - escenarios `prepareRewardScenario` (`'ready'`, `'no-target'` e `'insufficient-gold'`), `runCombatScenario` y `runStressScenario`.

  Expected: sin errores de consola y los mismos avisos.
- [ ] **Paso 2: Bundle.**
  Run: `npm run build && grep -rlE "placeDiagnosticStructure: development only|setNexusHealth|__gameDiagnostics" dist/`
  Expected: `build` con código de salida 0 y `grep` sin resultados (código 1).
- [ ] **Paso 3: Medición.**
  - Se repite la batería de §6 del informe de rendimiento en los dos perfiles.
  - Se compara con R0, R2 y R3: métricas estructurales iguales, picos de `aiMs` sin empeorar, y `simulationMs` y `gameplayOtherMs` sin aumento claro.
  - No se presenta como mejora nada que no esté respaldado. Si no hay dispositivo, se dice.
- [ ] **Paso 4: Informe de entrega** en §9 del diseño:
  - commits;
  - pruebas ejecutadas y su número;
  - las cifras `BASELINE` y `CURRENT` por dificultad, con el turno del primer rechazo y el `CONTROL` elegido;
  - medición;
  - limitaciones: sin la secuencia real de `Math.random`, sin daño de recompensas en la comparación (R5) y la evaluación de equilibrio pendiente de la fase 3;
  - confirmación de alcance con `git diff cee5941 --stat`.

  Se actualizan también el README y la auditoría.
- [ ] **Paso 5: Commit.**
  ```bash
  git add README.md docs/audits/2026-11-14-auditoria-responsabilidades.md docs/performance/2026-11-14-referencia-rendimiento.md docs/superpowers/specs/2026-11-20-r4-comandos-compartidos-design.md docs/superpowers/plans/2026-11-20-r4-comandos-compartidos.md
  git commit -m "docs(commands): verify R4 in the browser, check the bundle and measure it"
  ```

---

### Después de la Tarea 8: revisión independiente

- **Revisión:** un revisor nuevo, sobre el diff completo de R4, con el diseño, este plan y el Review Focus.
- **Qué comprueba además:**
  - que la transcripción de la Tarea 1 es fiel a `bf2c4a7`, líneas ≈1678-1726;
  - que la Tarea 1 no tocó producción;
  - que ningún cambio de la IA compensa los rechazos (condición 1);
  - que no hay cambios fuera del alcance.
- **Hallazgos:** los críticos e importantes se corrigen con una prueba que falle primero; los menores se anotan.
- **Al terminar R4 no se empieza R5.**
