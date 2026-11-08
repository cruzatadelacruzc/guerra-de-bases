# Menú inicial, acordeón de Recompensas y pantalla final — diseño

Fecha: 2026-11-08 · Estado: aprobado en conversación (maquetas validadas por el usuario)

## Intención

El juego también lo juegan **niños**, que se guían por iconos, colores y luces más que por texto. Hoy:

- El acordeón **"Recompensa"** del menú inicial parece un campo apagado: es del mismo cian que el resto, no dice qué contiene y nadie lo abre. Dentro, las tarjetas son bloques de texto con nombres en inglés y el coste al final.
- Al abrir el acordeón, el botón **DESPLEGAR UNIDADES** desaparece de la pantalla.
- El menú y la pantalla final tienen espaciado irregular, huecos muertos y texto decorativo que no informa ("COMANDO TÁCTICO · SECTOR 07", "ALERTA CRÍTICA // SECTOR 07", "REGISTRO LOCAL"…).

Objetivo: que el jugador entienda **qué tiene que hacer** y **qué recompensas puede ganar** de un vistazo, y que la pantalla final se lea como un informe claro y celebrado.

## Referencias visuales (validadas)

Maquetas en `.superpowers/brainstorm/10958-1794159415/content/` (carpeta ignorada por git):

- `recompensas-menu-v2.html` — menú cerrado (variante A elegida) y acordeón abierto con flechas de luz.
- `pantalla-final.html` — pantalla final en móvil vertical, horizontal, derrota y victoria.

Son la referencia de aspecto. Si el documento y la maqueta discrepan, manda el documento.

## Objetivos

### 1. Menú inicial

- **Quitar** el recuadro `COMANDO TÁCTICO · SECTOR 07` (`.menu-kicker`).
- **Añadir** bajo el título "GUERRA DE BASES" una línea sin caja: **"Construye, defiende y destruye el Nexo enemigo."**
- **Mantener** la moneda (icono SVG existente) junto al **200 · ORO INICIAL**.
- Espaciado: más aire entre el título y el panel, ritmo uniforme dentro del panel y el bloque completo centrado vertical y horizontalmente.

### 2. Acordeón de Recompensas, cerrado (variante A, "banner")

- Sigue siendo un `<details>`/`<summary>` (accesible y con teclado).
- Color propio **dorado/ámbar** para todo lo que es recompensa, separado del cian de la interfaz.
- Contenido del `summary`:
  - los **3 iconos de recompensa** en hexágonos de color sólido: artillería naranja `#fb923c`, aéreo azul `#38bdf8`, escudo verde `#34d399`, con el icono oscuro dentro;
  - el título **"RECOMPENSAS DE COMBATE"**;
  - el subtítulo **"Gana CP y desbloquea 3 ataques especiales"**;
  - un botón circular con flecha ↓ (↑ cuando está abierto).
- Un **brillo que barre** la franja cada pocos segundos, solo cuando está cerrado. Se desactiva con `prefers-reduced-motion`.

### 3. Acordeón de Recompensas, abierto

- El título del juego se compacta (tamaño menor) para ganar altura.
- El `summary` se queda arriba, más compacto, sin subtítulo y sin brillo.
- Debajo, una línea con icono ⚡: **"Elimina unidades y estructuras enemigas para ganar CP. Gasta CP + oro para lanzar el ataque cuando tú decidas."** Sustituye a la actual "Construye. Resiste. Destruye el Nexo enemigo." (esa idea pasa a la línea bajo el título).
- **3 tarjetas**, una por recompensa, cada una con su color de tipo:
  - recuadro de icono teñido y con brillo suave;
  - categoría (ATAQUE DE ÁREA / ATAQUE AÉREO / DEFENSA DEL NEXO) y **nombre en español**;
  - **coste arriba a la derecha**: pastilla dorada maciza `⚡ N CP` y pastilla con borde dorado `🪙 N` (icono de moneda, sin la palabra ORO);
  - descripción corta;
  - **datos con icono**:
    - artillería: diana "3 impactos" + explosión "120 daño c/u";
    - aéreo: bomba "4 bombas" + explosión "220 daño c/u";
    - escudo: escudo "−50% daño" + reloj "10 s".
- Los números de coste y efecto salen de los datos del juego, no se escriben a mano. Ya varían con la dificultad: `getRewardDefinitionForDifficulty`, y `getStrikePattern` para el número de impactos y bombas.
- **Sin barra de scroll visible.** La lista se desplaza dentro del panel y:
  - cuando hay contenido **debajo**, aparece abajo una **doble flecha dorada que brilla y late** (se mueve unos 4px), y el borde inferior de la lista se difumina con una máscara;
  - igual **arriba** cuando ya se bajó;
  - si no hay más en esa dirección, la flecha se apaga (opacidad 0 y sin interacción) y el borde deja de difuminarse;
  - tocar una flecha desplaza la lista unos 80% de su altura visible, con desplazamiento suave;
  - con `prefers-reduced-motion`, las flechas no laten y el desplazamiento es instantáneo.
- **DESPLEGAR UNIDADES siempre visible** con el acordeón abierto, en vertical y en horizontal.

### 4. Nombres de recompensas en español (en todo el juego)

| id | Antes | Después |
|---|---|---|
| `artillery_strike` | Artillery Strike | **Bombardeo de artillería** |
| `air_strike` | Air Strike | **Ataque aéreo** |
| `defensive_shield` | Defensive Shield | **Escudo defensivo** |

Se cambian en origen para que el menú, las tarjetas del HUD en partida y los avisos digan lo mismo:

- `REWARD_DEFINITIONS[*].title` en `web/src/game/rewardSystem.ts`;
- `title` en `web/src/game/unlocks/unlocks.json`;
- los avisos en `GameApplication.ts` (~l.2543): "Bombardeo de artillería activado: impactos en camino." y "Ataque aéreo activado: avión cruzando el campo.".

### 5. Pantalla final (game over)

Se conserva lo ya hecho en esta rama: los iconos nuevos (Nexo partido / bandera), el cartel CRÍTICO/ASEGURADO colgado bajo el emblema y el modal cian en victoria.

- **Quitar** la cabecera completa (`.game-over-header`: "ALERTA CRÍTICA // SECTOR 07" y "ESTADO: …"), el texto "REGISTRO LOCAL", el pie "GUERRA DE BASES · PROTOCOLO DE DESPLIEGUE" y el adorno `.game-over-corner`.
- Títulos: **"DERROTA"** (antes "DERROTA OPERATIVA") y **"VICTORIA"**. Los mensajes no cambian.
- El informe pasa a llamarse **"INFORME DE BATALLA"**.
- Filas del informe, cada una con su icono en un recuadro (cian; la de daño en rojo si es derrota y cian si es victoria) y números más grandes:
  - reloj — **Tiempo**;
  - soldado — **Soldados desplegados**, con las bajas en una pastilla roja con ✕ ("✕ 11 bajas");
  - edificio — **Estructuras construidas**;
  - diana — **Daño al Nexo rival**, con su barra.
- **Un solo bloque centrado**, sin huecos muertos, en todas las orientaciones:
  - **vertical:** emblema, título, mensaje, informe y botones en columna;
  - **horizontal:** dos columnas, con el emblema, el título y el mensaje a la izquierda (centrados) y el informe con los botones debajo a la derecha;
  - **tablet:** el mismo bloque, con un tamaño máximo razonable y centrado.
- **Botones**, uno junto al otro:
  - **"JUGAR DE NUEVO"** (icono de repetir, principal) en lugar de "REINICIAR";
  - **"MENÚ"** (icono de casa, secundario) en lugar de "VOLVER";
  - se mantienen los ids `btn-restart-game` y `btn-gameover-menu`, y se actualizan los `aria-label`.
- **Momento de luz único** al mostrarse:
  - los números cuentan desde 0 hasta su valor en unos 1,1 s con *ease-out*, incluido el tiempo en formato mm:ss;
  - la barra de daño se llena con brillo;
  - el cartel hace su "sello" (ya implementado);
  - con `prefers-reduced-motion`, todo aparece en su valor final;
  - si la pantalla se oculta o se vuelve a mostrar a mitad de animación, la anterior se cancela.

## No objetivos

- No cambia ningún valor de balance (costes, daño, duraciones, CP).
- No se rediseñan el panel de recompensas en partida, el menú de pausa ni el HUD. Reutilizar los colores por tipo ahí es una idea para más adelante, no parte de este trabajo.
- No se añaden sistemas de puntuación, estrellas, logros ni nuevas estadísticas.
- No se migra de Three.js ni se añaden dependencias.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que el botón DESPLEGAR quede fuera de la pantalla con el acordeón abierto, en cualquier tamaño soportado (mínimo 360×640 en vertical y 640×360 en horizontal).
- Que se vea la barra de scroll del navegador en la lista de recompensas.
- Que las flechas brillen cuando no hay nada más que ver.
- Animaciones que se repiten de forma llamativa sin parar, salvo el barrido del banner (espaciado) y el latido de las flechas.
- Que la pantalla final necesite scroll en un móvil horizontal de 360px de alto.
- Más texto decorativo: cada palabra en pantalla tiene que informar.

## Restricciones

- TypeScript estricto, sin `any` (AGENTS.md). La UI sigue fuera del ECS; la lógica de flechas y conteo vive en `web/src/ui/`.
- Objetivos táctiles de unos 44×44 px. Excepción: los botones de la pantalla final en horizontal muy bajo, con un mínimo de 40px (criterio ya documentado en el CSS).
- Rendimiento móvil:
  - las animaciones usan `transform`/`opacity` (y `filter` solo en los SVG pequeños);
  - el escucha de scroll es pasivo y se actualiza con `requestAnimationFrame` o directamente sin forzar layouts costosos;
  - el conteo usa `requestAnimationFrame` y se detiene al terminar.
- Fuentes existentes: Orbitron para títulos y cifras, Rajdhani para texto. Iconos en SVG inline; los de recompensa ya existen en `web/src/ui/rewardPresentation.ts` (`createRewardIcon`).
- Se mantienen los ids que usa el código (`select-difficulty`, `btn-start-game`, `mission-rules-content`, `stat-*`, `game-over-*` que sigan existiendo…). Los ids que desaparecen con la cabecera (`game-over-status`, `game-over-state`) se eliminan también de `GameHud.showGameOver`.

## Decisiones tomadas por mí (el usuario puede revisarlas)

- **CSS:** las reglas del menú y de la pantalla final están apiladas en varias capas de sobrescrituras dentro de `web/src/style.css` (por ejemplo, `.menu-shell` está definido dos veces y la pantalla final tiene ~1.500 líneas con bloques que se pisan). Recomiendo **sustituir esos bloques por uno nuevo y único** para cada pantalla, en lugar de añadir otra capa. No se tocan los estilos de otras pantallas.
- **Iconos nuevos** (diana, explosión, bomba, reloj, soldado, edificio, ✕, flechas dobles): SVG de trazo de 24×24 coherentes con los existentes. Pueden vivir junto a `rewardPresentation.ts` o en un módulo pequeño de iconos de UI.
- **Fuente de "3 impactos" y "4 bombas":** `getStrikePattern(id, difficulty).impacts.length`. El −50% y los 10 s del escudo salen de `reduction` y `durationSeconds`.
- **"🪙 N" sin la palabra ORO** en las tarjetas: se apoya en el icono, como pidió el usuario para los niños.
- **Estado inicial del acordeón:** empieza cerrado en cada visita al menú. No se recuerda entre sesiones.
- **Menú en horizontal bajo** (la disposición actual de dos columnas con `max-height: 520px`): el título, la línea del objetivo y DESPLEGAR van en la columna izquierda, y el panel de misión con el acordeón en la derecha. Al abrir el acordeón, la lista se desplaza dentro de la columna derecha y DESPLEGAR sigue visible a la izquierda.
- **Nombres más largos en el HUD de partida:** "Bombardeo de artillería" es más largo que "Artillery Strike". Las tarjetas de recompensas en partida deben seguir viéndose bien, con el texto partido en dos líneas si hace falta y sin desbordar. Se comprueba con capturas, pero no se rediseñan.
- **Conteo:** cuentan todos los números del informe (tiempo, soldados, bajas, estructuras y porcentaje), a la vez.

## Lo que se deja a quien lo construya

- Cómo se estructura la lógica de flechas (una clase o función pequeña en `ui/`) y el conteo (en `GameHud` o un helper).
- Los valores exactos de espaciado y tamaños por breakpoint, siempre que se cumplan los anti-objetivos y el aspecto de las maquetas.
- Si la máscara de difuminado se hace con `mask-image` o con pseudo-elementos degradados, según soporte en WebView Android (Capacitor 7).

## Verificación esperada

- `npm run typecheck`, `npm test` y `npm run build` en verde.
- Tests nuevos o actualizados donde sea lógica: textos de recompensa desde los datos según la dificultad, nombres en español y conteo final con el valor exacto.
- Capturas con Playwright del menú (cerrado, abierto arriba, abierto a mitad y abierto al final) y de la pantalla final (derrota y victoria), en 390×844, 360×640, 844×390, 640×360 y 1024×768. Comprobar que DESPLEGAR es visible, que no hay barra de scroll, el estado de las flechas y que la pantalla final no necesita scroll.
- Captura del panel de recompensas en partida para confirmar que los nombres en español no desbordan.
- Detector de impeccable (`detect.mjs`) sobre los archivos de UI cambiados.
- Sin verificación en dispositivo físico salvo que el usuario la haga; se indicará así.
