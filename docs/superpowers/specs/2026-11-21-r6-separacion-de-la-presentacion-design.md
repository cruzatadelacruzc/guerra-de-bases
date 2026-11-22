# R6 — Separación de la presentación — diseño

Fecha: 2026-11-21 · Estado: **aprobado** (opción A con los refuerzos del usuario; revisado por un lector independiente, que corrigió el tipo de §5.2; las decisiones de §12 fueron aprobadas con aclaraciones el 2026-11-21) · Commit de partida: `9057331`

Relación con los documentos anteriores:
- `docs/audits/2026-11-14-auditoria-responsabilidades.md`: paso R6 en §7 (`BattlefieldView`, sin copias `hp`/`position` ni `targetObjects` como fuente de datos), acoplamiento 3 en §5, riesgos de recursos en §8.1 y pruebas de R6-R8 en §8.2.
- `docs/superpowers/specs/2026-11-14-r3-capa-de-partida-design.md`: muertes por fotograma (decisión 1) y eventos `unitDied`/`structureDestroyed`.
- `docs/superpowers/specs/2026-11-20-r4-comandos-compartidos-design.md`: `buildStructure`, `sellStructure`, `trainUnit` y `activateReward` como únicos caminos de juego.
- `docs/superpowers/specs/2026-11-20-r5-recompensas-en-el-reloj-de-juego-design.md`: el daño de los ataques vive en `rewardExecution.ts`; `RewardEffectsView` solo dibuja. R6 no toca nada de eso.
- `docs/performance/2026-11-14-referencia-rendimiento.md`: batería de §6 y mediciones de R0, R3, R4 y R5.

---

## 1. Intención

> R6 — Separación de la presentación. El ECS y el dominio deciden qué pasa. La capa de presentación solo representa lo que ha pasado y lo que existe ahora.

Después de R3-R5, `GameApplication.ts` (2.753 líneas) ya no decide muertes, puntos, resultado, construcción ni daño de recompensas. Sigue siendo, en cambio, el dueño de unas 1.100 líneas de presentación: fábricas de mallas, barras de vida, restos, terreno, fantasma de colocación, raycast, visuales de proyectil, sincronización de unidades y edificios, escudos y planos de cámara de los ataques.

Además, conserva estructuras que **parecen** estado de juego:
- copias `hp`/`maxHp`/`position` en `RuntimeStructure` y `RuntimeUnit`;
- `targetObjects`;
- cuatro listas por facción.

R6 lleva la presentación a módulos de `rendering/` con un dueño claro para cada objeto visual y cada recurso de GPU. Elimina las copias redundantes y deja en `GameApplication` una línea de reparto por cada camino del ciclo de vida.

**Por qué ahora:** las fases futuras (órdenes globales y niebla de guerra) se apoyan en una vista indexada por `Entity` (auditoría §7), y R4 dejó explícitamente la creación de mallas fuera de la IA para R6 (rendimiento §8.4).

**Qué no cambia:** jugabilidad, equilibrio, tiempos de R5, comandos de R4, interfaz, cámara y el orden de las cosas dentro del fotograma.

## 2. Decisiones del usuario (2026-11-21)

1. **Fuga del fantasma de colocación:** se corrige en R6, no solo se documenta. El diseño cubre cancelar, cambiar de edificio y desmontar la partida, y distingue los recursos exclusivos de los compartidos (§5.6).
2. **Opción A: se avisa a la vista.** Quien ejecuta un comando o vacía un evento avisa a la vista. No hay conciliación completa con el ECS en cada fotograma. Los motivos del usuario son el rendimiento en móvil, conservar el orden actual de creación y borrado, y evitar una pasada extra por fotograma.
3. **Refuerzos de la opción A:**
   - un registro centralizado por `Entity` en `BattlefieldView`, con operaciones explícitas de crear, actualizar y quitar;
   - una auditoría de todos los caminos del ciclo de vida, cada uno de los cuales avisa exactamente una vez;
   - comandos y sistemas sin Three.js;
   - protección contra duplicados;
   - pruebas del ciclo completo, no solo de la construcción;
   - una comprobación de consistencia solo de desarrollo, que no es una conciliación por fotograma;
   - sincronización por fotograma que lee vida y posición del ECS.
4. **Reparto de pruebas:** Node prueba `BattlefieldView` contra el ECS y el dominio reales. Playwright verifica el cableado real de `GameApplication`. **No** se extrae otro módulo solo para probar el cableado en Node, porque sería una abstracción innecesaria y se acercaría a R8.
5. **Aclaraciones al reparto:**
   - Playwright verifica cada camino del ciclo de vida, no solo que el recuento final sea cero;
   - el borrado directo del escenario de recompensas pasa por una operación de la vista y libera sus recursos;
   - existe un `assertConsistency()` de desarrollo para comprobar justo después de cada operación;
   - `clear()` deja el registro vacío antes de que se active un `World` nuevo (los ids vuelven a 1);
   - `WorldReader` es de solo lectura en la interfaz y en la práctica;
   - las fábricas invisibles del escenario de estrés y los proyectiles son excepciones explícitas.
6. **Verificación en el navegador: opción A.** Igual que en R3-R5: `playwright-cli` global, un procedimiento escrito en el plan con cada comando y el valor esperado, y la salida guardada en el informe de entrega. No se añade ninguna dependencia.
7. **Graphify como complemento:** rutas, ciclos, comunidades y frescura del grafo, siempre comprobados contra el código. Una arista que falta no demuestra que una dependencia no exista (§3.6).

## 3. Estado actual (verificado en el código, commit `9057331`)

Los números de línea son de `web/src/GameApplication.ts`.

### 3.1 Responsabilidades de presentación dentro de `GameApplication.ts`

| Responsabilidad | Líneas | ¿Cambia el juego? | ¿ECS? | ¿Three? | Dueño tras R6 | Riesgo al extraer |
|---|---|---|---|---|---|---|
| Tipos `HealthBar`, `RuntimeStructure`, `RuntimeUnit`, `RuntimeTarget`, `RuntimeProjectile` | 75-109 | No | Ids | Sí | Desaparecen; tipos internos de la vista | Bajo |
| Barra de vida 3D (`create3DHealthBar`) | 461-502 | No | No | Sí | `rendering/HealthBar.ts` | Bajo (movimiento literal) |
| Terreno, suelo exterior, rejilla, línea central | 578-610 | No | No | Sí | `rendering/battlefieldScene.ts` | Bajo |
| Soldados del menú (`setupMenuCinematic`) | 612-625, 1007-1012 | No | No | Sí | `rendering/battlefieldScene.ts` | Bajo |
| Fábricas de mallas: soldado, tanque, Nexo, escudo, generador, barraca, torreta | 627-805 | No | No | Sí | `rendering/battlefieldMeshes.ts` | Bajo (movimiento literal) |
| `disposeObjectResources` | 811-818 | No | No | Sí | `rendering/battlefieldMeshes.ts` | Bajo |
| Restos (ruinas, chatarra, cadáveres, límite de 64) | 807-993 | No | No | Sí | `rendering/BattlefieldRemains.ts` | Bajo; hay que conservar el orden de los emisores |
| Visuales de los Nexos y sus escudos | 1047-1081, 1100-1103 | No | Lee | Sí | `BattlefieldView` (desde el ECS) | Medio: hoy se crean antes que la simulación |
| Fantasma de colocación y raycast al terreno | 1300-1352 | No | No | Sí | `rendering/PlacementGhost.ts` | Bajo; **fuga** (§3.4) |
| Selección del edificio que se vende (raycast + subir por la jerarquía) | 1416-1430 | No (la venta la hace el comando) | Id | Sí | `BattlefieldView.pickOwnStructure` | Medio: interacción |
| Representar una estructura (`representStructure`) | 1490-1519 | No | Lee | Sí | `BattlefieldView.structureBuilt` | Medio |
| Visual de una tropa producida (`createTroopVisual`) | 1521-1563 | No (`stats.soldiersTrained++` sí es UI) | Lee | Sí | `BattlefieldView.unitsProduced` | Medio |
| Explosiones y nube nuclear | 1642-1658 | No | No | Sí + audio + hápticos + temblor | Visual a la vista; audio, hápticos y temblor se quedan (§5.8) | Medio: orden de efectos |
| Muerte de unidad y destrucción de edificio (visual) | 1660-1695 | No (el dominio ya decidió) | Eventos | Sí | `BattlefieldView.deathsResolved` | Medio: orden de efectos |
| Sincronización de unidades y orientación hacia el objetivo | 1697-1726 | No | Lee | Sí | `BattlefieldView.syncUnitsAndTurrets` | Bajo |
| Orientación de torretas | 1728-1749 | No | Lee | Sí | `BattlefieldView.syncUnitsAndTurrets` (§5.3) | Bajo |
| Visuales de proyectil (crear, terminar, sincronizar) | 1773-1838 | No | Lee + eventos | Sí | `rendering/ProjectileView.ts` | Bajo |
| Barras de vida de edificios (`updateBuildingList`) | 1902-1918 | No | Lee | Sí | `BattlefieldView.syncStructures` | Bajo |
| Origen visual de los proyectiles de artillería | 1939-1943 | No | No | No | `GameApplication` lee la posición del Nexo del ECS | Bajo |
| Planos de cámara de artillería y ataque aéreo | 1989-2034 | No | No | No (solo `cameraController`) | `rendering/strikeCinematics.ts` (funciones puras) | Bajo |
| Visual del escudo por fotograma | 2101-2112 | No | `MatchState` | Sí | `BattlefieldView.syncShields` | Bajo |
| Liberar escudos (`disposeNexusShieldVisuals`) | 1981-1986 | No | No | Sí | Desaparece: el escudo es hijo del Nexo | Bajo; hoy se libera dos veces |
| Desmontaje visual de la partida | 1137-1174 | No | `world.clear()` | Sí | `BattlefieldView.clear()` + `ProjectileView.clear()` + `PlacementGhost.hide()` | Medio |
| Cámara orbitando en el menú | 2262-2266 | No | No | Sí | Se queda (cámara; fuera de alcance) | — |
| Temblor de cámara | 1842-1847, 2143 | No | No | Sí | Se queda (§5.8) | — |
| Diagnóstico: métricas, escenarios, borrado directo | 2307-2702 | Sí, solo desarrollo | Sí | Sí | Se queda, adaptado a la vista (§5.9) | Medio |

Ya están fuera y no cambian de responsabilidad:
- `ThreeRenderCoordinator`: escena, cámara, renderer, luces, redimensionado y `dispose`;
- `MapCameraController`;
- `CombatEffects`;
- `ProjectilePool`;
- `InstancedSoldierRenderer`;
- `RewardEffectsView` y `ballisticArc`;
- `TerrainGrid`.

### 3.2 Copias y registros que parecen estado de juego

| Estructura | Escritores | Lectores | Clasificación | Tras R6 |
|---|---|---|---|---|
| `RuntimeStructure.hp/maxHp`, `RuntimeUnit.hp/maxHp` | Copia del componente `health` en cada fotograma (1706-1707, 1864-1869, 1907-1908) | Barras de vida; **aviso al Nexo** (1859, usa el valor del fotograma anterior); **vida de las bases en el HUD** (1871); **daño al Nexo enemigo en el resumen** (2166-2168) | Redundante (4) | Desaparece. Las barras y el HUD leen el ECS. El aviso guarda `lastPlayerNexusHealth`, un único valor de presentación. El resumen lee el ECS (§5.8) |
| `RuntimeStructure.position` (`THREE.Vector3`) | Una vez al crear | Ruina y explosión (1690-1691), origen de artillería (1941), planos de cámara (1998-1999), altura de la torreta (1738) | Caché de un dato inmutable (2) | Desaparece. Se usan `event.position`, la transformada del ECS o `mesh.position`, que es el propio visual |
| `type`, `isPlayer` | Una vez al crear | Selección para vender, torretas, desmontaje | Metadatos del índice visual (3) | Se quedan dentro de la entrada del registro |
| `targetObjects: Map<Entity, RuntimeTarget>` | Al crear y al quitar en 9 sitios | **Un solo lector:** `createProjectileVisual` (1781-1782), para decidir si el disparo es de fusil (sonido y destello) | Índice visual usado como fuente de datos (3 → 4) | Desaparece. El tipo de soldado sale de `soldierKind` en el ECS (§5.4) |
| `playerBuildings`, `enemyBuildings`, `playerUnits`, `enemyUnits` | Al crear y al quitar | Sincronización; selección para vender (1418-1429); **contador de barracas del HUD** (1177); diagnóstico (2252-2254, 2409-2410, 2497, 2531-2553) | Índice visual (3) que además alimenta la UI | Las sustituye el registro. El HUD usa `liveFactories` (§5.8) y el diagnóstico usa `view.stats()` |
| `projectiles` + `projectileVisuals` | Eventos de disparo e impacto | Sincronización, métrica `projectiles` | Índice visual (3) | Pasan a `ProjectileView` |
| `playerHQ`, `enemyHQ` | Al empezar la partida | Aviso, HUD, origen de artillería, planos, resumen | Referencias a visuales usadas como datos | Desaparecen. Se consulta el registro por la entidad de la base o se lee el ECS |
| `rewardScenarioBuildings` | Escenario de recompensas | `rewardScenarioHealth` del diagnóstico | Índice de diagnóstico | Pasa a ser una lista de `Entity` |
| `gold`, `enemyGold` | Espejos del componente `economy` | HUD y `getFactionGold` como respaldo cuando la base ya no existe (1250-1256) | Espejo de juego | **Se queda.** No es render; es tarea de R7/R8 (§9) |
| `menuUnits`, `ruinsAndCorpses`, `placementGhost` | — | — | Solo visual (2) | Pasan a sus dueños |

### 3.3 Caminos del ciclo de vida

Están verificados con `grep` sobre `createEntity`, `removeEntity` y `world.clear` en todo `web/src` (fuera de las pruebas).

| # | Camino | Quién toca el ECS | Visual hoy | Tras R6 |
|---|---|---|---|---|
| C1 | Nexos iniciales | `createInitialBattle` (`initialBattle.ts:75-84`) dentro de `new BattleSimulation` | Se crean **antes** que la simulación y el id se asigna después (1047-1103) | `view.attach(world)` y después `view.structureBuilt(base)` para cada base, en el orden jugador → enemigo |
| C2 | Construcción del jugador | `buildStructure` (`structureCommands.ts:18-35`) | `representStructure` (1478) | `view.structureBuilt(result.entity)` |
| C3 | Construcción de la IA | `executeEnemyTurn` → `buildStructure` | `representStructure` (1620) | `view.structureBuilt(result.entity)` |
| C4 | Estructuras de diagnóstico (combate, recompensas, torretas de estrés) | `placeDiagnosticStructure` | `spawnScenarioStructure` → `representStructure` (2433-2438) | `view.structureBuilt(entity)` |
| C5 | Fábricas invisibles del escenario de estrés | `placeDiagnosticStructure` (2612-2623); se borran en 2645, en la misma llamada síncrona | Ninguno, a propósito | `view.declareWithoutVisual(entity)` al crearlas y `view.forgetWithoutVisual(entity)` al borrarlas (excepción explícita, §5.9) |
| C6 | Producción (jugador, IA, alimentador del combate, escenario de estrés) | `runProductionSystem` dentro de `advance` | `drainProductionEvents` → `createTroopVisual` (1764-1766, 2644) | `view.unitsProduced(events)` |
| C7 | Proyectiles | Sistema de armas (`systems.ts:423`); sistema de proyectiles (`systems.ts:483`, con o sin evento de impacto) | `createProjectileVisual`; `finishProjectileVisual`; `syncProjectileVisuals` libera los que ya no existen | `ProjectileView` (excepción explícita: puede faltar un visual por el límite del pool) |
| C8 | Muerte de unidad | `DeathResolver.#resolveUnits` (`DeathResolver.ts:78-104`) | `representUnitDeath` (1660-1681) | `view.deathsResolved(events)` |
| C9 | Destrucción de edificio, Nexo incluido | `DeathResolver.#resolveStructures` (`:107-126`). **La entidad de la base desaparece con su `economy`** | `representStructureDestruction` (1683-1695) | `view.deathsResolved(events)` |
| C10 | Venta | `sellStructure` (`structureCommands.ts:37-58`) | Se quita a mano (1440-1443) | `view.removedWithoutEffects(entity, 'sold')` |
| C11 | Borrado del escenario de recompensas | `world.removeEntity` directo (2534, 2544) | Quita las mallas de los edificios **sin liberarlas** (2532); las unidades sí se liberan | `discardEntity(entity)` en el bloque de diagnóstico: `world.removeEntity` + `view.removedWithoutEffects(entity, 'diagnostic')` |
| C12 | Desmontaje (`startNewGame`, `exitToMainMenu`, `endGame`) | `world.clear()` (1158), que además pone `#nextEntityId = 1` (`World.ts:98-102`) | `teardownMatch` (1137-1174) | `view.clear()` + `projectileView.clear()` + `placementGhost.hide()` |

Tres hechos verificados condicionan el diseño:
- **Cada partida usa un `World` nuevo cuyos ids empiezan en 1** (`World.ts:31`). Una entrada que sobreviva al desmontaje chocaría con el Nexo de la partida siguiente, así que la protección contra duplicados también sirve para comprobar el desmontaje.
- **La entidad del Nexo desaparece al caer** (C9). El resumen de fin de partida no puede leer su vida del ECS después de que caiga. Hoy usa la copia, que en ese fotograma vale `≤ 0` y se recorta a 0 (100 %). Tras R6, si la entidad falta, se toma como destruida (100 %), con el mismo resultado (§5.8).
- **Ningún sistema del ECS quita soldados ni edificios** fuera de `DeathResolver`, `sellStructure`, el diagnóstico y `world.clear()`. Los únicos que quitan entidades durante `advance` son los proyectiles.

### 3.4 Recursos: exclusivos y compartidos

| Recurso | Dueño | Tipo | Se libera hoy |
|---|---|---|---|
| Mallas de edificio, Nexo, tanque, escudo, soldados del menú | Cada llamada a la fábrica crea geometrías y materiales **nuevos** | Exclusivo del objeto | Con `disposeObjectResources` al quitarlo |
| Barras de vida 3D (3 geometrías + 3 materiales cada una) | Hija de la malla de su entidad | Exclusivo | Con la malla |
| Restos (máx. 64) | `ruinsAndCorpses` | Exclusivo | FIFO y `clearBattlefieldRemains` |
| Fantasma de colocación | `placementGhost` | Exclusivo | **Nunca.** `cancelPlacement` (1319) y `selectBuildingToPlace` (1305) solo hacen `scene.remove`. `teardownMatch` y `beginMatchEnding` pasan por `cancelPlacement` |
| Terreno, suelo, rejilla, línea central | `createTerrain` | Exclusivo, de toda la aplicación | Nunca (vive lo que vive la aplicación) |
| Lotes instanciados de soldados | `InstancedSoldierRenderer` | **Compartido** | `remove` por entidad; `dispose` al cerrar la aplicación |
| Proyectiles | `ProjectilePool` | **Compartido** (pool) | `release`; `clear`; `dispose` |
| Explosiones, humo, ondas, emisores | `CombatEffects` | **Compartido** (pools) | `clear`; `dispose` |
| Avión, bombas, proyectiles de artillería | `RewardEffectsView` | Exclusivo de cada ataque, gestionado por la vista | `sync`, `clear` y `dispose` (R5) |

Otras fugas o dobles liberaciones encontradas:
- **El escenario de recompensas** quita los edificios enemigos sin liberarlos (2532). Solo afecta a desarrollo.
- **El escudo se libera dos veces:** `disposeNexusShieldVisuals` (1981-1986) y luego el recorrido de la malla del Nexo, del que es hijo. Es inofensivo en Three.js, pero confunde la propiedad.

### 3.5 Línea base de dependencias, verificada en el código

Se usa un análisis propio de las importaciones de los 120 `.ts`, que distingue las de solo tipo:
- `import type`;
- las que solo importan nombres marcados como `type`.

Resultados:
- **`game/**` no importa** `three`, `rendering/`, `ui/` ni `platform/` (cero aristas fuera de pruebas).
- **`ui/**` no importa** `rendering/` ni `three`.
- **`rendering/**` no llega a ningún módulo que mute el ECS**, ni directa ni transitivamente, ni con importaciones de valor ni con las de tipo. Se consideraron mutadores: `game/commands/*`, `ecs/systems.ts`, `ecs/BattleSimulation.ts`, `ecs/initialBattle.ts`, `ecs/World.ts`, `match/DeathResolver.ts`, `match/rewardExecution.ts`, `match/shield.ts` y `dev/diagnosticStructures.ts`.

  Las importaciones directas de producción de `rendering/` hacia `game/` son:
  - `InstancedSoldierRenderer.ts` → `game/ecs/components.ts` (tipo);
  - `RewardEffectsView.ts` → `game/ecs/components.ts` (tipo), `game/match/strikeState.ts` (tipo) y `game/rewardSystem.ts` (valor: tres constantes de tiempo; `rewardSystem.ts` no importa nada).

  Solo una **prueba**, `RewardEffectsView.test.ts`, importa `rewardExecution.ts` (`scheduleStrike`).
- **No hay ciclos.** Se buscaron componentes fuertemente conexos (Tarjan) sobre los archivos de producción, con y sin las aristas de tipo: cero en los dos casos.
  - `ui/contracts.ts` no importa nada. Lo importan, solo como tipo, `GameApplication.ts`, `ui/BuildMenu.ts`, `ui/GameHud.ts`, `ui/GameUI.ts` y `ui/rewardPresentation.ts`.
  - `game/ecs/components.ts` no importa nada. Lo importan 32 archivos de producción.

  Un módulo que no importa nada no puede formar parte de un ciclo.
- `GameApplication.ts` importa 40 módulos. Seis son solo de tipo: `enemyAi`, `CommandContext`, `matchEvents`, `InstancedSoldierRenderer`, `MapCameraController` y `ui/contracts`.

### 3.6 Graphify (complemento, comprobado contra lo anterior)

**Frescura:**
- `graphify-out/graph.json` se generó el 2026-11-21 a las 09:29, con `built_at_commit` = `9057331c26…`, el commit actual de R5.
- Los 120 `.ts` de `web/src` están en `manifest.json` con la misma `mtime` que en disco.
- El árbol de trabajo no tiene cambios en `web/`.

**Qué contiene:**
- 1.371 nodos y 3.285 aristas: 3.209 `EXTRACTED`, 75 `INFERRED` y 1 `AMBIGUOUS`.
- Tipos de arista: `imports` 798, `contains` 626, `calls` 588, `references` 405, `imports_from` 361, `method` 346, `implements` 33, `rationale_for` 32, `shares_data_with` 30, `conceptually_related_to` 23, `indirect_call` 19 y otros.

**Límites que condicionan la lectura:**
1. **El grafo está marcado como no dirigido** (`directed: false`), aunque cada arista guarda `source` → `target` con el importador como origen. `graphify path` busca el camino más corto sin dirección, así que puede recorrer una importación al revés.
2. **No distingue las importaciones de solo tipo.** `import type { ActiveStrike, StrikeTimeline }` (`RewardEffectsView.ts:8`) aparece como un `imports_from` corriente.
3. **No registra las importaciones de CSS ni de JSON** (`main.ts` → `style.css`, `unlocks.json`…).

**Comparación con el código:**
- Las 361 aristas `imports_from` entre archivos de `web/src` coinciden con las importaciones relativas reales de `.ts`.
- Las únicas diferencias son las importaciones de CSS y JSON (punto 3) y dos textos de ejemplo dentro de `rewardExecutionBoundary.test.ts` y `testUtilitiesBoundary.test.ts`. Mi analizador los tomó por importaciones; el grafo, correctamente, no.

**`graphify path` desde `rendering/` hacia los mutadores.** Todas las rutas tienen dos saltos y pasan por un nodo común con las flechas enfrentadas. **Ninguna es una dependencia:**

| Consulta | Ruta devuelta | Lectura |
|---|---|---|
| `RewardEffectsView.ts` → `DeathResolver.ts` | `RewardEffectsView --imports_from--> components.ts <--imports_from-- DeathResolver` | Los dos importan `components.ts` |
| `RewardEffectsView.ts` → `structureCommands.ts` | `… --> components.ts <-- structureCommands` | Igual |
| `InstancedSoldierRenderer.ts` → `systems.ts` | `… --> components.ts <-- systems` | Igual |
| `ThreeRenderCoordinator.ts` → `rewardCommand.ts` | `ThreeRenderCoordinator <--imports_from-- GameApplication --imports_from--> rewardCommand` | `GameApplication` importa los dos |
| `contracts.ts` → `components.ts` | `contracts <-- GameApplication --> components` | Igual |

Los ciclos sobre las aristas de importación del grafo, recorridas con su dirección, también dan cero.

**Relaciones inferidas o semánticas.** Cerca de `rendering/` y `GameApplication.ts` solo hay una: `indirect_call INFERRED createGameRuntime() → .now() (BattleSimulation.ts)`. Es una inferencia errónea: el `now` que se llama es el del objeto `diagnosticsProfiler` (419-425). No se usa como dependencia.

**Comunidades (línea base, no fronteras obligatorias):**

| Comunidad | Etiqueta | Archivos |
|---|---|---|
| 21 | GameApplication Runtime | `GameApplication.ts`, `rendering/TerrainGrid.ts` (+ prueba) |
| 2 | Combat Effects Rendering | `rendering/CombatEffects.ts`, `ProjectilePool.ts`, `ThreeRenderCoordinator.ts` (+ pruebas) |
| 18 | Instanced Soldier Renderer | `rendering/InstancedSoldierRenderer.ts` (+ prueba) |
| 4 | Camera Shots and Gestures | `rendering/MapCameraController.ts` (+ prueba) |
| 6 | Strike State Model | `rendering/RewardEffectsView.ts`, `rendering/ballisticArc.ts`, **`game/match/strikeState.ts`** (+ pruebas) |

Lectura:
- `GameApplication` comparte comunidad con un solo módulo de render, el que solo él usa.
- La comunidad 6 cruza capas porque `RewardEffectsView` comparte el modelo de datos de los ataques. La arista es de solo tipo y va de `rendering/` hacia `game/`, que es la dirección permitida.
- Tras R6 cabe esperar que los nuevos módulos de `rendering/` formen comunidades propias y que la 21 se reduzca. No es un criterio de aceptación.

**Lo que el grafo no demuestra.** Que una ruta o una arista falte no demuestra que una dependencia no exista. Las conclusiones de §3.5 salen del análisis de las importaciones reales. Lo que las vigila a partir de ahora es la prueba de límites de §6.1.

## 4. Enfoques considerados

### 4.1 Cómo se entera la vista de qué existe

| | Enfoque | Ventajas | Inconvenientes | Decisión |
|---|---|---|---|---|
| **A** | Se avisa a la vista: quien ejecuta un comando o vacía un evento llama a la operación del ciclo de vida que corresponde | Conserva el orden exacto de creación y borrado; casi todo el código se mueve tal cual; no hay pasadas nuevas por fotograma | `GameApplication` tiene que acordarse de avisar en cada camino | **Elegida**, con registro, protección contra duplicados, comprobación de desarrollo y verificación por camino |
| B | La vista se concilia con el ECS en cada fotograma | Ningún camino puede olvidarse | Una pasada por fotograma sin medir; la venta y la destrucción solo se distinguen por la llegada del evento; si un evento se pierde, el edificio desaparece en silencio en vez de explotar | Descartada (rendimiento y orden) |
| C | Híbrido: creación avisada y borrado por conciliación | Cubre las bajas de diagnóstico sin avisos | Dos modelos a la vez para el mismo registro | Descartada |

### 4.2 Dónde se verifica que cada camino avisa una vez

| | Enfoque | Decisión |
|---|---|---|
| **A** | Node prueba `BattlefieldView` contra el dominio real; Playwright prueba el cableado de `GameApplication` | **Elegida** |
| B | Sacar el reparto a un módulo importable y probarlo en Node | Descartada: abstracción solo para probar y adelanta R8 |

### 4.3 Cómo se empaqueta la verificación en el navegador

| | Enfoque | Decisión |
|---|---|---|
| **A** | Procedimiento con `playwright-cli` escrito en el plan y salida guardada en el informe (convención de R3-R5) | **Elegida** |
| B | Spec con `@playwright/test` en el repo | Descartada: dependencia y ejecutor nuevos |
| C | `runLifecycleScenario()` de desarrollo llamado con un `eval` | Descartada: no pasa por eventos de puntero reales |

## 5. Diseño

### 5.1 Módulos

```
web/src/
  game/ecs/WorldReader.ts        NUEVO · solo tipos; sin Three.js
  rendering/
    battlefieldMeshes.ts         NUEVO · fábricas (movidas tal cual) + disposeObjectResources
    HealthBar.ts                 NUEVO · barra 3D (movida tal cual; `visible` por parámetro)
    BattlefieldRemains.ts        NUEVO · ruinas, chatarra, cadáveres, límite de 64
    BattlefieldView.ts           NUEVO · registro por Entity, ciclo de vida, sincronización,
                                         escudos, selección para vender, stats, contadores
    ProjectileView.ts            NUEVO · visuales de proyectil sobre ProjectilePool
    PlacementGhost.ts            NUEVO · fantasma y raycast al terreno
    strikeCinematics.ts          NUEVO · planos de cámara de los ataques (funciones puras)
    battlefieldScene.ts          NUEVO · terreno y soldados del menú
    (sin cambios) ThreeRenderCoordinator, CombatEffects, ProjectilePool,
                  InstancedSoldierRenderer, MapCameraController, RewardEffectsView,
                  ballisticArc, TerrainGrid
  dev/visualConsistency.ts       NUEVO · comprobación pura (Node y navegador)
  GameApplication.ts             reparto, audio, hápticos, temblor, UI y diagnóstico
```

**Dirección de las dependencias (una sola):**

```
GameApplication ──► rendering/* ──► game/ecs/WorldReader (tipo), components (tipo/constantes),
       │                            match/matchEvents (tipo), ecs/systems (solo tipos de evento),
       │                            definitions, rewardSystem (constantes), match/strikeState (tipo)
       ├──► game/** (comandos, simulación, DeathResolver, rewardExecution)
       └──► dev/visualConsistency ──► game/ecs/WorldReader (tipo), components
game/** ──► nada de three, rendering, ui ni platform
```

`rendering/**` puede importar **tipos** de `game/` y **valores** solo de módulos sin efectos sobre el ECS: `components.ts` (constantes `COMPONENTS` y `FACTIONS`), `definitions/structures.ts` y `rewardSystem.ts` (constantes). `initialBattle.ts` crea entidades, así que queda prohibido como valor. Ningún módulo nuevo lo necesita: el respaldo `PLAYER_BASE_POSITION` lo aplica `GameApplication` (§5.7). No puede importar `World` **ni siquiera como tipo**, porque con él se podría llamar a `removeEntity`. Usa `WorldReader` (§5.2). Lo vigila la prueba de límites de §6.1.

### 5.2 `WorldReader`: solo lectura en el tipo y en la práctica

```ts
// game/ecs/WorldReader.ts
export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
type ReadonlyComponentData = { readonly [Name in ComponentName]: DeepReadonly<ComponentData[Name]> };
export interface WorldReader {
  getComponent<Name extends ComponentName>(entity: Entity, component: Name): ReadonlyComponentData[Name] | undefined;
  queryInto(result: Entity[], components: readonly ComponentName[]): void;
}
```

- **Coste.** `World` lo cumple estructuralmente: no hay adaptador ni coste en tiempo de ejecución.
  - Se comprobó con `tsc --strict` contra el `World` real (revisión de 2026-11-21). Una primera versión, que devolvía `DeepReadonly<ComponentData[Name]>` directamente, **no compila**: el condicional sobre un índice genérico no se resuelve (TS2322). La versión de arriba sí compila.
  - Esa misma comprobación confirma que escribir `health.current` o `production.order.spawnPosition.x` a través del lector da TS2540.
  - Una prueba de compilación (`const reader: WorldReader = new World()`) lo fija.
- **Profundidad.** Es profundo porque `ProductionOrder.spawnPosition` y `weapon`, y `Projectile.targetPosition`, son objetos anidados.
- **El hueco de TypeScript.** Un objeto `readonly` se puede asignar a un parámetro mutable; por ejemplo, `InstancedSoldierRenderer.add(…, position: Position)`. El tipo, por tanto, no basta. **En la práctica** lo garantizan dos cosas:
  1. **Pruebas con `Object.freeze`.** Antes de `sync` y de cada operación del ciclo de vida, la prueba congela en profundidad todos los componentes de todas las entidades. Los módulos ES corren en modo estricto, así que cualquier escritura lanza `TypeError`. Cada prueba congela un `World` propio, porque la simulación no puede avanzar sobre componentes congelados.
  2. **Prueba de instantánea.** Compara una copia profunda de todos los componentes antes y después de un fotograma completo de presentación (las dos sincronizaciones, las torretas y los escudos).
- **`queryInto` escribe en el array del llamador.** Es el patrón actual y no toca el ECS.

### 5.3 `BattlefieldView`

**Construcción:** `new BattlefieldView({ scene, soldiers, effects, healthBarsVisible })`. Recibe `InstancedSoldierRenderer` y `CombatEffects` de `ThreeRenderCoordinator`, que sigue siendo su dueño (no se liberan aquí).

La vista **no depende** del audio, de los hápticos, de `MapCameraController` ni de la cámara salvo para orientar las barras hacia ella. Su única salida hacia esos sistemas es un tipo de datos (aclaración 1 del usuario):

```ts
export interface ExplosionCue { readonly position: Readonly<Position>; readonly scale: number; readonly nuclear: boolean }
```

La prueba de límites de §6.1 también falla si `rendering/BattlefieldView.ts`, `ProjectileView.ts` o `BattlefieldRemains.ts` importan `platform/`, `MapCameraController` o el código de audio.

**Registro:**
- `Map<Entity, EntityVisual>` para buscar y listas densas para recorrer: estructuras y unidades con malla. Las listas se recorren igual que hoy y no se asigna nada por fotograma.
- `EntityVisual` es una unión discriminada:
  - `{ kind: 'structure', building: BuildingKind, faction, group, healthBar, head?, shield? }`;
  - `{ kind: 'tank', faction, group, healthBar }`;
  - `{ kind: 'rifleman', faction, handle }`.

**Invariantes:**
- `attach(world: WorldReader)` lanza un error si ya hay un `World` enlazado o si el registro no está vacío.
- Toda operación de alta lanza un error si no hay un `World` enlazado.
- `add` lanza un error si la entidad ya está en el registro, igual que `InstancedSoldierRenderer.add`. Un duplicado es un error de programación: las pruebas lo detectan y en el navegador aparece como `pageerror`.
- Las operaciones de baja sobre una entidad que no está registrada no hacen nada, como hoy (`index < 0 → return`), y la comprobación de desarrollo informa de ellas.
- `clear()`:
  - quita y libera todos los visuales exclusivos;
  - quita a los soldados de `InstancedSoldierRenderer` (`soldiers.clear()`);
  - vacía los restos (`BattlefieldRemains.clear()`) y las excepciones;
  - suma 1 a `clears`;
  - desengancha el `World`.

  Los contadores de ciclo de vida **no se reinician**: se acumulan durante toda la vida de la aplicación, y las comprobaciones comparan diferencias entre un paso y el siguiente.

  Es idempotente, porque `endGame` desmonta y después `startNewGame` vuelve a desmontar.

**Operaciones del ciclo de vida** (una por camino de §3.3):

| Operación | Camino | Qué hace |
|---|---|---|
| `structureBuilt(entity)` | C1-C4 | Lee `building`, `faction`, `transform` y `health`, y crea la malla y la barra con las mismas alturas que hoy: 2,8 en torretas, 2,5 en los demás, 5,2 en el Nexo, y anchos 2,2 / 4,0. El Nexo añade su escudo como hijo (color `0x22d3ee` / `0xfb7185`). Lanza un error si falta un componente, como hoy |
| `unitsProduced(events)` | C6 | Fusilero: `soldiers.add`. Tanque: malla + barra a 1,8 / 1,4. Devuelve cuántos son del jugador, para `stats.soldiersTrained` |
| `deathsResolved(events, phase)` | C8, C9 | Con `phase: 'units'` procesa solo `unitDied` y con `phase: 'structures'` solo `structureDestroyed`, para mantener el orden actual del fotograma (§5.8). Ejecuta **los mismos efectos visuales y en el mismo orden que hoy**: en unidades, explosión → chatarra o cadáver → quitar; en edificios, ruina (si no es el Nexo) → explosión → quitar. **Usa solo los datos del evento** (`position`, `faction`, `kind`) y su propia entrada del registro; nunca lee el ECS, porque la entidad ya no existe (aclaración 4). Devuelve los `ExplosionCue` en un array reutilizado para el audio, los hápticos y el temblor (§5.8) |
| `removedWithoutEffects(entity, cause)` | C10, C11 | Quita y libera sin efectos; cuenta por `cause: 'sold' \| 'diagnostic'` |
| `declareWithoutVisual(entity)` / `forgetWithoutVisual(entity)` | C5 | Excepción explícita (solo desarrollo, §5.9) |
| `clear()` | C12 | Ver las invariantes |

**Sincronización por fotograma** (sin pasadas sobre el ECS, solo sobre el registro):
- `syncUnitsAndTurrets(camera)`, por cada unidad:
  - lee `transform` y `health`;
  - mueve el visual;
  - actualiza la barra (tanque) o `soldiers.setHealth` (fusilero);
  - orienta hacia `targeting.target`.

  También orienta las cabezas de las torretas, igual que hoy `updateTurrets`, justo después de las unidades. De ahí el nombre (aclaración 5); su lugar en el fotograma no cambia.
- **Componentes que faltan** (aclaración 3):
  - **La entidad existe pero le falta un componente necesario.** Se conserva el último estado visual, como hoy con la copia, y la comprobación de desarrollo lo informa (`missingComponent`, §5.9).
  - **La entidad ya no existe.** Su visual solo se quita por el camino explícito del ciclo de vida (C8-C12). La sincronización **nunca** borra un visual por su cuenta, porque eso sería conciliar. Mientras no llegue el aviso, la comprobación de desarrollo lo informa como `orphanVisual`.

  Con los caminos actuales (§3.3), ninguno de los dos casos debería darse en una partida normal.
- `syncStructures(camera)`: barras de edificios con `health` del ECS y orientación hacia la cámara.
- `syncShields(active: Readonly<Record<Faction, boolean>>, clockMs)`: visibilidad y la misma escala de hoy, `1 + sin(clockMs·0,004)·0,035`. `GameApplication` calcula `active` desde `MatchState` y la vista no lee `MatchState`.

**Consultas:**
- `pickOwnStructure(raycaster, faction): Entity | undefined`. Prueba solo las estructuras no-Nexo de la facción, en el orden de hoy, y sube por la jerarquía hasta la raíz registrada. Construye el array de mallas en cada toque, como hoy (no es un camino de cada fotograma).
- `positionOf(entity)`.
- `stats()`: `{ player: { structures, tanks, riflemen }, enemy: { … }, remains, sceneObjects }`. El desglose por facción alimenta las métricas `playerSoldiers`/`enemySoldiers` del diagnóstico y las comparaciones con R0-R5.
- `lifecycleCounts()` (solo desarrollo): `built`, `produced`, `unitDied`, `structureDestroyed`, `sold`, `discarded` y `clears`.
- `entries()`: un iterador de solo lectura para la comprobación de desarrollo.

### 5.4 `ProjectileView`

Usa `ProjectilePool`, de `ThreeRenderCoordinator`, sin ser su dueño. Mantiene el doble índice actual (lista + `Map`).

- `fired(events, world, elapsedSeconds)`. Por cada disparo:
  - Clasifica el disparo leyendo `soldierKind` del que dispara. Si es `'rifleman'`, el disparo es de fusil y se activa el destello (`soldiers.showMuzzleFlash`, `elapsedSeconds + 0,05`); si no, es pesado.
  - Pide una malla al pool.
  - Devuelve la clasificación en un array reutilizado para que `GameApplication` reproduzca el sonido. Hoy el sonido suena antes de pedir la malla, aunque el pool devuelva `null`, y eso se mantiene.
  - **Equivalencia con `targetObjects`:** todo fusilero recibe su visual en el mismo `advanceBattleSimulation` en que nace (C6). El que dispara sigue en el ECS cuando se vacían los disparos, porque las muertes se resuelven después en el fotograma (§3.3). Lo fija una prueba en Node.
- `impacts(impacts)`: libera la malla y devuelve las posiciones de los impactos pesados para la explosión (§5.8).
- `sync(world)`: mueve las mallas y libera las de los proyectiles que ya no existen, igual que hoy.
- `clear()` y `stats()`.

**Excepción explícita:** los proyectiles no forman parte del registro de entidades. Un proyectil puede quedarse sin visual porque se agotó el pool, y puede desaparecer sin evento si caduca.

### 5.5 Restos, mallas y barras

- `battlefieldMeshes.ts` y `HealthBar.ts` se **mueven tal cual**.
  - La única diferencia es que la opción de diagnóstico `bars=0` llega como `healthBarsVisible` en lugar de leer `diagnosticsOptions` del cierre.
  - Regla de propiedad: **cada llamada devuelve recursos nuevos y exclusivos.** `disposeObjectResources` solo se usa con árboles exclusivos.
- `BattlefieldRemains` (`scene`, `effects`): `addBuildingRuin`, `addTankWreck`, `addSoldierCorpse` y `clear`.
  - Conserva el orden de los emisores: los restos crean su emisor en el mismo punto que hoy.
  - Conserva el límite de 64 con FIFO y liberación del más antiguo, y el uso de `Math.random` para las rotaciones, que solo es visual.

### 5.6 `PlacementGhost`

Su dueño exclusivo es el fantasma. Se construye con `{ scene, terrain }`.

- `show(kind)`: si ya hay un fantasma, lo quita **y lo libera** (caso de cambiar de edificio) y crea uno nuevo con `instantiateBuildingMesh(kind, true)` en `(0, -100, 0)`. Se mantiene el comportamiento de crear uno nuevo aunque se repita el mismo tipo.
- `placementAt(raycaster, camera, pointer): Position | undefined`: el raycast al terreno, la zona (`5 < z < 73`, `|x| < 53`) y el redondeo a enteros, como hoy (1336-1345).
- `track(position | undefined)`: lo mueve, o lo esconde en `y = -100`.
- `hide()`: lo quita y lo libera. Es idempotente. Lo usan:
  - cancelar (`cancelPlacement`);
  - después de construir;
  - el desmontaje (`teardownMatch` → `cancelPlacement`);
  - el comienzo del fin de partida (`beginMatchEnding` → `cancelPlacement`).
- `dispose()` al cerrar la aplicación.

**Recursos compartidos:** el fantasma no comparte ningún recurso. Si en el futuro se compartieran geometrías entre edificios, la regla de §5.5 obligaría a liberar solo las exclusivas. Las pruebas de §6.1 lo vigilan escuchando el `dispose` de los recursos compartidos.

### 5.7 Cinemáticas de ataque y escena

- `strikeCinematics.ts`:
  - `artilleryShots(nexus: {x, z}, aim): CameraShot[]`;
  - `airStrikeShots(target, heading): CameraShot[]`.

  Son el cálculo actual (1989-2034), movido tal cual. `GameApplication` llama a `cameraController.playShots(…)`. La posición del Nexo sale del `transform` de la base del jugador. Si falta, se usa `PLAYER_BASE_POSITION`, igual que hoy el respaldo de 1941.
- `cameraGroundHeading` se queda en `GameApplication`: lee la cámara para construir un dato de juego, el rumbo que fija el comando (R5).
- `battlefieldScene.ts`:
  - `createTerrain(scene)` devuelve `{ floor, dispose }`;
  - `MenuSoldiers` ofrece `show(scene)` y `clear()`, y libera con `disposeObjectResources`, como hoy.
  - La posición inicial de los soldados del menú se mantiene igual (`Math.random`).

### 5.8 `GameApplication` tras R6

**Reparto (una línea por camino):**

| Camino | Línea |
|---|---|
| C1 | `startNewGame`: `view.attach(simulation.world)`, después `view.structureBuilt(playerBase)` y `view.structureBuilt(enemyBase)` |
| C2 | `onPointerUp`, construcción aceptada: `view.structureBuilt(build.entity)` |
| C3 | `representEnemyTurn`, `build` aceptado: `view.structureBuilt(result.entity)` |
| C4 | `spawnScenarioStructure`: `view.structureBuilt(placeDiagnosticStructure(…))` |
| C5 | Escenario de estrés: `declareWithoutVisual` al crear y `forgetWithoutVisual` al borrar |
| C6 | `advanceBattleSimulation` y escenario de estrés: `stats.soldiersTrained += view.unitsProduced(drain)` |
| C7 | `projectileView.fired(…)`, `projectileView.impacts(…)`, `projectileView.sync(…)` |
| C8-C9 | `updateCombat`: `view.deathsResolved(events, 'units')` y, más tarde, `view.deathsResolved(events, 'structures')` |
| C10 | `onPointerUp`, venta aceptada: `view.removedWithoutEffects(entity, 'sold')` |
| C11 | `discardEntity(entity)` en el bloque de diagnóstico |
| C12 | `teardownMatch`: `view.clear()`, `projectileView.clear()`, `placementGhost.hide()` |

**Lo que se queda y por qué:**
- **Audio (`SFX`) y hápticos.** No son render, y R1 aplazó su extracción. `GameApplication` los reproduce a partir de las descripciones que devuelven `deathsResolved` y `ProjectileView` y de los eventos de los ataques, que ya se procesan aquí desde R5.
- **Temblor de cámara.** Sale de las mismas descripciones de explosión. Moverlo obligaría a tocar `MapCameraController` y el comportamiento de la cámara, que hay que conservar.
- **El ayudante de explosión** `explode(position, scale, nuclear)` (sonido + temblor + háptico + `effects.createExplosion` o `createNuclearExplosion`). Lo usan:
  - los impactos pesados;
  - los impactos de los ataques;
  - la salida de los proyectiles de artillería (solo el efecto, como hoy);
  - el escenario de estrés.

  Las muertes ejecutan su parte visual en la vista, en el orden de hoy. La parte de audio, hápticos y temblor se aplica en el mismo fotograma, y el orden entre audio y visual no se percibe.
- **UI** (es R7), espejos de oro, bloque de diagnóstico y `cameraGroundHeading`.

**Consumidores de las copias, reconectados** (cambios mínimos que pide quitar las copias, no una reorganización de R7):

| Antes | Después | Equivalencia |
|---|---|---|
| `nexusDamageAlert.report(playerHQ.hp, health.current, …)` | `report(lastPlayerNexusHealth, health.current, …)`, y después se guarda `lastPlayerNexusHealth = health.current` | Mismo valor anterior; se inicializa a `NEXUS_HEALTH` en `startNewGame`, igual que la copia |
| `ui.setBaseHealth(playerHQ.hp…, enemyHQ.hp…)` | Se lee `health` de las dos bases en ese mismo punto | Mismo fotograma, mismo valor. Mientras se está en `PLAYING`, las dos bases existen en este punto: solo desaparecen después, en `deathResolver.resolve`, que fija el resultado y saca la partida de `PLAYING`. Si faltara una, se omite la llamada (caso imposible hoy, cubierto por la comprobación de desarrollo) |
| Resumen: `enemyHQ.hp` | `health` de la base enemiga en `endGame`; si falta, se toma 0 | En `MATCH_ENDING` el ECS no avanza, así que vale lo mismo que la copia del último fotograma. Una base que falta solo puede haber caído con `hp ≤ 0`, y eso da 100 % en los dos casos |
| HUD: `playerBuildings.filter(isValidSoldierFactory)` | `liveFactories(world, 'player')` | Mismas condiciones: `barracks`, `factory`, `health > 0`, facción. El orden de creación coincide con el de inserción de la lista. Lo fija una prueba (§6.1) |
| `strikeShellOrigin`: `playerHQ.position` | `transform` de la base, o la constante si falta | El Nexo no se mueve |
| Diagnóstico: `playerUnits.length` y similares | `view.stats()` y `projectileView.stats()` | Mismas cuentas: solo se cuentan unidades con visual |
| Alimentador del escenario de combate: `[...playerBuildings, ...enemyBuildings]` + `isValidSoldierFactory` + `building.isPlayer` (2497-2507) | `liveFactories(world, faction)` para cada facción | Mismas barracas. Las fábricas invisibles del escenario de estrés no existen en este escenario |

**Orden del fotograma (sin cambios respecto a hoy):**

```
PLAYING:
  gameplayClockMs += delta · cameraController.update
  IA (C3 dentro)
  simulation.advance · drainGeneratedIncome
  projectileView.fired → sonidos · view.unitsProduced (C6) · projectileView.impacts → explode
  projectileView.sync
  advanceStrikes · eventos de ataque → efectos y audio · rewardEffectsView.sync
  view.syncShields
  updateCombat:
    temblor · updateResourceUI · vida de las bases y aviso
    deathResolver.resolve
    view.deathsResolved(…, 'units') → audio, hápticos, temblor
    view.syncUnitsAndTurrets(camera)          (unidades y después torretas)
    effects.update
    view.deathsResolved(…, 'structures') → audio, hápticos, temblor
    view.syncStructures(camera)
    resultado → beginMatchEnding
  UI de recompensas cada 250 ms
  [DEV] comprobación automática de consistencia (como mucho 1 vez/s)
render
```

### 5.9 Comprobación de consistencia y operaciones de diagnóstico

`dev/visualConsistency.ts` contiene una función pura:

```ts
checkVisualConsistency(world: WorldReader, view: ConsistencyView): ConsistencyReport
// report: { missingVisual: Entity[]; orphanVisual: Entity[]; missingComponent: Entity[];
//           kindMismatch: Entity[]; exemptWithVisual: Entity[]; staleExemption: Entity[] }
```

**Reglas:**
- **Dibujable:** una entidad con `building` (Nexo incluido) o con `soldier`.
  - Las entidades con `projectile` quedan fuera: es la excepción explícita C7.
  - Las declaradas con `declareWithoutVisual` también: es la excepción explícita C5.
- `missingVisual`: dibujable y sin entrada en el registro.
- `orphanVisual`: entrada en el registro cuya entidad ya no existe (no tiene `faction`).
- `missingComponent`: entrada cuya entidad existe pero le falta un componente que la sincronización necesita (`transform` o `health`).
- `kindMismatch`: entrada cuyo tipo no coincide con `building.kind`/`soldierKind`.
- `exemptWithVisual`: una entidad declarada sin visual que, sin embargo, lo tiene.
- `staleExemption`: una entidad declarada sin visual que ya no existe.
- **Momentos válidos:** fuera de un fotograma y fuera del tramo síncrono de un escenario. Entre fotogramas siempre hay consistencia:
  - las órdenes se representan dentro del manejador que las ejecuta;
  - la producción y las muertes se vacían dentro del fotograma;
  - una unidad con `hp ≤ 0` todavía sin resolver sigue a la vez en el ECS y en el registro.

  En el menú, sin `World`, el registro debe estar vacío. La comprobación automática corre al final de la rama `PLAYING` de `animate`.

**Dónde se usa:**
- **Pruebas en Node:** después de cada paso. Un informe que no esté vacío hace fallar la prueba.
- **Desarrollo, automática.** Solo con `import.meta.env.DEV`: como mucho una vez por segundo de juego, con `console.error` una vez por problema distinto, y los recuentos se exponen en `read()` del diagnóstico. Es una consulta al ECS por segundo, no una conciliación, y no arregla nada.
- **`__gameDiagnostics.assertConsistency()`:** lanza un error con el informe si no está vacío. Playwright la llama después de cada operación.
- **Producción:** el bloque queda detrás de `import.meta.env.DEV`. El plan comprueba en `dist/` que no aparece el texto del error, como en R4 y R5.

**Operaciones de diagnóstico nuevas** (solo desarrollo, en `__gameDiagnostics`):
- `assertConsistency()`.
- `lifecycleCounts()`.
- `screenPointFor(x, z)`: proyecta un punto del mundo a coordenadas de pantalla. Solo lee la cámara.
- `setHealth(entity, value)`: la generalización de `setNexusHealth` a cualquier entidad viva (aclaración 8).
  - Usa las mismas validaciones: solo en `PLAYING`, un valor finito y `≥ 0` recortado a `health.max`, y un error si la entidad no tiene `health`.
  - **Solo escribe `health.current`.** Nunca quita entidades ni fija el resultado. La destrucción y, en su caso, la victoria o la derrota las decide `DeathResolver` en el fotograma siguiente, por su camino normal.
- `setEnemyAiEnabled(enabled)`.
- `entities(filter)`: una lista de solo lectura de las entidades de una facción y un tipo, para elegir a quién aplicar `setHealth`.
- `readResources()`: devuelve `renderer.info.memory`, el recuento de geometrías y materiales únicos que cuelgan de la escena (un recorrido, solo al llamarla) y `CombatEffects.stats()`.

  **Limitación conocida:** el recorrido de la escena no detecta recursos de objetos que se sacaron de la escena sin liberarlos. Por eso la verificación principal de la liberación son los eventos `dispose` en Node (§6.1), y en el navegador se complementa con `renderer.info.memory.geometries` después de que el objeto se haya dibujado.

`setNexusHealth` se mantiene tal cual. Todas estas operaciones, incluida `setNexusHealth`, viven en el bloque `if (diagnosticsEnabled && diagnosticsSamples)`, y `diagnosticsEnabled` exige `import.meta.env.DEV`. Vite las elimina del bundle de producción. El plan lo verifica buscando en `dist/` un texto que solo exista en ellas (§6.3).

## 6. Pruebas

Se usan `tsx --test` y `node:test`, como ya hace el repositorio. Three.js funciona en Node sin WebGL (ya lo hacen `RewardEffectsView.test.ts` e `InstancedSoldierRenderer.test.ts`), y `THREE.Raycaster` sobre una `PerspectiveCamera` también.

### 6.1 Node

**Caracterización de lo que se mueve tal cual:**
- **`battlefieldMeshes.test.ts`.** Para cada fábrica fija:
  - el número y el tipo de hijos;
  - el tipo y los parámetros de cada geometría;
  - el color, el emisivo, la transparencia y el `side` de cada material;
  - las posiciones y rotaciones locales;
  - los `userData` (`head`, `ring`, `muzzleMesh`).

  Comprueba además que dos llamadas no comparten ni geometrías ni materiales. Los valores esperados se copian del código actual (627-805). El commit del movimiento se revisa con `git diff --color-moved`.
- **`HealthBar.test.ts`.** Escala y desplazamiento según la proporción de vida (también 0, 1 y negativos), orientación hacia la cámara y opción oculta.
- **`BattlefieldRemains.test.ts`.**
  - Se construye con un `CombatEffects` real.
  - Al llegar a 65 restos, se libera el más antiguo (eventos `dispose` de sus geometrías y materiales).
  - Hay un emisor por resto, con la escala de hoy.
  - `clear()` libera todo.
- **`strikeCinematics.test.ts`.** Los planos coinciden con la fórmula actual para artillería y para los ataques aéreos con varios rumbos.

**Ciclo de vida contra el dominio real** (`BattlefieldView.test.ts`). Usa `BattleSimulation`, los comandos de R4, `DeathResolver` y una escena con `InstancedSoldierRenderer` y `CombatEffects` reales. **Después de cada paso, `checkVisualConsistency` debe dar un informe vacío.**
1. **`attach` + Nexos:**
   - dos entradas con los ids de las bases;
   - barras llenas;
   - el escudo es hijo del Nexo y está oculto.
2. **Construir con `buildStructure`** (jugador y enemigo):
   - una entrada por cada aceptación;
   - repetir `structureBuilt` con la misma entidad lanza un error y el registro no cambia;
   - un rechazo (`insufficient-gold`, `too-close`) no crea entrada.
3. **Producir:**
   - `trainUnit` + `advance` hasta terminar → `unitsProduced` crea un fusilero instanciado y un tanque con malla y barra;
   - devuelve cuántos son del jugador;
   - el contador `produced` sube.
4. **Sincronizar:**
   - el daño (`applyDamageSystem`) se ve en la barra y en `soldiers.setHealth`;
   - el movimiento (`advance`) se ve en la posición;
   - la orientación sigue a `targeting.target`, también en las torretas.
5. **Morir:** vida a 0 → `DeathResolver` → `deathsResolved`:
   - el visual sale del registro y de la escena;
   - hay un resto más;
   - los recursos exclusivos reciben `dispose`;
   - los compartidos (lotes de soldados, pools de efectos) **no**;
   - las descripciones de explosión salen en el orden de los eventos y con las escalas de hoy (0,6 / 1,2 / 3,0 nuclear);
   - el orden entre efectos y restos es el de hoy.
6. **Vender** con `sellStructure` → `removedWithoutEffects(…, 'sold')`: sin restos ni explosión, con `dispose` y contador.
7. **Borrado de diagnóstico** con `removeEntity` → `removedWithoutEffects(…, 'diagnostic')`, con `dispose` de los edificios, que hoy falta.
8. **Destrucción del Nexo:**
   - la entrada desaparece;
   - el escudo recibe `dispose` **una sola vez**;
   - no se crea ruina (como hoy);
   - la explosión es nuclear.
9. **`clear()` y partida nueva:**
   - todo lo exclusivo recibe `dispose`;
   - `soldiers` queda a 0;
   - la escena vuelve a la línea base de hijos;
   - `attach` de un **`World` nuevo** y `structureBuilt(1)` funcionan sin choque;
   - `attach` sin `clear` lanza un error, igual que un alta sin `World`;
   - `clear()` dos veces seguidas no falla.
10. **La comprobación detecta fallos provocados:**
    - una entidad dibujable sin visual;
    - un visual huérfano;
    - un tipo distinto;
    - una entidad exenta que tiene visual;
    - una exención caducada.

**Solo lectura:**
- Congelación profunda (`Object.freeze`) de todos los componentes y después `syncUnitsAndTurrets`, `syncStructures`, `syncShields` y cada operación del ciclo de vida: no hay excepciones.
- Instantánea del ECS antes y después de un fotograma de presentación: son iguales.
- Prueba de compilación de `WorldReader`.

**`ProjectileView.test.ts`:**
- un disparo de fusil y uno de tanque o torreta dan la misma clasificación que hoy daba `targetObjects`;
- el destello solo sale en el fusil;
- el impacto libera la malla;
- un proyectil que desaparece sin evento se libera en `sync`;
- con el pool agotado no hay visual ni error, y la clasificación (el sonido) se devuelve igual.

**`PlacementGhost.test.ts`:**
- `show` → `hide` dispara `dispose` en cada geometría y material del fantasma;
- `show(a)` → `show(b)` libera el de `a`;
- `hide()` dos veces no falla;
- ningún recurso de los demás visuales de la escena recibe `dispose`;
- `placementAt` respeta la zona y el redondeo con un `Raycaster` real.

**HUD de barracas.** Con varias barracas, de las que una se destruye y otra se vende, `liveFactories` da el mismo conjunto y el mismo orden que el filtro antiguo sobre la lista de inserción.

**Prueba de límites, `rendering/presentationBoundary.test.ts`.** Sigue el modelo de `rewardExecutionBoundary.test.ts` y recorre los módulos de producción de `rendering/` y `dev/visualConsistency.ts`. Falla si alguno:
- importa como **valor** algo de `game/commands/`, `ecs/systems.ts`, `ecs/BattleSimulation.ts`, `ecs/initialBattle.ts`, `ecs/World.ts`, `match/DeathResolver.ts`, `match/rewardExecution.ts`, `match/shield.ts`, `match/MatchState.ts` o `dev/diagnosticStructures.ts`;
- importa `ecs/World.ts` **incluso como tipo**;
- usa `document`, `window` o `navigator`. Es una excepción documentada: `MapCameraController` y `ThreeRenderCoordinator` ya los usan hoy y no se tocan.

Además, ningún módulo de `game/**` puede importar `three`, `rendering/`, `ui/` ni `platform/`. La prueba incluye muestras que demuestran que reconoce cada forma de importación.

### 6.2 Navegador (`playwright-cli`, procedimiento del plan)

Se usa el servidor de desarrollo con `?diagnostics=1`. Antes de empezar se registran `pageerror` y la consola. Cada paso afirma tres cosas:
1. el contador de su camino en `lifecycleCounts()` cambia exactamente lo esperado;
2. `assertConsistency()` no lanza;
3. los recursos (`readResources()`) se mueven en la dirección esperada.

| Paso | Camino | Cómo | Qué más se afirma |
|---|---|---|---|
| 0 | Menú | Cargar | Registro vacío; línea base de geometrías del menú |
| 1 | C1 | Empezar la partida con `setEnemyAiEnabled(false)` | `built` = 2; ids = bases del ECS |
| 2 | C2 | **Interfaz real:** menú de construcción → `mousemove`/`click` en `screenPointFor(x, z)` | `built` +1; el oro baja |
| 3 | Fantasma | ×20: elegir tipo → mover sobre el terreno (para que se dibuje) → Escape; y ×20 cambiando de tipo sin cancelar | Las geometrías vuelven al valor de antes de la serie |
| 4 | C6 | **Botón real** de entrenar | `produced` +1 al terminar la orden |
| 5 | C10 | **Modo vender real** → tocar el edificio en su `screenPointFor` | `sold` +1; el registro −1; las geometrías bajan |
| 6 | C8 | `setHealth(unidad, 0)` + un fotograma | `unitDied` +1; un fusilero menos en el lote instanciado; un resto más |
| 7 | C9 | `setHealth(estructura enemiga, 0)` + un fotograma | `structureDestroyed` +1; una ruina |
| 8 | C3 | `setEnemyAiEnabled(true)`; esperar a la primera estructura de la IA | `built` del enemigo +1 |
| 9 | C8/C9 en combate real | `runCombatScenario` corto con `assertConsistency()` cada segundo | Muchas altas y bajas, informes vacíos |
| 10 | C11 | `prepareRewardScenario('no-target')` y después `'ready'` | `discarded` = edificios + unidades quitadas; las geometrías bajan; después `built` +5 |
| 11 | C5 | `runStressScenario` | Ninguna excepción caducada y consistencia entre fotogramas |
| 12 | C9 Nexo | `setNexusHealth('enemy', 0)` | En `MATCH_ENDING`: no está en el ECS ni en el registro y no hay error. En `GAMEOVER`: registro vacío, `clears` +1 |
| 13 | C12 + C1 | Partida nueva | Los Nexos vuelven a tener los ids 1 y 2; sin `pageerror` por duplicado |
| 14 | Repetición | 3 ciclos de partida corta → vuelta al menú | Geometrías y texturas iguales a las del paso 0; recuento de la escena como complemento |

Se repite en el perfil móvil emulado de §6 del informe de rendimiento. Sin teléfono real, se dirá.

### 6.3 Comprobaciones de cierre

- `npm test`, `npm run typecheck` y `npm run build`, después de cada tarea que toque producción.
- Búsqueda en `dist/` del texto de error de la comprobación de desarrollo y de un texto propio de `setHealth`: sin resultados.
- `graphify update .` al final; se comprueba con el grafo nuevo que no aparecen ciclos, sabiendo que esto complementa la prueba de límites y no la sustituye.

## 7. Rendimiento y recursos

- **Por fotograma:** el mismo número de consultas `getComponent` que hoy por unidad y edificio. Desaparecen las escrituras de las copias. No hay pasadas nuevas sobre el ECS ni asignaciones por entidad. Los arrays de descripciones de explosión y de clasificación de disparos se reutilizan (patrón `length = 0`).
  - **Solo en desarrollo** se añade una consulta al ECS por segundo, que no existe en producción.
- **Draw calls, triángulos y número de objetos:** iguales, porque las mallas y las barras son las mismas.
- **Validación**, con la batería de §6 del informe de rendimiento en los perfiles de escritorio y móvil emulado, comparada con R0, R3, R4 y R5:
  1. draw calls medios y máximos;
  2. visuales activos y en pool: `projectiles`, `cachedProjectiles`, `soldiers`, partículas, emisores;
  3. geometrías y texturas (`renderer.info`) y materiales únicos de la escena;
  4. liberación al desaparecer unidades y edificios (pasos 5-7 y 10 de §6.2);
  5. liberación al terminar la partida (paso 12);
  6. liberación al volver al menú y empezar otra (pasos 13-14): tres combates seguidos y la partida siguiente deben volver a las mismas geometrías que en R0-R5 (23 en escritorio, 22 en móvil emulado);
  7. sincronización con el perfil móvil emulado, con la limitación de CPU de ese perfil. No hay interpolación: el visual toma la posición del ECS en cada fotograma, igual que hoy.

  Criterio: métricas estructurales iguales y `gameplayOtherMs` sin aumento claro. No se presenta ninguna mejora sin medición.
- **Métrica de la IA:** con la opción A, las estructuras de la IA se siguen creando dentro del tiempo que se mide como IA, así que `aiMs` y sus picos no cambian por R6.

## 8. Cambios de comportamiento declarados

1. **El fantasma se libera** al cancelar, al cambiar de edificio, después de construir, al desmontar y al empezar el fin de partida. Desaparece una fuga de geometrías y materiales.
2. **El escenario de recompensas libera** los edificios enemigos que borra (solo desarrollo).
3. **El escudo del Nexo se libera una sola vez.**
4. **El tipo de disparo se lee del ECS** (`soldierKind`) en lugar de `targetObjects`. Es equivalente (§5.4).
5. **Los Nexos se representan después** de construir la simulación, desde el ECS. Se añaden a la escena en el mismo orden relativo (jugador → enemigo) y sin otros objetos entre medias.
6. **Si falta un componente durante la sincronización,** el dato no se actualiza, en lugar de volver a dibujar la copia antigua. El resultado visible es el mismo.
7. **Operaciones de diagnóstico nuevas** (§5.9) y comprobación automática en desarrollo. Nada de esto existe en producción.

Nada más cambia. En concreto no cambian el equilibrio, la IA, los comandos, los tiempos de R5, el escudo, la cámara, los gestos, la UI ni el orden del fotograma.

## 9. Fuera de alcance (se registra, no se corrige)

| Asunto | Motivo |
|---|---|
| Reorganizar la UI, el HUD, los menús, las tarjetas de recompensa y el ritmo de `updateResourceUI` | R7 |
| Dejar `GameApplication` como raíz de composición | R8 |
| Espejos `gold`/`enemyGold` y respaldo de `getFactionGold` | No son render; R7/R8 |
| Extraer `SFX` y los hápticos | No son render (R1 lo aplazó) |
| Temblor de cámara dentro de `MapCameraController` | Toca el comportamiento de la cámara |
| Compartir geometrías y materiales entre barras, tanques y edificios | Optimización no pedida |
| `enemyAIEnabled` no se restablece al empezar otra partida | Hallazgo conocido de la auditoría §9; los pasos de §6.2 lo fijan de forma explícita |
| Zona de construcción duplicada entre el raycast y `placement.ts` | Menor aplazado de R4 |
| `aiMs` incluye la creación de mallas | Medición; no es una regresión |
| Terreno sin liberar al cerrar la aplicación | Vive lo que vive la aplicación; `battlefieldScene` expone `dispose` y el plan decide si se llama desde `dispose()` (§11) |
| Duración de partida con reloj real; dos mecanismos de fin de partida; sistema de desbloqueos | Decisiones de producto pendientes |
| `README_UNLOCKS.md` desactualizado | Documentación aparte |

## 10. Riesgos

| Riesgo | Mitigación | Vuelta atrás |
|---|---|---|
| Un camino deja de avisar o avisa dos veces | Protección contra duplicados, comprobación de desarrollo, pruebas por camino en Node y en el navegador | Cada tarea es un commit; `git revert` |
| Cambia el orden de los efectos o de los pools | `deathsResolved` ejecuta la misma secuencia; prueba del orden; comparación visual en el navegador | Igual |
| Se libera un recurso compartido | Regla de propiedad de §5.5; pruebas que escuchan `dispose` en los compartidos | Igual |
| Un registro viejo choca con el `World` nuevo | `attach` exige el registro vacío; pasos 9 (Node) y 13 (navegador) | Igual |
| El movimiento de las fábricas cambia algún detalle | Movimiento literal, `git diff --color-moved`, pruebas de estructura, captura en el navegador | Igual |
| Coexisten el registro viejo y el nuevo | El plan ordena las tareas para que cada lista vieja desaparezca en la misma tarea que la sustituye (§11) | — |
| `README.md` y la auditoría quedan desactualizados | Se actualizan en la tarea de cierre | — |

## 11. Para el plan (lo deja abierto el diseño)

**Orden sugerido**, de modo que no convivan dos registros:
1. Pruebas de caracterización y la prueba de límites con `WorldReader` (solo pruebas y tipos).
2. Movimiento literal de `battlefieldMeshes`, `HealthBar`, `BattlefieldRemains`, `battlefieldScene` y `strikeCinematics`. `GameApplication` las usa sin cambiar el comportamiento.
3. `PlacementGhost` con la corrección de la fuga.
4. `ProjectileView`. `targetObjects` pierde su único lector.
5. `BattlefieldView` con todos los caminos C1-C12 en una sola tarea. En esa misma tarea desaparecen `RuntimeStructure`, `RuntimeUnit`, `targetObjects`, las cuatro listas, `playerHQ`/`enemyHQ` y las copias, y se reconectan los consumidores de §5.8.
6. Comprobación de consistencia y operaciones de diagnóstico.
7. Navegador, recursos, medición, `dist/`, `graphify update` e informe de entrega.

**Decisiones menores que tomará el plan:**
- el nombre exacto de los métodos;
- el reparto de los archivos de prueba;
- si `battlefieldScene.dispose()` se llama desde `dispose()` del runtime;
- los valores concretos de los puntos de pantalla del procedimiento.

## 12. Decisiones aprobadas por el usuario (2026-11-21)

1. **El audio, los hápticos y el temblor se quedan en `GameApplication`.** La vista solo devuelve `ExplosionCue`, un tipo de datos, y no depende del audio, de los hápticos ni de `MapCameraController` (§5.3).
2. **Registrar dos veces la misma entidad lanza un error,** para que un fallo del ciclo de vida se vea en lugar de quedar oculto.
3. **Componente que falta:**
   - si la entidad existe, se conserva el último estado visual y se informa en desarrollo;
   - si la entidad ya no existe, su visual solo se quita por el camino explícito del ciclo de vida (§5.3).
4. **Fases de muerte:** se conserva el orden actual de los efectos de unidades y edificios. La presentación usa solo los datos del evento (posición, facción y tipo), que siguen disponibles aunque la entidad ya no exista (§5.3).
5. **`syncUnitsAndTurrets`:** el nombre dice lo que hace. Su lugar en el fotograma no cambia.
6. **`rendering/` no importa `World`, ni siquiera como tipo.** Usa `WorldReader` y los tipos de componentes de solo lectura.
7. **El fantasma se recrea** al cambiar de edificio, después de liberar los recursos exclusivos del anterior. No se añade reutilización ni caché.
8. **`setHealth(entity, value)` se añade junto a `setNexusHealth`.** Las dos son solo de desarrollo y quedan fuera del bundle de producción. Solo modifican la vida en el ECS: nunca quitan entidades ni fijan el resultado, y la destrucción la decide `DeathResolver` (§5.9).
9. **El diseño y el plan de R6 están en español.**

## 13. Informe de entrega

### 13.1 Commits

Todos están en `main`, después del diseño (`38b0ae7`) y del plan (`d8fb2f1`):

1. `1438b55` test(rendering): el contrato de solo lectura (`WorldReader`) y la prueba de límites de la presentación. **Solo pruebas y tipos.**
2. `c6b351d` la prueba de límites compara las rutas de importación resueltas.
3. `0a97008` fábricas de mallas, barras de vida y restos fuera de `GameApplication` (movimiento literal).
4. `5d3c1ad` terreno, soldados del menú y planos de cámara de los ataques fuera de `GameApplication`.
5. `23ee9cd` el fantasma de construcción es dueño de sus recursos y los libera al cancelar, al cambiar y al desmontar.
6. `24238af` los visuales de los proyectiles pasan a `ProjectileView`, que lee el tipo del tirador del ECS.
7. `0351771` `BattlefieldView` es dueño de los visuales por `Entity` y la aplicación pierde sus copias de juego.
8. `38fe490` comprobación del registro contra el ECS y operaciones de diagnóstico del ciclo de vida.
9. `76812b9` comprobación de consistencia después de cada paso en las pruebas de `BattlefieldView` (ronda de corrección de la revisión de la Tarea 7).
10. El commit de cierre (este informe, README, auditoría, informe de rendimiento y casillas del plan).

**Decisiones del controlador durante la ejecución:**

- **R1:** `EXTRA_PRESENTATION_MODULES` sigue siendo una constante privada de `presentationBoundary.test.ts`; la Tarea 7 la cambió a `['dev/visualConsistency.ts']` en el mismo sitio.
- **R2:** `BattlefieldView` crea y posee su propio `BattlefieldRemains` (§5.3: `clear()` vacía los restos); la instancia que la Tarea 2 dejó en `GameApplication` se borró en la Tarea 6.
- **R3:** la prueba de compilación con `@ts-expect-error` vive en una función que nunca se llama; la comprobación la hace `npm run typecheck`.
- **R4:** la búsqueda del paso 6 de la Tarea 6 no tenía límites de palabra y encontraba el campo de dominio `matchState.playerUnitsLost`. En el cierre se repite con límites de palabra (§13.2).

### 13.2 Pruebas y comprobaciones

- **`npm test`:** 463 de 463, frente a 391 antes de R6. Las nuevas: `WorldReader.test.ts`, `presentationBoundary.test.ts`, `battlefieldMeshes.test.ts`, `HealthBar.test.ts`, `BattlefieldRemains.test.ts`, `battlefieldScene.test.ts`, `strikeCinematics.test.ts`, `PlacementGhost.test.ts`, `ProjectileView.test.ts`, `BattlefieldView.test.ts` y `visualConsistency.test.ts`, más ajustes en `trainCommand.test.ts` y `testUtilitiesBoundary.test.ts`.
- **`npm run typecheck`:** sin errores.
- **`npm run build`:** código de salida 0. Avisa de un fragmento de más de 500 kB (`index-*.js`, 694,85 kB; 184,36 kB con gzip), como antes de R6 (690,81 kB en R5).
- **`dist/`:** no aparecen «Visual consistency failed» (texto del error de la comprobación) ni «Entity health must be a finite number» (texto propio de `setHealth`). Como control, «Ubicación ocupada» y «BattlefieldView already has a World attached», textos de producción, sí aparecen.
- **Copias de juego en `GameApplication.ts`** (con límites de palabra, decisión R4): `grep -nwE "RuntimeStructure|RuntimeUnit|targetObjects|playerBuildings|enemyBuildings|playerUnits|enemyUnits|playerHQ|enemyHQ"` y `grep -nE "\.(hp|maxHp)\b"`: sin resultados.
- **Grafo** (`graphify update .`; `built_at_commit` = `76812b9`, 1.617 nodos y 3.921 aristas):
  - Tarjan sobre las 258 aristas de importación entre ficheros de producción de `web/src`: ningún componente fuertemente conexo, ni con todas las aristas ni solo con las de valor (174). Mi análisis de las importaciones reales de los 80 `.ts` de producción da las mismas 258 aristas, sin diferencias con el grafo. Es un complemento de la prueba de límites, no la sustituye.
  - **Comunidades de `rendering/` (información, no criterio):** `BattlefieldView` con `HealthBar`; `battlefieldMeshes` con `PlacementGhost`; `CombatEffects` con `BattlefieldRemains`; `ProjectilePool` y `ProjectileView` con `game/ecs/systems.ts` (vocabulario común de proyectiles; `ProjectileView` no importa `systems.ts`); `battlefieldScene` con `TerrainGrid`; `strikeCinematics` sola; `RewardEffectsView` con `ballisticArc`. `GameApplication.ts` queda con `game/ai/aiSnapshot`, `executeEnemyTurn` y tres comandos, sin ningún módulo de `rendering/` (antes de R6 compartía la comunidad 21 con `TerrainGrid`, §3.6).

### 13.3 Navegador (§6.2 y comprobaciones añadidas por las revisiones)

Chrome 155 headless con GPU (Intel UHD 620 por Vulkan), servidor de desarrollo con `?diagnostics=1&overlay=0` y `playwright-cli`. Sin el panel en vivo, para que no tape los puntos que se tocan; la API es la misma. Se usó la interfaz real (botones, y clics o toques en el canvas en `screenPointFor(x, z)` calculado justo antes). Los errores se recogieron en la propia página (`error`, `unhandledrejection`, `console.error` y `console.warn`), porque `pageerror` no se puede escuchar entre llamadas de `playwright-cli`; una prueba con un error provocado confirmó que se capturan. **Sin errores ni avisos en ningún paso.** El informe completo, con la salida de cada `eval`, está en `.superpowers/sdd/2026-11-21-r6-separacion-de-la-presentacion/task-8-report.md`.

`lifecycleCounts()` acumula por página, y empezar una partida suma también `clears +1` (el desmontaje previo). El tamaño del registro se lee como `entities().length`, porque `assertConsistency()` demuestra que coincide con el registro.

**Escritorio (1280×720):**

| Paso | Resultado |
|---|---|
| 0 Menú | Contadores a 0, `entities()` vacío, consistencia correcta. Línea base: 95 geometrías, 1 textura, 94 geometrías y 103 materiales en la escena |
| 1 C1 | `built` +2; Nexos `[1, 2]` |
| 2 C2 | Barraca en `(10, 30)`: `built` +1, oro −150, geometrías 22 → 27 |
| 3 Fantasma | 27 antes; 29 con el fantasma visible; 27 después de cada serie de 20 |
| 3b | Torreta sobre la barraca: «Ubicación ocupada»; el fantasma sigue (+3 geometrías) y sigue al puntero; Escape → 27 |
| 4 C6 | `produced` +1 a los 2,0 s; el HUD pasa de «1 disponible» a «0 disponibles · Soldado 1,9 s» y vuelve |
| 6 C8 | `setHealth(fusilero, 0)`: justo después sigue en `entities()` y los contadores no cambian; 100 ms después, `unitDied` +1, fusileros del jugador 1 → 0, dos emisores nuevos (cadáver y explosión) |
| 5 C10 | Toque en el Nexo: nada. Toque en la barraca: `sold` +1, registro −1, geometrías 40 → 35. Toque en la barra de vida de un generador: `sold` +1, registro −1, geometrías 35 → 30 |
| 7 C9 | `prepareRewardScenario('ready')` y `setHealth(torreta, 0)`: `structureDestroyed` +1; explosión y ruina en la captura |
| 8 C3 | Partida nueva con la IA activa: su primer generador a los 0,8 s, `built` +1 |
| 9 C8/C9 | Combate de 12 s con `assertConsistency()` cada segundo: 12 comprobaciones sin fallos; `produced` +16, `unitDied` +5 |
| 10 C11 | Con 1 barraca y 2 fusileros enemigos: `discarded` +3; geometrías de la escena 33 → 28; después `'ready'`: `built` +5 |
| 11 C5 | `runStressScenario(10, 200)`: consistencia correcta, sin `staleExemption` |
| 12 C9 Nexo | En los tres primeros fotogramas de `MATCH_ENDING` la base enemiga no está en `entities()` y la consistencia es correcta. En `GAMEOVER` (4,0 s): registro vacío, `clears` +1, «VICTORIA» |
| 13 C12 + C1 | «Jugar de nuevo»: Nexos `[1, 2]`, sin errores de duplicado |
| 13b | Fantasma de barraca, artillería real en vuelo, pausa y «Reiniciar batalla»: sin errores, consistencia correcta, 0 ataques activos. Geometrías 25 frente a 24 tras el paso 13 (ver abajo); repetido: 25 → 25 |
| 14 | Tres ciclos de partida → combate → menú: 98 geometrías en los tres, 1 textura, 94 geometrías y 103 materiales en la escena. El paso 0 dio 95 (ver abajo) |

- **El paso 6 se ejecutó antes que el 5.** Con el zoom automático, la cámara siguió al fusilero hasta el Nexo enemigo y el punto `(−10, 30)` quedó fuera de la pantalla: el primer toque para el generador no construyó nada. Al morir el fusilero volvió la cámara y el paso 5 se hizo tal cual.
- **Paso 10:** `renderer.info` no bajó (24 → 24) porque la barraca enemiga descartada nunca se había dibujado: estaba fuera del encuadre y `renderer.info` solo cuenta lo que se ha subido a la GPU (limitación de §5.9). La liberación con objetos dibujados la muestra la comprobación 3 de abajo.
- **Geometrías por encima de lo esperado en los pasos 13b y 14 (+1 y +3).** Solo cambia `renderer.info.memory.geometries`; las geometrías y materiales de la escena y las texturas son iguales a la línea base. Una ejecución de control en una página nueva lo explica:
  - menú 95 → tras una partida sin disparos 95 → tras un combate 96 → tras otro 96 → tras una artillería 97 → tras otra 97;
  - son tres geometrías compartidas que viven lo que vive la aplicación y que `renderer.info` cuenta desde que se dibujan por primera vez: las dos de `ProjectilePool` (`light` y `heavy`) y la de los proyectiles de artillería de `RewardEffectsView` («only released by dispose()»);
  - ninguna la cambió R6, y no crecen: el paso 13b repetido y los tres ciclos del paso 14 se quedan iguales.

  No es una fuga, pero **el valor literal esperado no se cumple**, porque la línea base se tomó antes de que se usaran por primera vez. Se deja anotado así, sin cambiar la expectativa.

**Comprobaciones añadidas por las revisiones de las Tareas 6 y 7:**

| # | Resultado |
|---|---|
| 1 | Sin errores «already» ni «no World attached» con «Jugar de nuevo» ni al volver al menú tras una victoria |
| 2 | `assertConsistency()` correcto en el menú después de salir, con `entities()` vacío |
| 3 | Tres veces `'no-target'` y `'ready'` en la misma partida: geometrías 30 ↔ 24, geometrías de la escena 58 ↔ 28, objetos de escena 40 cada vez. En R5 cada llamada sumaba de 3 a 12 geometrías (§10.5 del diseño de R5) |
| 4 | En modo vender, el toque en la barra de vida vende el edificio; ni el cuerpo ni la barra del Nexo venden |
| 5 | Instrumentando el audio (`AudioBufferSourceNode.start`) y `navigator.vibrate` en la página: una torreta destruida da un sonido de explosión y un temblor (3 px por fotograma como máximo, 0 en reposo). Dos torretas y el Nexo en el mismo fotograma dan dos sonidos normales, uno nuclear y una vibración de 400 ms. **El temblor nuclear no se ve** (0 px): `cameraShake = 4,5` se fija, pero solo se aplica en `updateCombat`, que se detiene en `MATCH_ENDING`. Ya era así en `38b0ae7`, así que no es de R6 |
| 6 | El escudo del Nexo del jugador (tarjeta real) se ve solo mientras está activo y desaparece en cuanto `prepareRewardScenario` lo reinicia. La pulsación (±3,5 %) no se puede medir en capturas con la cámara en movimiento; la fija la prueba de `BattlefieldView`. El escudo enemigo no se inspeccionó en pantalla |
| 7 | Con dos barracas, el HUD muestra «2 Barraca(s)» y una línea por orden (fusilero y tanque), y vuelve a «2 disponibles» al terminar |
| 8 | El resumen tras el escenario de estrés da 5 soldados entrenados (los 5 fusileros del jugador); el combate mantiene la producción de los dos bandos |
| 9 | La victoria muestra un 100 % de daño a la base enemiga (al terminar la animación del contador) |
| 10 | Partida real de 204 s (escritorio) y de 202 s (móvil emulado) con la IA activa: `visualInconsistencies` = 0 en todas las lecturas y ningún `console.error`. El Nexo del jugador se mantuvo con `setNexusHealth` para que la partida durase. También 0 en el escenario de estrés y en el de recompensas |
| 11 | `screenPointFor` acierta: los toques en `(10, 30)` y `(−10, 30)` construyen, chocan y venden el edificio previsto |
| 12 | `setHealth(entidad, 0)` no quita nada en el acto; el ciclo normal de muerte llega en el fotograma siguiente (pasos 6 y 7) |

**Móvil emulado** (412×915, DPR 2,625 → 1,5, táctil; **sin teléfono real**). Filas 0, 1, 2, 4, 5, 6, 9, 12, 13 y 14, con toques, y las comprobaciones 3, 4, 7 y 10:

- iguales que en escritorio, salvo los valores propios del perfil (21 geometrías al empezar la partida frente a 22, y 0 texturas porque no hay sombras);
- en el menú, las geometrías suben de 67 a 95 en los primeros segundos: la cámara del menú gira y las va subiendo según entran en el encuadre. La línea base es 95;
- paso 14: 97 en el menú después de cada ciclo (+2 de `ProjectilePool`; en esta sesión no hubo artillería).

### 13.4 Recursos

| Momento | Escritorio | Móvil emulado |
|---|---:|---:|
| Menú al cargar (línea base) | 95 geometrías · 1 textura | 95 · 0 |
| Partida nueva | 22 | 21 |
| Fantasma visible / tras cancelar (×20, ×20) | 29 / 27 | – |
| Barraca vendida / generador vendido | −5 / −5 | −5 / −5 |
| `'no-target'` ↔ `'ready'`, tres veces en la misma partida | 24 ↔ 30 | 23 ↔ 29 |
| Fin de partida (`GAMEOVER`) | 17 | 17 |
| Partida nueva tras combates (batería de §6) | 23 | 22 |
| Menú tras tres ciclos de combate | 98 (95 + 3 compartidas) | 97 (95 + 2 compartidas) |

- **Texturas:** 1 en escritorio (el mapa de sombras) y 0 en móvil emulado, en todo momento.
- **Geometrías y materiales de la escena** (`sceneGeometries` / `sceneMaterials`): en el menú, 94 / 103 antes y después de todas las partidas, en los dos perfiles.
- **Lo que libera R6, comprobado en el navegador:**
  - el fantasma: las geometrías vuelven al valor previo tras 40 cambios y cancelaciones (§8.1);
  - el escenario de recompensas ya no acumula: 24 ↔ 30 estable, frente a +3…+12 por llamada en R5 (§8.2);
  - vender y morir quitan las geometrías exclusivas del edificio (−5 por barraca o generador vendido).
- **Lo que no baja y por qué:** las dos geometrías de `ProjectilePool` y la de los proyectiles de artillería son compartidas, se suben a la GPU la primera vez que se dibujan y viven lo que vive la aplicación. Por eso el menú pasa de 95 a 96-98 después del primer combate o la primera artillería y ya no se mueve (§13.3). R6 no las cambió.

### 13.5 Medición

En `docs/performance/2026-11-14-referencia-rendimiento.md` §8.6:

- sin cambios estructurales: draw calls, geometrías y la repetición (105 y 90 geometrías tras tres combates; 23 y 22 en la partida siguiente) coinciden con R0-R5;
- ritmo de la IA igual (1 llamada por fotograma, 1,40 decisiones/s);
- resto gameplay sin aumento claro: 0,43-0,46 ms en partida y 1,12-1,22 ms en combate de escritorio (R5: 0,42-0,47 y 1,15-1,19), 1,00-1,06 ms en combate de móvil emulado (R5: 0,97-1,03);
- la primera ejecución del combate de escritorio fue atípica en todos los componentes, también en los que R6 no toca, y se repitió dos veces;
- carga del portátil ~2,3-4,7. No se presenta ninguna mejora.

### 13.6 Limitaciones y lo no verificado

- **Sin dispositivo real.** Todo se comprobó y midió en Chrome headless del portátil, con el perfil móvil emulado.
- **Orden de los efectos:** la equivalencia con el orden anterior se apoya en las pruebas de Node (orden de `deathsResolved` y de las señales) y en la captura visual; en el navegador solo se comprobó un sonido por muerte y la secuencia nuclear.
- **Expectativas literales de los pasos 13b y 14:** no se cumplen por las geometrías compartidas que se suben la primera vez (§13.3). Se dejó anotado sin cambiar la expectativa.
- **Lo que el diagnóstico no expone:** el número de restos (`stats().remains`) y el tamaño del registro. Se leyeron a través de `sceneObjects` y los emisores (restos) y de `entities()` junto con `assertConsistency()` (registro).
- **`renderer.info` solo cuenta lo dibujado** (§5.9): en el paso 10, la barraca enemiga descartada no se había dibujado y su liberación se ve en las geometrías de la escena, no en `renderer.info`.
- **Escudo:** la pulsación no se midió en el navegador (la fija la prueba de Node) y el escudo enemigo no se inspeccionó en pantalla.
- **Toque en la barra de vida en escritorio:** los píxeles de la barra se solapan con el borde superior del edificio, así que el rayo pudo dar en la barra o en la caja; las dos llevan a la misma entidad. En móvil emulado sí se tocó la barra fuera del cuerpo del Nexo.
- **El paso 6 se ejecutó antes que el 5** (§13.3).
- **El reinicio del portátil** a mitad de la tarea borró los scripts y capturas del directorio temporal. Los resultados ya estaban anotados; solo se repitieron la partida larga en móvil emulado y la batería de medición.

**Registrado, sin corregir:**

- **Observación anterior a R6:** el temblor de la explosión nuclear no se ve, porque `cameraShake` solo se aplica en `updateCombat`, que deja de ejecutarse en `MATCH_ENDING`; `updateMatchEnding` solo lo reduce. El sonido nuclear y la vibración sí ocurren. Igual en `38b0ae7`.
- **Procedimiento del plan:** las líneas base de geometrías del menú y de la partida deberían tomarse después de un primer combate y una primera artillería, o comparar `sceneGeometries`, para no contar las geometrías compartidas que se suben la primera vez.
- **Menores de las revisiones de las tareas:**
  - **Tarea 1:** las listas de ficheros vigilados no comprueban que no estén vacías (riesgo de pasar en vacío); la prueba del clasificador no prueba cada regla con una muestra negativa ni una importación de varias líneas; el clasificador es conservador en algunos casos (por defecto + `{type A}` cuenta como valor; `typeof import()` como valor; coincidencias en comentarios o cadenas); `rendering/` se recorre sin subcarpetas (hoy no hay); las reglas ancladas de `game/` ya no encajarían en subcarpetas hipotéticas `game/ui` o `game/platform` (no existen).
  - **Tarea 2:** las pruebas de las fábricas no fijan los segmentos por defecto de Three.js; los restos se fijan solo por número de hijos y el material compartido de la ruina de la barraca no está documentado (anterior a R6; liberar dos veces es inocuo); el `+ 0` para `-0` en `HealthBar.test`; `!diagnosticsOptions || diagnosticsOptions.bars` repetido cuatro veces en `GameApplication`.
  - **Tarea 3:** `BattlefieldTerrain.dispose()` no se usa en producción (lo pide el diseño); `let menuSoldiers` sin inicializar hasta `init`; el respaldo del origen del proyectil enemigo difiere solo durante el desmontaje; la prueba de `clear` de los soldados del menú solo mira el primero.
  - **Tarea 4:** las pruebas del borde de la zona (z = 5 y z = 73) dependen del valor exacto del raycast en el límite exclusivo; «liberado antes de añadir el fantasma nuevo» no se comprueba por orden; la guarda de `selectBuildingToPlace` antes de `init`; `dispose()` equivale a `hide()`.
  - **Tarea 5:** la prueba de congelación no tenía un canario (se añadió en la Tarea 6); el filtro de omisión solo cubre la falta de facción del origen; la prueba del número de impactos deriva lo esperado de sus propias entradas.
  - **Tarea 6:** `prepareRewardScenario` llama a `syncShields` antes de los descartes (el brief decía después; sin efecto visible); `dispose()` del runtime no limpia los visuales de una partida en curso (anterior a R6).
  - **Tarea 7:** `checkVisualConsistency` asigna memoria en cada llamada (solo desarrollo, una vez por segundo); la prueba de categorías no comprueba que las demás estén vacías ni cubre la falta de `transform`; `describeInconsistencies` con un informe vacío; `staleExemption` detectado por la falta de facción; el `Set` de duplicados está fuera de la guarda de `DEV`; la prueba 3 de `missingVisual` depende del orden de recorrido del comprobador.
- **Sin cambios, como se acordó (§9):** R7 y R8, los espejos de oro, `SFX` y los hápticos, el temblor dentro de `MapCameraController`, compartir geometrías entre barras y edificios, `enemyAIEnabled` al empezar otra partida, la zona de construcción duplicada y `aiMs` con la creación de mallas.
- **Al terminar R6 no se empieza R7.**

### 13.7 Alcance

`git diff 38b0ae7 --stat`, con el commit de cierre preparado (sin contar `AGENTS.md`, un cambio del usuario sin confirmar que no forma parte de R6): 30 ficheros, 4.681 inserciones y 1.100 borrados.

- **Producción:** `GameApplication.ts` (+308 y −1.095 líneas), `game/ecs/WorldReader.ts`, `dev/visualConsistency.ts` y, en `rendering/`, `BattlefieldView.ts`, `ProjectileView.ts`, `PlacementGhost.ts`, `battlefieldMeshes.ts`, `HealthBar.ts`, `BattlefieldRemains.ts`, `battlefieldScene.ts` y `strikeCinematics.ts`.
- **Utilidad de prueba:** `rendering/presentationTestState.ts`.
- **Pruebas:** 13 ficheros `.test.ts`; dos ya existían (`trainCommand` y `testUtilitiesBoundary`).
- **Documentos:** README, auditoría, informe de rendimiento, este diseño y su plan.
- **Nada fuera de §5:** ni el ECS (salvo el tipo `WorldReader`), ni la IA, ni los comandos, ni la UI, ni el paso fijo. `ThreeRenderCoordinator`, `CombatEffects`, `ProjectilePool`, `InstancedSoldierRenderer`, `MapCameraController`, `RewardEffectsView`, `ballisticArc` y `TerrainGrid` no cambian.
