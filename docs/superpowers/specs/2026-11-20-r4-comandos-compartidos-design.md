# R4 — Comandos compartidos: construir, vender, entrenar y activar recompensas — diseño

Fecha: 2026-11-20 · Estado: aprobado (revisión 3) e implementado; informe de entrega en §9 (opción A; condiciones 1-6, ajustes 7-9 y aclaraciones 10-11 incorporados) · Commit de partida: `bf2c4a7`

Relación con los documentos anteriores:
- `docs/audits/2026-11-14-auditoria-responsabilidades.md`: paso R4 en §7, pruebas previas en §8.2, acoplamiento 2 de §5.
- `docs/superpowers/specs/2026-11-14-ia-enemiga-ordenes-niebla-design.md`: fase 2 en §7.3, módulos de §6.2, criterio de aprobación de §7.4.
- `docs/superpowers/specs/2026-11-14-r3-capa-de-partida-design.md`: asuntos para R4 en §10.6.

---

## 1. Intención

Hoy cada origen de órdenes valida y cobra por su cuenta dentro de `GameApplication.ts`:

- `onPointerUp` vende, valida la ubicación, cobra y crea la malla. La entidad ECS **sale de la malla** (`registerStructureTarget`).
- `executeEnemyAiTurn` cobra y llama a `spawnAIBuilding`, sin validar la ubicación.
- `trainUnit` y la IA llaman a `requestUnitProduction` por caminos distintos.
- La validación y el gasto de las recompensas, las recargas y los escudos viven en variables `let` del cierre.
- La reducción del escudo está escrita dos veces: en `modifyDamage` (proyectiles) y en `applyDamage` (recompensas).

R4 lleva estas reglas a **comandos de juego sin Three.js** en `web/src/game/commands/`. El jugador y la IA pasan por los mismos comandos y las mismas reglas de ubicación. La entidad ECS nace del comando validado, y el visual la representa.

**Por qué ahora:** la fase 3 (conocimiento de facción y banco de partidas sin gráficos) necesita poder construir, entrenar y activar recompensas sin render. Las futuras órdenes globales también emitirán comandos.

## 2. Decisión del usuario (2026-11-20)

**Opción A:** el jugador y la IA usan los mismos comandos y la misma validación de ubicación. La IA respeta la distancia mínima de 3,8 aunque construya menos.

Es una decisión de **consistencia de arquitectura**, no una aprobación del equilibrio resultante de la IA. La evaluación formal del impacto queda **pendiente del banco de partidas de la fase 3** (criterio de §7.4 del diseño de la IA).

Condiciones:

1. No se cambian la estrategia, las prioridades, los intervalos de decisión, las posiciones de construcción ni los modificadores económicos de la IA para compensar los rechazos.
2. Una prueba determinista con semilla fija compara el comportamiento anterior con el nuevo y registra: intentos de construcción, rechazos por distancia, construcciones aceptadas y oro gastado.
3. Un comando rechazado no consume recursos ni deja una entidad ECS a medias. Validar y ejecutar es atómico.
4. La validación de ubicación pertenece a la lógica de juego. No depende solo del raycast ni de las restricciones visuales.
5. Las entidades ECS se crean a partir de comandos validados. Los visuales reflejan el estado resultante y no son su fuente.
6. El resto del alcance no cambia: comandos para construir, vender, entrenar y activar recompensas, y un único camino autoritativo para la reducción del escudo.

Ajustes de la primera revisión del diseño (2026-11-20). El resto del diseño quedó aprobado.

7. **Proteger la creación sin validar.** `buildStructure` es el único camino normal de construcción para el jugador y la IA. La creación sin validar queda encerrada en una utilidad de diagnóstico solo para desarrollo, protegida por una comprobación de compilación y excluida del bundle de producción. Se verifica el bundle, con el mismo principio que `setNexusHealth` en R3 (§5.4).
8. **El comando de recompensa comprueba el estado de la partida.** `activateReward` verifica por sí mismo que la partida sigue en juego y, si no, devuelve un motivo de rechazo explícito. `GameApplication` puede conservar su guarda de UI, pero no es la única protección (§5.6).
9. **Línea base antes de cambiar nada.** Se capturan los resultados del ejecutor antiguo de la IA antes de tocar la implementación. El ejecutor de referencia de la prueba reproduce el comportamiento anterior, para separar los cambios reales de la nueva validación de los cambios accidentales de la refactorización (§6.2).

Aclaraciones de la segunda revisión (2026-11-20). El usuario aprobó extender la comprobación de partida a los cuatro comandos y usar `GameSession` junto con `MatchState`, con estas condiciones:

10. **Los cuatro comandos comprueban la partida.** Construir, vender, entrenar y activar recompensa rechazan si la partida no está activa. Un comando rechazado deja intactos el mundo, los recursos, los CP, las órdenes de producción y el estado de recompensas.
11. **Responsabilidades separadas:**
    - `GameSession` decide si la sesión está en la fase `PLAYING`;
    - `MatchState` registra si ya hay un resultado terminal (victoria o derrota);
    - un comando solo se acepta si la sesión está en `PLAYING` **y** `MatchState` no tiene resultado terminal, y si las dos fuentes no coinciden se rechaza;
    - no se crea otro estado `isPlaying` duplicado;
    - la capa de comandos no se acopla a la implementación de `GameSession`: `CommandContext` solo recibe la información de ciclo de vida mínima y de solo lectura (§5.6).

## 3. Comportamiento actual (verificado en el código, commit `bf2c4a7`)

### 3.1 Construir — jugador (`onPointerUp`, `getPlacementPosition`)

- **Zona:** el raycast al terreno descarta el punto **bruto** si `z <= 5`, `z >= 73` o `|x| >= 53`. Si lo descarta, el toque no hace nada (sin aviso).
- **Redondeo:** la posición aceptada es `(round(x), 0, round(z))`. Por eso una posición final puede valer exactamente `z = 73`, `z = 5` o `|x| = 53`.
- **Distancia:** se rechaza con "⚠️ Ubicación ocupada. Elige otro punto." si alguna estructura de `playerBuildings` (**Nexo incluido**) está a menos de 3,8. Como `y = 0` siempre, es distancia horizontal.
- **Oro:** después de la distancia. Si no alcanza, "¡Recursos insuficientes!".
- **Aceptado:** gasta `STRUCTURE_DEFINITIONS[kind].cost`, `SFX.playBuild()`, `stats.buildingsConstructed++`, `unlocks.recordEvent('building_constructed', …)`, crea la malla, su barra de vida y la entidad ECS (`registerStructureTarget`), aviso "¡TIPO CONSTRUIDO!".
- Después del intento, con éxito o sin oro, se cancela el modo de colocación y se actualiza la UI. **Con rechazo por distancia no se cancela.**

### 3.2 Construir — IA (`executeEnemyAiTurn`, `spawnAIBuilding`)

- `decideEnemyTurn` propone como mucho una construcción por turno, en una zona por tipo (`enemyAiProfile.ts`). Las zonas caen siempre dentro de la mitad enemiga: `|x| ≤ 22`, `-70 ≤ z ≤ -12`.
- La ejecución solo comprueba el oro (`spendFactionGold`) y crea malla y entidad. **No hay comprobación de distancia**: la IA puede solapar edificios.

### 3.3 Vender (`onPointerUp`, modo demoler)

- El raycast solo prueba mallas del jugador que no son el Nexo.
- Reembolso `Math.floor(coste × 0,7)`: 70 / 105 / 87 para generador, barraca y torreta.
- `SFX.playBuild()`, se quita y libera la malla, se borra la entidad ECS y su entrada en `targetObjects`, aviso "🗑️ Estructura vendida. Recuperas +N Oro.". Sin CP, sin ruinas, sin evento de desbloqueo.

### 3.4 Entrenar

- **Jugador (`trainUnit`):**
  - sin barracas vivas: "¡Debes construir una Barraca primero!";
  - todas ocupadas: "Todas las Barracas están produciendo.";
  - si no, usa la **primera barraca libre** en orden de creación;
  - la aparición es `x ± 1,5` (`Math.random`) y `z − 3`;
  - `veteran_armor` (inalcanzable, auditoría §4.6) sustituiría vida y daño del tanque;
  - el rechazo da "¡No tienes suficiente Oro!" o "La Barraca no está disponible para producir.".
- **IA:** `requestUnitProduction` con la barraca y la posición que decide la IA. El resultado se ignora.
- `requestUnitProduction` (ECS) ya valida el tipo, la barraca (viva, del tipo correcto), que la facción del monedero coincida con la de la barraca, la cola ocupada y el oro. Gasta y encola en un solo paso.

### 3.5 Recompensas (`activateRewardForFaction`)

1. Solo en `PLAYING`.
2. `validateRewardActivation` comprueba, en este orden: CP, oro, objetivo válido (no aplica al escudo), escudo ya activo (solo al escudo) y recarga.
3. Ataques: `selectStrikeAim` sobre los candidatos (`getRewardTargetCandidates`: entidades enemigas atacables, vivas en el ECS, con visual en `targetObjects` y que no son el Nexo; la vida se lee de la copia `runtime.hp`). Sin punto de mira se rechaza sin gastar.
4. Se revalida y se gasta: oro, CP y recarga de 15 s (`rewardCooldownMs`) para esa facción.
5. **Escudo:** `shieldUntil = ahora + duración`, y también se guarda en `activeRewardUntil`.
6. **Ataques:** se lanza el visual, que aplica el daño al llegar (R5). `activeRewardUntil` se fija con la duración visual.
7. Avisos para el jugador y sirena y aviso para la IA.

### 3.6 Escudo (dos caminos)

- **Proyectiles:** `BattleSimulation` recibe `modifyDamage`. Si el objetivo es la entidad base de una facción con el escudo activo, aplica `applyShieldReduction`.
- **Recompensas:** `applyDamage` hace lo mismo cuando `target.type === 'hq'`, con la facción tomada de `target.isPlayer`.
- Usan la misma reducción por dificultad, el mismo `gameplayClockMs` y la misma comparación `until > ahora`.

### 3.7 Otros usuarios de estas rutas

- Los escenarios de `?diagnostics=1` crean estructuras **fuera de las zonas** con `spawnAIBuilding` (torretas enemigas en `x = -56`, en `z = 30` dentro del campo del jugador y en `z = 0`). El escenario de estrés crea además barracas invisibles en la posición de cada Nexo con `createSoldierFactory`. También escriben el monedero, la recarga y el escudo directamente.
- **Cómo queda fuera de producción hoy:** todo el diagnóstico vive dentro de `if (diagnosticsEnabled && …)`, con `diagnosticsEnabled = import.meta.env.DEV && ?diagnostics=1`. Vite sustituye `import.meta.env.DEV` por `false` al compilar y elimina el bloque. R3 lo verificó buscando `setNexusHealth` y `__gameDiagnostics` en `dist`.
- **Estado de la partida:** `GameSession` (`game/GameSession.ts`, sin Three.js) tiene los estados `MENU`, `PLAYING`, `PAUSED`, `MATCH_ENDING` y `GAMEOVER`. `MatchState.outcome` (R3) se fija una sola vez, cuando cae un Nexo. En ese mismo `updateCombat`, `beginMatchEnding` pasa la sesión a `MATCH_ENDING`. Por eso, cuando cualquier comando se ejecuta (entre fotogramas o antes de la simulación), `outcome !== null` implica que la sesión ya no está en `PLAYING`.
- El resumen de la IA (`buildEnemyAiSnapshot`) lee barracas, recuentos y la vida del Nexo de las listas visuales.

## 4. Enfoques considerados

| Enfoque | Qué supone | Por qué sí o no |
|---|---|---|
| **A. Comandos compartidos con la misma validación para todos** (elegido) | Jugador e IA llaman a las mismas funciones. La IA deja de solapar edificios | Cumple R4 y la fase 2. Único cambio de comportamiento: los rechazos por distancia de la IA, medidos con semilla fija |
| B. Comandos compartidos sin la regla de distancia para la IA | Sin cambio de comportamiento hasta la fase 3 | Deja la validación partida, que es justo lo que R4 quiere quitar. Descartado por el usuario |
| C. Bus de comandos con cola que se ejecuta en el paso fijo | Uniforme, preparado para las órdenes globales | Cambia en qué fotograma se aplica cada orden y añade infraestructura sin un requisito concreto (AGENTS.md §2.9). La auditoría §6 también descarta un bus genérico |

## 5. Diseño

### 5.1 Módulos

```
web/src/game/commands/          NUEVO · sin Three.js, sin UI
  placement.ts                  zona de construcción por facción + distancia mínima
  structureCommands.ts          buildStructure, sellStructure
  trainCommand.ts               trainUnit (envuelve requestUnitProduction)
  rewardCommand.ts              activateReward (estado de partida, validación, punto de mira, gasto, estado)
  CommandContext.ts             { world, bases, match, sessionPhase, difficulty, nowMs } + comprobación de partida activa
  constructionBoundary.test.ts  quién puede crear estructuras (§5.4)
web/src/game/ecs/initialBattle.ts
                                + createBuildableStructure (primitiva ECS, sin validar)
web/src/dev/
  diagnosticStructures.ts       NUEVO · placeDiagnosticStructure, solo desarrollo
web/src/game/match/
  MatchState.ts                 + estado de recompensas por facción (recarga, escudo)
  shield.ts                     NUEVO · única reducción del escudo
web/src/game/ai/
  aiSnapshot.ts                 NUEVO · buildEnemyAiSnapshot leyendo el ECS y matchState
```

Mi propuesta es repartirlo en varios archivos pequeños en lugar del `gameCommands.ts` único de §6.2 del diseño de la IA. Cada comando tiene sus pruebas y ninguno se vuelve un segundo `GameApplication`. Si se prefiere un solo archivo, el contenido es el mismo.

Fronteras (las de la auditoría §6): `game/commands/` solo importa `game/ecs/`, `game/match/`, `game/definitions/` y `game/rewardSystem.ts`. Nada de `three`, `ui/`, `rendering/` ni `platform/`. Sin dependencias circulares.

### 5.2 Contexto y resultado

```ts
interface CommandContext {
  readonly world: World;
  readonly bases: Readonly<Record<Faction, Entity>>;   // también son los monederos
  readonly match: MatchState;
  readonly sessionPhase: GameSessionState;             // valor de session.state al llamar; import type (§5.6)
  readonly difficulty: Difficulty;
  readonly nowMs: number;                              // gameplayClockMs del llamador
}

type MatchNotPlaying = 'match-over' | 'not-playing';
function checkMatchPlaying(ctx): { ok: true } | { ok: false; reason: MatchNotPlaying };

type CommandResult<Accepted, Reason extends string> =
  | ({ readonly accepted: true } & Accepted)
  | { readonly accepted: false; readonly reason: Reason };
```

- Los comandos son **funciones síncronas** que el llamador ejecuta en el mismo punto del fotograma que hoy: el toque entre fotogramas y la IA antes de `advanceBattleSimulation`. No hay cola: el orden temporal no cambia.
- **Atomicidad (condición 3 y aclaración 10):** cada comando valida **todo** antes de su primera escritura, empezando por la partida activa. Después de la primera escritura no hay ningún rechazo posible. Si se rechaza, quedan intactos:
  - el mundo ECS (entidades y componentes);
  - los monederos;
  - los CP;
  - las órdenes de producción de todas las barracas;
  - el estado de recompensas (recargas y escudos de ambas facciones).

  Las pruebas lo comprueban con una foto de todo eso antes y después de cada rechazo.
- El resultado aceptado lleva lo que el llamador necesita para representar (entidad, reembolso, punto de mira…). `GameApplication` reacciona: visual, sonido, aviso y evento de desbloqueo. Es el mismo patrón de R3, con los resultados del comando en lugar de una cola de eventos.

### 5.3 Ubicación (`placement.ts`, condición 4)

```ts
const BUILD_ZONE = { minDepth: 5, maxDepth: 73, maxAbsX: 53 };   // jugador: z > 0; enemigo, espejado
const MIN_STRUCTURE_SPACING = 3.8;

type PlacementRejection = 'outside-zone' | 'too-close';
function validatePlacement(world, faction, position): { ok: true } | { ok: false; reason: PlacementRejection };
```

- **Zona en el dominio, con límites inclusivos:**
  - jugador: `5 ≤ z ≤ 73` y `|x| ≤ 53`;
  - enemigo, espejado: `−73 ≤ z ≤ −5` y `|x| ≤ 53`.

  Son inclusivos porque el dominio valida la posición **ya redondeada**, y hoy el jugador puede construir exactamente en `z = 73` o en `|x| = 53` (§3.1). Con límites estrictos se rechazarían toques que hoy se aceptan.
- **El raycast no cambia:** `getPlacementPosition` sigue descartando el punto bruto con los límites estrictos actuales y sigue moviendo el fantasma. Así el jugador ve exactamente lo mismo y el dominio acepta todo lo que el raycast deja pasar. El dominio es la autoridad, y el raycast es solo presentación.
- **Distancia:** `dx² + dz² < 3,8²` contra cada entidad ECS con componente `building` de la **misma facción** (el Nexo incluido). Equivale a `playerBuildings`, porque las estructuras muertas salen del ECS al principio de `updateCombat` (R3), antes de cualquier toque o turno de la IA.
- **Orden de comprobación:** zona → distancia → oro, el mismo que hoy.

### 5.4 Construir y vender (`structureCommands.ts`, condición 5)

```ts
// game/commands/structureCommands.ts: el único camino de juego
function buildStructure(ctx, faction, kind, position):
  CommandResult<{ entity: Entity; cost: number },
                MatchNotPlaying | 'outside-zone' | 'too-close' | 'insufficient-gold'>;
function sellStructure(ctx, faction, entity):
  CommandResult<{ refund: number; kind: BuildableStructureKind; position: Position },
                MatchNotPlaying | 'not-found' | 'not-owned' | 'not-sellable'>;

// game/ecs/initialBattle.ts: primitiva ECS, junto a createStructure y createSoldierFactory
function createBuildableStructure(world, faction, kind: BuildableStructureKind, position): Entity;

// dev/diagnosticStructures.ts: solo desarrollo
function placeDiagnosticStructure(world, faction, kind, position): Entity;
```

**Protección de la creación sin validar (ajuste 7):**

- **`createBuildableStructure`** compone la entidad a partir de `STRUCTURE_DEFINITIONS` (`createSoldierFactory` o `createStructure`). Es una primitiva del ECS, como las dos que ya existen, y no es un comando: no valida ni cobra.
- **`buildStructure`** es el único camino de juego. Comprueba que la partida está en juego, la ubicación y el oro, y solo entonces gasta y llama a `createBuildableStructure`.
- **`placeDiagnosticStructure`** es la única otra puerta de entrada:
  - vive en `web/src/dev/`, fuera de `game/`;
  - su primera línea es `if (!import.meta.env.DEV) throw new Error('placeDiagnosticStructure: development only')`;
  - solo la llaman los escenarios de `__gameDiagnostics`: las torretas de recompensas y de estrés y las barracas invisibles del estrés, que hoy usan `spawnAIBuilding` y `createSoldierFactory`.
- **Exclusión del bundle:** se usa el mismo mecanismo que en R3. La utilidad solo se llama dentro del bloque `if (diagnosticsEnabled && …)`, que Vite elimina en producción. Sin llamadas, el módulo (sin efectos secundarios) sale del bundle. La comprobación de `import.meta.env.DEV` es una segunda barrera si alguien la llamara desde fuera del bloque.
- **Verificación del bundle,** tras `npm run build`, igual que en R3: en `dist/` no aparece la cadena `placeDiagnosticStructure: development only`, ni `setNexusHealth`, ni `__gameDiagnostics`. El mensaje de error hace de marca: sobrevive a la minificación (los nombres de función no), así que su ausencia demuestra que la utilidad se eliminó.
- **Frontera comprobada por una prueba (`constructionBoundary.test.ts`):** recorre los `.ts` de `web/src` (sin pruebas ni `matchHarness.ts`) y falla si `createBuildableStructure`, `createStructure` o `createSoldierFactory` aparecen fuera de:
  - `game/ecs/initialBattle.ts`, donde se definen;
  - `game/commands/structureCommands.ts`;
  - `dev/diagnosticStructures.ts`.

  Así `GameApplication.ts` ya no puede crear estructuras por su cuenta. Usa solo `node:fs`, sin dependencias nuevas.
- **`sellStructure`:**
  - rechaza una entidad que no existe, de otra facción o que no es vendible (el Nexo o algo sin `building`);
  - si la acepta, abona `Math.floor(coste × 0,7)` al monedero de la facción y borra la entidad;
  - sin CP ni ruinas, como hoy.
- **Lado visual (`GameApplication`):** `registerStructureTarget(visual)` desaparece y su lugar lo ocupa `representStructure(entity)`. Esta función lee del ECS el tipo, la facción, la posición y la vida, crea la malla y la barra y registra el visual en `targetObjects` y en la lista de su facción. La usan:
  - el toque del jugador tras un `buildStructure` aceptado;
  - el ejecutor de la IA tras un `buildStructure` aceptado;
  - los escenarios de diagnóstico tras `placeDiagnosticStructure`, salvo las barracas invisibles del estrés, que siguen sin visual como hoy.

  `spawnAIBuilding` desaparece. Vender quita el visual del resultado aceptado (busca por `entity` en la lista del jugador).
- **Sin cambios:** los avisos, `SFX.playBuild()`, `stats.buildingsConstructed++`, la llamada a `unlocks.recordEvent('building_constructed', …)` (sin efecto, no se toca) y la regla de cancelar o no el modo de colocación.

### 5.5 Entrenar (`trainCommand.ts`)

```ts
function trainUnit(ctx, faction, factory: Entity, unit: SoldierKind, spawnPosition: Position, overrides?):
  ProductionOrderResult | { accepted: false; reason: MatchNotPlaying };   // el resultado actual de requestUnitProduction
function idleFactories(world, faction): readonly Entity[];   // barracas vivas sin orden, en orden de creación
```

- `trainUnit` usa como monedero `ctx.bases[faction]`. Así una barraca de otra facción da `invalid-factory`, el chequeo que ya hace `requestUnitProduction`.
- **Jugador:** los mensajes "sin barracas" y "todas ocupadas" salen de consultas ECS (`idleFactories` y un recuento de barracas vivas) en lugar de `playerBuildings`. La elección de la primera barraca libre, la aparición con `Math.random` y las sustituciones de `veteran_armor` se quedan en el llamador, sin cambios.
- **IA:** pasa por `trainUnit` con la barraca y la posición que ya decide. El resultado se registra (para la prueba de §6.2), pero la IA no reacciona a él: **comportamiento idéntico**.

### 5.6 Recompensas (`rewardCommand.ts`)

```ts
function activateReward(ctx, faction, id: RewardId):
  CommandResult<{ aim?: StrikeAim; definition: RewardDefinition },
                MatchNotPlaying | 'insufficient-points' | 'insufficient-gold' | 'no-valid-target'
                | 'shield-active' | 'cooldown'>;
function rewardTargetCandidates(world, faction): StrikeCandidate[];
```

- **Mismo orden que hoy, con la partida delante:** partida en juego (`checkMatchPlaying`) → validación (`validateRewardActivation`) → punto de mira (`selectStrikeAim`, ataques solamente) → gasto de oro y CP → recarga de 15 s → para el escudo, `shieldUntilMs = ahora + duración`. Todas las comprobaciones van antes de la primera escritura (condición 3).

**Partida activa: `GameSession` y `MatchState` de R3 (ajuste 8 y aclaraciones 10-11):**

- **Responsabilidades separadas:**
  - **`GameSession`** decide si la sesión está en la fase `PLAYING`. Es el único dueño del ciclo de vida: menú, pausa, secuencia final y fin.
  - **`MatchState.outcome` (R3)** registra si ya hay un resultado terminal (victoria o derrota). Lo escribe solo `DeathResolver`, y una vez fijado no cambia.

  Ninguna de las dos copia la información de la otra: `MatchState` no sabe de pausas y `GameSession` no decide resultados.
- **Regla de aceptación, en un solo sitio (`checkMatchPlaying`):** el comando se acepta solo si `ctx.sessionPhase === 'PLAYING'` **y** `ctx.match.outcome === null`. En cualquier otro caso se rechaza antes de validar nada más:

  | `sessionPhase` | `outcome` | Resultado |
  |---|---|---|
  | `PLAYING` | `null` | sigue con la validación del comando |
  | `PLAYING` | `victory` o `defeat` | rechazo `match-over` (las fuentes no coinciden) |
  | otro estado | `victory` o `defeat` | rechazo `match-over` |
  | otro estado | `null` | rechazo `not-playing` |

  `match-over` va primero porque es el motivo más fuerte y el que no cambiará.
- **Sin un `isPlaying` duplicado:** no se añade ninguna fase, bandera ni booleano a `MatchState`, a `CommandContext` ni a `GameApplication`. `checkMatchPlaying` deriva la respuesta de las dos fuentes en cada llamada y no la guarda.
- **Acoplamiento mínimo con `GameSession`:** `CommandContext` recibe solo `sessionPhase`, el **valor** de `session.state` en el momento de la llamada:
  - es una cadena de solo lectura del tipo `GameSessionState`;
  - se importa con `import type`, que desaparece al compilar;
  - la capa de comandos no recibe el objeto `GameSession`, no importa su clase y no puede llamar a `start`, `pause` ni `beginEnding`.

  El llamador construye el contexto en cada comando, así que el valor nunca queda desfasado.
- **Por qué hacen falta las dos:** en pausa, `outcome` es `null` pero la partida no debe aceptar órdenes. Y si alguna vez la sesión siguiera en `PLAYING` con un resultado ya fijado, por un cambio futuro en la secuencia de fin, el resultado terminal manda.
- **Comportamiento sin cambios:** hoy, por la secuencia de §3.7, cuando un comando se ejecuta con `outcome !== null`, la sesión ya está en `MATCH_ENDING`. `onPointerUp`, `trainUnit`, `activateRewardForFaction` y la IA solo actúan en `PLAYING`, así que la nueva comprobación no cambia ningún resultado actual.
- **Las guardas de `GameApplication` se conservan como guardas de UI:** evitan raycasts y avisos fuera de partida, pero ya no son la única protección. Los rechazos `match-over` y `not-playing` no muestran aviso, igual que hoy.
- **Los cuatro comandos** (construir, vender, entrenar y recompensa) llaman a la misma `checkMatchPlaying` antes que cualquier otra comprobación.
- **Estado en `MatchState` (lo previsto en la auditoría §6):**
  ```ts
  rewards: Record<Faction, { cooldownUntilMs: number; shieldUntilMs: number }>;
  ```
  La constante de 15 s pasa a `rewardSystem.ts` (`REWARD_COOLDOWN_MS`). `createMatchState` la inicializa a cero, igual que hoy `startNewGame`.
- **Candidatos desde el ECS:** se leen la vida y la posición del ECS (`health.current`) en lugar de `runtime.hp`, y sin exigir un visual. Esto cumple la condición 4.

  Equivale a hoy porque `runtime.hp` se copia del ECS al final de cada `updateCombat`. La IA y el toque leen después de esa copia y antes del siguiente paso de simulación. Hay una prueba de caracterización que fija los candidatos y el punto de mira de un escenario con daño aplicado.

  Lo que no entra en R4: las demás copias (`hp` para barras, resumen y aviso del Nexo) siguen en R6.
- **Se queda en `GameApplication`:**
  - la comprobación de `PLAYING`;
  - los avisos y la sirena;
  - lanzar los visuales de artillería y avión, que siguen aplicando el daño al llegar (**R5**);
  - `activeRewardUntil` de los ataques, que depende de la duración visual y solo alimenta la UI (R5).

  El `activeRewardUntil` del escudo pasa a leerse de `shieldUntilMs`.
- La UI (`updateRewardUI`), el resumen de la IA y los escenarios de diagnóstico leen y escriben la recarga y el escudo en `matchState.rewards` en lugar de en las cuatro variables `let`, que se eliminan.

### 5.7 Un solo camino para el escudo (`match/shield.ts`)

```ts
function applyFactionShield(world, match: MatchState, bases, target: Entity, damage: number,
                            nowMs: number, difficulty: Difficulty): number;
```

- Si `target` es la base de una facción y `match.rewards[faction].shieldUntilMs > nowMs`, devuelve `applyShieldReduction(damage, until, nowMs, reducción de la dificultad)`. Si no, devuelve el daño sin cambios.
- La usan tanto el `modifyDamage` de `BattleSimulation` (proyectiles) como `applyDamage` (recompensas). Desaparecen las dos copias actuales.
- **Una vez por golpe:** el daño de recompensas sigue entrando por `applyDamageSystem`, que no pasa por `modifyDamage`. Las pruebas comprueban que 100 de daño dan 50 (Normal) y no 25 por ambos caminos.

### 5.8 Resumen y ejecutor de la IA (asunto de R2 y R3 §10.6)

- `buildEnemyAiSnapshot` pasa a `game/ai/aiSnapshot.ts` y lee el ECS: barracas vivas y libres, recuentos por tipo, oro y vida del Nexo. También lee `matchState`: CP, recarga y escudo. Los valores son los mismos que hoy, por la misma razón que en §5.6.
- El ejecutor (`executeEnemyAiTurn`) solo traduce cada `EnemyAiCommand` en una llamada a `buildStructure`, `trainUnit` o `activateReward`, y representa los resultados aceptados. `ui.setAiStatus` sigue igual.
- **Prueba de conexión sin render:** un turno decidido con un generador de números fijo produce, en el mundo ECS, exactamente las entidades, órdenes y gastos esperados.
- **No se toca (condición 1):**
  - `decideEnemyTurn`, el perfil, los intervalos, las zonas y los costes;
  - la consulta de objetivos durante la recarga y la dificultad leída de dos sitios (asuntos menores de R2). Se registran y quedan fuera.

## 6. Pruebas

Ejecutor actual: `tsx --test "web/src/**/*.test.ts"`. Todo sin WebGL.

### 6.1 Caracterización y reglas (auditoría §8.2)

| Comando | Casos |
|---|---|
| Ubicación | Dentro y fuera de zona para cada facción. Bordes inclusivos (`z = 73`, `z = 5`, `|x| = 53` y sus espejos). A 3,79 se rechaza y a 3,8 se acepta. Una estructura enemiga cercana no bloquea. El Nexo propio sí bloquea |
| Construir | Gasta el coste de `STRUCTURE_DEFINITIONS`. Crea una entidad con tipo, facción, vida y componentes correctos (barraca con producción, generador con ingreso, torreta con arma). Rechaza sin oro. **Con un rechazo, el mundo, el oro y el número de entidades no cambian** |
| Vender | Reembolsa 70 / 105 / 87 y borra la entidad. Rechaza el Nexo, una entidad de otra facción y una inexistente sin cambiar nada |
| Entrenar | Barraca ocupada, sin oro, barraca de la otra facción, barraca muerta. `idleFactories` en orden de creación |
| Recompensa | Cada motivo de rechazo en el orden actual, sin gastar nada. Gasto de CP y oro por dificultad. Recarga de 15 s **para ambas facciones** e independiente entre ellas. Escudo: `shieldUntilMs` y rechazo `shield-active`. Ataque sin punto de mira rechazado sin gastar. Candidatos y punto de mira desde el ECS iguales a los actuales en un escenario con daño |
| Escudo | Reducción aplicada **una vez** por golpe en proyectiles (`BattleSimulation`) y en recompensas. Sin efecto en una estructura que no es el Nexo y sin efecto con el escudo caducado |
| Partida activa | Las cuatro combinaciones de la tabla de §5.6 para cada uno de los cuatro comandos. Incluye el caso de fuentes que no coinciden (`PLAYING` con `outcome` fijado), que se rechaza con `match-over`, y `not-playing` en `PAUSED`, `MATCH_ENDING`, `MENU` y `GAMEOVER`. Cada rechazo se hace con un comando que, por lo demás, sería válido (oro, CP, ubicación y barraca libre de sobra) y deja intactos el mundo, los monederos, los CP, las órdenes de producción y el estado de recompensas (foto antes y después) |
| Frontera | `constructionBoundary.test.ts` (§5.4) |
| IA | Prueba de conexión de §5.8 |

### 6.2 Comparación con semilla fija (condición 2 y ajuste 9)

**Montaje:**

- **Generador:** un generador con semilla escrito en el proyecto (p. ej. mulberry32, unas diez líneas, solo para pruebas, en `game/ai/testRng.ts`). Sin dependencias nuevas.
- **Escenario:**
  - `BattleSimulation` sin render;
  - IA enemiga con `EnemyAiController`, que ya es código de producción sin Three.js (R2);
  - jugador inactivo;
  - las tres dificultades, con la misma semilla;
  - 5 minutos de juego simulados con el paso de 1/30 s y una decisión por fotograma, como en el juego;
  - se para antes si cae un Nexo, y se registra cuándo.
- **Se registra por ejecución:**
  - intentos de construcción;
  - rechazos por distancia (y por zona, que deben ser 0);
  - construcciones aceptadas por tipo;
  - oro gastado en estructuras y en total;
  - órdenes de entrenamiento aceptadas;
  - el resultado y el segundo en que llega, si llega;
  - un registro turno a turno con los comandos, el oro antes y después y las entidades creadas.

**Ejecutor de referencia, primero y sin tocar producción:**

1. **Primer paso de R4, antes de modificar cualquier archivo de producción:**
   - se escribe el ejecutor de referencia, que vive solo en la prueba (`game/ai/legacyEnemyExecutor.ts`, utilidad de prueba como `matchHarness.ts`);
   - es una **transcripción** de `executeEnemyAiTurn` y `buildEnemyAiSnapshot` en `bf2c4a7`, con las mismas reglas: construir solo comprueba el oro; entrenar llama a `requestUnitProduction` e ignora el resultado; la recompensa valida y gasta como `activateRewardForFaction`;
   - sobre el ECS, crea las estructuras con `createSoldierFactory` o `createStructure`, como `registerStructureTarget`. Es una utilidad de prueba, fuera del alcance de la frontera de §5.4.
2. **Se ejecuta y se fijan sus cifras** (la línea base) en la prueba, en el mismo commit. Ese commit solo contiene pruebas.
3. **Fidelidad de la transcripción:** la decisión (`decideEnemyTurn` y el controlador) es el código real. Lo transcrito son unas 40 líneas, de la ejecución y del resumen. La revisión del commit compara la transcripción con `bf2c4a7` línea a línea.

   El resumen de referencia lee el ECS en lugar de las listas visuales, que no existen sin render. Es equivalente por lo explicado en §5.6 y §5.8. Lo que no se puede reproducir sin render se declara: la secuencia de `Math.random` del juego real y el daño de recompensas, que aplica el visual (R5).

**Cómo se separan los cambios reales de los accidentales:**

- **Línea base inmutable:** la referencia reproduce sus cifras fijadas en cada ejecución de las pruebas. Si un paso de la refactorización cambia algo compartido (simulación, decisión, costes), esta prueba falla, y no la del ejecutor nuevo.
- **Igualdad hasta el primer rechazo:** con la misma semilla, el ejecutor nuevo y la referencia producen el **mismo registro turno a turno** hasta el primer `too-close`. Una diferencia antes de ese turno es un cambio accidental y hace fallar la prueba. Desde ese turno, las ejecuciones divergen porque el oro no gastado cambia los turnos siguientes. Es la consecuencia esperada y **no se compensa** (condición 1).
- **Escenario de control sin rechazos:** una segunda semilla, o una ejecución más corta de la misma, en la que la IA no coloca nunca a menos de 3,8. Ahí ambos registros deben ser **idénticos de principio a fin**. Si en esa duración ninguna semilla de prueba lo consigue, se usa un escenario guionizado de turnos con posiciones separadas. La elección se fija en el plan.
- **Afirmaciones sobre el ejecutor nuevo:** nunca deja dos estructuras propias a menos de 3,8, y cada rechazo deja oro y entidades intactos.

**Lo que no hace:** no afirma nada sobre el equilibrio. Las cifras de antes y de después y el turno del primer rechazo se copian al informe de entrega (§9) como dato para la fase 3. Con el jugador inactivo, la IA no gana CP, así que este escenario no ejercita recompensas. Las cubren las pruebas de §6.1.

### 6.3 Comprobaciones de cierre

- `npm run typecheck`, `npm test` y `npm run build`, con los códigos de salida comprobados.
- **Bundle de producción (ajuste 7):** en `dist/` no aparecen `placeDiagnosticStructure: development only`, `setNexusHealth` ni `__gameDiagnostics`.
- **Navegador:** construir, vender, entrenar y las tres recompensas, con los mismos avisos; los escenarios de `?diagnostics=1` (recompensas, combate y estrés) siguen funcionando.
- **Rendimiento:** medición con el panel 0b en los escenarios de referencia, comparada con `docs/performance/2026-11-14-referencia-rendimiento.md`. Se espera que los picos de la IA no empeoren. La creación de mallas sigue en el mismo fotograma, pero fuera de `decideEnemyTurn`. Si no hay dispositivo, se dice.

## 7. Cambios de comportamiento declarados

- **Único cambio:** la IA ya no construye a menos de 3,8 de una estructura propia, Nexo incluido. Un turno rechazado no construye y conserva el oro. Las cifras de §6.2 lo cuantifican.
- **Sin cambios:**
  - el jugador: mismos toques aceptados, mismos avisos, mismos costes y reembolsos;
  - el entrenamiento y las recompensas de ambas facciones;
  - el escudo;
  - los tiempos de impacto;
  - la UI.

## 8. Fuera de alcance

- R5: daño de recompensas en el reloj de juego, `rewardExecution.ts` y `activeRewardUntil` de los ataques.
- R6: copias `hp` y `position` y `targetObjects` como índice visual, salvo los candidatos de recompensa (§5.6).
- R7, R8 y las fases 3 y siguientes de la IA.
- El banco de partidas y la aprobación de equilibrio de §7.4.
- Desbloqueos (`veteran_armor` incluido), los dos mecanismos de fin de partida, la duración con reloj real y `enemyAIEnabled`.
- Los espejos `gold` y `enemyGold` siguen existiendo y se refrescan tras cada comando (limpieza en R6 o R7).
- **Al terminar R4 no se empieza R5.**

## 9. Informe de entrega

### 9.1 Commits

Todos están en `main`, después del plan (`f3c8489`):

1. `32b51f7` test(ai): línea base con semilla del ejecutor antiguo. **Solo pruebas, antes de tocar producción.**
2. `38775fc` ubicación y fase de partida en el dominio.
3. `b4cff98` construir y vender.
4. `dc48004` entrenar.
5. `399b0dd` estado de recompensas, escudo único y activación.
6. `6945d2b` resumen y ejecutor de la IA en el dominio, con la comparación.
7. `d499196` `GameApplication` usa los comandos.
8. El commit de cierre (este informe, README, auditoría e informe de rendimiento).

### 9.2 Pruebas y comprobaciones

- **`npm test`:** 243 de 243, frente a 192 antes de R4.
- **`npm run typecheck` y `npm run build`:** correctos, con el código de salida comprobado.
- **Bundle:** en `dist/` no aparecen `placeDiagnosticStructure: development only`, `setNexusHealth` ni `__gameDiagnostics`. Como control, el servidor de desarrollo sí sirve la marca en `dev/diagnosticStructures.ts`.
- **Fronteras:**
  - `game/commands/` no importa `three`, `ui/`, `rendering/` ni `platform/`;
  - la prueba `constructionBoundary.test.ts` pasa: solo `buildStructure` y la utilidad de desarrollo crean estructuras.
- **Navegador** (móvil emulado, Chrome del sistema, sin errores de consola):
  - **Construir y vender:**
    - un toque junto al Nexo da "Ubicación ocupada", el modo de colocación sigue y el toque siguiente construye;
    - una barraca sobre un generador se rechaza;
    - generador, barraca y torreta se construyen con sus avisos;
    - vender un generador devuelve +70;
    - sin oro da "¡Recursos insuficientes!" y cancela el modo: un segundo toque no hace nada.
  - **Entrenar:** soldados y un tanque, con "Orden aceptada"; el tanque aparece a los 5 s.
  - **Recompensas:**
    - escudo de 10 s;
    - artillería: −180 de oro, −10 CP y 360 de daño a las torretas del escenario;
    - ataque aéreo: −280 de oro, −18 CP y 380 de daño;
    - durante la recarga desaparecen los botones de activar;
    - con `'no-target'` solo queda el escudo, y con `'insufficient-gold'`, ninguno;
    - en pausa no hay botones de activar.
  - **Partida y escenarios:**
    - victoria forzada con `setNexusHealth`;
    - la segunda partida empieza sin escudo ni recargas;
    - partida contra la IA (30 s): la IA construye 4 generadores, 2 barracas y 4 torretas;
    - los escenarios de recompensas, combate y estrés funcionan.

### 9.3 Comparación con semilla (§6.2)

Semilla 1, hasta 300 s y jugador inactivo. Todas las ejecuciones terminan en derrota del jugador antes de un minuto, como en una partida real con el jugador inactivo.

| Dificultad | Ejecutor | Intentos · rechazos por distancia | Aceptadas (gen. / barr. / torr.) | Solapadas | Oro en estructuras · total | Órdenes de tropa | Derrota a los |
|---|---|---|---|---:|---|---:|---|
| Fácil | antes | 6 · 0 | 3 / 1 / 2 | 1 | 700 · 1490 | 8 | 54,33 s |
| Fácil | después | 7 · 1 | 3 / 1 / 2 | 0 | 700 · 1440 | 7 | 46,67 s |
| Normal | antes | 9 · 0 | 4 / 2 / 3 | 1 | 1075 · 2165 | 14 | 42,13 s |
| Normal | después | 11 · 2 | 4 / 2 / 3 | 0 | 1075 · 2215 | 15 | 43,27 s |
| Difícil | antes | 13 · 0 | 5 / 3 / 5 | 4 | 1575 · 2985 | 23 | 42,13 s |
| Difícil | después | 14 · 1 | 5 / 3 / 5 | 0 | 1575 · 2835 | 20 | 40,43 s |

- **Primer rechazo:** Fácil a los 15,0 s (generador), Normal a los 9,8 s (generador) y 14,7 s (torreta), Difícil a los 7,35 s (generador). Hasta ese turno, los registros de antes y después son idénticos turno a turno.
- **Escenario de control** (Normal, semilla 3; 9 intentos sin solapes): los dos ejecutores dan el mismo registro y las mismas métricas de principio a fin.
- **Lectura:**
  - con esta semilla, la IA acaba construyendo los mismos edificios, solo que en otro sitio y algo más tarde;
  - las diferencias de oro total, órdenes de tropa y momento de la derrota son la divergencia esperada tras el primer rechazo, y no se compensan (condición 1);
  - **no es una evaluación de equilibrio:** queda pendiente del banco de partidas de la fase 3.

### 9.4 Medición

En `docs/performance/2026-11-14-referencia-rendimiento.md` §8.4:

- sin cambios estructurales (draw calls, geometrías y repetición sin crecimiento);
- ritmo de la IA igual (1 llamada por fotograma, 1,40 decisiones/s);
- simulación sin aumento;
- picos de la IA de 0,8-4,9 ms, dentro del rango anterior. La malla del edificio se sigue creando en el fotograma de la orden (R6).

### 9.5 Limitaciones y lo no verificado

- **Comparación con semilla:**
  - la referencia es una transcripción de prueba del ejecutor de `bf2c4a7`;
  - no reproduce la secuencia de `Math.random` del juego real;
  - no ejercita recompensas: sin CP, la IA no las pide, y su activación en la referencia lanza un error si se usara;
  - con el jugador inactivo, cada ejecución dura menos de un minuto.
- **Toques en el borde exacto de la zona** (`z = 73`, `|x| = 53`): no se comprobaron en el navegador. Los cubren las pruebas de `placement.test.ts`, y el raycast que filtra el punto bruto no ha cambiado.
- **Sin dispositivo real.** Todo se midió y comprobó en Chrome headless del portátil.
- **Daño de recompensas guiado por el visual:** sigue igual. `GameApplication.getRewardTargetCandidates` se conserva solo para aplicar ese daño al llegar el proyectil o la bomba (R5). La activación, la UI y la IA usan `rewardTargetCandidates` del dominio.
- **Sin cambios, como se acordó:** desbloqueos, los dos mecanismos de fin de partida, la duración con reloj real, `enemyAIEnabled`, los espejos `gold` y `enemyGold`, y la estrategia y los valores de la IA.
- **Al terminar R4 no se empieza R5.**

## 10. Decisiones tomadas por el diseñador (para revisar)

1. Zona del dominio con límites **inclusivos** sobre la posición redondeada, para no rechazar toques que hoy se aceptan (§5.3).
2. Comandos síncronos que devuelven su resultado, sin cola de eventos ni bus (§5.2).
3. Varios archivos pequeños en `game/commands/` en lugar de un `gameCommands.ts` único (§5.1).
4. *(Revisada por el ajuste 7.)* La creación sin validar se reparte en tres piezas: `createBuildableStructure`, una primitiva ECS que solo pueden llamar `buildStructure` y la utilidad de desarrollo; `placeDiagnosticStructure` en `dev/`, con guarda `import.meta.env.DEV` y marca para verificar el bundle; y una prueba de frontera (§5.4).
5. Candidatos de recompensa leídos del ECS en lugar de `runtime.hp` (§5.6).
6. Recarga y escudo en `MatchState.rewards`. `activeRewardUntil` de los ataques se queda en `GameApplication` hasta R5 (§5.6).
7. El resumen de la IA se lee del ECS y de `matchState`, con su prueba de conexión (§5.8).
8. Comparación con semilla durante 5 minutos simulados por dificultad, con jugador inactivo (§6.2).
9. *(Ajuste 8; aprobada con las aclaraciones 10-11.)* "Partida activa" exige que `GameSession` esté en `PLAYING` **y** que `MatchState` no tenga resultado terminal. Si las fuentes no coinciden, se rechaza. No se duplica estado: `CommandContext` solo recibe el valor `sessionPhase` (`import type`). Se aplica a los cuatro comandos (§5.6).
10. *(Ajuste 9.)* La referencia es una transcripción de prueba hecha y fijada en un commit solo de pruebas, antes de tocar producción. Los cambios accidentales se separan con la igualdad turno a turno hasta el primer rechazo y con un escenario de control sin rechazos (§6.2).
