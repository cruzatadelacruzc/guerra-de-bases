# Auditoría de responsabilidades — `GameApplication.ts` y módulos relacionados

Fecha: 2026-11-14 · Commit auditado: `6985747` · Tipo: solo auditoría y propuesta (sin cambios de código)

Fase 0a del plan `docs/superpowers/specs/2026-11-14-ia-enemiga-ordenes-niebla-design.md`. Lo marcado como **verificado** se comprobó leyendo el código; lo marcado como **inferencia** no se ha medido ni ejecutado.

---

## 1. Resumen

- `web/src/GameApplication.ts` (2.974 líneas) es a la vez **raíz de composición, simulación de partida, render, audio, entrada, presentación de UI, IA y herramientas de diagnóstico**. Todo vive dentro de una única función, `createGameRuntime`, con **61 variables `let` y 37 constantes** compartidas por cierre, y 231 referencias a `THREE.`.
- El **núcleo ECS está bien separado**: `World`, `BattleSimulation` (paso fijo de 1/30 s con tope de pasos), `systems.ts` e `initialBattle.ts` no importan Three.js y tienen pruebas. También están bien aislados `GameFrameLoop`, `GameSession`, `GameInputController`, los ayudantes de render (`ProjectilePool`, `CombatEffects`, `InstancedSoldierRenderer`, `MapCameraController`) y la UI, que solo habla con el juego mediante el puerto `GameUiPort`.
- El problema está en lo que **no llegó al ECS**:
  - la muerte de unidades y edificios;
  - los puntos de combate (CP) y las rachas;
  - la victoria y la derrota;
  - el estado de las recompensas;
  - el **momento en que se aplica el daño de las recompensas**;
  - la construcción y venta de edificios;
  - la IA.

  Todo eso se ejecuta dentro del bucle de sincronización visual, al ritmo de los fotogramas, mezclado con mallas y efectos.
- `createGameRuntime` **no tiene ninguna prueba**. Las 117 pruebas existentes cubren los módulos que ya están fuera.

## 2. Mapa de responsabilidades actuales

### 2.1 Dentro de `GameApplication.ts` (verificado)

| Responsabilidad | Dónde (líneas aprox.) | Capa a la que pertenece |
|---|---|---|
| Tipos de objetos de partida con malla (`RuntimeStructure`, `RuntimeUnit`, `RuntimeProjectile`, `HealthBar`) | 64-99 | Render (hoy también hace de estado de juego) |
| Contrato de diagnóstico `window.__gameDiagnostics` | 100-125, 2726-2925 | Herramienta de desarrollo |
| Audio sintetizado (Web Audio, objeto `SFX`) | 127-141, 181-355 | Plataforma/audio |
| Contrato `UnlockService` | 143-159 | Progresión |
| Estado global de la partida (colecciones, oro espejo, CP, relojes, escudos, metas de la IA, selección de construcción…) | 365-420 | Mezcla: dominio, render y UI |
| Barras de vida 3D | 425-464 | Render |
| Arranque del motor, cámara, entrada y ciclo de vida de la app | 466-529 | Composición y entrada |
| Terreno y cinemática del menú | 531-578 | Render |
| Fábricas de mallas (soldado, tanque, Nexo, escudo, generador, barraca, torreta) | 580-758 | Render |
| Restos de batalla (ruinas, chatarra, cadáveres, límite de 64) | 760-946 | Render |
| Inicio de partida: reset de estado, metas de la IA, creación de Nexos, `BattleSimulation` con callback de escudo | 948-1091 | Dominio + render + UI |
| Pausa, salida al menú, desmontaje de partida | 1093-1159 | Ciclo de vida |
| Presentación de recursos y recompensas en la UI | 1161-1226 | Presentación |
| Acceso al monedero ECS (`getFactionGold`, `spendFactionGold`, `creditFactionGold`) | 1228-1263 | Dominio |
| Consultas de edificios (`isValidSoldierFactory`, `isBuildingKind`, `isBuildingAlive`) | 1265-1288 | Dominio |
| Modo vender, selección de edificio, fantasma de colocación, coste de edificios | 1290-1360 | Entrada + UI + dominio |
| Gestos de toque, raycast, **venta** (reembolso 70 %, borra la entidad ECS) y **construcción** (validación de zona y distancia, gasto, malla, entidad ECS, evento de desbloqueo, sonido, aviso) | 1361-1505 | Entrada + dominio + render + audio + UI |
| Crear la entidad ECS de un edificio **a partir de su objeto visual** (`registerStructureTarget`) | 1507-1526 | Dominio, invertido |
| Visual de tropa al completar producción | 1528-1570 | Render |
| Entrenar unidades del jugador (`trainUnit`, mejora `veteran_armor`) | 1572-1616 | Comando + UI |
| IA enemiga (`spawnAIBuilding`, `updateEnemyAI`) | 1618-1706 | IA + render + UI |
| Explosiones y nube nuclear | 1708-1724 | Render + audio + hápticos |
| **Muerte de unidades**: CP, rachas, eventos de desbloqueo, restos, borrar entidad ECS, quitar visual | 1726-1808 (`updateUnitGroup`) | Dominio dentro del bucle visual |
| Orientación de torretas | 1810-1831 | Render |
| Avance de la simulación y vaciado de eventos ECS hacia visuales | 1833-1920 | Composición |
| `updateCombat`: temblor de cámara, UI por fotograma, alerta del Nexo, sincronización de unidades, **muerte de edificios** (CP, ruinas, borrado ECS), **detección de victoria o derrota** | 1922-2014 | Dominio + render + UI |
| Escudo, CP por destrucción, daño de recompensas (`applyDamage`), candidatos y validación de recompensas, gasto | 2016-2123 | Dominio |
| Efectos de artillería y ataque aéreo (tipos, geometrías, cámara cinemática, trayectoria) **que aplican el daño cuando el proyectil visual llega** | 2125-2483 | Render + dominio |
| Activar recompensas para cualquier facción y decisión de recompensas de la IA | 2485-2577 | Dominio + IA + UI + audio |
| Visual del escudo y UI de desbloqueos | 2579-2603 | Render + presentación |
| Fin de partida (secuencia, temporizador de respaldo, resumen) | 2605-2659 | Ciclo de vida + presentación |
| Bucle por fotograma `animate` (orden de todo lo anterior) y muestreo de diagnóstico | 2661-2724 | Composición |
| Escenarios de prueba de diagnóstico (modifican el monedero y las entidades directamente) | 2726-2925 | Desarrollo |
| `initApp`, enlace de acciones de UI, suscripciones a desbloqueos, API pública (`dispose`, `state`) | 2928-2974 | Composición |

### 2.2 Módulos fuera de `GameApplication.ts` (verificado)

| Módulo | Responsabilidad | Estado |
|---|---|---|
| `main.ts` | Arranque: fuentes, estilos, eventos nativos de Capacitor convertidos en eventos de `window`, `UnlockManager`, `GameUI`, `createGameRuntime` | Correcto |
| `game/ecs/World.ts`, `components.ts` | Almacén de entidades y componentes (`Map` por componente) | Correcto |
| `game/ecs/BattleSimulation.ts` | Paso fijo: objetivos, movimiento, armas, producción, ingresos, proyectiles; colas de eventos | Correcto. Le faltan la muerte, la victoria y las recompensas |
| `game/ecs/systems.ts` | Sistemas puros y comandos `requestUnitProduction`, `trySpendResources`, `applyDamageSystem` | Correcto |
| `game/ecs/initialBattle.ts` | Definiciones de unidades, torretas, bases y fábricas de entidades | Correcto, salvo lo duplicado en §4 |
| `game/ecs/combatFocus.ts` | Posiciones de combate para el zoom automático | Correcto |
| `game/rewardSystem.ts` | Perfiles de dificultad, definiciones y validación de recompensas, puntería | Correcto. La ejecución vive en `GameApplication` |
| `game/GameFrameLoop.ts` | Bucle con `requestAnimationFrame` y delta limitado a 0,1 s | Correcto (ver §5.8) |
| `game/GameSession.ts` | Máquina de estados MENU/PLAYING/PAUSED/MATCH_ENDING/GAMEOVER | Correcto |
| `game/GameInputController.ts` | Eventos de puntero, teclado, atrás nativo, visibilidad y foco de la app | Correcto |
| `game/nexusDamageAlert.ts` | Regla de aviso de daño al Nexo | Correcto |
| `game/unlocks/UnlockManager.ts` + `unlocks.json` | Desbloqueos persistentes y temporales con `localStorage` | **Sin efecto en el juego** (ver §4.6) |
| `platform/HapticFeedback.ts` | Vibración con Capacitor | Correcto |
| `rendering/ThreeRenderCoordinator.ts` | Escena, cámara, renderer (DPR ≤ 1,5 en táctil, sin antialias en táctil), luces, redimensionado, `dispose` | Correcto |
| `rendering/*` | Cámara, efectos, soldados instanciados, proyectiles, rejilla, trayectoria balística | Correcto, con pruebas |
| `ui/*` | DOM, HUD, menú de construcción, avisos, pantalla final; implementa `GameUiPort` | Correcto. Importa `rewardSystem` solo para definiciones estáticas |

## 3. Dependencias entre módulos (verificado)

```
main.ts ──► GameApplication.ts ──► three
   │              │
   │              ├──► game/ecs/{components, BattleSimulation, initialBattle, systems, combatFocus}
   │              ├──► game/{GameFrameLoop, GameInputController, GameSession, nexusDamageAlert, rewardSystem}
   │              ├──► platform/HapticFeedback
   │              ├──► rendering/{ThreeRenderCoordinator, MapCameraController(tipo), TerrainGrid,
   │              │               ballisticArc, InstancedSoldierRenderer(tipo)}
   │              └──► ui/contracts (solo tipos)
   ├──► ui/GameUI ──► ui/* ──► game/rewardSystem (definiciones)
   └──► game/unlocks/UnlockManager

rendering/InstancedSoldierRenderer ──► game/ecs/components (solo tipos Entity, Faction, Position)
game/ecs/* ──► (nada externo)            game/rewardSystem ──► (nada)
```

- No hay **ciclos** entre módulos.
- El dominio (`game/`) **no** importa Three.js.
- Toda la integración converge en `GameApplication.ts`. Es el único módulo que conoce a la vez ECS, Three.js, UI, audio, entrada y desbloqueos.

## 4. Responsabilidades mezcladas o duplicadas

### 4.1 La muerte se procesa en la sincronización visual (verificado)

`updateUnitGroup` (1726) y `updateBuildingList`, dentro de `updateCombat` (1922), detectan `hp <= 0`, otorgan CP, actualizan rachas, envían eventos de desbloqueo, crean restos, borran la entidad ECS y quitan su visual. Consecuencias:

- la consecuencia de juego de una muerte depende del orden del bucle de render y se procesa **por fotograma**, no por paso fijo;
- no se puede probar sin Three.js;
- la victoria o derrota se decide en `updateCombat` leyendo `playerHQ.hp`/`enemyHQ.hp`, que son copias del componente `health`.

### 4.2 El daño de las recompensas depende de la animación (verificado)

`updateActiveArtillery` (2285) y `updateActiveAirStrikes` (2425) aplican el daño cuando el proyectil o la bomba **visual** llega, con el delta del fotograma. Además, las listas de efectos guardan objetos `THREE.Vector3` y mallas como estado de juego. Por eso es imposible simular recompensas sin render, y es la razón por la que el banco de partidas del diseño las excluye.

### 4.3 Estado de juego fuera del ECS (verificado)

- **Viven en variables del cierre:**
  - CP por facción;
  - fin de recarga de recompensas;
  - fin del escudo;
  - recompensas activas;
  - rachas y contadores;
  - reloj de juego (`gameplayClockMs`);
  - metas y temporizador de la IA;
  - estadísticas de partida.
- **Doble estado:** `RuntimeStructure`/`RuntimeUnit` duplican `hp`, `maxHp` y `position` del ECS y se sincronizan cada fotograma. `gold`/`enemyGold` son copias del componente `economy`, con una alternativa de respaldo en `getFactionGold` (1240) que devolvería la copia si faltara la entidad.

### 4.4 Construcción "visual primero" (verificado)

- **Jugador:** el manejador de toques crea la malla, construye un `RuntimeStructure` y después `registerStructureTarget` crea la entidad ECS a partir de ese objeto visual.
- **IA:** sigue el mismo camino desde `spawnAIBuilding`.
- **Nexos:** se crean dos veces, como `RuntimeStructure` con `hp: 1200` y en `createInitialBattle` con `BASE_HEALTH = 1200`.

### 4.5 Valores y reglas duplicados (verificado)

| Dato o regla | Copias |
|---|---|
| Coste de edificios (100/150/125) | `getBuildingCost` (1328) y literales en `updateEnemyAI` (1660-1673) |
| Vida de edificios (380) | Construcción del jugador (1484) y `spawnAIBuilding` (1624); valor por defecto en `createSoldierFactory` |
| Vida del Nexo (1200) | `startNewGame` (×2) e `initialBattle.ts` |
| Reducción del escudo | Callback `modifyDamage` de `BattleSimulation` (1063-1083) **y** `applyDamage` (2036-2055): dos caminos para la misma regla |
| Validación de ubicación | Solo en `onPointerUp` (1458-1468); la IA no la usa |
| Punto de aparición de tropas | Valor por defecto en `requestSoldierProduction` (±3 en z) y valores explícitos distintos en `trainUnit` y en la IA |
| Tipos de dominio | `ui/contracts.ts` redefine `BuildingType`, `UnitType`, `Difficulty` y `RewardId`, que ya existen como `BuildingKind`/`SoldierKind` (ECS) y `Difficulty`/`RewardId` (`rewardSystem`) |
| Costes y duraciones de recompensas | `REWARD_DEFINITIONS` y el texto de `unlocks.json` ("10 CP / 180 Oro…"), que no refleja el multiplicador de dificultad |
| Fin de partida | Temporizador de 4 s en `updateMatchEnding` **y** `setTimeout` de 5 s en `beginMatchEnding` |
| Literal `'player' \| 'enemy'` | Repetido en lugar del tipo `Faction` |

### 4.6 Sistema de desbloqueos sin efecto (verificado)

- `unlocks.json` define tres entradas sin `trigger`, y `UnlockManager.recordEvent` solo concede desbloqueos con `trigger.event`. Por eso **las seis llamadas a `unlocks.recordEvent` no tienen efecto**.
- `unlocks.isUnlocked('veteran_armor')` (1591) nunca puede ser verdadero, porque `veteran_armor` no existe en las definiciones.
- `README_UNLOCKS.md` describe recompensas (helicóptero, `airstrike_temp`) y una API global (`Unlocks.grant`) que no existen.
- `UnlockManager` usa reloj real (`Date.now`, `setTimeout`) para caducar desbloqueos, no el reloj de juego, y su condición `custom` busca funciones en `globalThis`.
- "Reiniciar batalla" borra este progreso (`unlocks.resetProgress()`).

### 4.7 IA (verificado en la auditoría de la IA)

La IA mezcla decisión con render (`spawnAIBuilding` crea mallas), con UI (`ui.setAiStatus`) y con el bucle (`updateEnemyAI` se llama dos veces por fotograma, 2674 y 2679). El detalle está en el documento de diseño.

## 5. Acoplamientos innecesarios

1. **El dominio depende del orden del bucle visual** (§4.1 y §4.2). Es el acoplamiento más caro: impide probar la partida sin gráficos y bloquea el banco de partidas con recompensas.
2. **Entrada con lógica de juego.** `onPointerUp` valida, cobra, crea entidades, vende y reembolsa. Cualquier otro origen de órdenes (IA, pruebas, futuras órdenes globales) tiene que duplicarlo.
3. **Mallas como identidad de juego.** `targetObjects: Map<Entity, RuntimeTarget>` es a la vez índice visual y fuente de `hp` y `type` para la puntería de recompensas (`toStrikeCandidates`).
4. **Presentación por fotograma sin control de cambios.**
   - `updateCombat` llama a `updateResourceUI` en **cada fotograma**, que escribe `innerText` y actualiza el menú de construcción.
   - `updateResourceUI` llama a su vez a `updateRewardUI`, que recorre todos los objetivos del mundo.
   - Esto anula la limitación a 250 ms de `animate` (2681). Coste en móvil sin medir (**inferencia**).
5. **Cámara modificada desde el combate.** El temblor se aplica directamente a `camera.position` en `updateCombat`, fuera de `MapCameraController`.
6. **Audio y hápticos dentro de la lógica.** `SFX.*` y `haptics.*` se llaman desde la construcción, las recompensas y las explosiones, en lugar de reaccionar a eventos del dominio.
7. **El diagnóstico manipula el estado.** Los escenarios de desarrollo escriben directamente en el monedero, las entidades y `enemyAIEnabled`, y `enemyAIEnabled` no se restablece al empezar otra partida.
8. **Bucle de fotogramas.** `GameFrameLoop` usa `requestAnimationFrame`; `AGENTS.md` recomienda `renderer.setAnimationLoop()`. El delta está limitado y la pausa por segundo plano funciona, así que es una diferencia menor.
9. **Duración de partida con reloj real.** `stats.startTime = Date.now()` incluye pausas y la secuencia final en la duración que muestra la pantalla de fin.

## 6. Propuesta de separación modular

Objetivo: `GameApplication.ts` queda como **raíz de composición** (crea módulos, los conecta y fija el orden del fotograma). El resto se reparte así:

```
web/src/
  game/
    ecs/                      (sin cambios de fondo)
      systems.ts              + sistema de muerte (marca muertes y emite eventos por paso fijo)
    match/                    NUEVO · sin Three.js
      MatchState.ts           estado de facción: CP, rachas, recargas, escudos, recompensas activas,
                              reloj de juego, estadísticas
      MatchController.ts      avanza la simulación, procesa muertes → CP/rachas,
                              decide victoria/derrota, emite eventos de dominio
      matchEvents.ts          UnitDied, StructureDestroyed, StructureBuilt, StructureSold,
                              RewardActivated, StrikeImpactScheduled, StrikeImpact, MatchEnded
      rewardExecution.ts      línea de tiempo de impactos de recompensas sobre el reloj de juego
                              (los tiempos ya existen como constantes en rewardSystem.ts)
    definitions/structures.ts tabla única de edificios (coste, vida, tipo), Nexo incluido
    commands/                 (diseño de la IA, fase 2) build, sell, train, activateReward
    ai/                       (diseño de la IA)
  rendering/
    meshes/                   fábricas de mallas de unidades, edificios, Nexo, escudo,
                              aeronave, restos y barras de vida
    BattlefieldView.ts        mapa Entity → visual; crea/actualiza/borra visuales a partir del ECS
                              y de los eventos; restos limitados
    RewardEffectsView.ts      animación de proyectiles de artillería y avión, guiada por eventos
    PlacementPicker.ts        raycast, fantasma de colocación, selección para vender
  platform/
    SoundEffects.ts           el objeto SFX actual
  app/
    GamePresenter.ts          estado → GameUiPort, con control de cambios y frecuencia limitada
  dev/
    diagnostics.ts            muestreo y escenarios de `?diagnostics=1` (fase 0b)
```

Reglas de frontera:

- `game/**` no importa `three`, `ui/**`, `rendering/**` ni `platform/**`.
- El render lee el ECS y los eventos y nunca decide nada de juego.
- La entrada y la IA solo emiten **comandos**.
- Audio, hápticos, avisos y desbloqueos reaccionan a **eventos de dominio**.
- `ui/contracts.ts` reutiliza los tipos del dominio (`import type`) en lugar de redefinirlos.
- `RuntimeStructure`/`RuntimeUnit` desaparecen como estado de juego. Solo queda el visual, indexado por `Entity`.

No se propone un bus de eventos genérico: bastan colas tipadas que se vacían cada fotograma, el mismo patrón que ya usa `BattleSimulation` (`drainProductionEvents`, etc.).

## 7. Orden recomendado de refactorización

Cada paso conserva el comportamiento salvo donde se indica, termina con pruebas, tipado y build verdes, y **se mide contra la referencia del panel (0b)** antes de darse por cerrado.

| Paso | Contenido | Riesgo | Relación con el plan de la IA |
|---|---|---|---|
| **R0** | Panel de rendimiento y medición de referencia (fase 0b) | Bajo | Requisito previo |
| **R1** | Hojas sin comportamiento: `definitions/structures.ts` (tabla única, usada por jugador e IA), `platform/SoundEffects.ts`, `rendering/meshes/`, tipos de `ui/contracts.ts` desde el dominio | Bajo | — |
| **R2** | Fase 1 de la IA (extraer la decisión, doble llamada, pruebas) | Bajo-medio | Fase 1 |
| **R3** | `game/match/`: sistema de muerte en el ECS, CP, rachas, victoria/derrota y estado de facción; eventos de dominio; audio, hápticos y desbloqueos pasan a reaccionar a eventos. **Hecho** (`13eda2a`, `3b91c7d`, `0b0b8c7` y el commit de cierre de R3): las muertes se siguen procesando una vez por fotograma (decisión 1 del diseño de R3, que evitó el riesgo del paso fijo); la vista reacciona a los eventos | **Alto** según esta auditoría, porque las muertes iban a pasar de procesarse por fotograma a por paso fijo. Riesgo evitado: R3 mantiene la cadencia por fotograma | Requisito de las fases 3-4 (el conocimiento de facción lee el dominio) |
| **R4** | `game/commands/`: construir, vender, entrenar y activar recompensa (validación y gasto); `onPointerUp` y la IA solo emiten comandos; un solo camino para el escudo. **Hecho** (`32b51f7`..`d499196` y el commit de cierre de R4): la IA respeta la distancia mínima de 3,8, y la evaluación de su equilibrio queda pendiente del banco de partidas de la fase 3 | Medio | Fase 2 |
| **R5** | `rewardExecution.ts`: impactos programados sobre el reloj de juego; `RewardEffectsView` solo anima. **Hecho** (`5f6e47e`..`28d9144` y el commit de cierre de R5): `advanceStrikes` sigue avanzando una vez por fotograma (opción A del diseño de R5), y una referencia heredada comparada en 14 escenarios × 6 secuencias de delta fija los mismos fotogramas, puntos, objetivos y daño. El banco (`aiMatchRunner`) ya puede ejecutar los ataques sin render, con la opción `strikes` | **Alto**: hay que conservar los tiempos exactos de impacto | Permite incluir recompensas en el banco |
| **R6** | `BattlefieldView`: visual indexado por `Entity`; se eliminan las copias `hp`/`position` y `targetObjects` como fuente de datos de juego. **Hecho** (`d8fb2f1`..`76812b9` y el commit de cierre de R6): `BattlefieldView`, `ProjectileView` y `PlacementGhost` (`rendering/`) leen el ECS a través de `WorldReader` y nunca lo escriben; cada camino del ciclo de vida (C1-C12) avisa una vez a la vista; `GameApplication.ts` ya no tiene `RuntimeStructure`, `RuntimeUnit`, `targetObjects`, las cuatro listas ni `playerHQ`/`enemyHQ`, y conserva el audio, los hápticos y el temblor. El fantasma de construcción y el escenario de recompensas liberan sus recursos. En desarrollo, una comprobación compara el registro con el ECS una vez por segundo; en el navegador, cero inconsistencias en todos los caminos | Medio | — |
| **R7** | `GamePresenter`: UI con control de cambios y la limitación de 250 ms efectiva | Bajo | — |
| **R8** | Raíz de composición: `GameApplication.ts` solo conecta módulos y fija el orden del fotograma | Bajo | — |

Orden sugerido: **R0 → R1 → R2 → R3 → R4 → (fases 3-4 de la IA) → R5 → R6 → R7 → R8**.

R5 puede adelantarse si se quiere medir recompensas en el banco antes de la fase 4. Las mecánicas futuras (órdenes globales y niebla) se apoyan en R3, R4 y R6.

**Decisión de producto pendiente (no técnica):** qué hacer con el sistema de desbloqueos (§4.6): retirarlo, o definir de verdad sus condiciones y efectos. Hasta decidirlo, R3 mantiene las llamadas actuales a `recordEvent`, aunque no tengan efecto.

## 8. Riesgos y pruebas necesarias

### 8.1 Riesgos

- **Orden temporal.**
  - Mover muertes y recompensas al paso fijo cambia en qué fotograma ocurren las cosas.
  - Puede alterar el reparto de CP en muertes simultáneas o el momento de la victoria.
  - Mitigación: pruebas de caracterización antes de R3/R5 y comparación en el banco de partidas.
- **Fugas de recursos GPU al desmontar.** Separar visuales puede dejar geometrías o materiales sin liberar. Mitigación: comparar geometrías y texturas tras varias partidas seguidas con el panel 0b.
- **Rendimiento.** Las colas de eventos y el mapa `Entity → visual` añaden asignaciones si se hacen mal. Mitigación: colas reutilizadas (patrón `splice(0)` actual), sin asignaciones por entidad y por fotograma, y medición contra la referencia.
- **Archivo único de 3.000 líneas.** Hay mucho riesgo de conflictos y de cambios no relacionados. Mitigación: pasos pequeños y un módulo extraído por commit.
- **Sin pruebas de integración de la partida.** Hoy ningún test ejecuta `createGameRuntime`. Hasta R3, la única red de seguridad es manual.
- **Pruebas sin DOM.** El ejecutor actual (`tsx --test`) no tiene WebGL. Todo lo que deba probarse tiene que quedar en módulos sin Three.js.

### 8.2 Pruebas que deben existir antes de cada paso

| Antes de | Pruebas |
|---|---|
| R1 | Tabla de edificios: costes y vidas actuales (100/150/125; 380; Nexo 1200) |
| R2 | Las de la fase 1 del diseño de la IA |
| R3 | **Integración sin render** sobre `BattleSimulation` + `match/`: CP por baja (soldado 1, tanque 3) y por edificio (torreta 4, generador 4, barraca 6); rachas que se reinician al morir una unidad propia; victoria al caer el Nexo enemigo y derrota al caer el propio; una entidad muerta se elimina una sola vez y otorga CP una sola vez |
| R4 | Construir: coste, zona por facción, distancia mínima, rechazo sin oro. Vender: reembolso del 70 %, no se puede vender el Nexo. Entrenar: barraca ocupada, sin oro, facción equivocada. Recompensa: validación, gasto de CP y oro y recarga de 15 s para ambas facciones. Escudo aplicado **una vez** por golpe, tanto en proyectiles como en recompensas |
| R5 | Artillería: 3 impactos en los tiempos de `artilleryStrikeDurationSeconds`. Ataque aéreo: 4 bombas durante `AIR_STRIKE_FLIGHT_SECONDS`. Daño por impacto según el radio. La pausa no avanza la línea de tiempo |
| R6-R8 | Repetir partidas en el panel 0b sin crecimiento de geometrías ni texturas; prueba manual en dispositivo de pausa, segundo plano, botón atrás y fin de partida |

## 9. Hallazgos colaterales (para registrar, no corregir aquí)

| Hallazgo | Ubicación | Efecto |
|---|---|---|
| IA ejecutada dos veces por fotograma | `animate`, 2674 y 2679 | IA al doble del ritmo configurado. **Corregido en R2** (`df4d18d`): una llamada por fotograma con `DecisionClock` |
| La limitación de 250 ms de la UI de recompensas queda anulada | `updateCombat` → `updateResourceUI` → `updateRewardUI` | Recorrido de objetivos y escrituras DOM en cada fotograma |
| `veteran_armor` inalcanzable; desbloqueos sin disparadores | §4.6 | Código muerto y eventos sin efecto |
| `README_UNLOCKS.md` desactualizado | Raíz del repo | Documentación que no coincide con el comportamiento |
| Duración de partida con reloj real | `stats.startTime`, `endGame` | Incluye pausas y la secuencia final |
| `enemyAIEnabled` no se restablece | `startNewGame` | Solo afecta a los escenarios de desarrollo |
| Dos mecanismos para cerrar la partida | `beginMatchEnding` (5 s) y `updateMatchEnding` (4 s) | El de 5 s actúa de respaldo en segundo plano; conviene documentarlo o unificarlo |

## 10. Limitaciones de esta auditoría

- No se ejecutó el juego ni se midió rendimiento. Las afirmaciones de coste están marcadas como inferencia.
- Las pruebas (117) y el tipado pasaban al iniciar la auditoría de la IA en este mismo commit base. No se han vuelto a ejecutar porque no hubo cambios de código.
- No se revisaron línea a línea los módulos de UI ni `MapCameraController` (1.059 líneas). Solo sus fronteras y dependencias.
