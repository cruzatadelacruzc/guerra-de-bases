# R5 — Recompensas independientes de las animaciones — diseño

Fecha: 2026-11-20 · Estado: **aprobado (revisión 2)** (opción A; requisitos 1-6 y aclaraciones 7-10 del usuario incorporados) · Commit de partida: `f54dc77`

Relación con los documentos anteriores:
- `docs/audits/2026-11-14-auditoria-responsabilidades.md`: paso R5 en §7, problema en §4.2, pruebas previas en §8.2.
- `docs/superpowers/specs/2026-11-14-r3-capa-de-partida-design.md`: decisión 1 (muertes por fotograma) y asuntos para R5 en §10.6.
- `docs/superpowers/specs/2026-11-20-r4-comandos-compartidos-design.md`: `activateReward` y candidatos desde el ECS en §5.6; R5 fuera de alcance en §8.

---

## 1. Intención

> R5 — Recompensas independientes de las animaciones. Hacer que las recompensas funcionen desde la simulación. Artillería y ataques aéreos aplicarán su daño mediante el reloj del juego; las animaciones solo representarán lo ocurrido.

Hoy `updateActiveArtillery` y `updateActiveAirStrikes` (`GameApplication.ts:2130` y `:2270`) aplican el daño cuando el proyectil o la bomba **visual** llega. Las listas de efectos guardan `THREE.Vector3` y mallas como estado de juego. Sin render no hay daño de recompensas, y por eso el banco de partidas y la comparación de R4 las excluyen.

R5 lleva la línea de tiempo de los ataques a un módulo de dominio sin Three.js. Ese módulo decide cuándo cae cada impacto y aplica el daño. La vista solo dibuja lo que el dominio dice.

**Por qué ahora:** la auditoría colocaba R5 después de las fases 3-4 de la IA, pero permite adelantarlo (§7). Adelantarlo deja las recompensas listas para el banco de partidas.

## 2. Decisión del usuario (2026-11-20)

**Opción A:** la ejecución de recompensas avanza con `gameplayClockMs` y el delta del fotograma, en el mismo punto del fotograma que hoy. Se conserva el modelo de procesamiento por fotograma de R3 (decisión 1).

**Requisitos:**

1. **Una sola autoridad de tiempo.** `rewardExecution.ts` es lo único que decide cuándo ocurre un impacto. La vista deriva de su estado los proyectiles, el avión y las bombas, y nunca decide un impacto por su cuenta. La pausa y `MATCH_ENDING` congelan la línea de tiempo. Empezar una partida nueva borra los ataques pendientes.
2. **Rumbo del avión.** El rumbo de la cámara del jugador se captura al activar y se guarda como dato inmutable del ataque. Mover la cámara después no cambia un ataque en curso. Hay que comprobar que el rumbo fijo de la IA conserva su comportamiento.
3. **Objetivos.** Se resuelven desde el ECS en el momento real del impacto, no al activar. Se conservan el radio, el filtro de objetivos, el daño y el escudo. Nada depende de Three.js, de `targetObjects` ni de las copias visuales de la vida.
4. **Varios impactos.** Cada impacto que vence durante un fotograma se procesa exactamente una vez y en orden cronológico, también con deltas grandes. No se pierde ni se duplica ninguno.
5. **Eventos de presentación.** Los eventos de impacto solo sirven para presentar. El dominio aplica el daño tanto si alguien dibuja o lee el evento como si no.
6. **Sin render.** Conectar con `aiMatchRunner` vale como demostración limitada de que las recompensas se ejecutan sin render. No entran en R5 la fase 3 de la IA, el banco de partidas ni cambios de equilibrio.

**Pruebas de caracterización:** comparan el comportamiento heredado con la ejecución nueva del dominio usando secuencias de delta idénticas. Verifican los fotogramas de impacto, las posiciones de impacto, las entidades afectadas, el daño, la reducción del escudo y el fin de partida.

**Aclaraciones de la revisión del diseño (2026-11-20):**

7. **Hora nominal coherente en los dos caminos de activación.** La IA activa dentro del fotograma, cuando `gameplayClockMs` ya incluye el delta, y el jugador activa entre fotogramas. La hora nominal de cada impacto se calcula desde el inicio del fotograma (`nowMs - delta·1000`) y desde el contador acumulado **antes** de avanzar, no desde `startedAtMs`. `startedAtMs` queda para la UI y la duración (§5.4).
8. **`aiMatchRunner` con `strikes` apagado.** Los ataques programados no se acumulan. Se aplica solo a esa configuración del banco, sin un camino distinto en el juego normal, y las cifras de R4 no cambian (§5.7).
9. **Sin dependencias circulares.** `rewardExecution.ts` usa el daño compartido (`applyRewardDamage`, en `match/shield.ts`) y el criterio de objetivo compartido (`match/strikeTargets.ts`, nuevo) sin importar `rewardCommand.ts` (§5.1).
10. **Impactos simultáneos que se solapan.** Comparación estricta de fotogramas, puntos y estado de juego al final de cada fotograma. Cuando varios impactos de un fotograma se solapan, se comparan sus resultados agregados en lugar de qué impacto alcanzó a cada entidad (§6.2).

## 3. Comportamiento actual (verificado en el código, commit `f54dc77`)

### 3.1 Artillería (`triggerArtilleryStrike`, `updateActiveArtillery`)

- **Activación:** crea un efecto con `elapsed = 0` y tres impactos, uno por desfase de `ARTILLERY_IMPACT_OFFSETS` (`(0,0)`, `(6,4)`, `(-5,-3)`).
  - **Punto de impacto:** el punto de mira más el desfase, a altura 0.
  - **Momento de lanzamiento:** `launchAt = 0,7 + i·0,7 s`.
  - **Origen:** el visual del Nexo. Solo afecta a la animación.
- **Cada fotograma:**
  - `strike.elapsed += delta`.
  - Un proyectil se lanza el primer fotograma en que `elapsed - launchAt ≥ 0`. En ese momento salen la malla, la explosión de boca y dos sonidos (cañón y silbido).
  - El proyectil cae el primer fotograma en que `(elapsed - launchAt) / 2,2 ≥ 1`. Los impactos se recorren en orden de índice.
- **Al caer:**
  - se lee la lista de candidatos y se aplica `damage` a cada uno que esté a una distancia `≤ ARTILLERY_IMPACT_RADIUS` (12) en el plano XZ;
  - después vienen la explosión cinemática y el háptico.
- **Final:** el efecto se quita cuando caen los tres impactos. Con el reloj, los impactos caen a 2,9, 3,6 y 4,3 s.
- **Daño:** `getRewardDefinitionForDifficulty('artillery_strike', aiDifficulty).damage ?? 120`, leído en cada fotograma.

### 3.2 Ataque aéreo (`triggerAirStrikeForFaction`, `updateActiveAirStrikes`)

- **Activación:**
  - `start = aim - heading·60` y `end = aim + heading·60`, a la altura de crucero;
  - `duration = 5,2 s`;
  - cuatro bombas, una por desfase de `AIR_STRIKE_BOMB_OFFSETS` (`(0,0)`, `(5,3)`, `(-4,-3)`, `(8,-5)`), con `target = aim + desfase`.
- **Rumbo:**
  - jugador: `cameraGroundHeading()`, el rumbo de la cámara en el plano, unitario, que se lee una sola vez al activar;
  - IA: `{x: -1, z: 0}`.

  Ya hoy el rumbo queda fijado en `start` y `end` al activar.
- **Cada fotograma:**
  - `elapsed += delta` y `progress = min(1, elapsed / 5,2)`;
  - la posición del avión es `x, z = lerp(start, end, progress)`, con `lerp(a, b, t) = (1 - t)·a + t·b` (implementación de `THREE.MathUtils.lerp`).
- **Soltar una bomba:** ocurre el primer fotograma en que `(x - target.x)·(end.x - start.x) + (z - target.z)·(end.z - start.z) ≥ 0`. En ese mismo fotograma ya cuenta `bomb.elapsed += delta`, así que la caída empieza a contar con el delta completo del fotograma en que se suelta.
- **Caída:**
  - la bomba cae el primer fotograma en que `bomb.elapsed / 0,72 ≥ 1`;
  - el daño se aplica en `target`, no donde se soltó, a los candidatos a una distancia `≤ AIR_STRIKE_EFFECTIVE_RADIUS` (12);
  - el orden es explosión y háptico primero, daño después. Las bombas se recorren en orden de índice.
- **Final:** el efecto se quita cuando `progress ≥ 1` y han caído todas las bombas.
- **Daño:** `.damage ?? 220`.

### 3.3 Fotograma, pausa, fin y partida nueva

- **Orden en `animate`, solo en `PLAYING`:** `gameplayClockMs += delta` → cámara → IA (puede activar) → `advanceBattleSimulation` (simulación y eventos de producción) → `updateActiveArtillery` → `updateActiveAirStrikes` → escudos visuales → `updateCombat` (muertes, CP, resultado).
  - El daño de un impacto y la muerte que provoca se resuelven en el mismo fotograma.
  - Un ataque que activa la IA cuenta ya el delta de ese mismo fotograma.
  - Un ataque que activa el jugador entre fotogramas empieza a contar en el siguiente.
- **Delta:** `GameFrameLoop` lo limita a 0,1 s. Al reanudar, `resetDelta`.
- **`PAUSED`, `MATCH_ENDING`, `GAMEOVER`, `MENU`:** los efectos no avanzan. Los visuales se quedan donde estaban y un impacto pendiente no cae nunca.
- **Partida nueva:**
  - `teardownMatch` llama a `clearActiveRewardEffects` (quita y libera mallas);
  - `startNewGame` crea un `matchState` nuevo y vacía `playerActiveRewardUntil` y `enemyActiveRewardUntil`;
  - `prepareRewardScenario` (diagnóstico) hace lo mismo a mitad de partida.

### 3.4 Candidatos, daño y escudo

- **`getRewardTargetCandidates(faction)`:** entidades `targetable` de la facción contraria con `health.current > 0` y posición **leídas del ECS**. Además exige una entrada en `targetObjects` con `type !== 'hq'`.
  - La lista se pide de nuevo **en cada impacto**, así que una entidad que muere con el primer impacto ya no recibe el segundo.
  - Las posiciones son las del momento del impacto.
- **Requisito de `targetObjects`: en la práctica no excluye a nadie.**
  - Las estructuras se registran al ejecutar su comando (`:1515`).
  - Las unidades se registran con los eventos de producción, que se vacían dentro de `advanceBattleSimulation` **antes** de las recompensas (`:1763`).
  - Las bajas salen de `targetObjects` y del ECS en `updateCombat`, después de las recompensas. Entre medias, su vida es 0 y el filtro de vida ya las excluye.
- **`applyDamage`:**
  - llama a `applyRewardDamage`, que pasa el daño por `applyFactionShield` con `nowMs = gameplayClockMs` y después por `applyDamageSystem` (`max(0, vida - daño)`);
  - copia el resultado en `runtime.hp`, una copia visual que `updateCombat` vuelve a copiar del ECS en ese mismo fotograma (`:1705`, `:1906`).
- **El escudo nunca reduce el daño de un ataque.** `applyFactionShield` solo reduce el daño cuando el objetivo es el Nexo, y el Nexo nunca es candidato. Hoy el escudo no tiene ningún efecto sobre la artillería ni sobre el ataque aéreo. Se conserva tal cual (§7).

### 3.5 Lo demás que toca R5

- **`activeRewardUntil` de los ataques:**
  - es `gameplayClockMs + 4,3 s` (artillería, `artilleryStrikeDurationSeconds(3)`) o `+ 5,2 s` (avión);
  - lo fija `representRewardActivation` y solo lo lee `updateRewardUI`;
  - el de la IA se escribe pero nadie lo lee.
- **Cinemáticas del jugador** (`playArtilleryCinematic`, `playAirStrikeCinematic`): calculan con las mismas constantes cuánto se queda la cámara. Solo encuadran.
- **Diagnóstico:** cuenta `activeArtilleryStrikes` y `activeAirStrikes` con la longitud de las listas visuales.
- **`aiMatchRunner`:** la IA activa recompensas con `activateReward` (cobro, recarga), pero ningún ataque se ejecuta. R4 dejó documentado que la comparación excluye el daño de recompensas, y su referencia heredada (`legacyEnemyExecutor`) lanza un error si se intenta activar una recompensa en el escenario de comparación.

## 4. Enfoques considerados

**Reloj (lo decidió el usuario):**

- **A. Por fotograma con `gameplayClockMs` — elegido.** Mismo punto del fotograma y misma cadencia que hoy. Coherente con la decisión 1 de R3.
- **B. Dentro del paso fijo (1/30 s).** Los impactos se moverían hasta 33 ms y se mezclaría con la decisión pendiente de llevar las muertes al paso fijo. Descartado para R5.

**Cómo programa el dominio los impactos (decisión del diseñador):**

- **A1. Replicar fotograma a fotograma la aritmética actual — elegido.** El dominio acumula `elapsed` con el mismo delta y aplica las mismas comparaciones (`≥ 1` de progreso, prueba de "avión sobre el blanco" con el mismo `lerp`). Es pura aritmética, sin Three.js.
  - Los impactos caen **en el mismo fotograma exacto** que hoy, con cualquier secuencia de delta.
  - La comparación con la referencia puede exigir igualdad estricta, no tolerancias.
- **A2. Calcular de antemano la hora de cada impacto y aplicarlo cuando el reloj la alcance.** Es más simple, pero las bombas caerían hasta un fotograma más tarde (el fotograma en que se suelta ya cuenta su delta completo), y la artillería podría variar un fotograma por redondeo entre `Σdelta` y la resta de relojes. Descartado: la auditoría marca R5 como riesgo alto precisamente por los tiempos exactos.

## 5. Diseño

### 5.1 Módulos

| Módulo | Contenido | Three.js |
|---|---|---|
| `game/rewardSystem.ts` | Constantes de tiempo que hoy están en `GameApplication`: `AIR_STRIKE_FLIGHT_SECONDS` (5,2), `AIR_STRIKE_RUN_HALF_LENGTH` (60), `AIR_STRIKE_SPEED`, `AIR_STRIKE_BOMB_FALL_SECONDS` (0,72), `ENEMY_AIR_STRIKE_HEADING` (`{x:-1, z:0}`). También `nominalBombLandingSeconds(offset, heading)`, que **solo** usa la cinemática; el orden de los impactos no lo usa (§5.4) | No |
| `game/match/strikeTargets.ts` (nuevo) | `isStrikeTarget(world, entity, attacker)`: el criterio compartido de objetivo (targetable, facción contraria, vida > 0, no es Nexo). Sin estado | No |
| `game/match/shield.ts` (sin cambios) | `applyRewardDamage`, el único camino del daño de recompensa con el escudo (R4) | No |
| `game/match/rewardExecution.ts` (nuevo) | Datos de los ataques en curso, `scheduleStrike`, `advanceStrikes`, `clearStrikes` | No |
| `game/match/MatchState.ts` | `strikes` (ataques en curso y siguiente id) y `strikeActiveUntilMs` por facción | No |
| `game/commands/rewardCommand.ts` | `activateReward` programa el ataque tras cobrarlo; recibe el rumbo | No |
| `game/ai/executeEnemyTurn.ts` | Pasa `ENEMY_AIR_STRIKE_HEADING` | No |
| `rendering/RewardEffectsView.ts` (nuevo) | Proyectiles, avión y bombas dibujados desde el estado del dominio; mallas compartidas y liberación | Sí |
| `GameApplication.ts` | Conecta: avanza el dominio, lee los eventos, dispara explosiones, sonidos y hápticos, y las cinemáticas | Sí |
| `game/ai/aiMatchRunner.ts` | Opción `strikes` para ejecutar los ataques sin render (§5.7) | No |

**Dependencias (aclaración 9), todas en un solo sentido:**

```
commands/rewardCommand.ts ──► match/rewardExecution.ts ──► match/shield.ts ──► ecs/systems.ts
        │                              │
        └──────────────► match/strikeTargets.ts ◄───────┘
```

- **`rewardCommand.ts`** importa `scheduleStrike` de `rewardExecution.ts` e `isStrikeTarget` de `strikeTargets.ts`. `rewardTargetCandidates` sigue en `rewardCommand.ts`, con la misma firma pública de R4 (la usan la UI, la IA y el diagnóstico), pero filtra con `isStrikeTarget`.
- **`rewardExecution.ts`** importa `applyRewardDamage` de `shield.ts`, `isStrikeTarget`, los tipos de `MatchState` y las constantes de `rewardSystem.ts`. **No importa `rewardCommand.ts` ni nada de `commands/`.**
- **`strikeTargets.ts`** solo importa `ecs/components.ts` y el tipo `World`.
- **Ninguno de los tres** importa `three`, `rendering/`, `ui/` ni `platform/`.

Una prueba de límites, como `constructionBoundary.test.ts`, lee el código de `rewardExecution.ts` y `strikeTargets.ts` y falla si importan `commands/`, `three`, `rendering/`, `ui/` o `platform/` (§6.3).

### 5.2 Datos

```ts
type StrikeId = 'artillery_strike' | 'air_strike';

interface ArtilleryShellState {
  readonly x: number; readonly z: number;      // punto de impacto (mira + desfase)
  readonly launchAtSeconds: number;            // 0,7 + i·0,7
  launched: boolean;
  landed: boolean;
}
interface BombState {
  readonly x: number; readonly z: number;      // punto de impacto (mira + desfase)
  released: boolean;
  releaseX: number; releaseZ: number;          // posición del avión al soltarla (solo para dibujar)
  releaseProgress: number;                     // progreso del vuelo al soltarla (altura de la bomba en la vista)
  fallElapsedSeconds: number;
  landed: boolean;
}
interface StrikeBase {
  readonly id: number;                         // único dentro de la partida
  readonly faction: Faction;
  readonly aimX: number; readonly aimZ: number;
  readonly damagePerImpact: number;            // fijado al programar
  readonly radius: number;
  readonly startedAtMs: number;                // `nowMs` al activar; solo para UI y duración, nunca para ordenar (§5.4)
  elapsedSeconds: number;
}
type ActiveStrike =
  | (StrikeBase & { readonly kind: 'artillery_strike'; readonly shells: readonly ArtilleryShellState[] })
  | (StrikeBase & {
      readonly kind: 'air_strike';
      readonly heading: Readonly<{ x: number; z: number }>;   // copia congelada
      readonly startX: number; readonly startZ: number;
      readonly endX: number; readonly endZ: number;
      readonly bombs: readonly BombState[];
    });

interface StrikeTimeline { readonly active: ActiveStrike[]; nextId: number }
```

- **`MatchState`:**
  - **`strikes: StrikeTimeline`**. Como `createMatchState` crea una nueva en cada partida, empezar partida borra los ataques pendientes sin pasos extra (requisito 1).
  - **`rewards[faction].strikeActiveUntilMs: Partial<Record<StrikeId, number>>`** sustituye a `playerActiveRewardUntil` y `enemyActiveRewardUntil` para los ataques. El escudo ya usa `shieldUntilMs` desde R4.
- **Inmutable:** lo marcado `readonly` no cambia una vez programado (mira, rumbo, puntos de impacto, daño, radio).
- **Mutable:** solo el avance de la línea de tiempo (`elapsed`, `launched`, `released`, `landed`, posición de suelta).
- **Rumbo:** se copia y se congela (`Object.freeze({x, z})`). La cámara no guarda referencia a él (requisito 2).
- **Asignaciones:** los arrays se crean al programar (como mucho 4 bombas o 3 proyectiles). `advanceStrikes` no asigna nada salvo los eventos de presentación (§5.4).

### 5.3 Programar (`activateReward` y `scheduleStrike`)

```ts
function activateReward(
  ctx: CommandContext, faction: Faction, id: RewardId,
  options?: { heading?: Readonly<{ x: number; z: number }> }
): CommandResult<{ aim?: StrikeAim; definition: RewardDefinition; strikeId?: number }, RewardRejection>;

function scheduleStrike(
  match: MatchState, faction: Faction, id: StrikeId, aim: StrikeAim,
  heading: Readonly<{ x: number; z: number }> | undefined, difficulty: Difficulty, nowMs: number
): ActiveStrike;
```

- **Orden de `activateReward`:** igual que en R4 (partida en juego → validación → mira → cobro → recarga). Para los ataques, añade `scheduleStrike` **después del cobro**. Ningún rechazo programa nada.
- **Rumbo:**
  - es **obligatorio** para `air_strike` y se ignora en la artillería;
  - si falta, no es finito o no es unitario (`|‖h‖ - 1| > 1e-6`), `activateReward` lanza un error de programación antes de cobrar, porque es un fallo del llamador y no una regla de juego;
  - no se renormaliza, para no cambiar ni un bit del rumbo que da la cámara.
- **Llamadores:**
  - **jugador:** `activateRewardForFaction` pasa `cameraGroundHeading()` leído en ese momento;
  - **IA:** `executeEnemyTurn` pasa `ENEMY_AIR_STRIKE_HEADING`, el mismo `{x:-1, z:0}` de hoy.
- **`scheduleStrike`:**
  - **Artillería:** proyectiles en `aim + desfase` con `launchAtSeconds` de §3.1.
  - **Ataque aéreo:**
    - `start = aim - heading·60` y `end = aim + heading·60`;
    - bombas en `aim + desfase`, con `releaseX/Z` y `releaseProgress` a 0 hasta que se sueltan.
  - **Ambos:**
    - `damagePerImpact = getRewardDefinitionForDifficulty(id, difficulty).damage ?? 120 | 220` (mismos valores de respaldo que hoy);
    - `elapsedSeconds = 0`;
    - `strikeActiveUntilMs[id] = nowMs + 4,3 s | 5,2 s`.
- **Cinemática y avisos:** `representRewardActivation` sigue lanzando la cinemática del jugador, los avisos y la sirena. Ya no crea efectos ni fija `activeRewardUntil`.

### 5.4 Avanzar (`advanceStrikes`)

```ts
type StrikeEvent =
  | { type: 'shell-launched'; strikeId: number; faction: Faction; index: number }
  | { type: 'bomb-released'; strikeId: number; faction: Faction; index: number }
  | { type: 'impact'; strikeId: number; faction: Faction; kind: StrikeId; index: number; x: number; z: number }
  | { type: 'strike-finished'; strikeId: number };

function advanceStrikes(
  world: World, match: MatchState, bases: Readonly<Record<Faction, Entity>>,
  deltaSeconds: number, nowMs: number, difficulty: Difficulty,
  events: StrikeEvent[]   // el llamador lo reutiliza; se vacía al entrar
): void;
```

- **Algoritmo por ataque**, en una réplica exacta de §3.1 y §3.2:
  1. `elapsedSeconds += delta`.
  2. **Artillería:**
     - proyectil lanzado si `elapsed - launchAt ≥ 0`;
     - vencido si `min(1, (elapsed - launchAt) / 2,2) ≥ 1`.
  3. **Ataque aéreo:**
     - `progress = min(1, elapsed / 5,2)`;
     - el avión está en `lerp(start, end, progress)`, con la fórmula de §3.2;
     - se suelta una bomba con la misma prueba de "sobre el blanco", y `fallElapsed += delta` cuenta ya en ese fotograma;
     - la bomba vence si `min(1, fallElapsed / 0,72) ≥ 1`.
- **Orden cronológico (requisito 4):**
  - se recogen todos los impactos vencidos en este fotograma, de todos los ataques;
  - se ordenan por **hora nominal**, después por `strikeId` y después por índice;
  - se aplican uno a uno.

  El orden no cambia **cuándo** cae cada impacto, que sigue siendo el fotograma de la réplica. Solo decide el orden dentro de un mismo fotograma.
- **Hora nominal (aclaración 7):** el instante, dentro del fotograma, en que el contador del impacto cruza su umbral. Se calcula con una sola regla para todos los impactos y los dos caminos de activación:

  ```
  frameStartMs = nowMs - deltaSeconds·1000            // nowMs ya incluye el delta de este fotograma
  nominalMs    = frameStartMs + (umbral - contadorAntes)·1000
  ```

  `contadorAntes` es el valor del contador que se compara con el umbral, leído **antes** de sumarle el delta de este fotograma:

  | Impacto | Contador | Umbral |
  |---|---|---|
  | Proyectil de artillería | `strike.elapsedSeconds` | `launchAt + 2,2` |
  | Bomba | `bomb.fallElapsedSeconds` | `0,72` |

  Para la bomba que se suelta y cae en el mismo fotograma, `contadorAntes` es 0. Eso coincide con el modelo heredado, en el que la caída empieza a contar con el delta completo del fotograma en que se suelta (§3.2).

  **Por qué no `startedAtMs`:**
  - **la IA** activa dentro del fotograma, con `gameplayClockMs` ya incrementado (§3.3), y `advanceStrikes` suma a continuación el delta de ese mismo fotograma. El origen real de `elapsed` es por tanto `frameStartMs`, no `startedAtMs`, y la diferencia es un delta;
  - **el jugador** activa entre fotogramas, y su `elapsed` empieza a contar con el fotograma siguiente, cuyo `frameStartMs` coincide con `startedAtMs`.

  La regla de arriba no depende del momento de activación: solo usa el inicio del fotograma y el contador antes de avanzar, así que las dos facciones quedan en la misma línea de tiempo.

  `startedAtMs` sigue siendo el `nowMs` de la activación y solo alimenta `strikeActiveUntilMs` (4,3 s o 5,2 s después, igual que hoy) y la UI.
- **Desempate:** dos impactos con la misma hora nominal se ordenan por `strikeId` (orden de activación) y después por índice. Por ejemplo, dos bombas que se sueltan en el mismo fotograma tienen la misma hora nominal y se aplican por índice, igual que en la referencia.
- **Exactamente una vez:**
  - el impacto se marca `landed` antes de aplicar su daño;
  - un impacto `landed` no vuelve a evaluarse;
  - un delta grande vence todos los impactos pendientes a la vez y se aplican todos (§6.2, secuencias con delta de 10 s).
- **Objetivos en el momento del impacto (requisito 3):**
  - para cada impacto se recorre el ECS con `isStrikeTarget` (`targetable`, facción contraria, `health.current > 0`, no es Nexo por `building.kind !== 'hq'`) y se añade la distancia XZ `≤ radius` con `Math.hypot`, igual que hoy;
  - a cada objetivo se le aplica `applyRewardDamage(world, match, bases, entity, damagePerImpact, nowMs, difficulty)` de `match/shield.ts`;
  - no se crea un array intermedio;
  - no se toca `targetObjects` ni ninguna copia `hp`.
- **Eventos (requisito 5):**
  - se escriben después de aplicar el daño;
  - el daño no depende de que alguien lea `events`;
  - como `events` se vacía al entrar, nadie que no lo lea acumula memoria (el banco no lo lee);
  - `impact` se emite también si el impacto no alcanzó a nadie, igual que hoy explota aunque no haya objetivos.
- **Final:** un ataque se quita de `active` cuando:
  - artillería: han caído todos los proyectiles;
  - ataque aéreo: `progress ≥ 1` y han caído todas las bombas.

  Después se emite `strike-finished`.
- **Pausa y fin:**
  - `advanceStrikes` solo se llama en `PLAYING`, y sin llamada la línea de tiempo no avanza;
  - además, no hace nada si `match.outcome !== null`. No cambia nada hoy, porque el resultado se fija en `updateCombat`, después de las recompensas, y al fotograma siguiente ya no se está en `PLAYING`. Es una guarda para que el banco tampoco aplique daño después del resultado.

### 5.5 Vista (`RewardEffectsView`)

- **Recibe:** `scene`, las geometrías y materiales compartidos de proyectil, y la fábrica del avión. Las explosiones, sonidos y hápticos los dispara `GameApplication` a partir de los eventos, como hoy.
- **`sync(strikes: StrikeTimeline)`, una vez por fotograma tras `advanceStrikes`:** por cada ataque activo crea su visual la primera vez (indexado por `strike.id`) y lo coloca con el estado del dominio:
  - **proyectil:** progreso `min(1, (elapsed - launchAt) / 2,2)` sobre `ballisticPoint(origen, punto, apex)`, visible entre `launched` y `landed`. El origen (sobre el Nexo) y el apex son solo visuales y se calculan en la vista;
  - **avión:** `progress` del dominio, altura de crucero más arco y `orientAircraftAlongFlightPath`, como hoy;
  - **bomba:** visible entre `released` y `landed`. Interpola desde `releaseX/Z` y la altura derivada de `releaseProgress` hasta el punto de impacto con `min(1, fallElapsed / 0,72)`.
- **Visuales huérfanos:** los ataques que ya no están en `active` pierden sus visuales, que se quitan y se liberan como en `clearActiveRewardEffects`.
- **La vista no decide impactos:** no compara progresos para aplicar nada y no emite eventos. Si un fotograma no se dibujara, el daño ya estaría aplicado.
- **`clear()`:** quita y libera todo. Se llama en `teardownMatch` y `prepareRewardScenario`.
- **Pausa y `MATCH_ENDING`:** no se llama a `sync`, así que los visuales se quedan quietos como hoy.
- **Cinemáticas:** se quedan en `GameApplication` (cámara). `playAirStrikeCinematic` usa `nominalBombLandingSeconds` del dominio en lugar de rehacer la fórmula. Solo encuadra.

### 5.6 `GameApplication`

- **Fotograma** (mismo sitio que hoy):
  ```
  advanceBattleSimulation(delta, time)
  advanceStrikes(world, matchState, bases, delta, gameplayClockMs, aiDifficulty, strikeEvents)
  representStrikeEvents(strikeEvents)
  rewardEffectsView.sync(matchState.strikes)
  updateNexusShieldVisuals()
  updateCombat(delta)
  ```
- **`representStrikeEvents`**, que reproduce los efectos de hoy en el mismo fotograma:
  - `shell-launched`: explosión de boca, cañón y silbido;
  - `impact`: `createCinematicExplosion` y `haptics.strikeImpact()`.

  En el ataque aéreo de hoy la explosión va antes del daño, y ahora va después. Ambos ocurren dentro del mismo fotograma antes de dibujar, así que no se nota.
- **Se eliminan:**
  - `updateActiveArtillery`, `updateActiveAirStrikes`, `getRewardTargetCandidates` y `applyDamage`;
  - los tipos `ArtilleryEffect` y `AirStrikeEffect`, las listas `artilleryEffects` y `airStrikeEffects`;
  - `playerActiveRewardUntil` y `enemyActiveRewardUntil`.
- **`updateRewardUI`** lee `matchState.rewards.player.strikeActiveUntilMs[id]` en lugar de `playerActiveRewardUntil`.
- **Diagnóstico:** cuenta los ataques activos por tipo en `matchState.strikes.active`. `prepareRewardScenario` llama a `clearStrikes`, vacía `strikeActiveUntilMs` y llama a `rewardEffectsView.clear()`.

### 5.7 Sin render: `aiMatchRunner` (requisito 6)

- **Nueva opción `strikes?: boolean`,** por defecto `false`. Si está activa, el bucle llama a `advanceStrikes` con `FRAME_SECONDS` entre `simulation.advance` y `resolver.resolve`, que es el mismo orden que el juego.
- **Por qué por defecto apagada:** la comparación de R4 (`aiExecutor.comparison.test.ts`) fija cifras sin daño de recompensas. Encenderla por defecto cambiaría el planteamiento de esa prueba sin que R4 haya cambiado. La comparación de R4 no se toca.
- **Con la opción apagada (aclaración 8):**
  - `activateReward` es el mismo que en el juego: cobra, inicia la recarga, programa el ataque y fija `strikeActiveUntilMs`. No se añade ninguna bandera al comando ni al dominio;
  - el bucle del banco llama a `clearStrikes(state.match)` en cada fotograma, justo después del turno de la IA. Así `match.strikes.active` nunca tiene más de un ataque y no crece durante la partida;
  - `clearStrikes` solo vacía `active`. No toca la recarga, el escudo, `strikeActiveUntilMs`, los CP ni el oro, que ya cambiaron al aceptar el comando exactamente igual que en R4;
  - ningún ataque avanza ni aplica daño, así que el ECS evoluciona igual que en R4.

  **Por qué las cifras de R4 no cambian:**
  - la referencia heredada (`legacyEnemyExecutor`) nunca activa recompensas en el escenario de comparación, y lanza un error si lo intentara;
  - el lado nuevo cobra y fija la recarga como antes, y lo único que añade es una entrada en `match.strikes`, que no lee ni la IA (`aiSnapshot`) ni la comparación.

  La prueba de R4 se ejecuta sin modificaciones y sirve de comprobación.
- **Sin un camino distinto en el juego:** `clearStrikes` solo se llama en el banco cuando la opción está apagada, en `prepareRewardScenario` (diagnóstico) y al empezar partida, que de todos modos crea un `MatchState` nuevo. El juego normal siempre avanza los ataques con `advanceStrikes`.
- **Métrica nueva:** `strikeImpacts` (impactos aplicados), solo con la opción activa.
- **Prueba de demostración:**
  - una partida con semilla fija y la opción activa, con objetivos del jugador colocados para que la IA tenga a qué disparar;
  - comprueba que hay impactos, que se aplica daño y que no se aplica nada tras el resultado.

  No evalúa el equilibrio.

## 6. Pruebas

Las pruebas usan el ejecutor actual (`tsx --test`), sin DOM ni WebGL.

### 6.1 Referencia heredada (primer commit, antes de tocar producción)

- **`web/src/game/match/legacyRewardTimeline.ts`**, solo para pruebas, con el mismo papel que `legacyEnemyExecutor` en R4:
  - es una **extracción literal** de `updateActiveArtillery` y `updateActiveAirStrikes` y de sus funciones de activación;
  - quita las líneas visuales (mallas, `scene`, explosiones, sonido, hápticos);
  - cambia `THREE.Vector3` por `{x, y, z}` y `THREE.MathUtils.lerp` por la misma fórmula `(1 - t)·a + t·b`;
  - mantiene `getRewardTargetCandidates` y `applyDamage` tal como son, con `targetObjects` simulado como "toda entidad viva registrada" (§3.4) y aplicando el daño con `applyRewardDamage`;
  - registra por fotograma qué impactos caen, en qué orden, en qué punto, a quién dañan y cuánto.
- **Cómo se revisa la fidelidad:** el commit debe poder leerse al lado de `GameApplication.ts:2078-2340`, y las únicas diferencias son las líneas visuales quitadas.

  **Limitación:** ninguna prueba automática ejecuta el `GameApplication` antiguo. La fidelidad de la referencia descansa en esa revisión y en la comprobación del navegador (§6.4).
- **Pruebas que fijan la referencia** (auditoría §8.2), en ese mismo commit:
  - **Artillería:** con `delta = 1/60`, tres impactos en los fotogramas donde `Σdelta` alcanza 2,9, 3,6 y 4,3 s, en `aim + (0,0)`, `(6,4)` y `(-5,-3)`.
  - **Ataque aéreo:**
    - con el rumbo de la IA, cuatro bombas durante los 5,2 s, en los fotogramas que da la réplica y en `aim + desfase`;
    - con dos rumbos de jugador, el orden de suelta cambia con el rumbo.
  - **Radio:** una entidad a 12 recibe daño; una a 12 + 1e-6, no.
  - **Daño:** 120 por impacto (artillería) y 220 (avión) en cada dificultad, según `getRewardDefinitionForDifficulty`.
  - **Pausa:** si no se llama durante N fotogramas, ningún impacto cae y la secuencia sigue igual después.

### 6.2 Comparación referencia ↔ dominio (secuencias idénticas)

- **Escenarios** (cada uno sobre un `World` real con `BattleSimulation`, entidades colocadas a mano):

  | # | Escenario | Qué fija |
  |---|---|---|
  | S1 | Artillería del jugador sobre un grupo de unidades enemigas | Fotogramas, puntos y daño |
  | S2 | Artillería de la IA sobre estructuras del jugador | Facción contraria y filtro |
  | S3 | Ataque aéreo de la IA, rumbo `{x:-1, z:0}` | El rumbo fijo de la IA (requisito 2) |
  | S4 | Ataque aéreo del jugador con 4 rumbos de cámara, uno de ellos perpendicular a `(9,6)` para que dos bombas se suelten en el mismo fotograma | Rumbos arbitrarios y varias caídas en un fotograma |
  | S5 | Objetivo a radio 12 exacto, otro justo fuera, el Nexo enemigo dentro del radio | Radio y Nexo excluido |
  | S6 | Una unidad que muere con el primer impacto y está dentro del radio del segundo | No recibe el segundo; muere una vez |
  | S7 | Una unidad entra en el radio entre la activación y el impacto, y otra sale | Objetivos en el momento del impacto (requisito 3) |
  | S8 | Escudo de la facción objetivo activo durante todo el ataque | El daño de ataque no se reduce, porque el Nexo nunca es objetivo (§3.4) |
  | S9 | Artillería del jugador y avión de la IA a la vez | Ataques simultáneos de las dos facciones |
  | S10 | El resultado se fija a mitad de un ataque (Nexo a 0 por la simulación) | Fin de partida: después ya no cae nada (requisito 1) |
  | S11 | Partida nueva (`createMatchState`) con un ataque pendiente | No queda nada pendiente |

- **Secuencias de delta** (las mismas para referencia y dominio):
  - `1/60` constante;
  - `1/30` constante;
  - `0,1` constante (el límite de `GameFrameLoop`);
  - una secuencia con fluctuaciones generada con `seededRng` y valores entre 1/240 y 0,1;
  - una con una pausa (N fotogramas sin llamada) en mitad del vuelo;
  - una con un único delta de 10 s (fuera del límite real; para el requisito 4).
- **Qué se compara siempre, con igualdad estricta** (A1 lo permite):
  - el índice de fotograma de cada impacto;
  - su identidad (ataque, tipo, índice) y su punto `(x, z)`;
  - el número total de impactos (ni perdidos ni duplicados);
  - **el estado de juego al final de cada fotograma**: la vida de cada entidad, qué entidades existen después de resolver las muertes, los CP, las rachas y el resultado de cada facción.
- **Qué se compara según haya o no solape (aclaración 10):** en cada fotograma, los impactos vencidos se agrupan en **grupos solapados**. Dos impactos del mismo fotograma se solapan si alguna entidad está dentro del radio de los dos, con las posiciones de ese fotograma, en la referencia o en el dominio.
  - **Impacto solo** (un grupo de uno): igualdad estricta de **qué entidades dañó y cuánto**, después del escudo.
  - **Grupo solapado:** igualdad estricta de los **resultados agregados del grupo**:
    - el conjunto de entidades dañadas por algún impacto del grupo;
    - para cada una, cuántos impactos la alcanzaron y el daño total aplicado;
    - su vida al terminar el grupo.

    No se compara qué impacto concreto alcanzó a cada entidad ni cuál dio el golpe mortal. La referencia aplica en orden de índice y el dominio en orden cronológico (requisito 4), así que puede ser un impacto distinto aunque el resultado sea el mismo.

  **Por qué los agregados coinciden:**
  - dos ataques simultáneos son de facciones distintas, porque la recarga de 15 s es mayor que cualquier duración de ataque, y sus objetivos son disjuntos;
  - dentro de un grupo, una entidad que sobrevive al primer impacto recibe los dos en cualquier orden, y una que muere con el primero sale del filtro (`vida > 0`) para el segundo en cualquier orden. El número de impactos que recibe, el daño total y `max(0, v - a - b)` no dependen del orden.

  Si en algún escenario los agregados no coinciden, es un fallo del diseño y no se relaja la prueba.
- **Orden del dominio:** una prueba aparte exige que el dominio aplique y emita los impactos de un fotograma en orden de hora nominal (§5.4).
- **Fin de partida (S10):** el bucle de prueba imita `animate`. Avanza el dominio solo mientras `outcome === null` y la sesión simulada está en `PLAYING`, con `DeathResolver` después de las recompensas, como `updateCombat`.

### 6.3 Reglas del dominio y de los comandos

- `activateReward`:
  - un ataque aceptado programa exactamente un `ActiveStrike`, y un rechazo no programa nada;
  - `air_strike` sin rumbo o con rumbo no unitario lanza un error antes de cobrar;
  - el rumbo guardado es una copia congelada: cambiar el objeto original después no altera el ataque (requisito 2).
- `strikeActiveUntilMs`: 4,3 s y 5,2 s desde la activación.
- `executeEnemyTurn` pasa `ENEMY_AIR_STRIKE_HEADING`.
- `advanceStrikes`:
  - vacía `events` al entrar;
  - aplica el daño aunque nadie lea `events`;
  - no hace nada con `outcome !== null`.
- **Hora nominal (aclaración 7):**
  - **IA**: activada dentro del fotograma, con `nowMs` ya incrementado. La hora nominal del primer proyectil es el inicio del fotograma de activación más 2,9 s, no `startedAtMs + 2,9 s`;
  - **jugador**: activado entre fotogramas. La hora nominal del primer proyectil es `startedAtMs + 2,9 s`, porque el siguiente fotograma empieza en `startedAtMs`;
  - **mismo instante**: artillería del jugador y de la IA activadas en el mismo instante de juego por los dos caminos dan la misma hora nominal a sus impactos equivalentes;
  - **bomba que se suelta y cae en el mismo fotograma** (delta de 10 s): hora nominal = inicio del fotograma + 0,72 s;
  - `startedAtMs` y `strikeActiveUntilMs` siguen siendo los de la activación en los dos caminos.
- **Banco con `strikes` apagado (aclaración 8):** tras una partida en la que la IA activa varios ataques, `match.strikes.active` nunca pasa de un elemento, no se aplica ningún daño de recompensa, y la recarga y el gasto son los mismos que con la opción encendida hasta el primer impacto.
- **Límites de módulos (aclaración 9):** `rewardExecution.ts` y `strikeTargets.ts` no importan `commands/`, `three`, `rendering/`, `ui/` ni `platform/`.
- `nominalBombLandingSeconds` (solo para la cinemática) coincide, con un margen de un fotograma, con el fotograma de caída de la réplica a 1/60.
- `rewardEffectsView` y `GameApplication` no tienen pruebas sin DOM (como hoy). Su comprobación es la del navegador.

### 6.4 Comprobaciones de cierre

- `npm run typecheck`, `npm test` y `npm run build` en verde.
- **Navegador (Playwright, como en R4):**
  - escenario `prepareRewardScenario`, artillería y ataque aéreo del jugador con dos rumbos de cámara;
  - las explosiones coinciden con la bajada de vida;
  - la cámara movida a mitad del vuelo no cambia la trayectoria;
  - pausa a mitad del ataque y reanudación;
  - el ataque de la IA hace sonar la sirena y daña;
  - partida nueva con un ataque en curso: no queda nada en pantalla ni cae daño.
- **Recursos:** geometrías y texturas del panel 0b sin crecimiento tras varios ataques y dos partidas seguidas.
- **Medición:** panel 0b en el escenario de recompensas contra la referencia de R0 (`docs/performance/2026-11-14-referencia-rendimiento.md`), en el navegador de escritorio. Sin dispositivo real, se declara así.

## 7. Cambios de comportamiento declarados

- **Ninguno buscado.** Los impactos caen en el mismo fotograma, en el mismo punto, sobre las mismas entidades y con el mismo daño.
- **Diferencias internas sin efecto visible:**
  - dentro de un fotograma, el orden de aplicación pasa a ser cronológico;
  - la explosión del avión se dibuja después del daño, en vez de antes, dentro del mismo fotograma;
  - `runtime.hp` ya no se escribe en el impacto, solo en `updateCombat` del mismo fotograma (como ya ocurría con el resto del daño).
- **Se conserva tal cual, aunque convenga revisarlo después:** el escudo defensivo no reduce el daño de artillería ni del ataque aéreo, porque solo protege al Nexo y el Nexo nunca es objetivo de un ataque (§3.4). Cambiarlo sería una decisión de equilibrio y no entra en R5.

## 8. Fuera de alcance

- Fase 3 de la IA, el banco de partidas y cualquier evaluación o cambio de equilibrio.
- Mover las muertes o las recompensas al paso fijo (opción B).
- R6 (copias `hp` y `position`, `targetObjects`), R7 y R8.
- Desbloqueos, los dos mecanismos de fin de partida y la duración con reloj real.
- Que el escudo afecte al daño de los ataques.
- Retirar la referencia heredada: se queda con su comparación hasta que el usuario decida retirarla.
- **Al terminar R5 no se empieza R6.**

## 9. Decisiones tomadas por el diseñador (para revisar)

1. **A1, réplica fotograma a fotograma** en lugar de un horario calculado (§4). Permite comparar con igualdad estricta.
2. **El estado de los ataques vive en `MatchState.strikes`.** La partida nueva lo borra por construcción, y viaja ya en el `CommandContext` de R4 sin añadirle campos.
3. **El rumbo es obligatorio en `air_strike`** y su falta es un error de programación, no un rechazo de juego. No se renormaliza.
4. **El daño y el radio se fijan al programar.** Hoy se leen en cada fotograma, pero la dificultad no cambia durante una partida.
5. **Los eventos `shell-launched` y `bomb-released`** permiten que la vista y el sonido no comparen progresos por su cuenta (requisito 1).
6. **`RewardEffectsView` se extrae a `rendering/`,** como proponía la auditoría. Las cinemáticas de cámara se quedan en `GameApplication`.
7. **La guarda `outcome !== null` en `advanceStrikes`** no cambia nada en el juego y protege al banco.
8. **`aiMatchRunner` con `strikes` apagado por defecto,** para no alterar la comparación de R4. Con la opción apagada, el banco vacía los ataques programados en cada fotograma (aclaración 8).
9. **La referencia heredada se conserva** después de R5.
10. **El criterio de objetivo pasa a `match/strikeTargets.ts`** en lugar de quedarse en `rewardCommand.ts`, para que `rewardExecution.ts` no dependa de los comandos (aclaración 9). `rewardTargetCandidates` conserva su firma.
11. **Definición de solape para la comparación:** comparten al menos una entidad dentro del radio en el mismo fotograma, en cualquiera de las dos implementaciones (aclaración 10).
