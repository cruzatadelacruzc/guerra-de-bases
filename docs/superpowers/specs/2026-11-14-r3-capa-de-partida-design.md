# R3 — Capa de partida: muertes, puntos de combate, rachas y resultado — diseño

Fecha: 2026-11-14 · Estado: aprobado (decisiones 1-3) e implementado; plan aprobado; informe de entrega en §10 · Instrucciones de referencia: "Implementation Instructions – R3: Independent Game Core" (del usuario)

Relación con los documentos anteriores:
- `docs/audits/2026-11-14-auditoria-responsabilidades.md`: §4.1, §4.3, paso R3 en §7 y pruebas en §8.2.
- `docs/superpowers/specs/2026-11-14-ia-enemiga-ordenes-niebla-design.md`: fase 3 en §7.3, el conocimiento de facción lee el dominio.
- Decisión del usuario: R3 y R5 presentan su diseño y las pruebas de caracterización **antes** de implementar.

---

## 1. Intención

Hoy las consecuencias de juego de una muerte se deciden dentro del bucle que sincroniza los visuales, en `updateCombat` de `GameApplication.ts`:

- puntos de combate (CP);
- rachas y contadores de bajas;
- borrado de la entidad ECS;
- victoria o derrota.

Por eso no se pueden probar sin Three.js, la IA y el futuro banco de partidas no pueden leerlas como dominio, y cualquier cambio visual puede alterarlas.

R3 las saca a una **capa de partida** sin Three.js, en `web/src/game/match/`. El juego debe comportarse **exactamente igual** que antes.

## 2. Comportamiento actual (verificado en el código, commit `5b988a8`)

### 2.1 Cuándo se procesa

- **Cadencia:** una vez por **fotograma**, en estado `PLAYING`, dentro de `updateCombat`.
- **Orden del fotograma:** IA → `advanceBattleSimulation` → artillería → ataque aéreo (estos dos pueden aplicar daño) → visual del escudo → `updateCombat`.
- **Dentro de `updateCombat`:**
  1. vida de los Nexos a la UI y aviso de daño;
  2. muertes de **unidades del jugador**;
  3. muertes de **unidades enemigas**;
  4. torretas y efectos visuales;
  5. muertes de **estructuras del jugador** (Nexo incluido);
  6. muertes de **estructuras enemigas**;
  7. comprobación de fin de partida.
- **Orden dentro de cada lista:** se recorre al revés (`for (i = length - 1; i >= 0; i--)`). El orden de las listas es el de creación de las entidades de esa facción.
- **Qué cuenta como muerte:** la vida ECS (`health.current`) es `<= 0` en ese momento, sea por proyectiles del paso fijo o por recompensas aplicadas en el mismo fotograma.

### 2.2 Muerte de una unidad (`updateUnitGroup`)

| Unidad muerta | Efecto |
|---|---|
| Enemiga | `playerKillStreak++`, `enemyKillStreak = 0`, `playerUnitsDestroyed++`, eventos de desbloqueo `unit_killed` (`byPlayer: true`, racha y tipo) y `kill_streak`, y `achievement destroy_20_units` cuando `playerUnitsDestroyed === 20`. El **jugador** suma CP: soldado 1, tanque 3 |
| Del jugador | `enemyKillStreak++`, `playerKillStreak = 0`, `playerUnitsLost++`, evento `unit_killed` (`byPlayer: false`, racha y tipo). El **enemigo** suma CP: soldado 1, tanque 3 |
| Ambos casos | Explosión, chatarra (tanque) o cadáver (soldado), borrado de la entidad ECS, del índice visual y del visual, y salida de la lista |

- **Atribución de los CP:** van a la facción contraria, sin importar quién mató (torreta, unidad o recompensa).
- **Uso de los valores:** las rachas y `playerUnitsDestroyed` solo alimentan eventos de desbloqueo, que hoy no tienen efecto (auditoría §4.6). `playerUnitsLost` aparece en el resumen de fin de partida ("losses").

### 2.3 Muerte de una estructura (`updateBuildingList`)

- **Estructura normal:** la facción contraria suma CP (torreta 4, generador 4, barraca 6) y aparecen las ruinas.
- **Nexo:** sin CP y con una explosión grande ("nuclear").
- **En ambos casos:** explosión, borrado de la entidad ECS (también la del Nexo, que guarda el monedero de su facción) y del visual.
- **Fin de partida:** tras procesar ambas listas, si `!hqExplodingSequence`:
  - si la vida del Nexo del jugador es `<= 0`, se llama a `beginMatchEnding(false)` (derrota);
  - **si no**, si la del Nexo enemigo es `<= 0`, a `beginMatchEnding(true)` (victoria).
  - Si caen los dos en el mismo fotograma, es **derrota**.

## 3. Decisiones de diseño (propuestas)

1. **Se mantiene la cadencia por fotograma.**
   - El procesamiento pasa al dominio, pero se llama en el mismo punto (el sitio de los pasos 2-7 de §2.1) y una vez por fotograma.
   - Moverlo al paso fijo de la simulación cambiaría el momento de los CP y del final, y el daño de las recompensas (que hoy llega fuera del paso fijo hasta R5) se procesaría en otro momento.
   - Pasarlo al paso fijo queda como posible decisión futura, con su propia medición.
2. **El dominio reproduce el orden actual.**
   - Unidades del jugador → unidades enemigas → estructuras del jugador → estructuras enemigas.
   - Dentro de cada grupo, de la entidad más nueva a la más antigua (el orden de creación del `World`, recorrido al revés).
   - Así salen idénticos el orden de los eventos de desbloqueo, las rachas finales y el desempate de §2.3.
3. **Alcance del estado de partida.**
   - Pasan al dominio: **CP por facción, rachas por facción, `playerUnitsDestroyed`, `playerUnitsLost`** y la detección del resultado.
   - Se quedan donde están: recargas, escudos, recompensas activas y reloj de juego. Pertenecen a la activación y a la ejecución de recompensas (R4 y R5). Moverlos ahora mezclaría fases.
   - El gasto de CP de las recompensas pasa a llamar a una función del dominio.
4. **El dominio borra las entidades muertas**, incluido el Nexo, igual que ahora, y devuelve **eventos** de lo ocurrido. La aplicación los usa para todo lo visual y lo sonoro: explosión, ruina, chatarra, cadáver, quitar el visual, hápticos y sonido (vía `createCinematicExplosion`) y eventos de desbloqueo.
5. **El final de partida no cambia.** El dominio informa del resultado (`'victory' | 'defeat' | null`). La aplicación sigue llamando a `beginMatchEnding` con la misma guarda `hqExplodingSequence`. Los dos mecanismos de cierre quedan intactos (decisión del usuario).
6. **El resultado es terminal y se informa una sola vez** (instrucciones de R3, §5).
   - Cuando `resolveDeaths` detecta victoria o derrota, la guarda en `MatchState.outcome` y la devuelve con `outcomeIsNew: true` solo en esa llamada.
   - Con la partida ya terminada, `resolveDeaths` no procesa más muertes: no suma CP, no toca rachas ni contadores, no borra entidades ni emite eventos. Devuelve el resultado guardado con `outcomeIsNew: false`.
   - Hoy ocurre lo mismo por otra vía: tras `beginMatchEnding` la partida sale de `PLAYING` y `updateCombat` deja de llamarse. El dominio pasa a garantizarlo por sí mismo.
7. **El sistema de desbloqueos no cambia.** Recibe los mismos eventos, con los mismos datos y en el mismo orden.
8. **Dependencias visuales sustituidas por estado de juego** (instrucciones de R3, §3):

| Hoy depende de… | Con R3 se lee de… |
|---|---|
| `playerHQ.hp` y `enemyHQ.hp` (copias en los objetos visuales) para decidir el final | `health` ECS de las entidades base |
| Las listas visuales `playerUnits`, `enemyUnits`, `playerBuildings` y `enemyBuildings` para saber qué entidades revisar y en qué orden | El `World`: soldados y estructuras por facción, en orden de creación (que coincide con el de las listas) |
| `RuntimeUnit.type` y `RuntimeStructure.type` para los CP | Componentes `soldierKind` y `building.kind` |
| `unit.mesh.position` y `b.position` para la posición de los restos | `transform` ECS, incluido en el evento (es la misma posición: el visual se copia del ECS ese fotograma) |

## 4. Arquitectura

```
web/src/game/match/
  MatchState.ts        CP, rachas y contadores por partida (datos + funciones puras)
  resolveDeaths.ts     sistema de muertes: detecta, puntúa, borra y devuelve eventos y resultado
  matchEvents.ts       tipos de los eventos
```

Contratos (nombres orientativos):

```ts
// MatchState.ts
export interface MatchState {
  combatPoints: Record<Faction, number>;
  killStreak: Record<Faction, number>;
  /** Enemy units destroyed (feeds the 20-kills achievement). */
  playerUnitsDestroyed: number;
  /** Player units lost (shown in the game-over summary). */
  playerUnitsLost: number;
  /** Terminal once set; resolveDeaths stops processing after it. */
  outcome: 'victory' | 'defeat' | null;
}
export function createMatchState(): MatchState;                 // todo a 0
export function spendCombatPoints(state: MatchState, faction: Faction, points: number): void;

// matchEvents.ts
export type MatchEvent =
  | { type: 'unitDied'; entity: Entity; faction: Faction; kind: SoldierKind; position: Position;
      /** Racha de la facción que mata, tras sumar; y si fue la baja nº 20 del jugador. */
      killerStreak: number; playerReachedTwentyKills: boolean }
  | { type: 'structureDestroyed'; entity: Entity; faction: Faction; kind: BuildingKind; position: Position };

export interface DeathResolution {
  /** In processing order (§3.2). Reused between frames; read before the next call. */
  readonly events: readonly MatchEvent[];
  readonly outcome: 'victory' | 'defeat' | null;
  /** True only on the call that detected the outcome. */
  readonly outcomeIsNew: boolean;
}

// resolveDeaths.ts
export function resolveDeaths(
  world: World,
  state: MatchState,
  difficulty: Difficulty,
  bases: Readonly<Record<Faction, Entity>>
): DeathResolution;
```

**Responsabilidades:**

- **`resolveDeaths`:**
  - recorre el `World` en el orden de §3.2;
  - para cada soldado o estructura con `health.current <= 0`, actualiza `MatchState` como en §2.2-2.3 (con `getCombatPointsFor(kind, difficulty)`), anota el evento y borra la entidad;
  - calcula `outcome` con la vida de los Nexos leída **antes** de borrarlos, y con la misma prioridad (derrota primero);
  - es el único sitio del juego donde una muerte suma puntos.
- **`GameApplication` (presentación):**
  - sincroniza vida y posición de los visuales como ahora;
  - llama a `resolveDeaths` en el punto de §2.1;
  - por cada evento: busca el visual en `targetObjects`, lanza explosión, ruina, chatarra o cadáver, quita el visual y lo saca de su lista, y para `unitDied` envía los eventos de desbloqueo con los datos del evento;
  - con el resultado, `beginMatchEnding`.
  - Las variables sueltas `playerCombatPoints`, `enemyCombatPoints`, `playerKillStreak`, `enemyKillStreak`, `playerUnitsDestroyed` y `playerUnitsLost` pasan a ser `matchState.*`.
- **Puntos de combate en otros sitios:** UI de recompensas, resumen de la IA, validación y gasto de recompensas, diagnóstico y escenario de recompensas leen o escriben `matchState.combatPoints`. `awardCombatPointsForDestruction` desaparece, porque lo hace `resolveDeaths`.

**Fronteras:** `game/match/**` solo importa `game/ecs/**` y `game/rewardSystem.ts`, sin Three.js, UI ni plataforma. Sin asignaciones por fotograma: la lista de eventos y la de entidades se reutilizan.

### 4.1 Diferencia conocida: solo herramientas de desarrollo (decisión 3, aceptada con documentación)

**Qué cambia exactamente.**

- **Hoy:** una muerte solo se procesa si la entidad está en una de las cuatro listas visuales de `GameApplication` (`playerUnits`, `enemyUnits`, `playerBuildings`, `enemyBuildings`).
- **Con R3:** `resolveDeaths` procesa cualquier soldado, estructura o base del `World` con `health.current <= 0`. El ECS es la única fuente de verdad sobre la vida, la existencia y el ciclo de vida de las entidades (decisión del usuario).
- **La diferencia** solo puede aparecer con una entidad con vida que esté en el `World` y no en esas listas.

**Todos los caminos que crean entidades** (verificado en `GameApplication.ts`, commit `5b988a8`):

| Camino | Crea | ¿Entra en una lista visual? |
|---|---|---|
| `BattleSimulation` → `createInitialBattle` | Las dos bases | Sí: `playerHQ` y `enemyHQ` se añaden en `startNewGame` |
| `registerStructureTarget`: construcción del jugador, `spawnAIBuilding` y escenario de combate del diagnóstico | Estructuras | Sí, en la misma función que crea la entidad |
| `runProductionSystem` → evento de producción → `createTroopVisual` (`advanceBattleSimulation` y escenario de estrés) | Soldados | Sí, en el mismo fotograma en que nacen y antes de procesar las muertes |
| `runWeaponSystem` | Proyectiles | No aplica: no tienen componente `health` |
| `runStressScenario` del diagnóstico (`createSoldierFactory` directo) | 10 barracas invisibles | **No.** Es el único caso: se crean, se usan en 21 avances síncronos de la simulación y se borran antes de que se ejecute ningún fotograma. Ningún soldado llega a su alcance en ese tiempo, así que nunca pueden morir, ni hoy ni con R3 |

**Conclusión:**

- **En partida, la diferencia no se produce:** no existe ninguna entidad con vida fuera de las listas visuales.
- **Efecto en herramientas de desarrollo:** solo teórico. Si un escenario de diagnóstico futuro creara una entidad sin visual y la dejara morir, R3 la puntuaría y la borraría. Hoy quedaría muerta en el `World` sin puntuar.
- **Rendimiento:** `resolveDeaths` recorre una vez por fotograma las entidades con `health`, con una lista reutilizada. Hoy se recorren las cuatro listas visuales. El coste es del mismo orden y se mide contra R0.
- **Sin dependencias nuevas:** `game/match/` solo importa `game/ecs/` y `game/rewardSystem.ts`.

## 5. Pruebas de caracterización (se escriben y se aprueban antes de implementar)

### 5.1 Modelo de referencia del comportamiento actual (temporal)

`web/src/game/match/legacyDeathReference.ts`, solo para pruebas y **solo mientras dura R3**:

- **Por qué es temporal:** las instrucciones de R3 (§7) piden no mantener dos implementaciones paralelas de las reglas.
- Se crea en la primera tarea y sirve de referencia a la prueba diferencial durante la extracción.
- Se **borra en la última tarea**, después de que la prueba diferencial pase contra la implementación final. Queda en el historial de git y su resultado se registra en el informe de entrega.
- La protección a largo plazo la dan las pruebas de reglas de §5.2, que no duplican la lógica: fijan valores esperados.

Qué contiene:

- es una **transcripción literal** de la parte de juego de `updateUnitGroup`, `updateBuildingList` y la comprobación de fin de `GameApplication.ts` en `5b988a8`;
- quita lo visual y conserva el orden, las condiciones y los efectos sobre el estado;
- trabaja sobre un `World` y listas de "objetos de partida" con `{ entity, faction, type }` en el orden en que la aplicación los guarda;
- registra lo que la aplicación hacía en el mismo orden: CP, rachas, contadores, eventos de desbloqueo y llamadas a `beginMatchEnding`;
- la revisión independiente final comprobará que la transcripción coincide con el original línea a línea.

### 5.2 Pruebas de reglas (fijan §2 con valores exactos)

1. **CP por baja:** soldado enemigo → jugador +1; tanque enemigo → jugador +3; soldado del jugador → enemigo +1; tanque del jugador → enemigo +3.
2. **CP por estructura:** torreta 4, generador 4, barraca 6 para la facción contraria; Nexo 0.
3. **Rachas:** tres soldados enemigos muertos en fotogramas distintos → racha del jugador 3. Muere uno del jugador → racha del jugador 0 y del enemigo 1.
4. **Orden dentro de un fotograma:** mueren a la vez un soldado del jugador y uno enemigo → racha del jugador 1 y del enemigo 0, porque las unidades del jugador se procesan primero.
5. **Contadores:** `playerUnitsLost` y `playerUnitsDestroyed`; el evento de las 20 bajas se marca una sola vez, justo en la vigésima.
6. **Una sola vez:** una entidad muerta da CP y evento una vez, y desaparece del `World`. Una llamada siguiente no vuelve a contarla.
7. **Muertes por recompensa:** el daño aplicado fuera del paso fijo (`applyDamageSystem`) antes de la llamada se procesa en esa misma llamada.
8. **Resultado:** cae el Nexo enemigo → `victory`; cae el propio → `defeat`; caen ambos → `defeat`; ninguno → `null`. Tras el borrado del Nexo, su entidad ya no está en el `World`.
9. **Vida exactamente 0** cuenta como muerte; vida positiva no.
10. **Orden de eventos:** coincide con §3.2 (unidades del jugador de la más nueva a la más antigua, luego las enemigas, luego estructuras del jugador y luego las enemigas).
11. **Resultado una sola vez:** la llamada que detecta la caída de un Nexo devuelve `outcomeIsNew: true`; las siguientes devuelven el mismo resultado con `outcomeIsNew: false`.
12. **Partida ya terminada:** con `outcome` fijado, una nueva muerte (vida ≤ 0 después del final) no suma CP, no cambia rachas ni contadores, no borra la entidad y no emite eventos.
13. **Un evento por muerte:** dos llamadas seguidas sin daño nuevo → la segunda no emite ningún evento.

### 5.3 Prueba diferencial contra el modelo de referencia

Con un generador con semilla, se generan cientos de batallas sin gráficos con `BattleSimulation`:

- bases;
- estructuras de ambos bandos;
- producción de soldados y tanques;
- daño aleatorio extra en algunos fotogramas, que imita las recompensas.

En **cada fotograma** se procesan las muertes con la referencia (sobre una copia del estado) y con `resolveDeaths`, y se comparan:

- CP;
- rachas;
- contadores;
- secuencia de eventos de desbloqueo;
- entidades borradas;
- resultado.

Criterio: **0 diferencias**. Es la prueba que demuestra que el comportamiento anterior se conserva.

### 5.4 Pruebas de presentación (sin WebGL)

No hay forma de ejecutar `GameApplication` sin navegador. La integración se comprueba en el navegador con el panel de diagnóstico:

- en el combate guionizado y en una partida contra la IA, los CP aumentan, las unidades muertas desaparecen y dejan restos, y no hay errores de consola;
- se fuerza una victoria y una derrota (diagnóstico: vida del Nexo a 0) y se comprueba que aparece la secuencia de fin y el resumen con las bajas correctas.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Orden de procesamiento distinto (rachas, eventos, desempate) | Pruebas 5.2 (4, 8 y 10) y diferencial 5.3 |
| Doble procesamiento: el dominio borra la entidad y la presentación vuelve a ver "vida ≤ 0" | La presentación ya no decide muertes; solo actúa sobre los eventos. Prueba 5.2.6 |
| Visual huérfano (entidad borrada sin quitar su visual) | La presentación procesa los eventos en el mismo fotograma, antes de sincronizar el resto. Comprobación en navegador y repetición de partidas del panel (geometrías estables) |
| Nexo borrado y monedero perdido durante la secuencia de fin | Igual que hoy: se borra en el mismo momento. No cambia |
| Rendimiento | Listas reutilizadas; un recorrido del `World` por fotograma en lugar de recorrer las listas visuales. Se mide contra R0 |

## 7. Fuera de alcance

- Mover las muertes al paso fijo.
- Recargas, escudos, recompensas activas y reloj de juego (R4 y R5).
- Ejecución de recompensas en el reloj de simulación (R5).
- Comandos compartidos (R4).
- El sistema de desbloqueos, los dos mecanismos de fin de partida y la duración con reloj real (decisión del usuario).
- Cambios de balance.

## 8. Plan de tareas previsto (se detallará en el plan de implementación)

1. **Pruebas primero:** modelo de referencia temporal, pruebas de reglas y prueba diferencial. Commit propio y revisión de la transcripción.
2. **`MatchState` y `resolveDeaths`** hasta que pasen 5.2 y 5.3.
3. **Conexión en `GameApplication`**: la presentación consume eventos, el estado suelto pasa a `matchState` y se borra la lógica antigua.
4. **Navegador, medición contra R0 y documentación.** Última pasada de la prueba diferencial, borrado del modelo de referencia temporal e informe de entrega con los siete puntos de las instrucciones de R3 (§8):
   - archivos creados y modificados;
   - responsabilidades extraídas;
   - lo que queda en `GameApplication` y por qué;
   - pruebas y resultados;
   - dependencias visuales restantes;
   - asuntos para R4 y R5;
   - confirmación de alcance.
5. **Revisión independiente** del diff completo.

## 9. Decisiones que necesitan confirmación

1. Mantener la cadencia **por fotograma** en R3 (§3.1).
2. Alcance del estado de partida limitado a CP, rachas, contadores y resultado; recargas, escudos y reloj en R4 y R5 (§3.3).
3. Aceptar la diferencia de §4.1, que solo afecta a herramientas de desarrollo.

**Estado (decisión del usuario):** 1 y 2 aprobadas. La 3 se acepta con la documentación de §4.1. El ECS es la única fuente de verdad sobre la vida, la existencia y el ciclo de vida de las entidades.

## 10. Informe de entrega

Commits en `main`: `13eda2a` (caracterización), `3b91c7d` (capa de partida), `0b0b8c7` (conexión en `GameApplication`) y el de cierre (navegador, medición, retirada de la referencia y documentación).

### 10.1 Archivos creados y modificados

**Creados**, en `web/src/game/match/`:

| Archivo | Contenido |
|---|---|
| `MatchState.ts` | CP y rachas por facción, unidades destruidas y perdidas, y resultado. `createMatchState` y `spendCombatPoints` |
| `DeathResolver.ts` | Resolución de las muertes de un fotograma |
| `matchEvents.ts` | `MatchEvent` (`unitDied` y `structureDestroyed`) y `DeathResolution` |
| `unlockEvents.ts` | `unlockEventsFor`: traduce un evento a las llamadas de desbloqueo de siempre |
| `MatchState.test.ts`, `deathRules.test.ts` | Pruebas |
| `matchHarness.ts` | Utilidad solo de pruebas: monta una batalla y ejecuta un fotograma de muertes como lo hace la aplicación |

**Temporales:** se crearon en `13eda2a` y se borraron en el commit de cierre, como se acordó. Siguen en el historial para revisar la fidelidad de la transcripción.

- `legacyDeathReference.ts`: transcripción literal de la lógica de `5b988a8`;
- `deathResolver.differential.test.ts`: prueba diferencial.

**Modificados:**

- `web/src/GameApplication.ts`;
- `README.md`: arquitectura de `game/match/` y `setNexusHealth`;
- la auditoría de responsabilidades: R3 marcado como hecho;
- el informe de rendimiento: §8.3;
- este diseño y su plan.

**Desviaciones de nombre respecto a §4:**

- `resolveDeaths` es la clase `DeathResolver` con un método `resolve`. Así reutiliza sus listas sin estado global de módulo.
- La traducción a desbloqueos está en su propio archivo, `unlockEvents.ts`, en lugar de dentro de `GameApplication`. Así se prueba sin navegador.

El contrato es el de §4.

### 10.2 Responsabilidades extraídas

Las reglas que antes estaban en `updateUnitGroup`, `updateBuildingList`, `awardCombatPointsForDestruction` y la comprobación final de `updateCombat` están ahora en `game/match/`, sin Three.js, DOM ni UI:

- **Detección de muertes** en el ECS (`health.current <= 0`), en el orden de §3.2.
- **Puntos de combate:**
  - por baja: soldado 1, tanque 3;
  - por estructura: torreta 4, generador 4, barraca 6;
  - el Nexo no da puntos;
  - el gasto de las recompensas pasa por `spendCombatPoints`.
- **Rachas y contadores:**
  - la racha de quien mata sube y la del otro bando se reinicia;
  - `playerUnitsDestroyed`, con el logro de la baja 20;
  - `playerUnitsLost`, que aparece en el resumen.
- **Borrado de la entidad** muerta, una sola vez.
- **Victoria y derrota:**
  - la vida de los Nexos se lee antes de borrar nada;
  - si caen los dos Nexos a la vez, derrota;
  - el resultado es terminal y se informa como nuevo una sola vez.
- **Eventos de dominio** ordenados y su traducción a desbloqueos.

### 10.3 Lo que queda en `GameApplication` y por qué

- **Representación de cada evento:**
  - explosión con sonido y temblor de cámara, mediante `createCinematicExplosion`;
  - chatarra, cadáver o ruina;
  - hongo nuclear del Nexo;
  - quitar la malla o la instancia;
  - sacar el visual de su lista y de `targetObjects`.

  Todo esto es Three.js y audio.
- **Envío de los desbloqueos a `UnlockService`:** el servicio es de la aplicación y el sistema de desbloqueos está fuera de alcance. Recibe las mismas llamadas, con los mismos datos y en el mismo orden.
- **`beginMatchEnding`:** la sesión, la secuencia final, los temporizadores y el resumen son de la aplicación. Los dos mecanismos de cierre no se tocan.
- **Sincronización de barras de vida, posición y orientación de los visuales, aviso de daño del Nexo y hápticos:** es presentación.
- **Validación, recargas, escudos y ejecución de recompensas:** son de R4 y R5 (decisión 2). Solo cambian de sitio la lectura y el gasto de CP, que pasan a `matchState`.

### 10.4 Pruebas y resultados

**Pruebas nuevas:**

- **`deathRules.test.ts` (14 pruebas):**
  - CP por baja y por estructura, sin CP por el Nexo;
  - rachas;
  - orden entre bandos;
  - contadores y logro de la baja 20;
  - una muerte se procesa una vez;
  - daño de recompensa resuelto en el mismo fotograma;
  - victoria, derrota y caída simultánea (derrota);
  - vida exactamente 0;
  - orden de los eventos y datos de desbloqueo;
  - el resultado se informa una vez;
  - nada se procesa tras el final;
  - un evento por muerte.
- **`MatchState.test.ts` (2 pruebas):** estado inicial y gasto por facción.

**Mientras existió la referencia temporal:**

- las 11 reglas se ejecutaron también sobre la transcripción de `5b988a8`, y pasaron con las dos implementaciones;
- la prueba diferencial comparó fotograma a fotograma 300 batallas aleatorias con semilla: 53.745 fotogramas, 3.188 muertes y 289 finales, 76 de ellos con los dos Nexos a la vez. Hubo **0 diferencias**, también en la última pasada tras conectar `GameApplication`;
- dos mutaciones deliberadas, el orden entre bandos y el desempate, hicieron fallar la diferencial.

**Resultado final:**

- `npm test`: 185 de 185. Son 12 menos que con la referencia temporal: las 11 ejecuciones duplicadas y la diferencial.
- `npm run typecheck` y `npm run build` correctos, con los códigos de salida comprobados.
- `setNexusHealth`, `__gameDiagnostics` y los escenarios no aparecen en `dist`.

**Navegador** (móvil emulado, sin errores de consola):

- **Combate guionizado tres veces:** los CP crecen, aparecen los restos y las geometrías se mantienen estables.
- **Derrota forzada:** 14 bajas en el resumen, igual a 26 entrenados − 12 vivos.
- **Derrota del jugador inactivo contra la IA.**
- **Victoria forzada con `setNexusHealth`.**

Detalle y medición en §8.3 del informe de rendimiento: sin cambios estructurales ni aumento claro de la simulación o del resto de gameplay.

### 10.5 Dependencias visuales restantes

- **Daño de las recompensas** (artillería y ataque aéreo): se aplica cuando llega el proyectil o la bomba visual, con el delta del fotograma (auditoría §4.2). Es la razón por la que las muertes se procesan por fotograma y no en el paso fijo. → **R5**.
- **Copias de `hp`, `maxHp` y `position` en `RuntimeUnit` y `RuntimeStructure`:** se siguen leyendo de ellas
  - las barras de vida;
  - el aviso de daño del Nexo (`playerHQ.hp`);
  - el porcentaje de daño del resumen (`enemyHQ.hp`);
  - la proporción de vida del Nexo en el resumen de la IA;
  - los candidatos de recompensa (`targetObjects`).

  Ninguna decide ya una muerte, puntos ni el resultado. → **R6**.
- **`targetObjects` y las cuatro listas visuales:** solo sirven para encontrar el visual de un evento y para la sincronización. → **R6**.

### 10.6 Asuntos para R4 y R5

- **R4:**
  - la validación y el gasto de recompensas como comandos compartidos;
  - la construcción de la IA, que todavía usa `spawnAIBuilding`;
  - una prueba de conexión del resumen y el ejecutor de la IA (pendiente de R2).
- **R5:**
  - el daño de recompensas en el reloj de simulación;
  - después, se podrá valorar mover la resolución de muertes al paso fijo, con su propia medición (decisión 1).
- **Diferencia de un fotograma, sin efecto visible:**
  - las estructuras muertas salen ahora del ECS al principio de `updateCombat`, antes de orientar las torretas (antes, después);
  - una torreta que apuntaba a una estructura que cae ese fotograma conserva un fotograma su orientación anterior;
  - las estructuras no se mueven, así que no se aprecia.
- **Sin cambios, como se acordó:**
  - `enemyAIEnabled` sigue sin restablecerse (auditoría §9). Los escenarios de combate lo dejan desactivado, y para medir una partida contra la IA tras ellos hay que recargar.
  - el sistema de desbloqueos;
  - los dos mecanismos de fin de partida;
  - la duración con reloj real.

### 10.7 Confirmación de alcance

`git diff 5b988a8 --stat` solo incluye:

- `game/match/`;
- `GameApplication.ts`;
- `README.md`;
- la auditoría;
- el informe de rendimiento;
- el diseño y el plan de R3.

**Sin cambios en:**

- la IA, costes, estadísticas, balance, recompensas (comportamiento, valores y tiempos) o desbloqueos;
- los mecanismos de fin y la duración de la partida;
- `enemyAIEnabled`;
- el render y la UI, salvo leer los CP de `matchState`;
- R4, R5 y R6-R8.

**Comprobaciones de código:**

- No hay módulos `.js` ni `.mjs` en `web/src/`.
- Los módulos de producción de `game/match/` solo importan `game/ecs/` y `game/rewardSystem.ts`. La utilidad de pruebas `matchHarness.ts` además lee la vida de `definitions/structures.ts`.
- No hay dependencias circulares ni dependencias nuevas.
- `setNexusHealth` solo existe con `import.meta.env.DEV` y `?diagnostics=1`. Solo escribe la vida ECS: el resultado sale de la resolución normal.
