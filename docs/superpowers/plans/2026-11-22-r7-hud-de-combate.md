# R7 — HUD de combate — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el cajón «Centro de Mando» por un HUD de combate compacto: franja superior compartida por los dos bandos, barra de acciones B+ con grupos que se pliegan y que se transforma en el modo activo, venta en dos pasos y botones de recompensa. Todo alimentado por un presentador puro que escribe en el DOM solo cuando algo cambia.

**Architecture:**
- El dominio gana dos datos: el reembolso de venta exportado y el edificio productor de cada unidad (§6.8).
- `game/InteractionMode.ts` (máquina de estados pura) sustituye a `selectedBuildType`/`isDemolishMode`.
- `ui/hud/HudPresenter` lee el ECS (`WorldReader`) y `MatchState` y rellena un `HudView` reutilizable.
- Los componentes DOM de `ui/hud/` pintan ese `HudView` y solo escriben cuando cambia un valor.
- `GameUiPort` pasa a `render(view)`. `GameApplication` conserva la orquestación, los comandos, el audio y los hápticos.

**Tech Stack:** TypeScript estricto, DOM sin framework, SVG en línea, CSS propio (sin Tailwind en el HUD nuevo), `node:test` vía `tsx` (`npm test`), `tsc --noEmit` (`npm run typecheck`), Vite (`npm run build`), `playwright-cli` global para el navegador.

**Spec:** `docs/superpowers/specs/2026-11-22-r7-hud-de-combate-design.md` (aprobado, commit `0a4641e`). Las referencias `§` son de ese documento. Los números de línea `GameApplication.ts:N` son del commit `25946ef` (`web/src` idéntico en `0a4641e`).
- **Punto de partida comprobado:** `npm test` da 468 pruebas en verde.

## Global Constraints

- TypeScript estricto, sin `any`, sin `!` ni aserciones innecesarias. Sin dependencias nuevas. Sin `.js` en `web/src/`.
- `game/**` no importa `ui/`, `rendering/`, `platform/` ni `three`. `ui/hud/*` no importa `three` ni `rendering/`; lee el ECS solo con `WorldReader`.
- **No cambian:** reglas, costes, reembolso (`Math.floor(coste × 0.7)`), tiempos de producción, recompensas, cooldowns, IA, cámara, render 3D, menú principal, pausa ni pantalla final. Cambios de comportamiento permitidos: solo los de §9.
- **Valores fijados:**
  - umbral crítico: `healthPercent <= 30`; porcentaje = `Math.ceil(current / max * 100)` acotado a `0..100`, y `0` si `current <= 0`;
  - recompensas y recuento de objetivos: como máximo cada `250` ms de reloj de juego, más actualización inmediata tras un comando del jugador;
  - oro: entero (`Math.floor`); desde `10000`, `"10,2k"` (un decimal, coma);
  - porcentaje en el anillo: `` `${p} %` ``; segundos: `` `${Math.ceil(s)} s` ``;
  - casillas: objetivo `60×60` px, mínimo `44×44`; separación entre controles `≥ 8` px; icono de categoría `44` px de ancho; texto `≥ 11` px; contraste `≥ 4.5:1`;
  - nombre corto `≤ 9` caracteres;
  - aviso de motivo visible `1900` ms.
- **Textos fijados** (español, sin emojis en el HUD): ver la tabla de la Tarea 7 y la de la Tarea 9. `⚡` no representa el oro en ningún sitio.
- **Estados sin opacidad:** ningún estado del HUD se expresa bajando `opacity` (§5.2).
- Sin `backdrop-filter` en `hud.css`.
- **Commits:** uno por tarea, directo en `main`, `git add` con rutas explícitas (nunca `-A`). Antes de cada commit: prueba de la tarea, `npm test`, `npm run typecheck` y, si toca producción, `npm run build`. Mensaje terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No se incluyen `CLAUDE.md`, `.claude/`, `graphify-out/` ni `.impeccable/`.
- **Grafo:** `graphify update .` tras cada tarea que modifique código (`AGENTS.md` §16).

## Review Focus

1. **Oro exactamente igual al coste.** La acción está disponible, no «sin oro». Prueba en la Tarea 4 (`gold equal to cost is available`).
2. **La estructura elegida para vender cae antes de confirmar.** Se vuelve a Vendiendo, no se vende nada y aparece «La estructura ya no existe». Pruebas en la Tarea 2 (`targetGone`) y paso 6 del navegador (Tarea 10).
3. **Reiniciar desde la pausa con un modo activo y el Nexo crítico ya avisado.** La partida nueva empieza sin modo, con Construir abierto y el aviso crítico rearmado. Prueba en la Tarea 4 (`reset rearms the critical alert`) y paso 9 del navegador.
4. **Girar la pantalla mientras se coloca.** El modo se conserva y la barra se recalcula sin desbordar. Paso 7 del navegador.
5. **Doble toque rápido sobre la casilla Soldado.** Dos órdenes (si hay dos barracas libres) y la cámara no se enfoca, porque el toque no llega al lienzo. Paso 4 del navegador.

---

### Task 1: Dominio — reembolso exportado y productor por unidad (§6.8)

**Files:**
- Modify: `web/src/game/commands/structureCommands.ts:12-58`
- Modify: `web/src/game/ecs/initialBattle.ts:9-60` (`SoldierProductionDefinition`, `SOLDIER_PRODUCTION`)
- Modify: `web/src/game/commands/trainCommand.ts:26-37`
- Modify: `web/src/game/ecs/systems.ts:262-282` (`requestUnitProduction`)
- Modify: `web/src/GameApplication.ts:912-950` (`trainUnit`)
- Test: `web/src/game/commands/structureCommands.test.ts`, `web/src/game/commands/trainCommand.test.ts`, `web/src/game/ecs/BattleSimulation.test.ts` (o el archivo que ya prueba `requestUnitProduction`)

**Interfaces:**
- Produces:
  ```ts
  // structureCommands.ts
  export function sellRefund(kind: BuildableStructureKind): number;   // Math.floor(STRUCTURE_DEFINITIONS[kind].cost * 0.7); sellStructure la usa
  // initialBattle.ts
  export interface SoldierProductionDefinition { /* …campos actuales… */ readonly producer: BuildableStructureKind }
  //   rifleman.producer = 'barracks'; tank.producer = 'barracks'
  // trainCommand.ts — aceptan World o WorldReader
  export function liveFactories(world: WorldReader, faction: Faction, producer?: BuildableStructureKind): readonly Entity[];  // por defecto 'barracks'
  export function idleFactories(world: WorldReader, faction: Faction, producer?: BuildableStructureKind): readonly Entity[];
  export interface ProducerAvailability { total: number; free: number }
  /** Sin asignaciones: usa `scratch` para la consulta y escribe en `out`. */
  export function producerAvailability(world: WorldReader, faction: Faction, producer: BuildableStructureKind, scratch: Entity[], out: ProducerAvailability): ProducerAvailability;
  ```

- [ ] **Paso 1: Pruebas que fallan**
  - `sellRefund matches what sellStructure returns`: para `generator`, `barracks` y `turret`, `sellRefund(kind) === sellStructure(...).refund` (`70`, `105`, `87`).
  - `every unit names a buildable producer`: para cada clave de `SOLDIER_PRODUCTION`, `producer` está en `STRUCTURE_DEFINITIONS`.
  - `producerAvailability counts live and idle producers of the faction`: con dos barracas del jugador (una con orden) y una enemiga → `{ total: 2, free: 1 }`; una barraca con `health.current = 0` no cuenta.
  - `liveFactories filters by producer`: con un generador y una barraca, `liveFactories(world, 'player', 'generator')` está vacío.
  - `requestUnitProduction rejects a building that is not the unit's producer`: un edificio con `factory` y `kind: 'turret'` (creado en la prueba) → `{ accepted: false, reason: 'invalid-factory' }` y el oro no cambia.
- [ ] **Paso 2:** `npx tsx --test web/src/game/commands/structureCommands.test.ts web/src/game/commands/trainCommand.test.ts` → FAIL.
- [ ] **Paso 3: Implementar** las interfaces de arriba. `liveFactories` usa un predicado compartido `isLiveProducer(world, entity, faction, producer)` que también usa `producerAvailability`. `requestUnitProduction` compara `building.kind` del edificio con `SOLDIER_PRODUCTION[kind].producer` antes de cobrar. `GameApplication.trainUnit` pasa `SOLDIER_PRODUCTION[unitType].producer` a `liveFactories`/`idleFactories`; sus avisos no cambian en esta tarea.
- [ ] **Paso 4:** pruebas del paso 2 → PASS; `npm test` (todas las anteriores sin cambios de resultado, incluidas las de IA); `npm run typecheck`; `npm run build`.
- [ ] **Paso 5: Commit**
  ```bash
  git add web/src/game/commands/structureCommands.ts web/src/game/commands/structureCommands.test.ts \
    web/src/game/ecs/initialBattle.ts web/src/game/commands/trainCommand.ts web/src/game/commands/trainCommand.test.ts \
    web/src/game/ecs/systems.ts web/src/GameApplication.ts <archivo de prueba de requestUnitProduction>
  git commit -m "feat(game): export the sell refund and name each unit's producer"
  ```

---

### Task 2: `InteractionMode` y cancelaciones (§5.4, §5.4.1, §6.3)

**Files:**
- Create: `web/src/game/InteractionMode.ts`
- Test: `web/src/game/InteractionMode.test.ts`
- Modify: `web/src/GameApplication.ts:418-420` (estado), `:476-512` (Esc, clic derecho, «atrás»), `:524-646` (inicio y desmontaje), `:747-778` (seleccionar, vender, cancelar), `:826-910` (`onPointerUp`)

**Interfaces:**
- Produces:
  ```ts
  export type InteractionMode =
    | { readonly kind: 'none' }
    | { readonly kind: 'placing'; readonly structure: BuildableStructureKind }
    | { readonly kind: 'selling' }
    | { readonly kind: 'confirmingSale'; readonly entity: Entity; readonly structure: BuildableStructureKind; readonly refund: number };
  export type InteractionEvent =
    | { readonly type: 'selectStructure'; readonly structure: BuildableStructureKind }
    | { readonly type: 'toggleSell' }
    | { readonly type: 'pickStructure'; readonly entity: Entity; readonly structure: BuildableStructureKind; readonly refund: number }
    | { readonly type: 'built' }
    | { readonly type: 'saleConfirmed' }
    | { readonly type: 'targetGone' }
    | { readonly type: 'cancel' }      // ✕, Esc, clic derecho
    | { readonly type: 'back' }        // botón «atrás»
    | { readonly type: 'reset' };      // empezar, reiniciar, salir, fin de partida
  export const NO_INTERACTION: InteractionMode;   // { kind: 'none' }, congelado
  export function nextInteractionMode(mode: InteractionMode, event: InteractionEvent): InteractionMode;
  ```

- [ ] **Paso 1: Pruebas que fallan** — una por fila; la tabla es la especificación de `nextInteractionMode`:

  | Desde | Evento | Resultado |
  |---|---|---|
  | none | selectStructure(g) | placing(g) |
  | placing(g) | selectStructure(g) | none |
  | placing(g) | selectStructure(t) | placing(t) |
  | none / placing | toggleSell | selling |
  | selling / confirmingSale | toggleSell | none |
  | selling / confirmingSale | pickStructure(e) | confirmingSale(e) |
  | none / placing | pickStructure | sin cambio |
  | placing | built | none |
  | confirmingSale | saleConfirmed | selling |
  | confirmingSale | targetGone | selling |
  | cualquiera | cancel | none |
  | confirmingSale | back | selling |
  | placing / selling | back | none |
  | cualquiera | reset | none |
  | cualquiera ≠ los de arriba | evento sin fila | el mismo objeto (`===`) |

- [ ] **Paso 2:** `npx tsx --test web/src/game/InteractionMode.test.ts` → FAIL.
- [ ] **Paso 3: Implementar** `nextInteractionMode` (pura, sin asignar si no hay cambio).
- [ ] **Paso 4: Cablear en `GameApplication`.** `let interaction: InteractionMode = NO_INTERACTION` sustituye a `selectedBuildType` e `isDemolishMode`; todos los cambios pasan por `nextInteractionMode`:
  - `onEscape` y `onCancelPlacement` (clic derecho) → `cancel` si el modo no es `none`; el clic derecho devuelve `true` solo en ese caso.
  - `onNativeBack`: en `PLAYING` con modo ≠ `none` → `back` y `return true`; en el resto de casos, el comportamiento actual (`:491-507`).
  - `startNewGame`, `exitToMainMenu`, `teardownMatch` y la entrada en `MATCH_ENDING` → `reset`.
  - La pausa y `onApplicationInactive` **no** tocan el modo.
  - `onPointerUp`: el doble toque sigue limitado a `kind === 'none'`; colocar con `placing`; con `selling` el toque sigue vendiendo **de inmediato** en esta tarea (la confirmación llega en la Tarea 8). Construir con éxito → `built`; `insufficient-gold` → `cancel` (comportamiento actual).
  - El fantasma de colocación se muestra u oculta según `interaction.kind === 'placing'`, en una función `applyInteraction(next)` que también llama a los métodos de UI que siguen existiendo (`setPlacementActive`, `setDemolishMode`).
- [ ] **Paso 5:** pruebas → PASS; `npm test`; `npm run typecheck`; `npm run build`.
- [ ] **Paso 6: Commit** `feat(game): drive placing and selling through InteractionMode`.

---

### Task 3: Catálogo de presentación, iconos y formato (§6.2)

**Files:**
- Create: `web/src/ui/hud/actionCatalog.ts`, `web/src/ui/hud/hudFormat.ts`
- Test: `web/src/ui/hud/actionCatalog.test.ts`, `web/src/ui/hud/hudFormat.test.ts`
- Modify: `web/src/ui/uiIcons.ts` (iconos nuevos), `web/src/ui/contracts.ts:294-295`

**Interfaces:**
- Produces:
  ```ts
  // contracts.ts
  export type BuildingType = BuildableStructureKind;
  export type UnitType = SoldierKind;
  // uiIcons.ts — se añaden a UiIconId: 'generator' | 'barracks' | 'turret' | 'tank' | 'sell' | 'lock' | 'pause' | 'focus'
  //   (categorías: Construir usa 'building' y Ejército 'swords', que ya existen; soldado usa 'soldier')
  // actionCatalog.ts
  export type ActionGroup = 'build' | 'army';
  export const ACTION_GROUP_ORDER: readonly ActionGroup[];            // ['build', 'army']
  export const ACTION_GROUP_ICON: Readonly<Record<ActionGroup, UiIconId>>;
  export const ACTION_GROUP_LABEL: Readonly<Record<ActionGroup, string>>; // 'Construir', 'Ejército'
  export interface StructurePresentation { readonly kind: 'structure'; readonly id: BuildableStructureKind; readonly group: 'build';
    readonly shortName: string; readonly fullName: string; readonly pluralName: string; readonly indefiniteName: string; readonly icon: UiIconId }
  export interface UnitPresentation { readonly kind: 'unit'; readonly id: SoldierKind; readonly group: 'army';
    readonly shortName: string; readonly fullName: string; readonly icon: UiIconId }
  export type ActionPresentation = StructurePresentation | UnitPresentation;
  export const ACTION_CATALOG: readonly ActionPresentation[];
  export function structurePresentation(id: BuildableStructureKind): StructurePresentation;
  // hudFormat.ts
  export function formatGold(gold: number): string;
  export function formatPercent(percent: number): string;
  export function formatSeconds(seconds: number): string;
  ```
  Contenido de `ACTION_CATALOG`, en este orden:

  | id | shortName | fullName | pluralName | indefiniteName | icon |
  |---|---|---|---|---|---|
  | generator | Generador | Generador | Generadores | un Generador | generator |
  | barracks | Barraca | Barraca | Barracas | una Barraca | barracks |
  | turret | Torreta | Torreta láser | Torretas | una Torreta | turret |
  | rifleman | Soldado | Soldado ráfaga | — | — | soldier |
  | tank | Tanque | Tanque blindado | — | — | tank |

- [ ] **Paso 1: Pruebas que fallan**
  - `every buildable structure and every unit has exactly one entry` (claves de `STRUCTURE_DEFINITIONS` y `SOLDIER_PRODUCTION`).
  - `short names have at most 9 characters`.
  - `every unit producer is a catalogued structure`.
  - `formatGold`: `0 → '0'`, `225.9 → '225'`, `9999 → '9999'`, `10000 → '10,0k'`, `10234 → '10,2k'`.
  - `formatPercent(83) === '83 %'`; `formatSeconds(4.1) === '5 s'`, `formatSeconds(0) === '0 s'`.
- [ ] **Paso 2:** `npx tsx --test web/src/ui/hud/actionCatalog.test.ts web/src/ui/hud/hudFormat.test.ts` → FAIL.
- [ ] **Paso 3: Implementar.** Los iconos nuevos siguen el estilo de trazo de `uiIcons.ts` (rejilla 24×24, `stroke`).
- [ ] **Paso 4:** pruebas → PASS; `npm test`; `npm run typecheck`.
- [ ] **Paso 5: Commit** `feat(ui): add the HUD action catalog, icons and formatters`.

---

### Task 4: `HudPresenter` y `HudView` (§5.1, §5.2, §5.6, §6.1)

**Files:**
- Create: `web/src/ui/hud/hudView.ts`, `web/src/ui/hud/HudPresenter.ts`
- Test: `web/src/ui/hud/HudPresenter.test.ts` (mundo real con `createCommandTestContext`, `buildStructure`, `trainUnit`)

**Interfaces:**
- Consumes: Tarea 1 (`producerAvailability`, `sellRefund`, `SOLDIER_PRODUCTION[k].producer`), Tarea 2 (`InteractionMode`), Tarea 3 (catálogo).
- Produces:
  ```ts
  // hudView.ts
  export interface FactionSummaryView { healthPercent: number; critical: boolean; criticalEntered: boolean; gold: number; combatPoints: number }
  export type ActionState = 'available' | 'unaffordable' | 'requirement' | 'busy' | 'selected';
  export interface ActionView {
    readonly key: string;                       // `${kind}:${id}`
    readonly presentation: ActionPresentation;
    state: ActionState; cost: number; productionSeconds: number | null;
    progressPercent: number; orders: number; missingGold: number;
    requirement: StructurePresentation | null;  // productor que falta (state 'requirement') o que está ocupado (state 'busy')
  }
  export interface ProducerView { readonly producer: StructurePresentation; total: number; free: number }
  export type RewardButtonState = 'missing-points' | 'missing-gold' | 'no-target' | 'cooldown' | 'active' | 'ready';
  export interface RewardButtonView { readonly id: RewardId; title: string; state: RewardButtonState;
    pointsCost: number; goldCost: number; missingPoints: number; missingGold: number; remainingSeconds: number; ringFraction: number }
  export type ModeView =
    | { kind: 'none' } | { kind: 'placing'; structure: StructurePresentation } | { kind: 'selling' }
    | { kind: 'confirmingSale'; structure: StructurePresentation; refund: number };
  export interface HudView { player: FactionSummaryView; enemy: FactionSummaryView;
    actions: ActionView[]; producers: ProducerView[]; rewards: RewardButtonView[]; mode: ModeView }
  // HudPresenter.ts
  export interface HudPresenterInput {
    world: WorldReader; bases: Readonly<Record<Faction, Entity>>; match: Readonly<MatchState>;
    difficulty: Difficulty; nowMs: number; mode: InteractionMode;
    /** Recuento de objetivos de recompensa del jugador; se llama como máximo cada 250 ms. */
    countRewardTargets(): number;
  }
  export class HudPresenter {
    constructor(catalog?: readonly ActionPresentation[]);
    update(input: HudPresenterInput): HudView;   // devuelve siempre el mismo objeto y los mismos arrays
    invalidateRewards(): void;                   // la siguiente update recalcula recompensas aunque no hayan pasado 250 ms
    reset(): void;                               // nueva partida: rearma el aviso crítico y las recompensas
  }
  ```
  Reglas que fija esta tarea:
  - **Facción:** vida de `bases[side]` (sin base o `max <= 0` → `0`), oro de su `economy`, CP de `match.combatPoints`. `criticalEntered` es `true` solo en la `update` en que `critical` pasa de `false` a `true` para el jugador; para el enemigo siempre `false`.
  - **Estructura:** `selected` si el modo es `placing` de esa estructura; si no, `unaffordable` si `gold < cost`; si no, `available`.
  - **Unidad:** con `total === 0` del productor → `requirement`; con `free === 0` → `busy`; si no, `unaffordable` si `gold < cost`; si no, `available`. `orders` y `progressPercent` (`Math.floor((1 - remaining / duration) * 100)` de la orden más próxima) salen de las órdenes del jugador de ese tipo.
  - **Recompensas:** activa si `strikeActiveUntilMs[id] > nowMs` o, para el escudo, `shieldUntilMs > nowMs`; si no, el estado sale de `validateRewardActivation` (`insufficient-points → missing-points`, `insufficient-gold → missing-gold`, `no-valid-target → no-target`, `shield-active → active`, `cooldown → cooldown`, aceptada → `ready`). `ringFraction`: `points / pointsCost` en `missing-points`; `1 - restante / (REWARD_COOLDOWN_MS / 1000)` en `cooldown`; `restante / durationSeconds` en `active`; `1` en el resto. `title` = `getRewardDefinitionForDifficulty(id, difficulty).title`.
  - **Modo:** copia de `InteractionMode` con la presentación del catálogo.

- [ ] **Paso 1: Pruebas que fallan**
  - `player and enemy summaries come from the same rules` (mismos números con los dos bandos en el mismo estado).
  - `health percent rounds up and reaches 0 only at 0`: `1/1200 → 1`, `1199/1200 → 100`, `0 → 0`.
  - `30 percent is critical; criticalEntered fires once`: 31 % → 30 % → 25 % da `criticalEntered` `false, true, false`; subir a 40 % y bajar a 30 % lo vuelve a disparar.
  - `reset rearms the critical alert` (Review Focus 3).
  - `gold equal to cost is available` (Review Focus 1) y `one less is unaffordable with missingGold 1`.
  - `placing marks only that structure as selected`.
  - `units need a live producer, then a free one`: sin barracas → `requirement` con `requirement.id === 'barracks'`; con una barraca ocupada → `busy`; con una libre → `available`.
  - `orders and progress per unit kind` (dos órdenes de fusilero, la más próxima a la mitad → `orders 2`, `progressPercent 50`).
  - `reward states match validateRewardActivation` para cada motivo, con los números de `REWARD_DEFINITIONS` en `normal`.
  - `active strikes and shield report remaining seconds`.
  - `targets are counted at most every 250 ms unless invalidated` (espía sobre `countRewardTargets`: llamadas en `t = 0, 100, 249, 250` → 2; tras `invalidateRewards()` → 3).
  - `update reuses the view` (`update(a) === update(b)` y `view.actions` es el mismo array).
- [ ] **Paso 2:** `npx tsx --test web/src/ui/hud/HudPresenter.test.ts` → FAIL.
- [ ] **Paso 3: Implementar** con un array `scratch` de entidades propio del presentador; ninguna asignación en una `update` sin cambios de recompensas.
- [ ] **Paso 4:** pruebas → PASS; `npm test`; `npm run typecheck`.
- [ ] **Paso 5: Commit** `feat(ui): add the HUD presenter`.

---

### Task 5: CSS — fuera las reglas por posición; tokens y escala (§6.6)

Sin cambio visual: prepara `hud.css` y quita las reglas que se reactivarían al cambiar el DOM.

**Files:**
- Create: `web/src/styles/hud.css`
- Modify: `web/src/style.css` (borrar los selectores `#game-hud > div:first-child…`, `#game-hud > div:last-child…`, `#game-hud > div:nth-child(2)…` y las reglas que solo los neutralizaban, como `#game-hud > div.game-status-rail > div.game-center-controls`); `web/src/main.ts` (importar `./styles/hud.css`)

- [ ] **Paso 1: Capturas «antes»** con `playwright-cli` en 360×740, 390×844, 844×390 y 820×1180 (`?diagnostics=1`): HUD con el cajón cerrado y abierto.
- [ ] **Paso 2:** crear `hud.css` con los tokens: `--hud-player` (cian actual `#22d3ee`), `--hud-enemy` (`#f43f5e`), `--hud-gold` (`#facc15`), `--hud-cp` (el violeta de `main-menu.css`), `--hud-warn` (naranja), `--hud-panel`, `--hud-text-min: 11px`, `--hud-target: 44px`, `--hud-gap: 8px`, `--hud-tile: 60px`.
- [ ] **Paso 3:** borrar las reglas por posición; las que el HUD actual necesite se reescriben con sus clases (`.game-status-rail`, `.game-faction-status`, `.game-controls-drawer`…).
- [ ] **Paso 4: Capturas «después»**, mismas vistas. Expected: iguales a las del paso 1 a simple vista. `grep -nE '#game-hud > div:(first|last|nth)-child' web/src/style.css` → sin resultados.
- [ ] **Paso 5:** `npm test`; `npm run typecheck`; `npm run build`. **Commit** `refactor(styles): drop the positional HUD selectors and add HUD tokens`.

---

### Task 6: Franja superior, `render(view)` y aviso crítico (§5.1, §6.4, §6.5)

**Files:**
- Create: `web/src/ui/hud/FactionStrip.ts`
- Modify: `web/src/ui/contracts.ts` (`GameUiPort`), `web/src/ui/GameUI.ts`, `web/src/ui/GameHud.ts` (quitar `setBaseHealth`, `setAiStatus`), `web/src/ui/templates.ts` (franja nueva en lugar de `.game-status-rail`), `web/src/styles/hud.css`, `web/src/GameApplication.ts` (`:648-711` sustituidos por el presentador; `:961` sin `setAiStatus`; `:1035-1054`; `:1437-1440`)

**Interfaces:**
- Consumes: Tarea 4 (`HudPresenter`, `HudView`), Tarea 3 (formato, iconos).
- Produces:
  ```ts
  // contracts.ts — GameUiPort: sale setBaseHealth y setAiStatus; entra:
  render(view: Readonly<HudView>): void;
  // FactionStrip.ts
  export class FactionStrip {
    constructor(root: HTMLElement, side: 'player' | 'enemy');   // crea su DOM una vez
    render(summary: Readonly<FactionSummaryView>): void;        // escribe solo lo que cambió
  }
  ```

- [ ] **Paso 1: Presentador en `GameApplication`.** Una instancia; `presenter.update({ …, countRewardTargets: () => rewardTargetCandidates(world, 'player').length })` una vez por fotograma en `PLAYING` y `ui.render(view)`. `invalidateRewards()` tras cada comando del jugador y tras el turno de la IA. `reset()` en `startNewGame`. Se borran `updateResourceUI`, `updateRewardUI`, `lastRewardUiUpdateMs` y el bloque de `:1437-1440`. Si `view.player.criticalEntered`: `showToast(`NEXO ${formatPercent(view.player.healthPercent)}`)` y `haptics.nexusUnderAttack()`.
- [ ] **Paso 2: `FactionStrip`** (§5.1): panel con borde del color del bando; anillo SVG con `stroke-dasharray` actualizado solo si cambia el porcentaje; texto `formatPercent` dentro; oro (`coin` + `formatGold`) y CP (`bolt` + número + etiqueta «CP» en `--hud-cp`). Clase `is-critical` con pulso del color del bando; con `prefers-reduced-motion`, trazo más grueso sin animación. El enemigo en espejo (`row-reverse`). Pausa de 44×44 px en el centro. Altura ≤ 48 px. Etiquetas accesibles: «Nexo aliado: 83 %, 225 de oro, 3 CP» / «Nexo enemigo: …».
- [ ] **Paso 3: Adaptador temporal en `GameUI.render`:** la franja usa `FactionStrip`; el cajón todavía existente se alimenta desde `view` con sus métodos internos actuales (`BuildMenu.updateResources`, `GameHud.setRewardState`), llamados solo cuando cambian sus datos. Se borra en las Tareas 7 y 9.
- [ ] **Paso 4: Verificar** (`playwright-cli`, 360×740, 390×844 y 844×390): la franja mide ≤ 48 px de alto; con 4 cifras de oro no se corta en 360; `setNexusHealth('player', 360)` (30 % de 1200) muestra el pulso y un solo aviso «NEXO 30 %»; el enemigo no muestra «IA: CONSTRUYENDO».
- [ ] **Paso 5:** `npm test`; `npm run typecheck`; `npm run build`. **Commit** `feat(ui): show both Nexus in a shared strip fed by the presenter`.

---

### Task 7: Barra de acciones B+ y barra como modo (§5.2-§5.4, §5.9)

**Files:**
- Create: `web/src/ui/hud/actionBarLayout.ts`, `web/src/ui/hud/hudMessages.ts`, `web/src/ui/hud/ActionBar.ts`, `web/src/ui/hud/ActionHint.ts`, `web/hud-fixture.html`, `web/src/dev/hudFixture.ts`
- Test: `web/src/ui/hud/actionBarLayout.test.ts`, `web/src/ui/hud/hudMessages.test.ts`
- Modify: `web/src/ui/templates.ts` (barra en lugar de las secciones construir/entrenar del cajón), `web/src/ui/GameUI.ts`, `web/src/ui/contracts.ts` (`GameActions`), `web/src/styles/hud.css`, `web/src/GameApplication.ts` (acciones nuevas y textos de §9)
- Delete: `web/src/ui/BuildMenu.ts`, `web/src/ui/BuildMenu.test.ts`

**Interfaces:**
- Consumes: Tareas 2-4 y 6.
- Produces:
  ```ts
  // actionBarLayout.ts
  export const TILE_WIDTH = 60; export const CATEGORY_WIDTH = 44; export const BAR_GAP = 8;
  export interface ActionBarLayout { readonly expanded: readonly ActionGroup[]; readonly scrollOpenGroup: boolean }
  export function layoutActionBar(available: number, counts: Readonly<Record<ActionGroup, number>>, fixedWidth: number, open: ActionGroup): ActionBarLayout;
  //   ancho de un grupo desplegado = CATEGORY_WIDTH + n × (TILE_WIDTH + BAR_GAP); plegado = CATEGORY_WIDTH;
  //   fixedWidth = Vender + separadores; regla de §5.3
  // hudMessages.ts
  export function actionHint(action: Readonly<ActionView>): string | null;          // null si está disponible
  export function rewardHint(reward: Readonly<RewardButtonView>): string | null;    // null si está lista
  export function rewardPill(reward: Readonly<RewardButtonView>): string;
  export function modeText(mode: Readonly<ModeView>): string;
  export function producerChip(producer: Readonly<ProducerView>): string;
  // contracts.ts — GameActions: toggleDemolishMode pasa a toggleSellMode(); se añaden
  cancelMode(): void;
  confirmSale(): void;   // sin efecto hasta la Tarea 8
  // ActionBar.ts
  export class ActionBar {
    constructor(root: HTMLElement, hint: ActionHint);
    render(view: Readonly<HudView>): void;   // reconstruye el DOM solo si cambian modo, grupos visibles o número de acciones
    reset(): void;                           // grupo abierto = 'build'
  }
  // ActionHint.ts
  export class ActionHint { constructor(root: HTMLElement); show(anchor: HTMLElement, message: string): void }  // 1900 ms
  ```
  Textos fijados (`hudMessages.ts`):

  | Caso | Texto |
  |---|---|
  | unaffordable | `Faltan ${missingGold} de oro para ${fullName}` |
  | requirement | `Construye ${requirement.indefiniteName} primero` |
  | busy | `Sin ${requirement.pluralName} libres` |
  | chip del productor | `${pluralName} ${free}/${total} libres`, o `Sin ${fullName}` si `total === 0` |
  | modo placing | `Colocando ${shortName} · toca tu zona` |
  | modo selling | `Vender · toca una estructura tuya` |
  | modo confirmingSale | `${shortName} · +${refund} de oro` y botón `VENDER` |
  | botón de cancelar | `Cancelar` (✕) |

  Textos de `GameApplication` que cambian: `"Haz click en tu territorio…"` → ninguno (lo dice la barra); `"🗑️ MODO BORRAR…"` → ninguno; `` `¡${type.toUpperCase()} CONSTRUIDO!` `` → `` `${fullName} construido` `` (con `structurePresentation`).

- [ ] **Paso 1: Pruebas que fallan**
  - `layoutActionBar`: todo cabe → `['build','army']`; 360 px con el catálogo actual → solo el grupo abierto; el grupo abierto más ancho que `available` → `scrollOpenGroup: true`; con 11 elementos (`{ build: 6, army: 5 }`) a 390 px no devuelve un ancho mayor que `available` salvo con `scrollOpenGroup`.
  - `hudMessages`: cada fila de la tabla con los datos reales del catálogo; `actionHint` de una acción disponible → `null`.
- [ ] **Paso 2:** `npx tsx --test web/src/ui/hud/actionBarLayout.test.ts web/src/ui/hud/hudMessages.test.ts` → FAIL.
- [ ] **Paso 3: Implementar** `actionBarLayout.ts` y `hudMessages.ts`.
- [ ] **Paso 4: `ActionBar` y `ActionHint`** (§5.3, §5.4):
  - Un `ResizeObserver` sobre la barra guarda el ancho disponible; `layoutActionBar` se evalúa solo al cambiar ese ancho, el grupo abierto o el número de acciones.
  - Casillas `<button>` con `aria-disabled` según el estado (§5.2), `data-hud-action="${key}"`; el icono de categoría abre su grupo (`data-hud-group`). Tocar una casilla de un grupo lo deja abierto. Ejército no se cierra al pedir.
  - Estados por clase, sin opacidad: `is-unaffordable` (coste en `--hud-warn`), `is-requirement` (candado y `requirement.shortName` en lugar del coste), `is-busy` (fondo distinto, progreso), `is-selected` (contorno).
  - Unidades: barra de progreso (`progressPercent`, solo se escribe si cambia) e insignia `orders`; chip `producerChip` sobre el grupo.
  - Modo ≠ `none`: la barra muestra `modeText` y el botón `Cancelar` (`data-hud-mode="cancel"`, ≥ 44 px) en su mismo hueco; en `confirmingSale`, además, `VENDER` (`data-hud-mode="confirm-sale"`).
  - Vender fijo al final (`data-hud-sell`), fuera de los grupos.
  - Al tocar una acción no disponible, `ActionHint.show(casilla, actionHint(action))`; no se llama a `GameActions`.
  - Vertical: barra abajo a lo ancho. Horizontal: alineada a la derecha, con ancho máximo = ancho − bloque de recompensas − márgenes. Márgenes seguros; contenedor con `pointer-events: none`.
- [ ] **Paso 5: `GameUI`** delega `data-hud-*` en `ActionBar`/`GameActions`; `enterGameplay` llama a `actionBar.reset()`. `GameApplication` implementa `toggleSellMode`, `cancelMode` y `confirmSale` (vacío) con `nextInteractionMode`. Se borra `BuildMenu` y el adaptador correspondiente de la Tarea 6. Hasta la Tarea 9, `GameUI.setDemolishMode` queda vacío y `GameUI.setPlacementActive` solo pliega el cajón (que ya no contiene construir ni entrenar); los dos desaparecen del puerto en la Tarea 9.
- [ ] **Paso 6: Página de prueba** `web/hud-fixture.html` + `web/src/dev/hudFixture.ts`: monta `FactionStrip`, `ActionBar` y (desde la Tarea 9) `RewardButtons` con un `HudView` falso, con el catálogo real o uno de 11 elementos (`?items=11`, claves únicas reutilizando presentaciones reales). Vite no la incluye en `npm run build` (solo construye `web/index.html`); comprobar que `dist/` no contiene `hud-fixture`.
- [ ] **Paso 7: Verificar** con `playwright-cli` en el juego (360×740, 390×844, 844×390, 820×1180) y en la página de prueba con `?items=11`:
  - nada sale de la pantalla; casillas ≥ 44 px, separación ≥ 8 px, texto ≥ 11 px (medido con `getComputedStyle` y `getBoundingClientRect`);
  - colocar → la barra muestra el modo → `Cancelar` vuelve a la barra; Esc y clic derecho también;
  - vender (todavía en un paso) entra y sale del modo;
  - tocar Torreta sin oro muestra el aviso junto a la casilla.
- [ ] **Paso 8:** `npm test`; `npm run typecheck`; `npm run build`. **Commit** `feat(ui): replace the build drawer with the B+ action bar`.

---

### Task 8: Venta en dos pasos y resalte (§5.5, §5.7)

**Files:**
- Modify: `web/src/rendering/BattlefieldView.ts`, `web/src/GameApplication.ts` (`onPointerUp`, `confirmSale`, comprobación por fotograma)
- Test: `web/src/rendering/BattlefieldView.test.ts`

**Interfaces:**
- Consumes: Tarea 1 (`sellRefund`), Tarea 2 (`pickStructure`, `saleConfirmed`, `targetGone`), Tarea 7 (`confirmSale`).
- Produces:
  ```ts
  // BattlefieldView.ts
  highlight(entity: Entity | null): void;   // un único anillo con geometría y material creados una vez en el constructor
  ```

- [ ] **Paso 1: Pruebas que fallan** en `BattlefieldView.test.ts`:
  - `highlight places one ring under the entity and hides it with null`;
  - `the ring follows the structure in syncStructures`;
  - `the ring hides when the highlighted entity is removed or on clear`;
  - `highlighting twice creates no new geometry or material`.
- [ ] **Paso 2:** `npx tsx --test web/src/rendering/BattlefieldView.test.ts` → FAIL.
- [ ] **Paso 3: Implementar** `highlight`. El anillo cuenta como recurso permanente de la vista (+1 geometría y +1 material respecto a la línea base de R6); se anota en el informe.
- [ ] **Paso 4: Cablear la venta:**
  - `selling` o `confirmingSale` + toque sobre estructura propia (`pickOwnStructure`) → `pickStructure` con `kind` del componente `building` y `sellRefund(kind)`; `battlefieldView.highlight(entity)`.
  - `confirmSale()` → `sellStructure`; aceptada: `saleConfirmed`, sonido, `removedWithoutEffects`, aviso `` `${fullName} vendida · +${refund} de oro` ``; rechazada: `targetGone`.
  - Cada fotograma en `PLAYING`: si el modo es `confirmingSale` y la entidad ya no tiene `building` con vida > 0 → `targetGone` y aviso `La estructura ya no existe` (Review Focus 2).
  - Al salir de `confirmingSale` por cualquier evento → `highlight(null)`.
- [ ] **Paso 5:** pruebas → PASS; `npm test`; `npm run typecheck`; `npm run build`.
- [ ] **Paso 6: Verificar** con `playwright-cli`: vender → tocar barraca → la barra muestra `Barraca · +105 de oro` y `VENDER`; nada se vende hasta pulsar `VENDER`; el oro sube 105; se sigue en modo vender; «atrás» simulado (`window.dispatchEvent(new Event('native-back-button', { cancelable: true }))`) desde la confirmación vuelve a Vendiendo y desde Vendiendo a la barra.
- [ ] **Paso 7: Commit** `feat(game): confirm sales in the action bar and highlight the target`.

---

### Task 9: Botones de recompensa; fuera el cajón (§5.6, §6.4, §6.5)

**Files:**
- Create: `web/src/ui/hud/RewardButtons.ts`
- Modify: `web/src/ui/templates.ts` (borrar el cajón y `#tactical-rewards-panel`), `web/src/ui/GameUI.ts`, `web/src/ui/GameHud.ts` (borrar `setRewardState` y su DOM), `web/src/ui/contracts.ts`, `web/src/styles/hud.css`, `web/src/style.css` (borrar reglas del cajón y de `.tactical-reward-*`), `web/src/dev/hudFixture.ts`
- Delete: `web/src/ui/ControlsDrawer.ts`

**Interfaces:**
- Consumes: Tarea 4 (`RewardButtonView`), Tarea 7 (`ActionHint`, `rewardHint`, `rewardPill`).
- Produces:
  ```ts
  export class RewardButtons {
    constructor(root: HTMLElement, hint: ActionHint);
    render(rewards: readonly Readonly<RewardButtonView>[]): void;   // 3 botones creados una vez
  }
  // contracts.ts — GameUiPort pierde updateResources, updateRewardState, setDemolishMode y setPlacementActive
  ```
  Textos fijados (`rewardPill` / `rewardHint`):

  | Estado | Píldora | Aviso al tocar |
  |---|---|---|
  | missing-points | `${pointsCost - missingPoints}/${pointsCost} CP` | `${title}: faltan ${missingPoints} CP` |
  | missing-gold | `faltan ${missingGold}` (con `coin`) | `${title}: faltan ${missingGold} de oro` |
  | no-target | `sin objetivo` | `${title}: no hay objetivos` |
  | cooldown | `formatSeconds` | `Recarga: ${formatSeconds}` |
  | active | `formatSeconds` | `${title} en curso` |
  | ready | `LISTO` | — (activa) |

- [ ] **Paso 1: `RewardButtons`:** botones de 48 px con anillo SVG (`ringFraction`) y píldora (≥ 11 px), clase por estado, `aria-label` = `${title}: ${aviso o 'lista'}`. Un `click` en `ready` → `GameActions.activateReward(id)`; en otro estado → `ActionHint.show`. Vertical: columna en el borde derecho sobre la barra; horizontal: fila a la derecha junto a la barra; ≥ 8 px entre botones y con AUTO.
- [ ] **Paso 2:** borrar el cajón, `ControlsDrawer`, `#tactical-rewards-panel`, `GameHud.setRewardState`, los métodos del puerto de la lista y sus reglas CSS; borrar el resto del adaptador de la Tarea 6. AUTO (`#btn-auto-zoom`), según §5.8: botón de 44×44 px como mínimo con el icono `focus` y la etiqueta `AUTO` debajo (≥ 11 px); en el borde izquierdo encima de la barra (vertical) o en la esquina superior izquierda bajo la franja (horizontal), a ≥ 8 px de otros controles. Estado por `aria-pressed`: `true` → borde y texto en `--hud-player`; `false` → contorno apagado y texto gris claro con contraste ≥ 4.5:1, sin `opacity`. Se conservan `GameActions.toggleAutoZoom`, `GameUiPort.setAutoZoom` y sus `aria-label` actuales; el comportamiento de la cámara no cambia.
- [ ] **Paso 3:** `npm test`; `npm run typecheck`; `npm run build`; `grep -rn "game-controls\|tactical-reward\|ControlsDrawer\|BuildMenu" web/src` → sin resultados; `grep -rn "⚡\|LOCKED\|INSUFFICIENT\|NO VALID" web/src --include=*.ts` → sin resultados en código de producción.
- [ ] **Paso 4: Verificar** con `playwright-cli` (`prepareRewardScenario('ready')`, `'insufficient-gold'`, `'no-target'`): cada estado muestra su píldora; tocar uno no listo muestra su aviso junto al botón; activar artillería lanza la cinemática y el botón pasa a `active` y los demás a `cooldown`.
- [ ] **Paso 5: Commit** `feat(ui): move rewards to always-visible buttons and remove the drawer`.

---

### Task 10: Verificación, medición, critique y entrega (§7, §8, §12 T11)

**Files:**
- Modify: `docs/superpowers/specs/2026-11-22-r7-hud-de-combate-design.md` (nueva §15, informe de entrega), `docs/audits/2026-11-14-auditoria-responsabilidades.md` (R7 hecho en §7), `docs/performance/2026-11-14-referencia-rendimiento.md` (nueva sección de R7), `README.md` (módulos de `ui/hud/`), este plan (casillas)

- [ ] **Paso 1: Navegador, perfil móvil emulado** (390×844 y 360×740, táctil; después 844×390), `npm run dev`, `playwright-cli open "http://localhost:5173/?diagnostics=1"`, `pageerror` registrado:

  | # | Acción | Expected |
  |---|---|---|
  | 1 | Iniciar partida | Franja ≤ 48 px; barra plegada con Construir abierto; tres recompensas en `missing-points` |
  | 2 | Generador → toque en `screenPointFor(10, 30)` | Oro −100; aviso `Generador construido`; barra normal |
  | 3 | Barraca ×2 en dos puntos | Chip `Barracas 2/2 libres` |
  | 4 | Doble toque rápido en Soldado (Review Focus 5) | Dos órdenes, insignia `2`, `Barracas 0/2 libres`; la cámara no se mueve |
  | 5 | Torreta con el oro por debajo de 125 | Aviso `Faltan N de oro para Torreta láser` junto a la casilla; ningún comando |
  | 6 | Vender → tocar una barraca → `setHealth(<barraca>, 0)` (Review Focus 2) | Vuelve a Vendiendo; aviso `La estructura ya no existe`; el oro no cambia |
  | 7 | Elegir Torreta → girar a 844×390 → volver a 390×844 (Review Focus 4) | El modo sigue; la barra no desborda en ninguna orientación |
  | 8 | «Atrás» con modo / sin modo / en pausa | Cancela / pausa / reanuda sin perder el modo conservado |
  | 9 | `setNexusHealth('player', 300)` → pausa con Torreta elegida → «Reiniciar batalla» (Review Focus 3) | Un aviso `NEXO 25 %`; tras reiniciar: sin modo, Construir abierto, vida 100 % y el aviso vuelve a funcionar |
  | 10 | `prepareRewardScenario('ready')` → activar artillería | Cinemática; `active` y `cooldown` en los otros dos |
  | 11 | Arrastrar empezando a 10 px por encima de la barra | La cámara se desplaza; no se construye ni se vende nada |
| 12 | Tras el arrastre de la fila 11, mirar AUTO; tocarlo | Muestra `AUTO` apagado (`aria-pressed="false"`); al tocarlo se ilumina y la cámara vuelve al seguimiento |

  Expected: todas las filas cumplen y no hay `pageerror`.
- [ ] **Paso 2: Medidas automáticas** en los cinco tamaños (360×740, 390×844, 844×390, 820×1180, 1280×720) y en `hud-fixture.html?items=11`: ningún control fuera del viewport; todos ≥ 44 px; separaciones ≥ 8 px; texto ≥ 11 px; contraste ≥ 4.5:1. Se guarda la tabla en el informe.
- [ ] **Paso 3: Rendimiento:** la batería de la referencia de rendimiento (combate de 30 s, dos ejecuciones, escritorio y móvil emulado) comparada con R6: `frameMs`, `gameplayOtherMs`, geometrías (+1 por el anillo de resalte, §Tarea 8). Durante 10 s de combate, un `MutationObserver` sobre `#game-hud` confirma que no se añaden nodos salvo al cambiar de modo o de grupo.
- [ ] **Paso 4: `/impeccable critique`** del HUD de combate. Expected: > 25/40 y ningún P0. Los P1 que aparezcan se corrigen antes de cerrar o se registran con motivo en §15.
- [ ] **Paso 5: Dispositivo real** si lo hay (§7.3); si no, se dice en el informe.
- [ ] **Paso 6:** `npm test`, `npm run typecheck`, `npm run build`, `graphify update .`. Informe de entrega (§15 del diseño): commits, número de pruebas, resultados de los pasos 1-5, limitaciones y `git diff 0a4641e --stat`. Se actualizan README, auditoría y referencia de rendimiento.
- [ ] **Paso 7: Commit** `docs(r7): verify the combat HUD, measure it and report the delivery`.

---

### Después de la Tarea 10: revisión independiente

Revisión de `0a4641e..HEAD` contra el diseño, con foco en: los límites de importación de Global Constraints; que la UI no decida reglas (estados de recompensas y acciones salen del dominio); ausencia de escrituras DOM por fotograma sin cambios; las cancelaciones de `InteractionMode`; los cinco puntos de Review Focus. Los hallazgos críticos o importantes se corrigen antes de cerrar R7.

## Dependencias entre tareas

```
T1 ──► T2 ──► T4 ──► T6 ──► T7 ──► T8 ──► T9 ──► T10
T3 ─────────► T4
T5 ─────────────────► T6
```

Orden de ejecución: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10. El único código temporal es el adaptador del cajón en `GameUI.render` (Tarea 6), que se borra en las Tareas 7 y 9.
