# R6 — Separación de la presentación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La presentación de Three.js sale de `GameApplication.ts` a módulos de `rendering/`, con un registro por `Entity` que sigue al ECS sin copias de juego. La jugabilidad, la interfaz y el orden del fotograma no cambian, y desaparece la fuga del fantasma de colocación.

**Architecture:**
- `BattlefieldView` es el dueño de los visuales de estructuras y unidades. Se le avisa por cada camino del ciclo de vida (opción A) y en cada fotograma lee la vida y la posición a través de `WorldReader`, de solo lectura.
- `ProjectileView`, `PlacementGhost`, `BattlefieldRemains`, `battlefieldMeshes`, `HealthBar`, `battlefieldScene` y `strikeCinematics` se llevan cada uno su parte de la presentación.
- `GameApplication` conserva el reparto (una línea por camino), el audio, los hápticos, el temblor de cámara, la UI y el diagnóstico.
- Una comprobación de consistencia de desarrollo, que **no** es una conciliación, vigila el registro.

**Tech Stack:** TypeScript estricto, Three.js 0.128, `node:test` vía `tsx` (`npm test`), `tsc --noEmit` (`npm run typecheck`), Vite (`npm run build`), `playwright-cli` global para el navegador y la medición.

**Spec:**
- `docs/superpowers/specs/2026-11-21-r6-separacion-de-la-presentacion-design.md` (aprobado, commit `38b0ae7`). Las referencias `§` de este plan son de ese documento. Los números de línea `GameApplication.ts:N` son del commit de partida `9057331`; `web/src` es idéntico en `38b0ae7`.
- Contexto: `docs/audits/2026-11-14-auditoria-responsabilidades.md` (R6 en §7 y §8.2), `docs/performance/2026-11-14-referencia-rendimiento.md` (§6 y §8.3-8.5) y el plan de R5 (convenciones).
- **Punto de partida comprobado:** `npm test` da 391 pruebas, todas en verde; `npm run typecheck` sale limpio.

## Resumen para quien ejecuta (detalle en el diseño)

- **Arquitectura actual** (§3.1): unas 1.100 líneas de presentación siguen en el cierre de `createGameRuntime`.
- **Problemas** (§3.2-3.4):
  - copias `hp`/`maxHp`/`position` que alimentan barras, HUD, el aviso al Nexo y el resumen final;
  - `targetObjects`, con un solo lector;
  - cuatro listas por facción que alimentan el HUD y el diagnóstico;
  - el fantasma de colocación, que nunca se libera;
  - el escenario de recompensas, que quita mallas sin liberarlas;
  - el escudo, que se libera dos veces.
- **Arquitectura objetivo y límites:** §5.1-5.9. La dirección de dependencias es única: `GameApplication → rendering → tipos de game`, y `game` no importa nada de render, UI ni plataforma.
- **Línea base de dependencias:** §3.5-3.6. Sin ciclos, `rendering/` no llega a mutadores del ECS, y el grafo de Graphify estaba fresco en `9057331`.
- **Pruebas y rendimiento:** §6-7. **Fuera de alcance:** §9. **Riesgos:** §10. **Decisiones aprobadas:** §12.

## Global Constraints

- TypeScript estricto, sin `any`, sin aserciones innecesarias y sin `!`. Sin dependencias nuevas. Sin `.js` ni `.mjs` en `web/src/`.
- **Límites** (§5.1, §6.1):
  - los módulos de producción de `rendering/` y `dev/visualConsistency.ts` no importan **como valor** `game/commands/*`, `ecs/systems.ts`, `ecs/BattleSimulation.ts`, `ecs/initialBattle.ts`, `ecs/World.ts`, `match/DeathResolver.ts`, `match/rewardExecution.ts`, `match/shield.ts`, `match/MatchState.ts` ni `dev/diagnosticStructures.ts`;
  - no importan `ecs/World.ts` **ni como tipo**; leen el ECS a través de `WorldReader`;
  - `BattlefieldView.ts`, `ProjectileView.ts` y `BattlefieldRemains.ts` no importan `platform/`, `MapCameraController.ts` ni audio;
  - `game/**` no importa `three`, `rendering/`, `ui/` ni `platform/`;
  - sin ciclos, tampoco de solo tipos.
- **La presentación nunca muta el ECS ni `MatchState`.** Nada de `removeEntity`, `addComponent` ni escribir componentes desde `rendering/`.
- **Orden del fotograma:** el de §5.8, sin cambios respecto a `GameApplication.ts:2257-2305` y `:1840-1925`.
- **Valores exactos que se conservan:**
  - barras de vida: torreta a `2.8` y el resto de edificios a `2.5`, ancho `2.2`; Nexo a `5.2`, ancho `4.0`; tanque a `1.8`, ancho `1.4`;
  - escudo: colores `0x22d3ee` (jugador) y `0xfb7185` (enemigo), escala `1 + Math.sin(clockMs * 0.004) * 0.035`;
  - explosiones: muerte de fusilero `0.6`, tanque `1.2`, edificio `1.2`, Nexo `3.0` nuclear, impacto pesado `0.6`, salida de artillería `0.3` (sin temblor), impactos de ataque `0.85` (artillería) y `0.82` (avión);
  - temblor: nuclear `cameraShake = 4.5`; los demás, `max(cameraShake, scale * 0.7)`;
  - emisores de restos: generador `0.9`, barraca `1.5`, torreta `1.1`, Nexo `2.2`, chatarra `0.8`, cadáver `0.4`; límite de restos `64`, en FIFO;
  - fantasma escondido en `y = -100`; zona de construcción `5 < z < 73` y `|x| < 53`, con redondeo a enteros;
  - destello de fusil hasta `elapsedSeconds + 0.05`.
- **Cambios de comportamiento permitidos:** solo los de §8. Todo lo demás queda igual: equilibrio, IA, comandos de R4, tiempos de R5, escudo, cámara, gestos y UI.
- **Fuera de alcance:** R7, R8 y todo §9. **Al terminar R6 no se empieza R7.**
- **Commits:**
  - un commit por tarea, directo en `main`, con rutas explícitas en `git add` (nunca `-A`);
  - antes de cada commit se ejecutan la prueba de la tarea, `npm test`, `npm run typecheck` y, si la tarea toca producción, `npm run build`;
  - cada mensaje termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - no se incluyen `CLAUDE.md`, `.claude/`, `.gitattributes`, `.graphifyignore` ni `graphify-out/`.
- **Grafo:** después de cada tarea que modifique código se ejecuta `graphify update .` (`AGENTS.md` §16). `graphify-out/` no se versiona.

## Review Focus

1. **Tocar la barra de vida o una pieza hija de un edificio en modo vender.** La selección tiene que subir por la jerarquía hasta la raíz registrada y devolver la entidad del edificio. Prueba en la Tarea 6 (`pickOwnStructure` con un rayo que solo corta la barra de vida) y paso 5 del navegador (Tarea 8).
2. **"Ubicación ocupada" (`too-close`) con el fantasma activo.** El fantasma sigue visible y **no** se libera; con `insufficient-gold`, en cambio, se cancela. Es el comportamiento actual (`GameApplication.ts:1463-1484`). Prueba de `PlacementGhost` en la Tarea 4 (`track` no recrea la malla) y paso 3b del navegador (Tarea 8).
3. **El Nexo cae en el mismo fotograma que otras unidades y edificios.** Todos los visuales de ese fotograma salen del registro una sola vez, en el orden de los eventos, y el desmontaje posterior no falla. Prueba en la Tarea 6 (`a Nexus falling with other deaths in the same frame…`).
4. **Una producción termina en el mismo fotograma en que cae su barraca.** El soldado recibe su visual (la producción se vacía antes de resolver las muertes) y la barraca lo pierde, sin inconsistencias. Prueba en la Tarea 6.
5. **"Reiniciar batalla" desde la pausa con el fantasma visible, proyectiles en vuelo y un ataque activo.** `startNewGame` desmonta: no queda ningún visual, el fantasma se libera y los ids 1 y 2 del `World` nuevo no chocan. Prueba en la Tarea 6 (`clear with live projectiles…`) y paso 13b del navegador (Tarea 8).

---

### Task 1: `WorldReader` y prueba de límites (solo tipos y pruebas)

**Objetivo:** fijar el contrato de solo lectura y la dirección de las dependencias **antes** de mover código. Hoy el código ya cumple todos los límites (§3.5), así que la prueba pasa desde el principio y vigila las tareas siguientes.

**Responsabilidad:** ninguna se extrae. Se crean el tipo `WorldReader` (dueño: `game/ecs`) y la prueba de límites (dueña: `rendering/`).

**Dependencias:** `WorldReader.ts → components.ts` (solo tipos). La prueba solo lee archivos.

**Files:**
- Create: `web/src/game/ecs/WorldReader.ts`
- Create: `web/src/game/ecs/WorldReader.test.ts`
- Create: `web/src/rendering/presentationBoundary.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // game/ecs/WorldReader.ts (solo tipos; tal cual §5.2)
  export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
  export type ReadonlyComponentData = { readonly [Name in ComponentName]: DeepReadonly<ComponentData[Name]> };
  export interface WorldReader {
    getComponent<Name extends ComponentName>(entity: Entity, component: Name): ReadonlyComponentData[Name] | undefined;
    queryInto(result: Entity[], components: readonly ComponentName[]): void;
  }
  ```
- `presentationBoundary.test.ts` exporta, para la Tarea 7, la constante `EXTRA_PRESENTATION_MODULES: string[]`, que por ahora está vacía.

- [ ] **Paso 1: Pruebas** (`WorldReader.test.ts`):
  - `a World is a WorldReader without an adapter`: `const reader: WorldReader = new World();` y una lectura (`reader.getComponent(base, COMPONENTS.health)?.current === NEXUS_HEALTH`).
  - `writes through a WorldReader do not compile`: dos líneas con `// @ts-expect-error`, una que asigna `health.current` y otra `production.order.spawnPosition.x`. Si alguna dejara de ser un error, `npm run typecheck` fallaría.
- [ ] **Paso 2: Prueba de límites** (`presentationBoundary.test.ts`), siguiendo el modelo de `game/match/rewardExecutionBoundary.test.ts`:
  - **Módulos vigilados:** todos los `.ts` de producción de `web/src/rendering/` (con `readdirSync`, sin `.test.ts` ni `presentationTestState.ts`) más `EXTRA_PRESENTATION_MODULES`.
  - **Clasificación de cada importación:** de valor o de tipo. Es de tipo si es `import type` o si todos los nombres entre llaves llevan `type `.
  - **Casos:**
    - `presentation modules value-import no ECS-mutating module` (lista de Global Constraints);
    - `presentation modules never import World, not even as a type`;
    - `entity views import neither platform, the camera controller nor audio`, solo para `BattlefieldView.ts`, `ProjectileView.ts` y `BattlefieldRemains.ts`, cuando existan;
    - `game modules import neither three, rendering, ui nor platform`, sobre todo `web/src/game/**` sin pruebas;
    - `the boundary check recognises value, type-only, mixed, re-export, side-effect and dynamic imports`, con muestras de texto como en R5.
- [ ] **Paso 3:** `npx tsx --test web/src/game/ecs/WorldReader.test.ts web/src/rendering/presentationBoundary.test.ts`
  Expected: PASS. Después, `npm run typecheck` limpio.
- [ ] **Paso 4: Comprobar que la prueba de límites muerde.** Añadir temporalmente `import { World } from '../game/ecs/World.ts';` a `rendering/TerrainGrid.ts` → la prueba falla; quitarlo → vuelve a pasar. No se hace commit de la línea temporal.
- [ ] **Paso 5:** `npm test` (las 391 de partida más las nuevas, todas en verde) y `npm run typecheck`.

**Rendimiento y recursos:** ninguno; solo hay tipos y pruebas.
**Riesgos y vuelta atrás:** riesgo bajo. Si el `@ts-expect-error` no falla con alguna versión de `tsc`, la revisión lo detecta. Vuelta atrás: `git revert`.

- [ ] **Paso 6: Commit**
  ```bash
  git add web/src/game/ecs/WorldReader.ts web/src/game/ecs/WorldReader.test.ts web/src/rendering/presentationBoundary.test.ts
  git commit -m "test(rendering): pin the read-only world contract and the presentation boundary"
  ```

---

### Task 2: Fábricas de mallas, barras de vida y restos (movimiento literal)

**Objetivo:** sacar de `GameApplication` las fábricas y los restos **sin cambiar su resultado**, y definir la regla de propiedad de los recursos.

**Responsabilidad que se extrae:**
- `GameApplication.ts:461-502`: `create3DHealthBar`;
- `:627-805`: fábricas de soldado, tanque, Nexo, escudo, generador, barraca y torreta, más `instantiateBuildingMesh`;
- `:807-993`: `disposeObjectResources`, restos y su límite.

**Nuevo dueño:** `rendering/battlefieldMeshes.ts`, `rendering/HealthBar.ts` y `rendering/BattlefieldRemains.ts`. `GameApplication` sigue creando y guardando los objetos (`RuntimeStructure`, etc.) hasta la Tarea 6, pero con estas funciones.

**Dependencias:** los tres módulos nuevos → `three` y tipos de `game/` (`Position`, `BuildingKind`, `BuildableStructureKind`). `BattlefieldRemains` → `CombatEffects`, solo como tipo `Pick`.

**Files:**
- Create: `web/src/rendering/battlefieldMeshes.ts`, `web/src/rendering/HealthBar.ts`, `web/src/rendering/BattlefieldRemains.ts`
- Modify: `web/src/GameApplication.ts` (quitar `:461-502`, `:627-805` y `:807-993`; importar y llamar a los módulos nuevos)
- Test: `web/src/rendering/battlefieldMeshes.test.ts`, `web/src/rendering/HealthBar.test.ts`, `web/src/rendering/BattlefieldRemains.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // battlefieldMeshes.ts — cuerpos movidos tal cual; cada llamada crea geometrías y materiales nuevos (exclusivos)
  export function createSoldierMesh(colorHex: number): THREE.Group;
  export function createTankMesh(colorHex: number): THREE.Group;
  export function createHQMesh(colorHex: number): THREE.Group;
  export function createNexusShieldVisual(color: number): THREE.Mesh;          // name 'nexus-defensive-shield', visible = false
  export function createGeneratorMesh(colorHex?: number): THREE.Group;         // userData.ring
  export function createBarracksMesh(colorHex?: number): THREE.Group;
  export function createTurretMesh(colorHex?: number): THREE.Group;            // userData.head
  export function instantiateBuildingMesh(type: BuildableStructureKind, isPlayer?: boolean): THREE.Group;
  /** Solo para árboles cuyos recursos son exclusivos; nunca para lotes o pools compartidos. */
  export function disposeObjectResources(root: THREE.Object3D): void;

  // HealthBar.ts
  export interface HealthBar {
    readonly group: THREE.Group; readonly fillMesh: THREE.Mesh; readonly maxWidth: number;
    update(currentHp: number, maxHp: number): void; billboard(camera: THREE.Camera): void;
  }
  export function createHealthBar(isPlayer: boolean, heightOffset?: number, width?: number, visible?: boolean): HealthBar;
  //   valores por defecto 2.0, 1.6 y true; `visible = false` sustituye la lectura de diagnosticsOptions.bars

  // BattlefieldRemains.ts
  export const MAX_BATTLEFIELD_REMAINS = 64;
  export class BattlefieldRemains {
    constructor(scene: THREE.Scene, effects: Pick<CombatEffects, 'addBurningEmitter'>);
    addBuildingRuin(position: Readonly<Position>, kind: BuildingKind): void;   // conserva la rama 'hq'
    addTankWreck(position: Readonly<Position>): void;
    addSoldierCorpse(position: Readonly<Position>): void;
    get count(): number;
    clear(): void;
  }
  ```

- [ ] **Paso 1: Pruebas que fallan**, con los valores copiados de `GameApplication.ts` en `9057331`:
  - **`battlefieldMeshes.test.ts`**, una prueba por fábrica (`createTankMesh keeps its three parts…`, etc.). Cada una afirma el número de hijos, la clase y los `parameters` de cada geometría, el `color`, `emissive`, `emissiveIntensity`, `metalness`, `roughness`, `transparent`, `opacity`, `side`, `wireframe` y `depthWrite` de cada material, y las posiciones y rotaciones locales. Además:
    - `instantiateBuildingMesh uses the player and enemy colors of today`: generador `0xeab308`/`0xff2244`, barraca y torreta `0x00f0ff`/`0xff3344`;
    - `two calls never share a geometry or a material`, recorriendo los dos árboles;
    - `disposeObjectResources disposes every geometry and material of the tree once`, escuchando el evento `dispose`.
  - **`HealthBar.test.ts`:**
    - `update scales and shifts the fill`: con 50/100, `fill.scale.x === 0.5` y `fill.position.x === -0.4` para un ancho de 1.6; con 0 y con valores negativos, `scale.x === 0`; con un valor por encima del máximo, `1`;
    - `billboard copies the camera quaternion`;
    - `visible false hides the group`;
    - `default height 2.0 and width 1.6`.
  - **`BattlefieldRemains.test.ts`**, con un `CombatEffects` real sobre una `THREE.Scene`:
    - `each remains adds one burning emitter with today's scale` (los seis valores de Global Constraints, a través de `effects.stats().activeEmitters` y un espía sobre `addBurningEmitter`);
    - `the 65th remains disposes the oldest`: los `dispose` de la primera ruina y `count === 64`;
    - `clear disposes every remains and leaves the scene without them`.
- [ ] **Paso 2:** `npx tsx --test web/src/rendering/battlefieldMeshes.test.ts web/src/rendering/HealthBar.test.ts web/src/rendering/BattlefieldRemains.test.ts`
  Expected: FAIL (los módulos no existen).
- [ ] **Paso 3: Mover tal cual** los cuerpos a los tres módulos.
  - `BattlefieldRemains` convierte `Position` a `THREE.Vector3` una vez por resto, para `addBurningEmitter` y para `group.position`.
  - En `GameApplication`:
    - `trackBattlefieldRemains` y `clearBattlefieldRemains` pasan a ser una instancia `remains`, que se crea en `initEngine` después de `combatEffects`;
    - `create3DHealthBar(…)` pasa a `createHealthBar(…, !diagnosticsOptions || diagnosticsOptions.bars)`.
- [ ] **Paso 4:** pruebas del paso 2 → PASS; `npm test`; `npm run typecheck`; `npm run build` → código 0.
- [ ] **Paso 5: Comprobar que es un movimiento literal.** `git diff --color-moved=zebra -- web/src/GameApplication.ts web/src/rendering/` no muestra cambios dentro de los cuerpos movidos, salvo las conversiones de tipo de `Position` y el parámetro `visible`.

**Rendimiento y recursos:** las mallas y los recursos por objeto son los mismos que hoy; no se comparte nada nuevo. Las barras siguen siendo 3 geometrías + 3 materiales por entidad (§9).
**Riesgos y vuelta atrás:** el riesgo es cambiar un detalle al mover. Lo cubren las pruebas de estructura y la revisión con `--color-moved`. Vuelta atrás: `git revert`.

- [ ] **Paso 6: Commit**
  ```bash
  git add web/src/rendering/battlefieldMeshes.ts web/src/rendering/HealthBar.ts web/src/rendering/BattlefieldRemains.ts \
    web/src/rendering/battlefieldMeshes.test.ts web/src/rendering/HealthBar.test.ts web/src/rendering/BattlefieldRemains.test.ts \
    web/src/GameApplication.ts
  git commit -m "refactor(rendering): move mesh factories, health bars and battlefield remains out of the app"
  ```

---

### Task 3: Terreno, soldados del menú y planos de cámara de los ataques

**Objetivo:** sacar la escena estática y la coreografía de cámara, que son puras.

**Responsabilidad que se extrae:**
- `GameApplication.ts:578-625`: `createTerrain`, `setupMenuCinematic`;
- `:1007-1012`: limpieza de `menuUnits`;
- `:1931-1934`: constantes de cámara;
- `:1989-2034`: `playArtilleryCinematic`, `playAirStrikeCinematic` (solo el cálculo de los planos).

**Nuevo dueño:** `rendering/battlefieldScene.ts` y `rendering/strikeCinematics.ts`. `GameApplication` llama a `cameraController.playShots(...)` con lo que devuelven, y conserva `cameraGroundHeading`.

**Dependencias:** `battlefieldScene` → `three`, `TerrainGrid`, `battlefieldMeshes`. `strikeCinematics` → `rewardSystem` (constantes y `nominalBombLandingSeconds`) y el tipo `CameraShot` de `MapCameraController`. Ni uno ni otro importa nada de `game/` que mute.

**Files:**
- Create: `web/src/rendering/battlefieldScene.ts`, `web/src/rendering/strikeCinematics.ts`
- Modify: `web/src/GameApplication.ts`
- Test: `web/src/rendering/battlefieldScene.test.ts`, `web/src/rendering/strikeCinematics.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // battlefieldScene.ts
  export interface BattlefieldTerrain { readonly floor: THREE.Mesh; dispose(): void }
  export function createBattlefieldTerrain(scene: THREE.Scene): BattlefieldTerrain;  // los 4 objetos de hoy, en el mismo orden
  export class MenuSoldiers {
    constructor(scene: THREE.Scene);
    show(random?: () => number): void;   // 8 + 8 soldados, posiciones de :613-624; Math.random por defecto
    clear(): void;                       // quita y libera, como :1008-1012
    get count(): number;
  }

  // strikeCinematics.ts — constantes y cálculo movidos tal cual
  export const ARTILLERY_CAMERA_NEXUS_DISTANCE = 38;
  export const ARTILLERY_CAMERA_IMPACT_DISTANCE = 50;
  export const AIR_STRIKE_CAMERA_LEAD_SECONDS = 1;
  export const AIR_STRIKE_CAMERA_DISTANCE = 45;
  export function artilleryShots(nexus: Readonly<{ x: number; z: number }>, impactCenter: Readonly<StrikeAim>): CameraShot[];
  export function airStrikeShots(target: Readonly<StrikeAim>, heading: Readonly<StrikeAim>): CameraShot[];
  ```

- [ ] **Paso 1: Pruebas que fallan:**
  - `artilleryShots frames the Nexus then the impact with today's timings`: dos planos. El primero, en `(nexus.x, nexus.z)`, con `durationSeconds = 0.7`, `holdSeconds = 0.8` y `distance = 38`. El segundo, en el centro del impacto, con `durationSeconds = (0.7 + 2.2 - 0.15) - 1.5`, `holdSeconds = artilleryStrikeDurationSeconds(3) - 2.75 + 0.8` y `distance = 50`. Comparación con tolerancia de `1e-9`.
  - `airStrikeShots holds until the last bomb lands`, con los rumbos `{1,0}`, `{0,-1}` y `{-0.6,0.8}`: un plano con `durationSeconds = 1`, `holdSeconds = max(nominalBombLandingSeconds(...)) + 0.6 - 1` y `distance = 45`.
  - `createBattlefieldTerrain adds floor, outer ground, grid and center line in that order`; `dispose` libera sus geometrías y materiales (eventos `dispose`) y los quita de la escena.
  - `MenuSoldiers.show places 8 player and 8 enemy soldiers…`, con un `random` fijo (`() => 0.5`): posiciones `(-10, 0, 15)` y `(-10, 0, -15)`, colores `0x00f0ff` y `0xff3344`. `clear` libera y deja `count === 0`.
- [ ] **Paso 2:** `npx tsx --test web/src/rendering/battlefieldScene.test.ts web/src/rendering/strikeCinematics.test.ts` → FAIL.
- [ ] **Paso 3: Implementar** moviendo los cuerpos y cambiar `GameApplication`:
  - `terrainFloor` pasa a ser `terrain.floor`;
  - `menuUnits` pasa a ser una instancia `menuSoldiers`;
  - `playArtilleryCinematic(aim)` pasa a `cameraController.playShots(artilleryShots(playerNexusPosition(), aim))`. `playerNexusPosition()` lee el `transform` de `simulation.playerBase` y, si falta, usa `PLAYER_BASE_POSITION` (§5.7);
  - `strikeShellOrigin` usa la misma función para el jugador y su equivalente enemigo con `ENEMY_BASE_POSITION`;
  - `terrain.dispose()` **no** se llama desde `dispose()` del runtime (decisión menor de §11). El terreno vive lo que vive la aplicación, como hoy.
- [ ] **Paso 4:** pruebas → PASS; `npm test`; `npm run typecheck`; `npm run build`.

**Rendimiento y recursos:** los mismos objetos. `strikeShellOrigin` hace una búsqueda en un `Map` por proyectil, en lugar de leer `playerHQ.position`; no es un camino de cada fotograma.
**Riesgos y vuelta atrás:** que cambie el orden de los objetos de la escena. Lo cubre la prueba de orden. Vuelta atrás: `git revert`.

- [ ] **Paso 5: Commit**
  ```bash
  git add web/src/rendering/battlefieldScene.ts web/src/rendering/strikeCinematics.ts \
    web/src/rendering/battlefieldScene.test.ts web/src/rendering/strikeCinematics.test.ts web/src/GameApplication.ts
  git commit -m "refactor(rendering): move the terrain, the menu soldiers and the strike camera shots out of the app"
  ```

---

### Task 4: `PlacementGhost` y corrección de la fuga

**Objetivo:** dar al fantasma un dueño exclusivo que lo libere al cancelar, al cambiar de edificio, después de construir, al desmontar y al empezar el fin de partida (decisión 1 y aclaración 7).

**Responsabilidad que se extrae:** `GameApplication.ts:1300-1352` (`selectBuildingToPlace`, `cancelPlacement`, `getPlacementPosition`, `updatePlacementGhost`) y `:1332-1334` (zona de construcción).

**Nuevo dueño:** `rendering/PlacementGhost.ts`. `selectedBuildType` sigue en `GameApplication`, porque es estado de entrada y UI.

**Dependencias:** `PlacementGhost` → `three`, `battlefieldMeshes` y los tipos `Position` y `BuildableStructureKind`.

**Files:**
- Create: `web/src/rendering/PlacementGhost.ts`
- Modify: `web/src/GameApplication.ts`
- Test: `web/src/rendering/PlacementGhost.test.ts`

**Interfaces:**
- Consumes: `instantiateBuildingMesh` y `disposeObjectResources` (Tarea 2).
- Produces:
  ```ts
  export const BUILD_ZONE = Object.freeze({ minZ: 5, maxZ: 73, maxAbsX: 53 });
  export class PlacementGhost {
    constructor(scene: THREE.Scene, terrain: THREE.Object3D);
    show(kind: BuildableStructureKind): void;         // libera el anterior si existe; uno nuevo en (0, -100, 0)
    placementAt(raycaster: THREE.Raycaster, camera: THREE.Camera, pointer: THREE.Vector2): Position | undefined;
    track(position: Readonly<Position> | undefined): void;   // mueve, o esconde en y = -100; nunca recrea
    hide(): void;                                     // quita y libera; idempotente
    get visual(): THREE.Object3D | null;              // para las pruebas y el diagnóstico
    dispose(): void;
  }
  ```

- [ ] **Paso 1: Pruebas que fallan** (`PlacementGhost.test.ts`):
  - `hide disposes every geometry and material of the ghost once`.
  - `show replaces the previous ghost and disposes it first`: `show('barracks')` y después `show('turret')` → `dispose` de todos los recursos de la barraca antes de añadir la torreta; un solo fantasma en la escena.
  - `show of the same kind creates a fresh ghost` (aclaración 7: sin reutilización).
  - `hide twice and hide without a ghost do not throw`.
  - `no other object's resources are disposed`: la escena tiene además una malla de edificio y un `InstancedSoldierRenderer`, y se escuchan los `dispose` de sus recursos (Review Focus 2: `track` no recrea).
  - `track keeps the same mesh and hides it at y = -100 when undefined`.
  - `placementAt rounds inside the zone and rejects the edges`. Con un `Raycaster` y una `PerspectiveCamera` reales mirando al suelo: el punto `(10.4, 0, 20.6)` da `{ x: 10, y: 0, z: 21 }`; `z = 5`, `z = 73` y `|x| = 53` dan `undefined`.
- [ ] **Paso 2:** `npx tsx --test web/src/rendering/PlacementGhost.test.ts` → FAIL.
- [ ] **Paso 3: Implementar** y conectar en `GameApplication`:
  - `selectBuildingToPlace` pasa a `placementGhost.show(type)`;
  - `cancelPlacement` pasa a `placementGhost.hide()`;
  - `getPlacementPosition` pasa a `placementGhost.placementAt(raycaster, camera, mouse)`;
  - `updatePlacementGhost` pasa a `placementGhost.track(...)`, solo si hay `selectedBuildType`.

  Los sitios que hoy llaman a `cancelPlacement` (Escape, atrás nativo, construcción, `toggleDemolishMode`, `startNewGame`, `teardownMatch`, `beginMatchEnding`) no cambian; solo cambia lo que hace `cancelPlacement`. `dispose()` del runtime llama a `placementGhost.dispose()`.
- [ ] **Paso 4:** pruebas → PASS; `npm test`; `npm run typecheck`; `npm run build`.

**Rendimiento y recursos:** cancelar o cambiar de edificio ya no pierde geometrías ni materiales. El coste es el mismo que hoy (una malla por selección).
**Riesgos y vuelta atrás:** liberar algo compartido. Lo cubre la prueba de "otros recursos". El fantasma no comparte nada (§3.4). Vuelta atrás: `git revert`, que devuelve la fuga.

- [ ] **Paso 5: Commit**
  ```bash
  git add web/src/rendering/PlacementGhost.ts web/src/rendering/PlacementGhost.test.ts web/src/GameApplication.ts
  git commit -m "fix(rendering): the placement ghost owns and disposes its resources on cancel, replace and teardown"
  ```

---

### Task 5: `ProjectileView` y el tipo de disparo desde el ECS

**Objetivo:** llevar los visuales de proyectil a su propio módulo y quitar el único lector de `targetObjects` (§3.2, §5.4).

**Responsabilidad que se extrae:** `GameApplication.ts:1773-1838` (`createProjectileVisual`, `finishProjectileVisual`, `syncProjectileVisuals`) y `projectiles`/`projectileVisuals` (`:394-395`).

**Nuevo dueño:** `rendering/ProjectileView.ts`. El sonido se queda en `GameApplication`.

**Dependencias:** `ProjectileView` → `three`, `ProjectilePool`, el tipo `InstancedSoldierRenderer`, `WorldReader` (tipo), `components.ts` (`COMPONENTS`) y los tipos `WeaponFireEvent` y `ProjectileImpact` (`import type` de `ecs/systems.ts`, permitido).

**Duplicación temporal controlada:** después de esta tarea, `targetObjects` se sigue escribiendo, pero ya no lo lee nadie. Desaparece en la Tarea 6. No crea ningún camino nuevo.

**Files:**
- Create: `web/src/rendering/ProjectileView.ts`
- Create: `web/src/rendering/presentationTestState.ts` (utilidad solo de pruebas)
- Modify: `web/src/GameApplication.ts`
- Modify: `web/src/game/match/testUtilitiesBoundary.test.ts` (añadir `'rendering/presentationTestState.ts'` a `TEST_UTILITIES`)
- Test: `web/src/rendering/ProjectileView.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // ProjectileView.ts
  export type ShotKind = 'rifle' | 'heavy';
  export class ProjectileView {
    constructor(pool: ProjectilePool, soldiers: Pick<InstancedSoldierRenderer, 'showMuzzleFlash'>);
    /** Vacía `shots` y añade uno por disparo con proyectil, posición y facción (el mismo filtro que :1779). */
    fired(world: WorldReader, events: readonly WeaponFireEvent[], elapsedSeconds: number, shots: ShotKind[]): void;
    /** Vacía `heavyImpacts` y añade la posición de cada impacto pesado. */
    impacts(impacts: readonly ProjectileImpact[], heavyImpacts: Position[]): void;
    sync(world: WorldReader): void;   // mueve; libera los que ya no tienen transform (como :1830-1834)
    clear(): void;
    stats(): { active: number };
  }

  // presentationTestState.ts (solo pruebas)
  /** Congela en profundidad todos los componentes de todas las entidades: cualquier escritura lanza TypeError. */
  export function freezeWorldComponents(world: World): void;
  export interface PresentationTestMatch {
    readonly simulation: BattleSimulation; readonly ctx: CommandContext; readonly scene: THREE.Scene;
    readonly soldiers: InstancedSoldierRenderer; readonly effects: CombatEffects; readonly pool: ProjectilePool;
    readonly camera: THREE.PerspectiveCamera;
  }
  export function createPresentationTestMatch(): PresentationTestMatch;   // ctx en 'PLAYING', dificultad 'normal'
  ```
- **Clasificación:** el disparo es `'rifle'` si `world.getComponent(source, COMPONENTS.soldierKind) === 'rifleman'`; en cualquier otro caso, `'heavy'`. El destello solo sale en los de fusil.

- [ ] **Paso 1: Pruebas que fallan** (`ProjectileView.test.ts`, con `createPresentationTestMatch` y combate real con `simulation.advance`):
  - `a rifleman's shot is a rifle shot with a muzzle flash; tank and turret shots are heavy`. Un espía sobre `showMuzzleFlash` recibe `(source, elapsed + 0.05)` solo para el fusil.
  - `an impact releases the mesh and reports heavy impacts only`.
  - `a projectile removed without an impact is released by sync`.
  - `with the pool exhausted the shot still reports its kind and creates no visual` (129 disparos; `stats().active === 128`).
  - `fired skips a shot whose source has no faction` (sin sonido, sin visual).
  - `fired, impacts and sync never write the ECS`: `freezeWorldComponents` antes de llamarlos, sin excepciones; e instantánea (`snapshotCommandState`) igual antes y después.
  - `clear releases every active projectile`.
- [ ] **Paso 2:** `npx tsx --test web/src/rendering/ProjectileView.test.ts` → FAIL.
- [ ] **Paso 3: Implementar** y conectar en `advanceBattleSimulation` (orden de §5.8):
  - `projectileView.fired(world, simulation.drainWeaponEvents(), time, shots)` → un `SFX.playRifleShot()` o `SFX.playHeavyCannon()` por cada `shot`;
  - producción, sin cambios todavía;
  - `projectileView.impacts(simulation.drainProjectileImpacts(), heavyImpacts)` → `createCinematicExplosion(vector(pos), 0.6, false)` por cada impacto;
  - `projectileView.sync(world)`.

  `shots` y `heavyImpacts` son arrays del cierre, que se reutilizan. Quitar la lectura de `targetObjects` (`:1781`). En `teardownMatch`, `projectilePool.clear()` pasa a `projectileView.clear()`. Las métricas `projectiles` (`:2250`, `:2404`) pasan a `projectileView.stats().active`.
- [ ] **Paso 4:** pruebas → PASS; `npm test` (incluida `testUtilitiesBoundary`); `npm run typecheck`; `npm run build`.

**Rendimiento y recursos:** el mismo pool, las mismas mallas y la misma cadencia. Se añade una lectura de `soldierKind` por disparo en lugar de una búsqueda en `targetObjects`. No hay asignaciones nuevas por fotograma.
**Riesgos y vuelta atrás:** que la clasificación sea distinta. Es equivalente por §5.4 y lo cubre la prueba. Vuelta atrás: `git revert`.

- [ ] **Paso 5: Commit**
  ```bash
  git add web/src/rendering/ProjectileView.ts web/src/rendering/ProjectileView.test.ts web/src/rendering/presentationTestState.ts \
    web/src/game/match/testUtilitiesBoundary.test.ts web/src/GameApplication.ts
  git commit -m "refactor(rendering): projectile visuals move to ProjectileView and read the shooter's kind from the ECS"
  ```

---

### Task 6: `BattlefieldView`, todos los caminos del ciclo de vida y fin de las copias

**Objetivo:** el registro por `Entity` sustituye a `RuntimeStructure`, `RuntimeUnit`, `targetObjects`, las cuatro listas, `playerHQ`/`enemyHQ` y las copias, **todo en esta tarea**, para que no convivan dos registros (§11). Se reconectan los consumidores de §5.8.

**Responsabilidad que se extrae:**
- `GameApplication.ts:75-104` (tipos);
- `:388-393` y `:434-437` (colecciones);
- `:1047-1103` (Nexos);
- `:1137-1174` (parte visual del desmontaje);
- `:1416-1450` (selección para vender);
- `:1490-1563` (`representStructure`, `createTroopVisual`);
- `:1660-1749` (muertes, sincronización, torretas);
- `:1901-1918` (barras de edificios);
- `:1981-1986` y `:2101-2112` (escudos);
- `:2531-2553` (borrado del escenario de recompensas).

**Nuevo dueño:** `rendering/BattlefieldView.ts`. El reparto y la respuesta a los `ExplosionCue` (audio, hápticos, temblor) quedan en `GameApplication`.

**Dependencias:** `BattlefieldView` → `three`, `battlefieldMeshes`, `HealthBar`, `BattlefieldRemains`, los tipos `InstancedSoldierRenderer` y `CombatEffects`, `WorldReader` (tipo), `components.ts`, y por `import type`: `ProductionCompletedEvent` (`ecs/systems.ts`) y `MatchEvent` (`match/matchEvents.ts`).

**Files:**
- Create: `web/src/rendering/BattlefieldView.ts`
- Modify: `web/src/GameApplication.ts`
- Modify: `web/src/rendering/presentationTestState.ts` (ayudante `createBattlefieldTestView`)
- Test: `web/src/rendering/BattlefieldView.test.ts`, `web/src/game/commands/trainCommand.test.ts` (prueba del HUD de barracas)

**Interfaces:**
- Consumes: Tareas 1, 2 y 5.
- Produces:
  ```ts
  // presentationTestState.ts (solo pruebas, añadido)
  export function createBattlefieldTestView(match: PresentationTestMatch): BattlefieldView;   // ya enlazada a match.simulation.world

  // BattlefieldView.ts
  export interface ExplosionCue { readonly position: Readonly<Position>; readonly scale: number; readonly nuclear: boolean }
  export type VisualKind = BuildingKind | SoldierKind;
  export type RemovalCause = 'sold' | 'diagnostic';
  export interface LifecycleCounts {
    readonly built: number; readonly produced: number; readonly unitDied: number;
    readonly structureDestroyed: number; readonly sold: number; readonly discarded: number; readonly clears: number;
  }
  export interface FactionVisualStats { readonly structures: number; readonly tanks: number; readonly riflemen: number }
  export interface BattlefieldViewOptions {
    readonly scene: THREE.Scene; readonly soldiers: InstancedSoldierRenderer;
    readonly effects: CombatEffects; readonly healthBarsVisible: boolean;
  }
  export class BattlefieldView {
    constructor(options: BattlefieldViewOptions);
    attach(world: WorldReader): void;                      // lanza un error si ya hay World o el registro no está vacío
    structureBuilt(entity: Entity): void;                   // C1-C4; incluye 'hq' (malla, barra 5.2/4.0, escudo hijo)
    unitsProduced(events: readonly ProductionCompletedEvent[]): number;   // devuelve cuántos son del jugador
    deathsResolved(events: readonly MatchEvent[], phase: 'units' | 'structures', cues: ExplosionCue[]): void;
    removedWithoutEffects(entity: Entity, cause: RemovalCause): void;
    syncUnitsAndTurrets(camera: THREE.Camera): void;
    syncStructures(camera: THREE.Camera): void;
    syncShields(active: Readonly<Record<Faction, boolean>>, clockMs: number): void;
    pickOwnStructure(raycaster: THREE.Raycaster, faction: Faction): Entity | undefined;   // sin Nexo
    has(entity: Entity): boolean;
    entries(): IterableIterator<readonly [Entity, VisualKind]>;
    stats(): { readonly player: FactionVisualStats; readonly enemy: FactionVisualStats; readonly remains: number };
    lifecycleCounts(): LifecycleCounts;                     // acumulados; clear() no los reinicia
    clear(): void;                                          // idempotente; suma 1 a clears
  }
  ```
- **Reglas** (§5.3, aclaraciones 2-4):
  - cualquier alta sin `World` o con una entidad ya registrada lanza un error;
  - las bajas de una entidad que no está registrada no hacen nada;
  - `deathsResolved` usa solo los datos del evento y su entrada, nunca el ECS;
  - en la sincronización, si a una entidad le falta `transform` o `health`, se conserva el último estado visual;
  - la sincronización nunca borra un visual por su cuenta.
- **Selección:** un `WeakMap<THREE.Object3D, Entity>` de raíces registradas. `pickOwnStructure` sube por `parent` hasta encontrar una raíz.
- **Escudos:** `GameApplication` reutiliza un objeto `shieldState: Record<Faction, boolean>` que rellena en cada fotograma, sin asignar uno nuevo.

- [ ] **Paso 1: Prueba del HUD** (`trainCommand.test.ts`): `liveFactories keeps the HUD's former barracks filter`. Barracas creadas en orden A, B, C y D; B a vida 0 sin resolver; C vendida; una barraca enemiga y una torreta del jugador → `liveFactories(world, 'player')` deep-equal `[A, D]`. Debe pasar ya, porque caracteriza el comportamiento.
- [ ] **Paso 2: Pruebas que fallan** (`BattlefieldView.test.ts`). Usan `createPresentationTestMatch()` con los comandos de R4, `simulation.advance` y `DeathResolver` reales. **Después de cada paso,** `view.entries()` coincide con las entidades `building`/`soldier` del ECS (comprobación local de la prueba; la función de desarrollo llega en la Tarea 7).
  1. `attach and the two Nexuses`: entradas = bases; barras llenas; el escudo es hijo del Nexo, oculto, con los colores de Global Constraints.
  2. `structureBuilt represents each accepted build once`. Jugador y enemigo con `buildStructure`; un segundo `structureBuilt(entity)` lanza un error y deja `entries()` igual; los rechazos `insufficient-gold` y `too-close` no crean entrada; las alturas de barra son 2.8 (torreta) y 2.5.
  3. `unitsProduced`: `trainUnit` + `advance` hasta terminar → un fusilero en `soldiers` y un tanque con malla y barra a 1.8/1.4; devuelve 1 para el jugador y 0 para el enemigo; `produced` +2.
  4. `sync follows the ECS`. `applyDamageSystem` se ve en `fillMesh.scale.x` y en la barra instanciada; `advance` mueve el visual; la orientación sigue a `targeting.target` en unidades y torretas (`userData.head`).
  5. `unit deaths`: vida a 0 → `resolve` → `deathsResolved(events, 'units', cues)`. El visual sale del registro y de la escena; `remains.count` +1; los recursos del tanque reciben `dispose`; los lotes de `soldiers` y los pools de `effects` **no**; `cues` va en el orden de los eventos con escala 0.6/1.2 y `nuclear: false`; la explosión se crea antes que el resto (espía sobre `effects.createExplosion` y `addBurningEmitter`).
  6. `structure deaths`, con `phase: 'structures'`: ruina → explosión (1.2) → quitar; en la fase `'units'`, los `structureDestroyed` no se procesan.
  7. `Nexus destruction`: sin ruina; cue `{ scale: 3.0, nuclear: true }`; el escudo recibe `dispose` **una vez**.
  8. `a Nexus falling with other deaths in the same frame removes every visual once` (Review Focus 3).
  9. `a production completing as its barracks falls` (Review Focus 4): el soldado aparece, la barraca desaparece y las entidades coinciden.
  10. `removedWithoutEffects` para `'sold'` (`sellStructure`) y `'diagnostic'` (`removeEntity`): sin restos ni explosión; `dispose` de los recursos; los contadores `sold` y `discarded`.
  11. `deathsResolved works from event data alone`: la entidad ya no está en el ECS cuando se llama, y la posición del resto es la de `event.position`.
  12. `a missing component keeps the last visual state`: quitar `health` a una entidad viva → `syncStructures` no lanza y la barra no cambia.
  13. `clear, then a new World`: `dispose` de todo lo exclusivo; `soldiers` a 0; la escena vuelve a la línea base; `attach(nuevoWorld)` y `structureBuilt(1)` funcionan sin choque; `attach` sin `clear` lanza un error, igual que un alta sin `World`; `clear()` dos veces no falla; `clears` +2 y los demás contadores se mantienen.
  14. `clear with live projectiles, a placement ghost and an active strike leaves nothing behind` (Review Focus 5), con `ProjectileView`, `PlacementGhost` y `RewardEffectsView` reales en la misma escena: después de `view.clear()`, `projectileView.clear()`, `ghost.hide()` y `rewardEffectsView.clear()`, la escena vuelve a la línea base.
  15. `pickOwnStructure climbs to the registered root` (Review Focus 1): un rayo que solo corta el plano de la barra de vida devuelve la entidad; el Nexo nunca se devuelve; un edificio enemigo no se devuelve para `'player'`.
  16. `presentation never writes the ECS`: `freezeWorldComponents` y después `syncUnitsAndTurrets`, `syncStructures`, `syncShields` y cada alta; sin excepciones. La instantánea es igual antes y después de un fotograma de presentación.
  17. `syncShields`: la visibilidad sigue a `active` y la escala es `1 + sin(t·0.004)·0.035`.
- [ ] **Paso 3:** `npx tsx --test web/src/rendering/BattlefieldView.test.ts` → FAIL.
- [ ] **Paso 4: Implementar `BattlefieldView`** con los cuerpos actuales de `representStructure`, `createTroopVisual`, `representUnitDeath`, `representStructureDestruction`, `updateUnitGroup`, `updateTurretAim` y `updateBuildingList`. Solo cambia de dónde salen los datos: el ECS a través de `WorldReader`, o el evento.
- [ ] **Paso 5: Reparto en `GameApplication`** (tabla de §5.8):
  - **C1:** `startNewGame` crea `BattleSimulation`, después `view.attach(world)`, `structureBuilt(playerBase)` y `structureBuilt(enemyBase)`.
  - **C2/C3/C4:** `view.structureBuilt(entity)`. `spawnScenarioStructure` devuelve `Entity`.
  - **C6:** `stats.soldiersTrained += view.unitsProduced(...)`, en `advanceBattleSimulation` y en el escenario de estrés.
  - **C8/C9** en `updateCombat`:
    - primero `unlocks.recordEvent` por cada `unitDied`, como hoy;
    - después `view.deathsResolved(events, 'units', cues)` → `playExplosionFeedback(cue)` por cada cue;
    - en su sitio, `view.deathsResolved(events, 'structures', cues)` → lo mismo.

    `playExplosionFeedback(cue)`: si es nuclear, `cameraShake = 4.5`, `SFX.playCinematicExplosion(true)` y `haptics.nexusDestroyed()`; si no, `SFX.playCinematicExplosion(false)` y `cameraShake = max(cameraShake, scale * 0.7)`.
  - **C10:** `view.removedWithoutEffects(entity, 'sold')`. La selección usa `view.pickOwnStructure(raycaster, 'player')`.
  - **C11:** `discardEntity(entity)` = `world.removeEntity(entity)` + `view.removedWithoutEffects(entity, 'diagnostic')`. `prepareRewardScenario` lo usa:
    - sobre las estructuras enemigas no-Nexo que hay en el ECS;
    - en `'no-target'`, también sobre los soldados enemigos;
    - después llama a `view.syncShields(...)` en lugar de escribir `playerShieldVisual.visible`;
    - `rewardScenarioBuildings` pasa a ser `rewardScenarioEntities: Entity[]`.
  - **C12:** `teardownMatch` hace `view.clear()`, `rewardEffectsView.clear()`, `projectileView.clear()`, `combatEffects.clear()`, `world.clear()` y `cancelPlacement()`.
  - **Consumidores reconectados** (§5.8):
    - `lastPlayerNexusHealth`, con valor inicial `NEXUS_HEALTH`;
    - `ui.setBaseHealth`, desde el ECS;
    - el resumen de `endGame`, desde el ECS, con la base ausente contada como 0;
    - `updateResourceUI`, con `liveFactories(world, 'player')`;
    - el alimentador del combate, con `liveFactories` por facción;
    - las métricas `soldiers`/`playerSoldiers`/`enemySoldiers`, con `view.stats()`.
  - **Se borran:**
    - los tipos `HealthBar`, `RuntimeStructure`, `RuntimeUnit`, `RuntimeTarget` y `RuntimeProjectile`;
    - las cuatro listas, `targetObjects`, `playerHQ` y `enemyHQ`;
    - `playerShieldVisual`, `enemyShieldVisual` y `disposeNexusShieldVisuals`;
    - `isValidSoldierFactory`, `representStructure`, `createTroopVisual`, `representUnitDeath`, `representStructureDestruction`, `updateUnitGroup`, `updateTurretAim`, `updateTurrets` y `updateBuildingList`;
    - `updateNexusShieldVisuals`, que pasa a `view.syncShields(shieldState, gameplayClockMs)`.
- [ ] **Paso 6: Comprobar que no queda nada del registro antiguo.** `grep -nE "RuntimeStructure|RuntimeUnit|targetObjects|playerBuildings|enemyBuildings|playerUnits|enemyUnits|playerHQ|enemyHQ|\.hp\b|\.maxHp\b" web/src/GameApplication.ts`
  Expected: ninguna coincidencia.
- [ ] **Paso 7:** pruebas → PASS; `npm test`; `npm run typecheck`; `npm run build`. Prueba rápida en el navegador: partida, construir, vender y una muerte, sin errores de consola. La verificación completa es la de la Tarea 8.

**Rendimiento y recursos:**
- por fotograma, las mismas consultas `getComponent` por entidad que hoy y sin las escrituras de las copias;
- ninguna pasada sobre el ECS, porque se recorren las listas densas del registro;
- arrays de `cues` y `shieldState` reutilizados;
- el escudo se libera una vez y el escenario de recompensas libera lo que borra.

**Riesgos y vuelta atrás:** es la tarea más grande, a propósito, para no tener dos registros a la vez. Los riesgos son el orden de los efectos y que falte un camino. Los cubren las pruebas 5-9 y 13-14, el `grep` del paso 6 y la Tarea 8. Vuelta atrás: un solo `git revert`.

- [ ] **Paso 8: Commit**
  ```bash
  git add web/src/rendering/BattlefieldView.ts web/src/rendering/BattlefieldView.test.ts web/src/rendering/presentationTestState.ts \
    web/src/game/commands/trainCommand.test.ts web/src/GameApplication.ts
  git commit -m "refactor(rendering): BattlefieldView owns entity visuals by Entity and the app drops its gameplay copies"
  ```

---

### Task 7: Comprobación de consistencia y operaciones de diagnóstico

**Objetivo:** que un camino olvidado o duplicado salte en desarrollo y en las pruebas (§5.9), y dar a Playwright las operaciones que necesita para verificar cada camino.

**Responsabilidad nueva:**
- `dev/visualConsistency.ts`: una función pura;
- `BattlefieldView`: las excepciones explícitas;
- `GameApplication`: la comprobación automática en DEV, siete operaciones en `__gameDiagnostics` y la excepción C5 en el escenario de estrés.

**Dependencias:** `visualConsistency` → `WorldReader` (tipo), `components.ts` y el tipo `VisualKind` de `BattlefieldView`. `GameApplication` la importa y solo la usa detrás de `import.meta.env.DEV`.

**Files:**
- Create: `web/src/dev/visualConsistency.ts`
- Modify: `web/src/rendering/BattlefieldView.ts` (excepciones)
- Modify: `web/src/GameApplication.ts`
- Modify: `web/src/rendering/presentationBoundary.test.ts` (`EXTRA_PRESENTATION_MODULES = ['dev/visualConsistency.ts']`)
- Test: `web/src/dev/visualConsistency.test.ts`, `web/src/rendering/BattlefieldView.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // BattlefieldView.ts (añadidos)
  declareWithoutVisual(entity: Entity): void;     // C5; lanza un error si la entidad ya está registrada
  forgetWithoutVisual(entity: Entity): void;
  exemptions(): ReadonlySet<Entity>;              // clear() la vacía

  // dev/visualConsistency.ts
  export interface ConsistencyView {
    entries(): Iterable<readonly [Entity, VisualKind]>;
    exemptions(): ReadonlySet<Entity>;
  }
  export interface ConsistencyReport {
    readonly missingVisual: readonly Entity[]; readonly orphanVisual: readonly Entity[];
    readonly missingComponent: readonly Entity[]; readonly kindMismatch: readonly Entity[];
    readonly exemptWithVisual: readonly Entity[]; readonly staleExemption: readonly Entity[];
  }
  /** `world` undefined = menú: el registro debe estar vacío (todo va a orphanVisual). */
  export function checkVisualConsistency(world: WorldReader | undefined, view: ConsistencyView): ConsistencyReport;
  export function isConsistent(report: ConsistencyReport): boolean;
  export function describeInconsistencies(report: ConsistencyReport): string;   // empieza por "Visual consistency failed:"

  // __gameDiagnostics (añadidos; solo DEV)
  assertConsistency(): void;      // lanza Error(describeInconsistencies(r)) si !isConsistent(r)
  lifecycleCounts(): LifecycleCounts;
  screenPointFor(x: number, z: number): { x: number; y: number };   // CSS px de la ventana; Vector3(x, 0, z).project(camera)
  setHealth(entity: number, value: number): void;   // solo PLAYING; finito y ≥ 0, recortado a max; solo escribe health.current
  //   errores: Error('Start a match before setting an entity health'),
  //            RangeError('Entity health must be a finite number of zero or more'),
  //            Error('That entity has no health')
  setEnemyAiEnabled(enabled: boolean): void;
  entities(filter?: { faction?: 'player' | 'enemy'; kind?: string }): number[];   // lee el ECS
  readResources(): { geometries: number; textures: number; sceneGeometries: number; sceneMaterials: number;
                     effectGeometries: number; effectMaterials: number };
  ```
- **Reglas** (§5.9):
  - **dibujable:** `building` o `soldier`, sin `projectile` y sin estar exenta;
  - `orphanVisual`: la entrada existe y su entidad no tiene `faction`;
  - `missingComponent`: la entidad existe, pero le falta `transform` o `health`;
  - `kindMismatch`: el `VisualKind` no coincide con `building.kind` / `soldierKind`;
  - **exenciones:** `exemptWithVisual` (la exenta tiene visual) y `staleExemption` (la exenta ya no existe).

- [ ] **Paso 1: Pruebas que fallan:**
  - **`visualConsistency.test.ts`**, sobre un `World` y una `ConsistencyView` de prueba:
    - un informe vacío en un caso consistente;
    - cada una de las seis categorías provocada por separado;
    - un proyectil sin visual no se informa;
    - una entidad exenta sin visual no se informa;
    - en el menú (`world` undefined) con entradas, todo va a `orphanVisual`;
    - `describeInconsistencies` nombra las entidades.
  - **`BattlefieldView.test.ts`:** después de **cada** paso de las pruebas 1-14 de la Tarea 6, `isConsistent(checkVisualConsistency(world, view))`; esto sustituye a la comprobación local. Además:
    - `declareWithoutVisual` sobre una entidad registrada lanza un error;
    - `clear()` vacía las excepciones.
- [ ] **Paso 2:** `npx tsx --test web/src/dev/visualConsistency.test.ts web/src/rendering/BattlefieldView.test.ts` → FAIL.
- [ ] **Paso 3: Implementar.** En `GameApplication`:
  - **escenario de estrés** (`:2612-2645`): `view.declareWithoutVisual(factory)` al crear cada fábrica invisible y `view.forgetWithoutVisual(factory)` justo después de su `removeEntity`;
  - **comprobación automática:** al final de la rama `PLAYING` de `animate`, `if (import.meta.env.DEV)`, como mucho una vez por segundo de `gameplayClockMs`. Hace `console.error` una sola vez por cada firma `categoría:entidad` (el conjunto se vacía en `startNewGame`) y deja el último informe a mano para `read()` (`visualInconsistencies: number`);
  - **operaciones nuevas:** dentro del bloque `if (diagnosticsEnabled && diagnosticsSamples)`, junto a las que ya existen. `setHealth` copia las validaciones de `setNexusHealth` (`:2574-2585`) y no quita entidades ni toca `matchState`.
- [ ] **Paso 4:** pruebas → PASS; `npm test`; `npm run typecheck`; `npm run build`.
- [ ] **Paso 5: Producción limpia.** `grep -rl "Visual consistency failed" dist/` y `grep -rl "Entity health must be a finite number" dist/` (el texto de error de `setHealth`).
  Expected: sin resultados en los dos casos.

**Rendimiento y recursos:** en producción, nada. En desarrollo, una consulta `queryInto` por segundo con un array reutilizado.
**Riesgos y vuelta atrás:** que la comprobación se quede en el bundle. Lo cubre el paso 5. Falsos positivos entre fotogramas: los momentos válidos están en §5.9 y Playwright solo llama entre fotogramas. Vuelta atrás: `git revert`.

- [ ] **Paso 6: Commit**
  ```bash
  git add web/src/dev/visualConsistency.ts web/src/dev/visualConsistency.test.ts web/src/rendering/BattlefieldView.ts \
    web/src/rendering/BattlefieldView.test.ts web/src/rendering/presentationBoundary.test.ts web/src/GameApplication.ts
  git commit -m "feat(dev): check the visual registry against the ECS and expose lifecycle diagnostics"
  ```

---

### Task 8: Navegador, recursos, medición y entrega

**Objetivo:** verificar en el navegador el cableado real de cada camino, comprobar que los recursos no crecen y medir contra R0-R5. Después, actualizar la documentación.

**Files:**
- Modify: `README.md` (arquitectura: `rendering/BattlefieldView.ts`, `ProjectileView.ts`, `PlacementGhost.ts` y el resto de módulos nuevos)
- Modify: `docs/audits/2026-11-14-auditoria-responsabilidades.md` (R6 hecho en §7)
- Modify: `docs/performance/2026-11-14-referencia-rendimiento.md` (nueva §8.6 de R6)
- Modify: `docs/superpowers/specs/2026-11-21-r6-separacion-de-la-presentacion-design.md` (nueva §13, informe de entrega)
- Modify: este plan (casillas)

- [ ] **Paso 1: Navegador, escritorio** (1280×720), con `npm run dev`, `playwright-cli open "http://localhost:5173/?diagnostics=1"` y `pageerror` y consola registrados. En cada paso se guarda la salida de `eval` en el informe.

  **Antes de cada paso:**
  - `c0 = lifecycleCounts()`;
  - `r0 = readResources()`.

  **Después de cada paso:**
  - `assertConsistency()` no lanza;
  - la diferencia de contadores es la indicada;
  - no hay ningún `pageerror`.

  | # | Camino | Acción | Expected |
  |---|---|---|---|
  | 0 | Menú | Cargar | `entities()` vacío; `r0` = línea base del menú |
  | 1 | C1 | Iniciar partida (botón real); `setEnemyAiEnabled(false)` | `built` +2; `entities({kind:'hq'})` = los ids de las bases (1 y 2) |
  | 2 | C2 | Botón real de barraca → `mousemove`/`click` en `screenPointFor(10, 30)` | `built` +1; el oro baja 150 |
  | 3 | Fantasma | ×20: elegir generador → `mousemove` a `screenPointFor(0, 40)` → Escape; ×20: elegir barraca → torreta → generador sin cancelar → Escape | `geometries` igual a la de antes de la serie |
  | 3b | Review Focus 2 | Elegir torreta → `click` en el mismo punto del paso 2 | Aviso "Ubicación ocupada"; el fantasma sigue visible (captura); después, Escape |
  | 4 | C6 | Botón real de entrenar fusilero; esperar a que termine la orden | `produced` +1 |
  | 5 | C10 | Botón real de vender → `click` en `screenPointFor(10, 30)` y, otra vez, en la barra de vida del edificio | `sold` +1; el registro −1; `geometries` baja |
  | 6 | C8 | `setHealth(<fusilero del jugador>, 0)` + 100 ms | `unitDied` +1; `stats` de fusileros −1; los restos +1 |
  | 7 | C9 | Generar una estructura enemiga de prueba con `prepareRewardScenario('ready')` y `setHealth(<torreta>, 0)` + 100 ms | `structureDestroyed` +1; una ruina |
  | 8 | C3 | Partida nueva; `setEnemyAiEnabled(true)`; esperar hasta 60 s | `built` del enemigo +1 sobre los Nexos |
  | 9 | C8/C9 en combate | `runCombatScenario({ barracksPerSide: 2, warmupSeconds: 2, durationSeconds: 10 })`, con `assertConsistency()` cada segundo en paralelo | Todos los informes vacíos; `produced` y `unitDied` suben |
  | 10 | C11 | Partida; `prepareRewardScenario('no-target')`; después `'ready'` | `discarded` = estructuras no-Nexo + soldados enemigos que había; `geometries` baja; después `built` +5 |
  | 11 | C5 | `runStressScenario(10, 200)` y `assertConsistency()` cuando termina | Sin inconsistencias ni `staleExemption` |
  | 12 | C9 Nexo | Partida; `setNexusHealth('enemy', 0)`; `assertConsistency()` en `MATCH_ENDING`; esperar a `GAMEOVER` | En `MATCH_ENDING`, la base enemiga no está en `entities()` ni en el registro. En `GAMEOVER`, registro vacío y `clears` +1 |
  | 13 | C12 + C1 | Partida nueva desde la pantalla final | `entities({kind:'hq'})` = los ids 1 y 2; sin errores de duplicado |
  | 13b | Review Focus 5 | Elegir barraca (fantasma visible), lanzar artillería (`prepareRewardScenario('ready')` + tarjeta real), pausar y "Reiniciar batalla" | Sin errores; `assertConsistency()` limpio; `geometries` igual que tras el paso 13 |
  | 14 | Repetición | 3 × (partida → `runCombatScenario({ warmupSeconds: 2, durationSeconds: 10 })` → salir al menú) | `geometries` y `textures` iguales a `r0` del paso 0; `sceneMaterials` como complemento |

  Expected: todas las filas cumplen.
- [ ] **Paso 2: Navegador, perfil móvil emulado** (412×915, DPR 1,5, táctil; informe de rendimiento §6). Se repiten las filas 1, 2, 4, 5, 9, 12 y 14, con toques en lugar de clics.
  Expected: igual que en escritorio. En el informe se dice que no hubo teléfono real, si no lo hubo.
- [ ] **Paso 3: Medición.** La batería de §6 del informe de rendimiento en los dos perfiles (partida Normal de 25 s y combate de 30 s, dos ejecuciones cada uno), comparada con R0, R3, R4 y R5:
  - draw calls medios y máximos;
  - triángulos;
  - geometrías y texturas;
  - `projectiles`, `cachedProjectiles`, `soldiers`, partículas y emisores;
  - `gameplayOtherMs`, `renderMs` y `frameMs`;
  - repetición de tres combates y la partida siguiente.

  Expected: las métricas estructurales coinciden con R5; tras la repetición, las geometrías vuelven a 23 (escritorio) y 22 (móvil emulado); `gameplayOtherMs` no sube de forma clara. Se anota la carga del portátil. No se presenta ninguna mejora sin medición.
- [ ] **Paso 4: Producción y grafo:**
  - `npm test`, `npm run typecheck` y `npm run build` en verde;
  - las dos búsquedas en `dist/` de la Tarea 7, sin resultados;
  - `graphify update .` y el análisis de ciclos de §3.5 sobre el grafo nuevo: sin ciclos. Es complementario a la prueba de límites;
  - las comunidades nuevas de `rendering/` se anotan como información, no como criterio.
- [ ] **Paso 5: Informe de entrega** (§13 nueva del diseño):
  - commits;
  - número de pruebas;
  - resultados de los pasos 1-4;
  - recursos;
  - limitaciones: sin dispositivo real si no lo hubo; la equivalencia del orden de efectos se apoya en las pruebas y la captura visual;
  - `git diff 38b0ae7 --stat`, para confirmar el alcance.

  Se actualizan también el README, la auditoría y el informe de rendimiento.
- [ ] **Paso 6: Commit**
  ```bash
  git add README.md docs/audits/2026-11-14-auditoria-responsabilidades.md docs/performance/2026-11-14-referencia-rendimiento.md \
    docs/superpowers/specs/2026-11-21-r6-separacion-de-la-presentacion-design.md docs/superpowers/plans/2026-11-21-r6-separacion-de-la-presentacion.md
  git commit -m "docs(rendering): verify R6 in the browser, check resources and measure it"
  ```

---

### Después de la Tarea 8: revisión independiente

Una revisión de todo el rango, `38b0ae7..HEAD`, contra el diseño, con el foco en:
- los límites de §5.1;
- que la presentación no escriba nunca el ECS;
- que cada camino C1-C12 avise exactamente una vez;
- la propiedad de los recursos, exclusivos frente a compartidos;
- el orden del fotograma;
- los cinco puntos de Review Focus.

Los hallazgos críticos o importantes se corrigen antes de cerrar R6. Los menores se registran en el diseño (§13). **No se empieza R7.**

## Dependencias entre tareas

```
T1 ──► T2 ──► T3
 │      └───► T4
 └──► T5 ──► T6 ──► T7 ──► T8
        (T6 usa T2 y T5; T4 y T3 son independientes de T5-T7)
```

Orden de ejecución: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8. La única duplicación temporal es la de `targetObjects` entre T5 y T6, que se escribe sin lectores y se borra en T6.
