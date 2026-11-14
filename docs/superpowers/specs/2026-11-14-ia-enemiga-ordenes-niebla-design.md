# IA enemiga, órdenes globales y niebla de guerra — diseño

Fecha: 2026-11-14 · Estado: decisiones cerradas en conversación; pendiente de aprobación final del documento

Este documento fija la evolución de la IA enemiga y de dos mecánicas futuras (órdenes globales **Mantener posición / Atacar** y **niebla de guerra**), su arquitectura técnica y el orden de implementación. No autoriza a implementar nada por sí solo: cada fase se planifica aparte.

Las decisiones marcadas **(decisión del usuario)** salieron de la conversación de diseño. Las marcadas **(propuesta)** son elecciones técnicas razonables que el usuario puede cambiar al revisar este documento.

---

## 1. Intención

La auditoría del 2026-11-14 mostró que la IA enemiga:

- vive dentro de `createGameRuntime` en `web/src/GameApplication.ts` (`updateEnemyAI`, `spawnAIBuilding`, `maybeActivateEnemyReward`, estado en las líneas ~381-420 y ~1007-1020);
- decide con metas de edificios sorteadas al empezar, tiradas aleatorias y un temporizador;
- casi no mira el campo de batalla (solo el umbral del escudo depende de la vida del Nexo);
- usa el mismo monedero ECS que el jugador, sin oro oculto;
- se ejecuta **dos veces por fotograma** (`animate`, llamadas en ~2674 y ~2679), por lo que decide al doble del ritmo configurado;
- mezcla decisión con render (crea mallas Three.js) y con UI (`ui.setAiStatus`);
- no tiene ninguna prueba.

La dificultad hoy solo da más oro, más edificios y más velocidad. Queremos un adversario que **tome decisiones estratégicas** sin convertir el juego en un RTS complejo, y preparar la arquitectura para dos mecánicas que llegarán con el rediseño del combate y de los controles.

## 2. Público y objetivos por dificultad (decisión del usuario)

Público principal: jugadores casuales de móvil, sobre todo jóvenes y personas que empiezan en la estrategia. Secundario: adolescentes y adultos aficionados a la estrategia. Fácil de aprender, con profundidad suficiente para jugadores con experiencia. No es un juego exclusivamente infantil.

| Dificultad | Objetivo | Niebla |
|---|---|---|
| Fácil | Enseñar las mecánicas, experiencia accesible | **Desactivada para ambos bandos** |
| Normal | Experiencia equilibrada, decisiones razonables de la IA | Activada para ambos |
| Difícil | IA más estratégica: administra mejor, recuerda información, aprovecha oportunidades | Activada para ambos |

La IA nunca tiene información privilegiada: con niebla activada decide solo con lo que su facción conoce.

## 3. Objetivos, no objetivos y anti-objetivos

**Objetivos**

- IA separada en un módulo propio, probable sin WebGL ni Three.js.
- La IA **decide qué pedir**; los sistemas del juego **validan y ejecutan** con las mismas reglas, costes y validaciones que el jugador.
- Diferencias de dificultad basadas en **calidad de decisión**, no solo en recursos.
- Órdenes globales Mantener / Atacar para ambos bandos.
- Niebla completa y simétrica en Normal y Difícil.

**No objetivos**

- Control individual de unidades, formaciones configurables, selección de grupos.
- Búsqueda de caminos (pathfinding); el movimiento sigue en línea recta con el deslizamiento actual contra edificios.
- ML, LLMs, algoritmos de búsqueda complejos o dependencias nuevas.
- Juego en red.

**Anti-objetivos** (fracaso aunque funcione)

- Que la IA haga trampas: oro oculto, unidades gratis, saltarse validaciones o información que el jugador no podría tener. Una ventaja económica **explícita, visible en el perfil de dificultad y configurable** (como el ingreso base enemigo) está permitida, pero la dificultad no puede depender solo de ella (decisión del usuario).
- Que el jugador tenga que microgestionar: el juego debe seguir siendo "construye, produce y decide el momento".
- Que Fácil frustre a quien empieza.
- Que el rendimiento en móvil empeore de forma apreciable (ver §9).
- Cambiar el equilibrio en silencio: todo cambio de valores de juego se declara.

## 4. Restricciones

Las de `AGENTS.md`, en especial: TypeScript estricto sin `any`; la lógica de juego no importa Three.js; ECS para entidades de juego y UI fuera del ECS; simulación a paso fijo (`BattleSimulation`, 1/30 s); sin asignaciones en bucles calientes; pruebas con el `tsx --test` existente; documentación alineada con el comportamiento.

## 5. Decisiones de diseño de las mecánicas futuras

### 5.1 Órdenes globales (decisión del usuario)

- **Predeterminado: Atacar**, idéntico al comportamiento actual (las unidades se producen y avanzan solas).
- **Mantener posición**: las unidades se concentran en una **zona defensiva fija delante del Nexo**, en **puestos distribuidos en arco**. Combaten a enemigos que entren en su **radio de defensa** y vuelven a su puesto al terminar el combate. Las nuevas unidades van directamente a la zona.
- **Tropas ya avanzadas al pulsar Mantener (opción B)**: las que están combatiendo terminan ese combate y luego regresan; las que no combaten regresan directamente.
- **Atacar**: las unidades acumuladas avanzan, cada una a su velocidad normal (sin marcha sincronizada).
- El jugador no configura formaciones ni posiciones.
- **Límite de población por facción**, valor a fijar con pruebas de rendimiento.
- La IA usa las mismas órdenes y decide cuándo cambiarlas.

### 5.2 Niebla de guerra (decisión del usuario)

- **Opción A**: completa y simétrica, solo en Normal y Difícil.
- La **ubicación del Nexo enemigo se conoce desde el inicio**; sus construcciones, defensas y unidades se descubren.
- Las zonas exploradas **conservan la información anterior** (edificios vistos); las **unidades enemigas desaparecen** al salir de la visibilidad.
- Las recompensas **solo seleccionan objetivos visibles** en la primera versión.
- Nada de ataques contra estructuras invisibles ni de información filtrada a través del sistema de combate.

### 5.3 IA y órdenes (decisión del usuario)

| Postura | Orden habitual | Prioridad |
|---|---|---|
| Desarrollar | Mantener | Economía y estructura de base |
| Defender | Mantener | Proteger el Nexo |
| Presionar | Acumula con Mantener, luego **Atacar** cuando ve una oportunidad | Golpear al jugador |

---

## 6. Arquitectura técnica

### 6.1 Principio

```
FactionKnowledge  ──►  EnemyAi (decide)  ──►  GameCommand[]  ──►  GameCommands (valida + ejecuta en ECS)
 (lo que sabe la         sin Three.js,          datos puros         mismas funciones que usa el jugador
  facción)               sin UI                                       │
                                                                      ▼
                                                    eventos (StructureBuilt, ProductionCompleted…)
                                                                      │
                                                                      ▼
                                              GameApplication / render crean visuales y avisos
```

La IA nunca escribe en componentes, monederos, vida, objetos de render ni UI.

### 6.2 Módulos nuevos (propuesta)

| Módulo | Responsabilidad |
|---|---|
| `web/src/game/commands/gameCommands.ts` | Comandos de juego compartidos por jugador e IA: `buildStructure`, `trainUnit`, `activateReward` (validación y gasto), y más adelante `setArmyOrder`. Devuelven `{ accepted: true } \| { accepted: false; reason }` y encolan eventos. Una sola tabla de costes y vida de estructuras. |
| `web/src/game/commands/placement.ts` | `validatePlacement(world, faction, position)`: zona de construcción espejada por facción (jugador `5 < z < 73`, enemigo `-73 < z < -5`, `|x| < 53`) y distancia mínima de 3,8 a estructuras propias. Hoy esta regla solo existe dentro de `onPointerUp`. |
| `web/src/game/knowledge/FactionKnowledge.ts` | Interfaz de solo lectura de lo que una facción conoce. Implementaciones: `FullKnowledge` (todo, usada en Fácil y hasta que exista la niebla) y `FogKnowledge` (fase de niebla). |
| `web/src/game/ai/enemyAiProfile.ts` | Parámetros de la IA por dificultad (intervalo, umbrales, probabilidades, preferencias). Datos inmutables. |
| `web/src/game/ai/aiSnapshot.ts` | Construye el resumen plano que la IA consume **solo** desde `FactionKnowledge` y el estado propio. |
| `web/src/game/ai/EnemyAi.ts` | `decideEnemyTurn(snapshot, profile, state, rng): { commands, posture }` (función pura) y `EnemyAiController` (intervalo, postura actual, memoria). |
| `web/src/game/visibility/` (fase de niebla) | Cuadrícula de visión por facción, memoria de estructuras vistas, consultas `isVisible`. TypeScript puro. |

Las estrategias (economía, construcción, producción, defensa, recompensas) empiezan como funciones dentro de `EnemyAi.ts` y solo se separan en archivos cuando su tamaño lo justifique. No se crea un `AIDecisionEngine` genérico.

### 6.3 Contratos (esbozo; nombres orientativos)

```ts
type GameCommand =
  | { type: 'build'; faction: Faction; kind: 'generator' | 'barracks' | 'turret'; position: Position }
  | { type: 'train'; faction: Faction; factory: Entity; unit: SoldierKind }
  | { type: 'activateReward'; faction: Faction; reward: RewardId }
  | { type: 'setArmyOrder'; faction: Faction; order: 'hold' | 'attack' };   // fase de órdenes

interface FactionKnowledge {
  readonly faction: Faction;
  ownStructures(): readonly KnownStructure[];          // siempre completas
  ownUnits(): readonly KnownUnit[];                     // siempre completas
  visibleEnemyUnits(): readonly KnownUnit[];
  knownEnemyStructures(): readonly KnownStructure[];    // visibles + recordadas (con lastSeenMs)
  enemyNexusPosition(): Position;                       // siempre conocida
  isVisible(x: number, z: number): boolean;
}

interface EnemyAiSnapshot {
  nowMs: number;
  gold: number;
  incomePerSecond: number;           // base + generadores vivos
  productionCapacityPerSecond: number; // gasto máximo de las barracas
  combatPoints: number;
  rewardCooldownRemainingMs: number;
  ownCounts: Record<'generator' | 'barracks' | 'turret', number>;
  idleFactories: readonly Entity[];
  nexusHealthRatio: number;
  nexusDamagedRecently: boolean;
  ownArmyPower: number;
  knownEnemyArmyPower: number;       // visible ahora (Normal) o estimado (Difícil)
  threatNearBase: number;            // poder enemigo visible cerca del Nexo/estructuras propias
  localDefensePower: number;
  rewardAimValue: Partial<Record<'artillery_strike' | 'air_strike', number>>; // de selectStrikeAim sobre objetivos visibles
  armyOrder: 'hold' | 'attack';      // fase de órdenes
}
```

`rng: () => number` se inyecta (por defecto `Math.random`; en pruebas, un generador con semilla escrito en el propio proyecto, sin dependencias).

**Poder** de un ejército (propuesta): suma del coste en oro de sus unidades vivas ponderado por vida restante (`coste × vida/vidaMáx`). Simple y coherente con la economía.

### 6.4 Ejecución y ritmo

- `EnemyAiController.update(deltaSeconds)` se llama **una vez por fotograma** en estado `PLAYING`, después de `advanceBattleSimulation`, y decide cuando su acumulador supera el intervalo (`acumulador -= intervalo`, no reinicio a 0).
- **Eliminar la doble llamada sin cambiar el ritmo percibido (propuesta):** los intervalos configurados pasan de 2,5 / 1,4 / 0,7 s a **1,25 / 0,7 / 0,35 s**, el ritmo efectivo actual. Cambiar el ritmo real es una decisión de la fase de estrategia.
- Los comandos se ejecutan en el mismo fotograma, en orden: construir → entrenar → recompensas → orden de ejército.
- `ui.setAiStatus` deja de llamarse desde la IA; `GameApplication` muestra la postura devuelta (ver §8).

### 6.5 Modelo de decisión: posturas + reglas de prioridad

Una máquina de tres posturas decide la **prioridad general**; dentro de cada una, una lista corta de reglas ordenadas elige **la acción**. Las recompensas usan el valor que ya calcula `selectStrikeAim`.

```
             threatNearBase > localDefensePower × k_amenaza
 DESARROLLAR ──────────────────────────────────────────────► DEFENDER
     │   ▲                                                       │
     │   └──── sin amenaza durante T_calma ─────────────────────┘
     │
     │ ownArmyPower ≥ knownEnemyArmyPower × k_ventaja
     │ y economía objetivo alcanzada
     ▼
 PRESIONAR ── oleada terminada o ownArmyPower < umbral ──► DESARROLLAR
 (Defender tiene prioridad sobre Presionar en cualquier momento)
```

- **Histéresis:** tiempo mínimo en cada postura (propuesta: 8 s, salvo entrar en Defender, que es inmediato).
- **Economía (todas las posturas):** construir generadores mientras `incomePerSecond < productionCapacityPerSecond × k_eco`; construir barracas mientras sobre ingreso; no acumular oro ocioso por encima de un tope.
- **Reservas:** si a la IA le faltan pocos CP para una recompensa útil, reserva su coste en oro; Defender reserva el coste de una torreta.
- **Construcción:** posiciones de una lista de **puestos predefinidos por zonas** (atrás: generadores; medio: barracas; delante: torretas) filtrados por `validatePlacement`. Las torretas se colocan preferentemente entre la última amenaza conocida y el Nexo. Los edificios perdidos se reconstruyen según la postura.
- **Producción:** soldados para respuesta rápida y volumen; tanques cuando el enemigo conocido tiene muchas torretas o para reforzar una oleada.
- **Defensa (escalones):** producir → torreta en el frente amenazado → ataque táctico sobre la concentración cercana → escudo **cuando el Nexo está recibiendo daño** (no solo por porcentaje de vida).
- **Recompensas ofensivas:** solo si el valor esperado supera el umbral de la dificultad; entre aire y artillería, mejor valor por coste.
- **Con órdenes (fase 7):** Desarrollar y Defender usan Mantener; Presionar acumula con Mantener hasta `N` unidades (o poder suficiente) y emite Atacar; vuelve a Mantener cuando la oleada termina.
- **Antes de las órdenes:** Presionar equivale a priorizar producción sobre economía.

### 6.6 Dificultad como calidad de decisión (propuesta)

| Palanca | Fácil | Normal | Difícil |
|---|---|---|---|
| Niebla | No | Sí | Sí |
| Retardo de reacción ante amenaza | Largo | Medio | Corto |
| Señales que usa | Amenaza al Nexo y oro | + reservas, puestos por zona, valor de recompensas | + estimación del ejército no visible, aprovechar ventanas (tras un ataque táctico, cuando el ejército del jugador está lejos) |
| Memoria de la IA (uso de lo conocido) | — (sin niebla) | Usa estructuras recordadas; del ejército solo lo visible | Además estima el ejército del jugador a partir de avistamientos recientes que caducan |
| Errores deliberados | Frecuentes (elige al azar entre opciones peores) | Algunos | Casi ninguno |
| Umbral de valor de recompensas | Bajo | Medio | Alto |
| Presionar | Tarde y con oleadas pequeñas | Oleadas razonables | Oleadas sincronizadas con oportunidades |

La memoria del juego (qué se recuerda en el mapa) es **igual para ambos bandos**; la dificultad solo cambia **cómo la usa** la IA.

**Ingreso base enemigo (propuesta):** se mantienen 6 / 11 / 18 como ventaja explícita y configurable; no se cambian en silencio. Se revisan con mediciones cuando la IA decida mejor (ver fase 4 y fase 11); reducirlos es una opción, no un requisito. `rewardCostMultiplier` también afecta al jugador; se mantiene y se documenta.

### 6.7 Órdenes globales en el ECS (fases 5-7)

- **Separar destino de objetivo:** hoy `BattleSimulation` usa un solo mapa `#targets` para moverse y disparar. Se separa en *destino de movimiento* (posición) y *objetivo de disparo* (entidad), para que una unidad pueda volver a su puesto mientras dispara a lo que tenga a su alcance.
- **Destino por defecto** cuando no hay objetivo válido: con Atacar, el Nexo enemigo; con Mantener, el puesto de la unidad. Con niebla desactivada y Atacar, el resultado es idéntico al actual.
- **Orden de ejército:** un componente en la entidad base de cada facción (`armyOrder: 'hold' | 'attack'`, por defecto `'attack'`).
- **Puestos:** zona centrada 12 unidades delante del Nexo hacia el centro del mapa (jugador `z ≈ 48`, enemigo `z ≈ -48`); arcos concéntricos de radio inicial 8 que crecen si se llenan; el puesto se asigna por orden de llegada (propuesta, valores ajustables).
- **Radio de defensa:** las unidades en Mantener solo eligen objetivos dentro de un radio alrededor del centro de la zona (propuesta inicial 24) y lo abandonan si sale de él.
- **"Combate terminado" (opción B):** una unidad avanzada termina su combate cuando su objetivo muere o sale de su alcance y no hay otro enemigo visible dentro de su alcance durante 1,5 s (propuesta).
- **Límite de población:** `requestUnitProduction` rechaza con `reason: 'population-cap'`; el valor se fija con el panel de rendimiento.
- **HUD:** un único botón grande de dos estados (Defender / Atacar), mínimo 44×44 px, con contador de unidades en la zona.

### 6.8 Niebla en el ECS (fases 8-10)

- **Cuadrícula por facción:** celdas de 5 unidades sobre el terreno de 110×150 (22×30 celdas), `Uint8Array` con tres estados: sin explorar, explorada, visible. Se recalcula a ~5 Hz, no en cada paso fijo.
- **Fuentes y radios de visión (propuesta inicial, ajustable):**

| Fuente | Alcance de disparo | Visión |
|---|---|---|
| Nexo | — | 30 |
| Torreta | 22 | 26 |
| Tanque | 18 | 22 |
| Soldado | 14 | 18 |
| Barraca | — | 14 |
| Generador | — | 10 |

- **Memoria:** cada facción guarda las estructuras enemigas vistas (tipo, posición, última vida vista, `lastSeenMs`). Se borra o actualiza al volver a ver la celda. Las unidades no se recuerdan.
- **Combate:** la selección de objetivos de soldados y torretas solo considera entidades visibles para su facción. Sin objetivo visible → destino por defecto (§6.7).
- **Recompensas:** `getRewardTargetCandidates` filtra por visibilidad de la facción que activa.
- **IA:** consume `FogKnowledge`. Nunca lee el ECS crudo.
- **Activación:** una opción por partida derivada de la dificultad (`fog: difficulty !== 'easy'`). Con niebla desactivada se usa `FullKnowledge` y no se filtra nada.
- **Render:** una textura de 22×30 con filtrado lineal aplicada al terreno (sin capas transparentes a pantalla completa); mallas, instancias de soldados, barras de vida y efectos enemigos fuera de lo visible no se dibujan. Las estructuras recordadas se muestran como "fantasma" en gris.
- **HUD con niebla:** se ocultan el oro enemigo (`enemy-gold-text`) y el estado de la IA; la vida del Nexo enemigo muestra el último valor visto (propuesta).

### 6.9 Acoplamientos conocidos que no se resuelven aquí

- El daño de artillería y del ataque aéreo se aplica cuando llega el efecto visual (`updateActiveArtillery`, `updateActiveAirStrikes`). Es un acoplamiento juego-render que se documenta; solo se toca si una fase lo necesita.
- `updateResourceUI` recorre todos los objetivos en cada fotograma (vía `updateRewardUI`). No es de la IA; se registra para la auditoría de responsabilidades.

---

## 7. Fases de implementación

### 7.1 Orden de ejecución (decisión del usuario)

1. Auditoría de responsabilidades (0a).
2. Panel de rendimiento (0b), para fijar una referencia inicial.
3. Fase 1 de la IA: corregir la doble llamada, separar la decisión del resto de la aplicación e incorporar pruebas.
4. Fases estratégicas de la IA (2, 3, 4…), de forma progresiva.

Las auditorías terminan con su informe y su propuesta **antes** de cualquier modificación estructural. Ninguna tarea se implementa antes de llegar a su fase.

### 7.2 Alcance de 0a y 0b (decisión del usuario)

**0a. Auditoría de responsabilidades: solo auditoría y propuesta, sin modificar código.** Cubre `GameApplication.ts` y su relación con el ECS, la simulación, el render, la entrada, la interfaz, las recompensas y los demás módulos directamente relacionados. Entrega:

- mapa de responsabilidades actuales;
- dependencias entre módulos;
- responsabilidades mezcladas o duplicadas;
- acoplamientos innecesarios;
- propuesta de separación modular;
- orden recomendado de refactorización;
- riesgos y pruebas necesarias.

**0b. Panel de rendimiento: amplía el diagnóstico de `?diagnostics=1`** (`window.__gameDiagnostics`), sin sistema independiente y sin mezclarse con el HUD del jugador. Desactivado por defecto, con mediciones opcionales y sin coste apreciable en partidas normales. Incluye:

- FPS y tiempo por fotograma;
- draw calls y triángulos;
- geometrías y texturas;
- entidades activas por tipo y facción;
- tiempo de cada sistema ECS;
- tiempo de la IA y frecuencia de sus decisiones;
- separación entre coste de simulación y de render.

**El panel existe antes de cualquier refactorización (decisión del usuario).** Su objetivo es medir la versión actual para poder demostrar después si las mejoras de arquitectura benefician al rendimiento. Por eso:

- 0b solo añade instrumentación: no reorganiza ni refactoriza código de juego, aunque la auditoría 0a lo haya propuesto.
- 0b termina con una **medición de referencia de la versión actual**, registrada en `docs/` con:
  - versión (commit);
  - dispositivo o navegador;
  - escenarios: partida inicial, combate representativo y `runStressScenario`;
  - valores de cada métrica.
- Cada fase estructural posterior (1, 2 y las refactorizaciones que salgan de 0a) repite las mismas mediciones con los mismos escenarios y las compara con la referencia antes de darse por terminada.

### 7.3 Tabla de fases

| Fase | Contenido | Depende de | Cambia comportamiento |
|---|---|---|---|
| **0a. Auditoría de responsabilidades** | Ver §7.2 | — | No (sin código) |
| **0b. Panel de rendimiento** | Ver §7.2 | 0a | No |
| **1. Estabilizar la IA** | Pruebas de caracterización; `enemyAiProfile.ts`; `decideEnemyTurn` puro con `rng` inyectado que reproduce la lógica actual; controlador con acumulador; eliminar la doble llamada ajustando intervalos (§6.4); sacar `ui.setAiStatus` de la IA. La lógica actual queda disponible como **IA de referencia** para el banco de partidas | 0b | No (ritmo preservado) |
| **2. Comandos compartidos** | `gameCommands.ts` y `placement.ts`; jugador e IA construyen, entrenan y activan recompensas por la misma vía; evento `StructureBuilt` para el render; la IA pasa a respetar `validatePlacement` | 1 | Sí, leve: la IA ya no solapa edificios (con criterio de aprobación, §7.4) |
| **3. Conocimiento, resumen y banco** | `FactionKnowledge` con `FullKnowledge`; `aiSnapshot.ts` con todas las señales; banco de partidas sin gráficos; **medición de referencia** de la IA actual en las tres dificultades | 2 | No |
| **4. Estrategia v1** | Posturas, economía por equilibrio, reservas, puestos por zona, defensa por escalones, recompensas por valor, dificultad como calidad de decisión | 3 | **Sí** (objetivo de la fase), con criterio de aprobación (§7.4) |
| **5. Preparar el combate** | Separar destino de objetivo; destino por defecto; límite de población (valor medido con 0b) | 0b, 1 | No (salvo el límite) |
| **6. Órdenes globales (jugador)** | Componente de orden, zona, puestos, radio de defensa, opción B, botón del HUD | 5 | Sí |
| **7. La IA usa las órdenes** | Mapeo postura ↔ orden; oleadas | 4, 6 | Sí |
| **8. Niebla en el dominio** | Cuadrícula, memoria, `FogKnowledge`, activación por dificultad; sin efecto en combate ni pantalla todavía | 3, 5 | No |
| **9. Niebla en combate, recompensas e IA** | Filtro de visibilidad en objetivos, candidatos de recompensas y conocimiento de la IA | 8, 7 | Sí (Normal/Difícil) |
| **10. Niebla en pantalla y HUD** | Textura de niebla, ocultar visuales, fantasmas, cambios del HUD | 9 | Sí |
| **11. Equilibrio general y dispositivos** | Ajuste de radios de visión, ingreso enemigo y demás valores generales con el banco de partidas y pruebas en dispositivos reales; aquí sí pueden revisarse valores de juego, siempre declarados | 10 | Sí, declarado |

Prioridad inmediata (decisión del usuario): **0a, 0b, 1, 2, 3 y 4**. Las fases 5-10 se integran en el rediseño del combate y de los controles. Las mejoras de la IA **se publican a los jugadores** cuando su fase supera su criterio de aprobación, sin esperar a la fase 11.

**Relación con 0a (propuesta):** la auditoría de responsabilidades manda sobre cómo se reparte el resto de `GameApplication.ts`; las fronteras de §6.2 (IA, comandos, conocimiento) se mantienen salvo que el usuario las revise a la vista de esa auditoría.

### 7.4 Criterios de aprobación y equilibrio por fase (decisión del usuario)

Toda fase que cambie de forma significativa el comportamiento de la IA (2 y 4 en la prioridad inmediata; 7 y 9 más adelante) se aprueba solo si, en el banco de partidas y con escenarios equivalentes:

- **Fácil** no es más difícil que la versión actual: la tasa de victorias del jugador no empeora respecto a la IA de referencia.
- **Normal** ofrece un desafío intermedio y consistente: queda entre Fácil y Difícil y su resultado no varía mucho entre lotes de partidas.
- **Difícil** consigue una tasa de victorias de la IA superior a la de Normal en los mismos escenarios y condiciones.

Para lograrlo **solo** se ajustan parámetros de decisión de la IA (`enemyAiProfile.ts`). No se tocan costes, daños, ingresos ni estadísticas generales en estas fases. La IA nunca obtiene recursos ocultos ni se salta validaciones o reglas del jugador.

**Método estadístico (propuesta):**

- al menos 200 partidas por dificultad y escenario, con semillas fijas y registradas;
- tasas de victoria con intervalo de confianza del 95 % (Wilson);
- "no empeora" significa que la tasa del jugador en Fácil no queda por debajo del límite inferior del intervalo de la referencia;
- "Difícil supera a Normal" significa que los intervalos no se solapan;
- las partidas que alcanzan el tiempo máximo simulado (propuesta: 15 minutos) cuentan como empate y se informan aparte.

### 7.5 Banco de partidas (propuesta)

- **Qué es:** un script local de desarrollo ejecutado con `tsx`, no una puerta de CI.
- **Qué simula:** economía, construcción, producción y combate con `BattleSimulation` y los comandos de la fase 2. No usa render.
- **Jugador:** un **rival automático sencillo y fijo** (por ejemplo, una o dos estrategias guionizadas de construcción y producción). Es el mismo en todas las comparaciones.
- **IA:** la IA de referencia (lógica actual extraída en la fase 1) frente a la IA nueva, en las tres dificultades.
- **Sin recompensas tácticas:** hoy su ejecución y el momento del daño viven en el código de render (§6.9), y moverlas es una refactorización sensible que este diseño no incluye. Es una limitación declarada. Las decisiones de recompensas de la fase 4 se validan con pruebas unitarias sobre `decideEnemyTurn` y con partidas manuales. Si la auditoría 0a propone extraer la ejecución de recompensas al dominio, el banco las incorporará cuando exista.
- **Informe:** tasas de victoria, empates, duración media y semillas, guardado junto al plan de la fase.

## 8. HUD (resumen de impactos)

- Fase 1: la postura de la IA sale del controlador y `GameApplication` la pasa a `setAiStatus` (sin cambio visible).
- Fase 4: textos de postura legibles para el público ("Construyendo", "Defendiendo", "Preparando ataque") en Fácil; en Normal y Difícil se ocultan desde la fase 10.
- Fase 6: botón Defender / Atacar.
- Fase 10: sin oro enemigo, sin estado de la IA, vida del Nexo enemigo como último valor visto; mensajes claros cuando una recompensa no tiene objetivos visibles.

## 9. Rendimiento y pruebas

- La IA decide como mucho cada 0,35 s y no asigna memoria por fotograma fuera de su ciclo de decisión.
- La cuadrícula de niebla se actualiza a ~5 Hz; comprobar visibilidad es acceso directo a una celda.
- El límite de población y el coste de la niebla se validan con el panel de la fase 0b en un escenario de combate representativo y, cuando sea posible, en dispositivos reales (se documentan dispositivo, escenario y medidas).
- Pruebas mínimas por fase:
  - **1:** valores por dificultad; prioridad generador → barraca → torreta y comprobación de oro; elección soldado/tanque/nada por barraca libre; selección de recompensa y umbral del escudo; intervalo de decisión; la IA solo gasta del monedero enemigo.
  - **2:** comandos aceptan/rechazan igual para jugador e IA; validación de ubicación por facción.
  - **4:** transiciones de postura con histéresis; reservas; defensa por escalones; recompensas por umbral de valor; diferencias por dificultad.
  - **5-7:** destino frente a objetivo; opción B; puestos; radio de defensa; límite de población; mapeo postura ↔ orden.
  - **8-9:** estados de celda; memoria de estructuras; objetivos solo visibles; recompensas solo visibles; la IA no ve lo no explorado; Fácil sin niebla.

## 10. Lo que queda al constructor

- Nombres finales de archivos y tipos, siempre que respeten las fronteras de §6.
- Valores iniciales marcados como "propuesta" (radios, tiempos, constantes `k_*`), que se ajustan en las fases 4 y 11.
- Cómo se dibujan los fantasmas y los bordes de la niebla, dentro del presupuesto de rendimiento.
- El rival automático del banco de partidas: lo más sencillo que sirva para comparar dificultades.
