# Menú inicial, acordeón de Recompensas y pantalla final — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar el menú inicial (acordeón dorado de Recompensas con flechas de luz) y la pantalla final (informe compacto con iconos y conteo animado), y pasar los nombres de recompensas a español.

**Architecture:** La lógica nueva y testeable vive en módulos pequeños y puros dentro de `web/src/ui/`: datos de recompensa, estado de las flechas de scroll y conteo animado. `GameUI` y `GameHud` los conectan al DOM. El CSS de ambas pantallas sale de `style.css`, donde hay capas que se pisan, y pasa a dos hojas nuevas e independientes importadas después de `style.css`.

**Tech Stack:** TypeScript estricto, Vite 6, Tailwind 3 (utilidades en plantillas), `node:test` vía `tsx`, Playwright (solo para capturas de verificación).

**Spec:** `docs/superpowers/specs/2026-11-08-menu-recompensas-pantalla-final-design.md`. Las maquetas de referencia están en `.superpowers/brainstorm/10958-1794159415/content/recompensas-menu-v2.html` y `pantalla-final.html`.

## Global Constraints

- TypeScript estricto, sin `any`, sin aserciones `!` innecesarias. La UI fuera del ECS. No se añaden dependencias.
- No cambia ningún valor de balance (costes, daño, duraciones, CP).
- Dorado de recompensas `#fbbf24` (suave `#fde68a`). Colores por tipo: artillería `#fb923c`, aéreo `#38bdf8`, escudo `#34d399`.
- Fuentes: Orbitron para títulos y cifras, Rajdhani para texto.
- Objetivos táctiles de unos 44px. En la pantalla final en horizontal bajo, mínimo 40px.
- Tamaños soportados: 360×640 a 1024×768, en vertical y en horizontal. DESPLEGAR siempre visible; la pantalla final nunca necesita scroll.
- `prefers-reduced-motion`: sin barrido, sin latido, conteo instantáneo, scroll instantáneo. `style.css` ya tiene una regla global que acorta las animaciones; el JS lo comprueba con `matchMedia`.
- Textos exactos (copiar tal cual):
  - Línea del objetivo: `Construye, defiende y destruye el Nexo enemigo.`
  - Título del acordeón: `RECOMPENSAS DE COMBATE`; subtítulo: `Gana CP y desbloquea 3 ataques especiales`.
  - Explicación del acordeón abierto: `Elimina unidades y estructuras enemigas para ganar CP. Gasta CP + oro para lanzar el ataque cuando tú decidas.`
  - Nombres: `Bombardeo de artillería`, `Ataque aéreo`, `Escudo defensivo`.
  - Avisos: `Bombardeo de artillería activado: impactos en camino.` y `Ataque aéreo activado: avión cruzando el campo.`
  - Pantalla final: títulos `DERROTA` / `VICTORIA`; carteles `CRÍTICO` / `ASEGURADO`; informe `INFORME DE BATALLA`; filas `Tiempo`, `Soldados desplegados`, `Estructuras construidas`, `Daño al Nexo rival`; bajas `N bajas`; botones `JUGAR DE NUEVO` (aria `Jugar de nuevo`) y `MENÚ` (aria `Volver al menú`).
- Commits: solo si el usuario autorizó commits para esta ejecución. Directamente en `main`, con rutas explícitas en `git add`, y nunca incluir `docs/` ajenos ni `.playwright-*`. Cada mensaje termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Cambiar la dificultad con el acordeón abierto y desplazado:** la lista se vuelve a pintar con otros costes y las flechas deben reflejar el nuevo contenido. Se cubre en la Task 4 (`refresh()` tras pintar) y se verifica con captura.
2. **Girar el móvil o redimensionar con el acordeón abierto:** cambia la altura visible y las flechas se recalculan solas. Se cubre en la Task 3 (ResizeObserver) y en la Task 4 (captura en 640×360).
3. **Fin de partida dos veces seguidas** (reiniciar y volver a perder antes de que acabe el conteo): el segundo conteo cancela el primero y termina en sus propios valores. Test en la Task 5.
4. **Duración con formato inesperado** (`"123:05"` en partidas de más de 99 minutos, o una cadena que no se pueda interpretar): se muestra bien o se deja tal cual, sin `NaN`. Test en la Task 5.
5. **Daño 0% o 100%, y 0 soldados o 0 bajas:** se muestran `0%`, `100%` y `0` correctamente, y la barra queda vacía o llena. Test en la Task 5 y captura en la Task 6.

---

### Task 1: Nombres de recompensas en español

**Files:**
- Modify: `web/src/game/rewardSystem.ts:118-147` (`REWARD_DEFINITIONS[*].title`)
- Modify: `web/src/game/unlocks/unlocks.json` (`title` de los 3)
- Modify: `web/src/GameApplication.ts:2542-2544` (los dos `showToast`)
- Test: `web/src/game/rewardSystem.test.ts`

**Interfaces:**
- Produces: `REWARD_DEFINITIONS[id].title` en español; el resto de las tareas lo leen sin cambios de firma.

- [ ] **Step 1: Write the failing test** en `rewardSystem.test.ts`:

```ts
test('reward titles are shown in Spanish', () => {
  assert.equal(getRewardDefinitionForDifficulty('artillery_strike', 'normal').title, 'Bombardeo de artillería');
  assert.equal(getRewardDefinitionForDifficulty('air_strike', 'normal').title, 'Ataque aéreo');
  assert.equal(getRewardDefinitionForDifficulty('defensive_shield', 'hard').title, 'Escudo defensivo');
});
```

- [ ] **Step 2:** `npx tsx --test web/src/game/rewardSystem.test.ts`. Esperado: FAIL (`'Artillery Strike' !== 'Bombardeo de artillería'`).
- [ ] **Step 3:** cambiar los tres `title` en `rewardSystem.ts` y en `unlocks.json`, y los dos textos de aviso de `GameApplication.ts` (copia exacta en Global Constraints).
- [ ] **Step 4:** `npm test`. Esperado: todo en PASS. `grep -rn "Artillery Strike\|Air Strike\|Defensive Shield" web/src` no devuelve nada.
- [ ] **Step 5: Commit** (si está autorizado), con la spec, el plan y el `.gitignore` pendientes:

```bash
git add web/src/game/rewardSystem.ts web/src/game/rewardSystem.test.ts web/src/game/unlocks/unlocks.json web/src/GameApplication.ts docs/superpowers/specs/2026-11-08-menu-recompensas-pantalla-final-design.md docs/superpowers/plans/2026-11-08-menu-recompensas-pantalla-final.md .gitignore
git commit -m "feat(rewards): show reward names in Spanish"
```

---

### Task 2: Iconos de UI y datos de recompensa

**Files:**
- Create: `web/src/ui/uiIcons.ts`
- Modify: `web/src/ui/rewardPresentation.ts` (añadir `getRewardFacts`; marcar `getRewardEffect` como `@deprecated`, ya que su único uso está en `GameUI.ts:337` y se sustituye y elimina en la Task 4)
- Test: `web/src/ui/rewardPresentation.test.ts` (nuevo)

**Interfaces:**
- Produces:
  - `export type UiIconId = 'bolt' | 'coin' | 'target' | 'burst' | 'bomb' | 'clock' | 'shield' | 'soldier' | 'building' | 'cross' | 'chevron-down' | 'chevron-up' | 'double-down' | 'double-up' | 'replay' | 'home';`
  - `export function uiIconMarkup(id: UiIconId, className?: string): string`: SVG en texto para `templates.ts`, con `viewBox="0 0 24 24"`, `aria-hidden="true"` y la clase `ui-icon` más la clase opcional.
  - `export function createUiIcon(id: UiIconId, className?: string): SVGSVGElement`: el mismo icono como elemento DOM.
  - `export interface RewardFact { icon: UiIconId; value: string; label: string }`
  - `export function getRewardFacts(id: RewardId, difficulty: Difficulty): readonly RewardFact[]`
- Los trazos de los iconos se toman de las maquetas (`<symbol id="i-…">` en `recompensas-menu-v2.html` y `pantalla-final.html`); `coin` es el SVG que ya usa el menú junto al 200. Las dobles flechas usan `viewBox 0 0 30 22` en la maqueta: se adaptan a 24×24.

- [ ] **Step 1: Write the failing test** `rewardPresentation.test.ts`:

```ts
test('artillery facts come from the strike pattern and damage', () => {
  assert.deepEqual(getRewardFacts('artillery_strike', 'normal'), [
    { icon: 'target', value: '3', label: 'impactos' },
    { icon: 'burst', value: '120', label: 'daño c/u' },
  ]);
});
test('air strike facts list bombs and damage', () => {
  assert.deepEqual(getRewardFacts('air_strike', 'hard'), [
    { icon: 'bomb', value: '4', label: 'bombas' },
    { icon: 'burst', value: '220', label: 'daño c/u' },
  ]);
});
test('shield facts show reduction and duration', () => {
  assert.deepEqual(getRewardFacts('defensive_shield', 'easy'), [
    { icon: 'shield', value: '−50%', label: 'daño' },
    { icon: 'clock', value: '10 s', label: '' },
  ]);
});
test('ui icon markup is an accessible-hidden svg', () => {
  const svg = uiIconMarkup('clock', 'extra');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 24 24"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /class="ui-icon extra"/);
});
```

- [ ] **Step 2:** `npx tsx --test web/src/ui/rewardPresentation.test.ts`. Esperado: FAIL (los exports no existen).
- [ ] **Step 3:** implementar `uiIcons.ts` (un `Record<UiIconId, readonly string[]>` de trazos, como `ICON_PATHS` en `rewardPresentation.ts`) y `getRewardFacts`:
  - el número de impactos y bombas sale de `getStrikePattern(id, difficulty).impacts.length`;
  - el daño, de `damagePerImpact`;
  - el escudo usa `reduction` (`−` es U+2212) y `durationSeconds`, ambos de `getRewardDefinitionForDifficulty`.
- [ ] **Step 4:** `npm test` y `npm run typecheck`. Esperado: PASS. En esta tarea `getRewardEffect` se queda marcado `/** @deprecated */` porque `GameUI.ts` aún lo usa; se elimina en la Task 4.
- [ ] **Step 5: Commit** (si está autorizado): `git add web/src/ui/uiIcons.ts web/src/ui/rewardPresentation.ts web/src/ui/rewardPresentation.test.ts` y `feat(ui): add UI icon set and reward facts`.

---

### Task 3: Flechas de luz para listas desplazables

**Files:**
- Create: `web/src/ui/ScrollCues.ts`
- Test: `web/src/ui/ScrollCues.test.ts`

**Interfaces:**
- Produces:
  - `export interface ScrollMetrics { scrollTop: number; clientHeight: number; scrollHeight: number }`
  - `export function getScrollCueState(metrics: ScrollMetrics, threshold?: number): { canScrollUp: boolean; canScrollDown: boolean }`, con `threshold` por defecto 4.
  - `export class ScrollCues { constructor(container: HTMLElement, list: HTMLElement); refresh(): void; destroy(): void }`
    - Alterna las clases `can-scroll-up` y `can-scroll-down` en `container`.
    - Escucha `scroll` (pasivo) en `list` y usa un `ResizeObserver` sobre `list`.
    - Los botones `[data-scroll-cue="up"|"down"]` dentro de `container` hacen `list.scrollBy({ top: ±0.8 * clientHeight, behavior })`, con `behavior` `'auto'` si `matchMedia('(prefers-reduced-motion: reduce)')` coincide y `'smooth'` si no. Se llama a `event.stopPropagation()`.
    - `refresh()` es público para que quien pinta el contenido lo llame.

- [ ] **Step 1: Write the failing test**:

```ts
test('only the down cue shows at the top of a long list', () => {
  assert.deepEqual(getScrollCueState({ scrollTop: 0, clientHeight: 300, scrollHeight: 600 }), { canScrollUp: false, canScrollDown: true });
});
test('both cues show in the middle', () => {
  assert.deepEqual(getScrollCueState({ scrollTop: 150, clientHeight: 300, scrollHeight: 600 }), { canScrollUp: true, canScrollDown: true });
});
test('only the up cue shows at the bottom, including sub-pixel ends', () => {
  assert.deepEqual(getScrollCueState({ scrollTop: 296.5, clientHeight: 300, scrollHeight: 600 }), { canScrollUp: true, canScrollDown: false });
});
test('no cue when everything fits or within the threshold', () => {
  assert.deepEqual(getScrollCueState({ scrollTop: 0, clientHeight: 300, scrollHeight: 300 }), { canScrollUp: false, canScrollDown: false });
  assert.deepEqual(getScrollCueState({ scrollTop: 3, clientHeight: 300, scrollHeight: 302 }), { canScrollUp: false, canScrollDown: false });
});
```

- [ ] **Step 2:** `npx tsx --test web/src/ui/ScrollCues.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** implementar la función y la clase. La clase comprueba que exista `ResizeObserver` antes de usarlo.
- [ ] **Step 4:** `npm test && npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** (si está autorizado): `feat(ui): add glowing scroll cues for scroll lists`.

---

### Task 4: Menú inicial y acordeón de Recompensas

**Files:**
- Modify: `web/src/ui/templates.ts` (`mainMenuTemplate`)
- Modify: `web/src/ui/GameUI.ts` (`mount`, `#renderMissionRules`, nuevo `#renderRewardTeaser`, conexión de `ScrollCues` y del evento `toggle`)
- Create: `web/src/styles/main-menu.css`
- Modify: `web/src/main.ts` (importar `./styles/main-menu.css` después de `./style.css`)
- Modify: `web/src/style.css` (eliminar las reglas del menú)

**Interfaces:**
- Consumes: `uiIconMarkup`, `createUiIcon`, `getRewardFacts` (Task 2); `ScrollCues` (Task 3); `createRewardIcon`, `getRewardCategory` (ya existen).

- [ ] **Step 1: plantilla.** En `mainMenuTemplate`:
  - Quitar `<span class="menu-kicker">…</span>` y añadir tras el `h1` `<p class="menu-tagline">` con la línea del objetivo.
  - Mantener intactos `menu-brief-heading`, la moneda, la dificultad y los `<select>` ocultos.
  - Sustituir `<details class="menu-rules">` por esta estructura (las clases son las que usa el CSS):
    - `details#menu-rewards.menu-rewards`, que contiene:
      - `summary.menu-rewards-summary`, con:
        - `span.menu-rewards-icons[aria-hidden]`, que se rellena en JS;
        - `span.menu-rewards-copy`, con `strong` (título) y `span.menu-rewards-hint` (subtítulo);
        - `span.menu-rewards-toggle[aria-hidden]`, con `uiIconMarkup('chevron-down')`.
      - `div.menu-rewards-scroll-wrap`, con:
        - `button[type=button][data-scroll-cue=up][aria-label="Ver recompensas anteriores"].menu-scroll-cue.is-up`, con `uiIconMarkup('double-up')`;
        - `div#mission-rules-content.mission-rules-content`, que es la lista que se desplaza;
        - el botón equivalente `down`, con `aria-label="Ver más recompensas"`.
  - Los botones de flecha llevan `tabindex="-1"`: con teclado se desplaza la lista directamente.
- [ ] **Step 2: GameUI.**
  - `#renderRewardTeaser()`: en `mount`, una sola vez, añade a `.menu-rewards-icons` tres `span.menu-reward-hex.is-<id>` con `createRewardIcon(id)`.
  - `#renderMissionRules(difficulty)` pinta en `#mission-rules-content`:
    - `p.mission-rules-how`, con `createUiIcon('bolt')` y la explicación (CP y `CP + oro` en `<b>`);
    - por recompensa, un `article.mission-rules-card.is-<id>` con:
      - `span.mission-rules-tile`, con el icono;
      - cabecera con la categoría y el `h3` del título;
      - `div.mission-rules-cost`, con `span.is-cp` (`bolt` + `N CP`) y `span.is-gold` (`coin` + `N`);
      - `p.mission-rules-desc` (la `description` existente);
      - `div.mission-rules-facts`, un `span` por cada `getRewardFacts` con icono, `<b>value</b>` y label.
    - Al terminar, llama a `this.#rewardCues?.refresh()`.
  - En `mount`, después de pintar:
    - crea `#rewardCues = new ScrollCues(wrap, list)`;
    - escucha `toggle` en `#menu-rewards`: alterna `is-rewards-open` en `.menu-shell` y, si se abre, hace `list.scrollTop = 0`, cambia el chevron por `chevron-up` (o lo gira con CSS) y llama a `refresh()` en el siguiente `requestAnimationFrame`.
  - Eliminar `getRewardEffect` de `rewardPresentation.ts`.
- [ ] **Step 3: CSS nuevo** en `web/src/styles/main-menu.css`. Es el único lugar con estilos de `#main-menu`, `.menu-*` y `.mission-rules-*`. Debe cumplir:
  - **Menú cerrado:** bloque centrado; aire de `clamp(1.25rem, 3vh, 2rem)` entre el título y el panel; ritmo interno de 14–16px en el panel; tamaños de la maqueta (`h1` unos `2.35rem` en móvil).
  - **Banner cerrado:**
    - borde dorado al 55%, degradado dorado de izquierda a derecha y sombra con desplazamiento;
    - hexágonos de 30×34px con `clip-path` y color sólido por tipo;
    - un barrido con `::after` `linear-gradient(105deg…)` cada 3,2s, solo `:not([open])`.
  - **Abierto (`.menu-shell.is-rewards-open`):**
    - el shell ocupa `100%` de la altura disponible;
    - el `h1` baja a unos `1.55rem` y se oculta `.menu-tagline`;
    - `.menu-brief` y `.menu-rewards` crecen con `flex: 1; min-height: 0`;
    - la lista lleva `overflow-y: auto; scrollbar-width: none`, más `::-webkit-scrollbar { display: none }` y `overscroll-behavior: contain`;
    - el difuminado usa `mask-image` + `-webkit-mask-image` con `--fade-top` y `--fade-bottom`, de 0 a 44px según `can-scroll-*`;
    - las flechas se posicionan de forma absoluta, centradas; tienen `opacity: 0` y `pointer-events: none` salvo con su `can-scroll-*`; brillan con un `drop-shadow` dorado doble y laten con una animación `translateY ±4px` de 1,3s;
    - el área táctil de cada flecha es de al menos 44×30px.
  - **Tarjetas:** como en la maqueta, con `--c` por tipo, coste arriba a la derecha (CP en dorado macizo y oro con borde) y datos en pastillas.
  - **Horizontal bajo (`max-height: 520px`):** dos columnas. A la izquierda van el título, la línea del objetivo y `.menu-bottom`; a la derecha, `.menu-brief` con altura limitada a la ventana, y la lista se desplaza dentro.
  - **Reduced motion:** sin barrido ni latido.
- [ ] **Step 4: limpiar `style.css`.**
  - Eliminar todas las reglas cuyos selectores sean exclusivamente `#main-menu`, `.menu-*` o `.mission-rules-*`, incluidas las que están dentro de `@media`; si un `@media` queda vacío, borrarlo. Se borra también `.menu-nav`: comprueba con grep que ninguna plantilla lo usa.
  - Mover `.menu-intel-panel` tal cual a `main-menu.css`, porque sigue en la plantilla.
  - Comprobación: `grep -n "menu-\|mission-rules\|#main-menu" web/src/style.css` no devuelve nada.
- [ ] **Step 5: verificar.**
  - `npm run typecheck && npm test && npm run build` en verde.
  - Capturas con Playwright (`npm run dev`) en 390×844, 360×640, 844×390, 640×360 y 1024×768, de estos estados: cerrado; abierto arriba; abierto a mitad (`scrollTop` a la mitad); abierto al final; abierto tras cambiar a PESADILLA (los costes de oro son 207/322/253 y las flechas son correctas).
  - Comprobar en cada captura:
    - `#btn-start-game` está dentro del viewport (`getBoundingClientRect().bottom <= innerHeight`);
    - no se ve barra de scroll;
    - el estado de las flechas coincide con `getScrollCueState`;
    - el aspecto coincide con `recompensas-menu-v2.html`.
- [ ] **Step 6: Commit** (si está autorizado): plantilla, `GameUI.ts`, `rewardPresentation.ts`, `main.ts`, `style.css` y `styles/main-menu.css`, con el mensaje `feat(menu): golden rewards accordion with scroll cues and cleaner spacing`.

---

### Task 5: Conteo animado

**Files:**
- Create: `web/src/ui/countUp.ts`
- Test: `web/src/ui/countUp.test.ts`

**Interfaces:**
- Produces:
  - `export function easeOutCubic(t: number): number`
  - `export function countValueAt(target: number, progress: number): number`: `Math.round(target * easeOutCubic(clamp(progress, 0, 1)))`.
  - `export function parseClockDuration(text: string): number | null`: acepta `^(\d+):([0-5]\d)$`; en otro caso devuelve `null`.
  - `export function formatClockDuration(totalSeconds: number): string`: minutos con `padStart(2, '0')` y segundos con 2 cifras, igual que `GameApplication.ts:2641-2643`.
  - `export interface CountUpTarget { element: { textContent: string | null }; to: number; format(value: number): string }`
  - `export interface FrameScheduler { request(cb: (now: number) => void): number; cancel(handle: number): void; now(): number }`
  - `export class CountUpAnimator { constructor(scheduler?: FrameScheduler); start(targets: readonly CountUpTarget[], options: { durationMs: number; reducedMotion: boolean }): void; cancel(): void }`
    - Por defecto usa `requestAnimationFrame`, `cancelAnimationFrame` y `performance.now`.
    - `start` cancela cualquier conteo anterior.
    - Con `reducedMotion` escribe los valores finales de inmediato.
    - El último fotograma siempre escribe exactamente `format(to)`.

- [ ] **Step 1: Write the failing test**, con un `FakeScheduler` que guarda los callbacks y avanza el tiempo a mano:

```ts
test('clock durations round-trip, including long matches', () => {
  assert.equal(parseClockDuration('04:37'), 277);
  assert.equal(parseClockDuration('123:05'), 7385);
  assert.equal(formatClockDuration(277), '04:37');
  assert.equal(formatClockDuration(7385), '123:05');
});
test('unparseable durations are rejected', () => {
  assert.equal(parseClockDuration(''), null);
  assert.equal(parseClockDuration('4:7'), null);
  assert.equal(parseClockDuration('aa:bb'), null);
});
test('count values start at zero, end exact and handle zero targets', () => {
  assert.equal(countValueAt(64, 0), 0);
  assert.equal(countValueAt(64, 1), 64);
  assert.equal(countValueAt(64, 2), 64);
  assert.equal(countValueAt(0, 0.5), 0);
});
test('animator writes exact final values when the duration elapses', () => { /* start 1100ms → avanzar 1200ms → textContent === format(to) para 2 targets ('64%', '04:37') */ });
test('reduced motion writes final values immediately', () => { /* sin frames: textContent final tras start() */ });
test('a second start cancels the first animation', () => { /* start(A); avanzar 300ms; start(B); avanzar 1200ms → A no cambia después del segundo start; B termina en sus finales */ });
```

- [ ] **Step 2:** `npx tsx --test web/src/ui/countUp.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm test && npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** (si está autorizado): `feat(ui): add cancellable count-up animator`.

---

### Task 6: Pantalla final compacta

**Files:**
- Modify: `web/src/ui/templates.ts` (`gameOverTemplate`)
- Modify: `web/src/ui/GameHud.ts` (`showGameOver`, `setGameOverVisible`)
- Create: `web/src/styles/game-over.css`
- Modify: `web/src/main.ts` (importar `./styles/game-over.css`)
- Modify: `web/src/style.css` (eliminar las reglas de la pantalla final)

**Interfaces:**
- Consumes: `uiIconMarkup` (Task 2); `CountUpAnimator`, `parseClockDuration`, `formatClockDuration` (Task 5).
- Se conservan las piezas ya hechas: `.game-over-insignia`, los dos SVG (`game-over-icon-defeat` y `game-over-icon-victory`), `#game-over-badge` y la clase `is-victory` en el modal y en la tarjeta.

- [ ] **Step 1: plantilla.**
  - Eliminar `.game-over-header` (con `#game-over-status` y `#game-over-state`), el `REGISTRO LOCAL`, `.game-over-corner` y el `<small>` del pie.
  - El informe pasa a ser `section.game-over-report` > `h3` `INFORME DE BATALLA` + 4 filas `div.game-over-stat`, cada una con:
    - `span.game-over-stat-icon`, con `uiIconMarkup` (`clock`, `soldier`, `building` o `target`);
    - `span` con la etiqueta;
    - `b.game-over-stat-value`.
  - Fila de soldados: `<b class="game-over-stat-value"><span id="stat-soldiers">0</span><span class="game-over-losses">${uiIconMarkup('cross')}<span id="stat-losses">0</span> bajas</span></b>`.
  - Fila de daño: lleva la clase `is-damage`, con `id="stat-enemy-hq-damage"` en el `b`, y debajo `div.game-over-progress > span#stat-enemy-hq-damage-bar`.
  - Botones: mismos ids, con `uiIconMarkup('replay')` y `uiIconMarkup('home')`, y los textos y `aria-label` de Global Constraints.
- [ ] **Step 2: GameHud.**
  - `showGameOver` escribe el cartel, el título y el mensaje (copia exacta: defeat `CRÍTICO`/`DERROTA`/`Tu Nexo principal fue destruido por el asedio enemigo.`; victory `ASEGURADO`/`VICTORIA`/`El Nexo rival ha caído. El sector está bajo tu control.`). Ya no escribe `game-over-status` ni `game-over-state`.
  - Pone la barra a `0%` y, en el siguiente `requestAnimationFrame`, a `${summary.enemyBaseDamagePercent}%` (la transición CSS hace el llenado).
  - Llama a `#countUp.start([...], { durationMs: 1100, reducedMotion })` con 5 objetivos:
    - soldados y bajas como `String`;
    - estructuras como `String`;
    - daño como `` `${n}%` ``;
    - tiempo con `formatClockDuration`, solo si `parseClockDuration(summary.duration)` no es `null`; si es `null`, escribe `summary.duration` tal cual y lo excluye del conteo.
  - `reducedMotion` sale de `matchMedia('(prefers-reduced-motion: reduce)').matches`.
  - `setGameOverVisible(false)` llama a `#countUp.cancel()`.
- [ ] **Step 3: CSS nuevo** en `web/src/styles/game-over.css`. Es el único lugar con estilos de `#game-over-modal`, `.game-over-*` y `.metric-marker` (este último ya no se usa). Hay que mover aquí, reescritas sin capas, las reglas de la insignia, los iconos, el cartel con su animación de sello y la victoria en cian que hoy están al final del bloque de `style.css`. Debe cumplir:
  - **Vertical:** un solo bloque centrado (`justify-content: center`) con columnas de unos 22px de separación. Emblema de unos 7.25rem, título de unos 1.55rem, filas de unos 42px con iconos de 32px en recuadros de 7px de radio, valores en Orbitron de unos 1.08rem y botones de 52px en dos columnas `1.25fr 1fr`.
  - **Horizontal (`orientation: landscape` y `max-height: 600px`):** grid de dos columnas `0.85fr 1.15fr`. A la izquierda va el héroe, centrado; a la derecha, el informe con los botones debajo. Emblema de unos 92px, filas de unos 34px, iconos de 26px y botones de al menos 40px. Todo en `cqh`/`clamp` para que quepa en 360px de alto sin scroll.
  - **Tablet y escritorio (`min-width: 768px`):** el mismo bloque centrado, con un ancho máximo de unos 56rem en horizontal y 26rem en vertical. Sin espacio muerto entre el informe y los botones.
  - **Colores:** el icono de la fila de daño y su valor en rojo con derrota y en cian con `.is-victory`. Bajas en una pastilla roja. La barra mantiene sus degradados actuales con `transition: width 1.1s cubic-bezier(.16,1,.3,1)`.
  - **Reduced motion:** sin giro del anillo, sin sello y sin transición de la barra.
- [ ] **Step 4: limpiar `style.css`.**
  - Eliminar todas las reglas cuyos selectores sean exclusivamente `#game-over-modal`, `.game-over-*`, `.is-victory .game-over-*` o `.metric-marker`, y los `@keyframes game-over-*`, incluidos los que están dentro de `@media`. Si un `@media` queda vacío, borrarlo.
  - Comprobación: `grep -n "game-over\|metric-marker" web/src/style.css` no devuelve nada.
- [ ] **Step 5: verificar.**
  - `npm run typecheck && npm test && npm run build` en verde.
  - Capturas de derrota y victoria en 390×844, 375×667, 360×640, 844×390, 667×375, 640×360 y 1024×768. Usar un resumen con 23 soldados, 11 bajas, 6 estructuras, `04:37` y 64%/100%, y otro con 0, 0, 0, `00:12` y 0%.
  - Comprobar en cada captura:
    - nada desborda (`scrollHeight <= clientHeight` en `#game-over-modal`);
    - los botones son visibles y miden al menos 40px;
    - los valores finales son exactos tras 1,3s;
    - el aspecto coincide con `pantalla-final.html`.
- [ ] **Step 6: Commit** (si está autorizado): plantilla, `GameHud.ts`, `main.ts`, `style.css` y `styles/game-over.css`, con el mensaje `feat(game-over): compact battle report with icons and count-up`. Este commit incluye también los cambios previos del icono y el cartel.

---

### Task 7: Verificación final

- [ ] **Step 1:** `npm run typecheck && npm test && npm run build`. Esperado: 0 errores y todos los tests en PASS.
- [ ] **Step 2:** `node /home/cronos/.claude/skills/impeccable/scripts/detect.mjs --json web/src/ui/templates.ts web/src/styles/main-menu.css web/src/styles/game-over.css`. Esperado: `[]`; si no, corregir los hallazgos.
- [ ] **Step 3:** captura del panel de recompensas en partida (abrir el "CENTRO DE MANDO" en 390×844 y 844×390) para confirmar que los nombres en español no desbordan las tarjetas.
- [ ] **Step 4:** `git status --short` y `git diff --stat` para confirmar que no hay cambios ajenos. Informar al usuario de qué se verificó y que no se probó en un dispositivo físico.
