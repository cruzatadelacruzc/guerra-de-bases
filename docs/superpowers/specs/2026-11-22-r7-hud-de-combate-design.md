# R7 — HUD de combate — diseño

Fecha: 2026-11-22 · Estado: **aprobado** el 2026-11-22 (dirección B+ y decisiones de §2 tomadas por el usuario el 2026-11-22; revisado por un lector independiente, que corrigió el comportamiento real de Esc y «atrás» y abrió las decisiones 8 y 9) · Commit de partida: `25946ef`

Relación con los documentos anteriores:
- `docs/audits/2026-11-14-auditoria-responsabilidades.md`: paso R7 en §7 («`GamePresenter`: UI con control de cambios y la limitación de 250 ms efectiva»), problema de §5.4 y «Punto de partida para R7».
- `docs/superpowers/specs/2026-11-20-r4-comandos-compartidos-design.md`: `buildStructure`, `sellStructure`, `trainUnit` y `activateReward` siguen siendo los únicos caminos de juego.
- `docs/superpowers/specs/2026-11-20-r5-recompensas-en-el-reloj-de-juego-design.md`: las recompensas viven en el reloj de juego; R7 no toca sus reglas.
- `docs/superpowers/specs/2026-11-21-r6-separacion-de-la-presentacion-design.md`: `BattlefieldView` y `WorldReader` (solo lectura). R7 añade una única operación de resalte a la vista (§5.7).
- `docs/performance/2026-11-14-referencia-rendimiento.md`: batería de medición que R7 repite (§8).

---

## 1. Intención

> En un teléfono, el jugador construye, entrena y lanza recompensas sin perder de vista la batalla, con un HUD que sigue funcionando cuando el catálogo de estructuras y armamento crezca.

Prioridades del usuario, en orden: usabilidad y aprendizaje, visibilidad del campo, aprovechamiento del espacio, accesibilidad táctil, claridad de acciones y estados, consistencia visual, rendimiento. No se sacrifica usabilidad por una interfaz más elaborada.

R7 junta dos cosas que dependen una de otra:
1. **El rediseño del HUD de combate** (franja superior, barra de acciones, modos, recompensas).
2. **El paso R7 de la auditoría**: un presentador que entrega a la UI datos planos y una UI que solo escribe en el DOM cuando algo cambia, con la limitación de 250 ms efectiva. Construir el HUD nuevo sobre el sistema de actualización actual heredaría sus problemas (§3.4).

**Contexto que condiciona el diseño:** el usuario seguirá añadiendo estructuras y armamento al catálogo. Ninguna solución puede depender de que hoy haya 3 estructuras y 2 unidades.

**Qué no cambia:** reglas de combate, economía, costes, reembolso de venta (70 %), tiempos de producción, reglas y balance de las recompensas, IA, cámara, render 3D de unidades y estructuras, menú principal, pausa y pantalla final.

## 2. Decisiones del usuario (2026-11-22)

1. **Dirección B+.** Barra de acciones siempre visible (sin cajón ni hojas). Las categorías no se dejan para más adelante: se diseñan y construyen en R7, porque el catálogo va a crecer.
2. **Categorías: grupos que se pliegan.** Cada grupo (Construir, Ejército) muestra siempre su icono de categoría. Si todo cabe, todos los grupos se ven desplegados; si no, solo uno queda abierto y los demás se reducen a su icono, con la misma altura y posición.
3. **Modo colocar/vender: la barra se transforma.** Mientras dura el modo, la propia barra muestra el modo y su cancelación. No hay franja adicional encima.
4. **Venta en dos pasos** con el reembolso exacto visible antes de confirmar.
5. **Sin arreglo previo del Escudo (T0 descartado).** El fallo P0 de §3.2 desaparece al eliminar el cajón (§9, T8), y no se publicará ni probará con jugadores antes de terminar R7.
6. **Franja superior:** anillo de progreso por Nexo con el color de cada bando, sin iconos del Nexo ni decoración; misma presentación para jugador e IA; oro y CP con icono y cantidad para los dos bandos.
7. **Sin `shape`.** La forma del HUD quedó fijada con la maqueta, dos critiques de Impeccable y estas decisiones; el siguiente paso es este documento y después el plan.
8. **Botón «atrás» de Android:** con un modo activo lo cancela; sin modo activo, pausa como hoy (§5.4.1).
9. **El edificio productor de cada unidad es un dato del dominio desde R7** (§6.8), en lugar de una regla fija «Ejército necesita una Barraca».

## 3. Estado actual (verificado en el código, commit `25946ef`)

### 3.1 Componentes y comunicación

- La UI implementa `GameUiPort` (`web/src/ui/contracts.ts`) y recibe acciones mediante `GameActions`. No toca el ECS directamente; está bien separada (auditoría §4).
- `web/src/ui/templates.ts` → `gameHudTemplate`: barra superior con dos paneles de facción (`1200 / 1200 HP`, barra, ORO, CP del jugador, ORO y «IA: CONSTRUYENDO» del enemigo), columna central con PAUSA y AUTO, y un cajón «Centro de Mando» con tres secciones: construir (Generador, Barracas, Torreta, Borrar/Vender), entrenar (Soldado, Tanque) y recompensas (tres tarjetas).
- `GameHud.ts` (vida, estado de IA, tarjetas de recompensa, fin de partida), `BuildMenu.ts` (botones de construir y entrenar, estado de barracas), `ControlsDrawer.ts` (cajón), `GameUI.ts` (montaje, delegación de clics, menú principal).
- `GameApplication.ts` mantiene el estado de interacción en variables sueltas: `selectedBuildType`, `isDemolishMode` (~419-420), `selectBuildingToPlace` (~760), `cancelPlacement` (~773), `toggleDemolishMode` (~747), toque y doble toque en `onPointerUp` (~826-910, tolerancia 10 px, doble toque 300 ms / 30 px solo fuera de los modos).

### 3.2 Problemas de usabilidad (medidos con Playwright y dos critiques de Impeccable)

| Problema | Evidencia |
|---|---|
| **P0 — Escudo inalcanzable en vertical** | Con el cajón abierto y el scroll al máximo, la tarjeta del Escudo queda cortada en 390×844 (contenido hasta y=896) y 360×740. |
| P1 — Modos invisibles en táctil | `setPlacementActive(true)` cierra el cajón y la pista «TOCA EL TERRENO» queda en 0×0. No hay botón de cancelar; solo Esc, clic derecho o «atrás» de Android. El modo vender tampoco se ve tras el aviso de 2,5 s y un toque vende. |
| P1 — Recompensas enterradas | Abierto el cajón en vertical, 0 % del panel de recompensas visible; hay que desplazar 2,1 veces la altura visible. |
| P1 — Cobertura | Vertical: cajón abierto 354 px (42 %) + barra 79 px ≈ 49 % tapado. Horizontal: ≈ 87-97 % tapado. |
| P2 — Texto diminuto | 44 nodos por debajo de 10 px, 11 tamaños distintos, mínimo 7,7 px; un texto con contraste 4,3:1. |
| P2 — Lenguaje | Estados en inglés crudo (`LOCKED`, `INSUFFICIENT GOLD`, `NO VALID TARGET`), «¡GENERATOR CONSTRUIDO!», ⚡ usado para el oro. |
| P2 — No escala | Botones escritos a mano en la plantilla; costes 50/180 repetidos en `templates.ts` y `BuildMenu.ts` en lugar de leerse de `SOLDIER_PRODUCTION`. |

Puntuación de la critique (Nielsen): HUD actual **16/40**; maqueta B+ **25/40**.

### 3.3 Lecciones de la maqueta B+ (critique del prototipo)

- Una barra plana con casillas de 54 px usa 370 de 370 px a 390 de ancho, desborda a 360 px con el catálogo actual y deja medio catálogo fuera con 11 elementos. De ahí la decisión 2.
- Texto de 8,5-9,5 px en casillas y píldoras; contraste 3,78:1 en el coste «sin oro» por bajar la opacidad; pausa de 42 px y «Cancelar» de 40 px; 4 px entre casillas.
- Tres formas distintas de expresar «no disponible»; el naranja significaba a la vez falta de oro, barracas ocupadas y error.
- Alarma de Nexo crítico demasiado débil.
- El banner de modo encima de la barra tapaba la zona de construcción propia (en horizontal, la base del jugador está a la izquierda).

### 3.4 Problemas técnicos

- **La limitación de 250 ms está anulada.** `updateCombat` llama a `updateResourceUI()` en cada fotograma (~1034), que llama a `updateRewardUI()`; esta recorre los objetivos con `rewardTargetCandidates`. El `if (gameplayClockMs - lastRewardUiUpdateMs >= 250)` de `animate` (~1437) no limita nada.
- `BuildMenu.updateResources` reconstruye el estado de las barracas con `createElement('progress')` en cada fotograma.
- `ui.setBaseHealth` se llama en cada fotograma desde `updateCombat` (~1050).
- **Lógica duplicada:** `updateRewardUI` (~674-711) recalcula el estado de cada recompensa en paralelo con `validateRewardActivation` (`web/src/game/rewardSystem.ts`). Hoy coincide el orden, pero es una copia.
- **CSS en capas que se contradicen:** reglas por posición (`#game-hud > div:first-child…`, `div:last-child`, `nth-child(2)`) anuladas por reglas posteriores con comentarios sobre especificidad. Un cambio de estructura reactivaría reglas antiguas.
- `backdrop-filter: blur` en varios paneles; ya existe un interruptor de diagnóstico para quitarlo porque es caro en móvil.

## 4. Enfoques considerados

### 4.1 Navegación inferior

| Enfoque | Ventajas | Inconvenientes | Resultado |
|---|---|---|---|
| A — Pestañas «Estructuras / Soldados» con hoja de filas | Escala; sitio para descripciones | 2 toques por acción; la hoja tapa la base propia (vertical ≈ 20-31 %) y necesita minimizarse al colocar | Descartado |
| B — Barra plana siempre visible | 1 toque; ~15 % tapado | No cabe a 360 px ni con 7+ elementos | Descartado tal cual |
| **B+ — Barra con grupos que se pliegan** | 1 toque dentro del grupo abierto; un solo patrón en todos los tamaños; crece con el catálogo | Cambiar de grupo cuesta 1 toque más en teléfonos | **Elegido** |
| Fila con desplazamiento horizontal sin grupos | Lo más simple | Lo que no se ve se olvida | Descartado (se usa solo como último recurso dentro de un grupo, §5.3) |

### 4.2 Presentación de los modos

| Enfoque | Resultado |
|---|---|
| **La barra se transforma en el modo** | **Elegido**: cero cobertura adicional. Coste: para cambiar de estructura durante la colocación hay que cancelar y elegir otra (2 toques). |
| Franja de modo encima de la barra | Descartado: tapa ~46 px más justo sobre la base propia. |

### 4.3 Venta

| Enfoque | Resultado |
|---|---|
| **Dos pasos, confirmación en la barra** | **Elegido**. |
| Dos pasos, confirmación flotando sobre la estructura | Descartado: exige proyectar posiciones 3D a pantalla en cada fotograma y rompe la regla «la barra es el modo». |
| Un toque, como hoy | Descartado: venta accidental sin deshacer. |

## 5. Diseño

### 5.1 Franja superior

```
┌────────────────────────────────────────────────────┐
│ (83%) ⬡225 ϟCP 3        [ Ⅱ ]        ϟCP 1 ⬡53 (71%) │   ≤ 48 px (hoy 79-86)
└────────────────────────────────────────────────────┘
  panel con borde cian (aliado)      panel con borde rojo (hostil)
```

- Un mismo componente instanciado dos veces, en espejo: el anillo en el extremo exterior y los recursos hacia dentro.
- **Anillo de vida:** progreso circular en el color del bando, con el porcentaje dentro («83 %»). Redondeo hacia arriba (`ceil`), de modo que solo muestra 0 % cuando la vida es 0.
- **Vida crítica (≤ 30 %):** el anillo y el borde del panel pulsan en el mismo color del bando; nunca se pasa a rojo (el rojo identifica al enemigo). Con `prefers-reduced-motion`, trazo más grueso y estático en lugar de pulso. Al cruzar el umbral hacia abajo en el Nexo del jugador, un único aviso «NEXO 22 %» y la vibración existente (`HapticFeedback`). El aviso no se repite hasta que la vida vuelva a subir del umbral o empiece otra partida.
- **Oro:** icono de moneda (ya existe `coin` en `uiIcons.ts`) y cantidad entera; desde 10 000, formato `10,2k`.
- **CP:** icono de rayo (`bolt`), etiqueta «CP» y color violeta, el mismo que ya usa el menú principal. **⚡ deja de usarse para el oro en todo el juego.**
- **Se elimina «IA: CONSTRUYENDO»** del HUD. `setAiStatus` y su llamada desaparecen del puerto de la UI.
- **Pausa:** botón de 44×44 px en el centro de la franja.
- Se mantienen el oro y los CP del rival (información estratégica: los CP enemigos anuncian sus ataques).

### 5.2 Vocabulario de estados

Una sola regla para todas las acciones de la barra y las recompensas. **No se usa la opacidad para expresar estados** (bajaba el contraste por debajo de 4,5:1).

| Estado | Presentación |
|---|---|
| Disponible | Aspecto normal |
| Sin oro | Coste en naranja; casilla a plena intensidad. El naranja significa solo «falta oro» |
| Requisito pendiente | Candado y el requisito en lugar del coste (por ejemplo «Barraca») |
| Ocupado | Progreso y «0/2 libres», con fondo distinto |
| Seleccionado | Contorno brillante |

- Los controles no disponibles usan `aria-disabled="true"`, no `disabled`, para que el toque llegue y se explique el motivo.
- **Todo toque sobre una acción no disponible muestra el motivo junto al control tocado** («Faltan 30 de oro para Torreta», «Construye una Barraca primero», «Todas las Barracas están ocupadas»). El dominio sigue validando cada comando como hoy.
- Todos los textos visibles en español. Desaparecen `LOCKED`, `INSUFFICIENT GOLD`, `NO VALID TARGET` y «¡GENERATOR CONSTRUIDO!» (se usa el nombre corto del catálogo).

### 5.3 Barra de acciones B+

```
Vertical, plegada (teléfonos con el catálogo actual):
┌────────────────────────────────────────────────┐
│ [🏗▾ GENERADOR BARRACA TORRETA]  [⚔]  │ [VENDER] │
└────────────────────────────────────────────────┘
Tras tocar ⚔:
│ [🏗]  [⚔▾ SOLDADO TANQUE]          │ [VENDER] │

Horizontal / tablet (cabe todo, desplegada):
│ [🏗 GENERADOR BARRACA TORRETA] [⚔ SOLDADO TANQUE] │ [VENDER] │
```

- **Grupos:** Construir y Ejército, en ese orden, más la acción fija Vender al final. Cada grupo empieza con su icono de categoría, que es también el control para abrirlo.
- **Regla de plegado** (función pura, probada en Node):
  1. Si el ancho de todos los grupos desplegados cabe en el ancho disponible, todos se muestran desplegados.
  2. Si no, solo el grupo abierto se despliega; los demás se muestran como su icono.
  3. Si el grupo abierto no cabe ni solo, se desplaza en horizontal dentro de la barra, con ajuste por casilla y un indicador «+N» en el borde.
- **Con el catálogo actual**, los teléfonos en vertical ya muestran la barra plegada; horizontal y tablet la muestran desplegada (estimación con las medidas de la maqueta; se confirma en T6).
- **Grupo abierto:** al empezar la partida, Construir. Después, el último grupo cuya casilla o icono se tocó. Ejército no se cierra al pedir una unidad, así que pedir varias seguidas cuesta un toque cada una. Se reinicia en cada partida.
- **El ancho disponible se mide al cambiar el tamaño de la ventana o la orientación** (ResizeObserver), nunca en el bucle de juego.
- **Casillas:** objetivo ~60×60 px (mínimo 44×44), separación ≥ 8 px. Contenido: icono, nombre corto (≤ 9 caracteres), coste y, en las unidades, tiempo de producción. Texto ≥ 11 px.
- **Unidades:** progreso de la orden más próxima de ese tipo y una insignia con el número de órdenes de ese tipo. El requisito y la disponibilidad de cada unidad salen de su edificio productor (§6.8): sin ningún productor vivo, «requisito pendiente» con el nombre del edificio; con productores pero todos ocupados, «ocupado». El grupo Ejército muestra «<Productor> x/y libres» por cada tipo de productor presente en el catálogo (hoy solo «Barracas x/y libres» o «Sin Barraca»).
- **Generada desde datos (§6.2):** añadir una estructura o unidad a las definiciones y a su entrada del catálogo de presentación basta para que aparezca en su grupo.
- Vender no pertenece a ningún grupo ni se pliega.

### 5.4 Modos: la barra se transforma

```
Colocando:   │ [🏗 Colocando Generador · toca tu zona                 ✕] │
Vendiendo:   │ [↺ Vender · toca una estructura tuya                    ✕] │
Confirmando: │ [↺ Barraca · +105 oro               [VENDER]            ✕] │
```

- Mientras hay un modo activo, la barra muestra el modo en su mismo hueco y con su misma altura; el resto de acciones no se ven.
- **Colocando:** se entra tocando una casilla de estructura disponible. Tocar el terreno propio intenta construir (comportamiento actual de `onPointerUp`). Al construir con éxito, se vuelve a la barra con Construir abierto (como hoy, la colocación termina tras una construcción).
- **Cancelar** desde cualquier modo: ✕ en la barra, Esc y clic derecho. Hoy Esc solo cancela la colocación (no el modo vender) y el clic derecho cancela los dos; tras R7, los tres cancelan cualquier modo. El botón «atrás» de Android se trata en §5.4.1.
- Para cambiar de estructura durante la colocación: cancelar y elegir otra.
- **Qué termina un modo y qué no** (decisión del autor):

| Evento | Efecto sobre el modo |
|---|---|
| ✕, Esc, clic derecho | Lo cancela |
| Construcción con éxito | Termina la colocación |
| Venta confirmada | Vuelve a Vendiendo |
| Empezar, reiniciar o salir de la partida; fin de partida (`MATCH_ENDING`) | Lo cancela |
| Botón de pausa y paso a segundo plano | Lo conserva: al reanudar se sigue en el mismo modo |
| Activar una recompensa | Lo conserva (las recompensas siguen visibles en vertical y horizontal) |
| Girar la pantalla | Lo conserva; la barra se recalcula para la nueva orientación |

#### 5.4.1 Botón «atrás» de Android (decisión del usuario)

Hoy `onNativeBack` (`GameApplication.ts` ~491) alterna la pausa durante `PLAYING`/`PAUSED` y nunca cancela un modo. Tras R7:

1. `PLAYING` con un modo activo → cancela el modo (Confirmando vuelve a Vendiendo; Vendiendo y Colocando vuelven a la barra) y consume la pulsación.
2. `PLAYING` sin modo → pausa, como hoy.
3. `PAUSED` → reanuda, como hoy (el modo conservado sigue activo, §5.4).
4. `MATCH_ENDING` y `GAMEOVER` → sin cambios.
- El doble toque para enfocar la cámara sigue desactivado durante los modos, como hoy.
- **El texto prioriza la instrucción**: si no cabe, se acorta el nombre de la estructura antes que «toca tu zona».

### 5.5 Venta en dos pasos

1. Vender (acción fija) → modo **Vendiendo**.
2. Tocar una estructura propia (`pickOwnStructure`) → modo **Confirmando**: la estructura queda resaltada (§5.7) y la barra muestra su nombre corto, el reembolso exacto y el botón **[VENDER]**.
3. **[VENDER]** ejecuta `sellStructure` y vuelve al modo Vendiendo para poder vender otra; ✕ sale a la barra.
4. Tocar otra estructura propia cambia la selección; tocar terreno sin estructura no hace nada.
5. Si la estructura seleccionada deja de existir antes de confirmar (destruida, partida terminada), se vuelve a Vendiendo sin vender y se muestra «La estructura ya no existe».

El reembolso mostrado sale del dominio: se exporta desde `structureCommands.ts` una función pura con el mismo cálculo que usa `sellStructure` (`Math.floor(coste × 0,7)`), y `sellStructure` la usa. La regla no cambia.

### 5.6 Recompensas

- Tres botones redondos de 48 px. Vertical: columna en el borde derecho, por encima de la barra. Horizontal: a la derecha, junto a la barra. Separación ≥ 8 px entre ellos y con cualquier otro control; la cámara (AUTO) no va pegada a ellos.
- **Estado** (anillo + píldora corta, texto ≥ 11 px):

| Estado | Origen en el dominio | Anillo | Píldora |
|---|---|---|---|
| Faltan CP | `insufficient-points` | CP actuales / coste | «12/18 CP» |
| Falta oro | `insufficient-gold` | completo, naranja | «faltan 40» con moneda |
| Sin objetivos | `no-valid-target` | apagado | «sin objetivos» |
| Recarga | `cooldown` | barrido de la recarga | segundos |
| Activa | tiempo activo > 0 (incluye `shield-active`) | tiempo restante | segundos |
| Lista | validación aceptada | lleno, con brillo | «LISTO» |

- El estado se obtiene llamando a `validateRewardActivation` con los datos del dominio, no con una copia de su lógica. El estado «Activa» se lee de `MatchState` (`shieldUntilMs`, `strikeActiveUntilMs`), como hoy.
- **Un toque (`click`) sobre una recompensa lista la activa** (sin confirmación). Sobre una que no está lista, el aviso junto al botón nombra la recompensa y dice qué falta («Ataque aéreo: faltan 6 CP»).
- El nombre de cada recompensa está en su etiqueta accesible (`aria-label`) y en los avisos; no hay rótulo fijo en pantalla.
- La cinemática de cámara de los ataques sigue funcionando igual; ya no hay cajón que cerrar.

### 5.7 Resalte de estructura (único cambio en `rendering/`)

`BattlefieldView` añade una operación para resaltar una entidad propia y quitar el resalte (por ejemplo `highlight(entity | null)`), que reutiliza materiales existentes o un único material compartido, sin crear recursos por fotograma. Se libera en `clear()`. Si la entidad desaparece, el resalte se quita con ella.

### 5.8 Disposición por orientación

- **Vertical:** franja superior; barra abajo; recompensas en el borde derecho; cámara AUTO en el borde izquierdo, sobre la barra.
- **Horizontal:** la base propia está a la izquierda (`LANDSCAPE_AZIMUTH`), así que la barra y las recompensas se alinean **a la derecha** y la zona izquierda queda libre para colocar y mover la cámara. Ancho máximo de la barra = ancho − bloque de recompensas − márgenes.
- **Tablet y escritorio:** mismos componentes; la barra cabe desplegada.
- **Botón de cámara automática (AUTO):** su comportamiento no cambia. El seguimiento empieza activado, se desactiva al mover la cámara a mano y el botón lo alterna (`MapCameraController`). Solo cambian su lugar y su aspecto:
  - vertical: borde izquierdo, encima de la barra; horizontal: esquina superior izquierda, bajo la franja; siempre a ≥ 8 px de cualquier otro control;
  - 44×44 px como mínimo (hoy mide 48×30, por debajo del mínimo táctil);
  - icono y la etiqueta «AUTO» debajo, en texto ≥ 11 px. No queda solo con icono;
  - el estado se ve sin depender de la opacidad: activado, borde y texto iluminados en cian; desactivado, contorno apagado y texto en gris claro con contraste ≥ 4.5:1;
  - se conserva la etiqueta accesible actual («Zoom automático activado» / «Zoom automático desactivado») y `aria-pressed`.
- Márgenes seguros (`env(safe-area-inset-*)`) en los cuatro lados.
- Fuera de sus controles, el HUD deja pasar los toques al campo (`pointer-events: none` en contenedores).
- Sin `backdrop-filter` en el HUD de combate; fondos sólidos semitransparentes con contraste suficiente.

### 5.9 Avisos

- Los avisos de motivo (§5.2, §5.6) aparecen anclados al control tocado y no en el centro del campo.
- El aviso central existente (`ToastNotifications`) se mantiene para eventos de partida («¡NEXUS BAJO ATAQUE!», construcción completada, venta realizada).

## 6. Arquitectura

### 6.1 Presentador del HUD

- Módulo puro, sin DOM ni Three.js, en `web/src/ui/hud/` (la UI ya depende de definiciones de `game/`; el juego no depende de la UI).
- Entradas: `WorldReader`, `MatchState`, bases, dificultad, reloj de juego, `InteractionMode` y el grupo abierto.
- Salida: `HudView`, datos planos (números, cadenas, enums), sin objetos del motor.
- `factionSummary(side)`: **la misma función** para jugador e IA (porcentaje de vida, crítico sí/no, oro, CP).
- Acciones: una entrada por casilla del catálogo con estado (§5.2), coste, tiempo, progreso y motivo; datos de barracas libres.
- Recompensas: estado de §5.6 vía `validateRewardActivation`.
- **Frecuencias:** vida, oro, CP y progreso de producción cada fotograma (baratos); recuento de objetivos y estado de recompensas a 4 Hz, con la limitación de 250 ms realmente efectiva.
- **Sin asignaciones por fotograma:** el presentador rellena un `HudView` reutilizable.
- El presentador sustituye a `updateResourceUI` y `updateRewardUI` de `GameApplication`.

### 6.2 Catálogo de presentación

- En la UI, una entrada por identificador de estructura construible y de unidad: nombre corto (≤ 9 caracteres), nombre completo para avisos y accesibilidad, icono y grupo (`build` | `army`).
- No se añaden datos de UI a `STRUCTURE_DEFINITIONS` ni a `SOLDIER_PRODUCTION`. Costes y tiempos se leen siempre de las definiciones.
- **Prueba de completitud:** falla si una estructura construible o una unidad de las definiciones no tiene entrada, o si un nombre corto supera 9 caracteres.
- El orden de las casillas dentro de un grupo es el del catálogo.

### 6.3 `InteractionMode`

- Máquina de estados pura junto a `GameInputController`: `none | placing(type) | selling | confirmingSale(entity)`.
- Sustituye a `selectedBuildType` e `isDemolishMode`. Todas las cancelaciones (✕, Esc, clic derecho, «atrás», inicio y salida de partida, fin de partida) pasan por ella.
- Fuera del ECS (AGENTS.md §4.4). `GameApplication` la consulta en `onPointerUp` para decidir entre construir, seleccionar para vender o enfocar la cámara.

### 6.4 Componentes DOM

- Franja superior (`FactionStatus` ×2), barra de acciones, botones de recompensa y avisos anclados. TypeScript y DOM, sin framework, iconos SVG en línea.
- **Escriben en el DOM solo cuando cambia el valor que muestran.** Nunca crean elementos dentro del bucle de juego; la barra se reconstruye solo cuando cambia su estructura (grupos visibles, modo, número de casillas).
- El progreso se cuantiza a porcentaje entero; el anillo actualiza `stroke-dasharray` solo cuando cambia el porcentaje.
- Al empezar o reiniciar una partida, los valores recordados se vacían.
- Se eliminan `BuildMenu.ts`, `ControlsDrawer.ts`, el cajón de `gameHudTemplate` y el panel de recompensas de `GameHud.ts`. La pantalla final y la pausa no cambian.

### 6.5 `GameUiPort`

- Sale: `updateResources`, `setBaseHealth`, `updateRewardState`, `setAiStatus`, `setDemolishMode`, `setPlacementActive`.
- Entra: `render(view: HudView)`.
- Se mantienen: `showToast`, `flashNexusAlert`, `setPaused`, `showGameOver`, `enterGameplay`, `enterMainMenu`, `setAutoZoom`, `setUnlocks`, `setPermanentUnlockCount`, `getMissionSettings`, `getCanvasContainer`, `bindActions`.
- `GameActions` añade lo que necesitan la barra y los modos (abrir grupo, cancelar modo, confirmar venta). `toggleDemolishMode` pasa a llamarse según el nuevo modo.

### 6.6 CSS

- Nuevo `web/src/styles/hud.css` con selectores por clase y tokens: color de bando (cian / rojo), de recurso (oro, CP violeta, naranja «falta oro») y escala tipográfica con mínimo de 11 px.
- **Se borran** las reglas por posición de `style.css` y las del cajón. No se añaden reglas encima de las antiguas.
- Se conservan Orbitron y Rajdhani y la identidad visual actual.

### 6.7 Dependencias

Ninguna nueva.

### 6.8 Cambios en el dominio

R7 toca `game/` solo en dos puntos, ambos sin cambiar reglas ni balance:

1. **Reembolso de venta:** función pura exportada desde `structureCommands.ts` con el cálculo actual (`Math.floor(coste × 0,7)`); `sellStructure` la usa (§5.5).
2. **Edificio productor por unidad (decisión del usuario):**
   - `SoldierProductionDefinition` (`web/src/game/ecs/initialBattle.ts`) gana un campo `producer: BuildableStructureKind`. Soldado y Tanque: `'barracks'`.
   - `liveFactories` e `idleFactories` (`trainCommand.ts`), que hoy filtran `kind === 'barracks'` a mano, pasan a recibir el tipo de productor. Sus llamadas actuales (`GameApplication`, `aiSnapshot`) pasan `'barracks'` o el productor de la unidad, con el mismo resultado que hoy.
   - `requestUnitProduction` (`systems.ts`) rechaza una orden cuyo edificio no sea el productor de la unidad, con el motivo existente `invalid-factory`. Hoy todas las unidades salen de Barracas, así que ningún camino actual cambia de resultado.
   - `GameApplication.trainUnit` elige un productor libre del tipo de la unidad, en lugar de «la primera Barraca libre».
   - La IA no cambia de comportamiento: sigue pidiendo a sus Barracas.
   - Resultado: una unidad nueva con otro edificio productor solo necesita su definición, su entrada del catálogo de presentación y, si el edificio es nuevo, la definición de ese edificio.

## 7. Pruebas

### 7.1 Node (`tsx --test`)

- Presentador: porcentaje y redondeo, umbral crítico, simetría de `factionSummary`, estados de las casillas (disponible, sin oro, requisito, ocupado, seleccionado), barracas libres, **paridad de cada estado de recompensa con `validateRewardActivation`**, frecuencia de 4 Hz del recuento de objetivos, ausencia de asignaciones en una actualización estable.
- Regla de plegado: todo cabe, plegado, grupo abierto que no cabe solo; con el catálogo actual y con uno de 11 elementos.
- `InteractionMode`: todas las transiciones y cancelaciones, incluida la estructura que desaparece en `confirmingSale`.
- Catálogo: completitud y longitud de nombres.
- Reembolso: la función exportada coincide con lo que devuelve `sellStructure`.
- Productor: toda unidad tiene un `producer` construible; `liveFactories`/`idleFactories` filtran por él; `requestUnitProduction` rechaza un edificio que no es el productor; las pruebas existentes de producción, IA y comandos siguen pasando sin cambios de resultado.
- Botón «atrás»: con modo activo cancela; sin modo pausa; en pausa reanuda conservando el modo.
- Formateadores (`10,2k`, segundos, porcentaje).

### 7.2 Navegador

Como en R3-R6: `playwright-cli` global, procedimiento escrito en el plan con cada comando y el valor esperado, y salida guardada en el informe de entrega. Sin dependencias nuevas.

- Capturas en 360×740, 390×844, 844×390, 820×1180 y escritorio con el catálogo actual, en el juego real.
- **Catálogo de 11 elementos** (decisión del autor): se comprueba con una página de prueba solo de desarrollo que monta la barra real con un `HudView` y un catálogo falsos, sin juego detrás. No forma parte del build de producción ni añade caminos al juego. La regla de plegado se prueba además en Node (§7.1).
- Comprobaciones: nada se sale de la pantalla; botones ≥ 44 px y separación ≥ 8 px; texto ≥ 11 px; contraste ≥ 4.5:1; colocar, cancelar con ✕, vender en dos pasos; pedidos seguidos; activar cada recompensa; girar la pantalla durante un modo; pausa y reanudación; reiniciar.
- Una nueva `/impeccable critique` del HUD al final, que debe superar 25/40.

### 7.3 Dispositivo real

Arrastre empezando junto a la barra, doble toque dentro y fuera de los modos, notch en horizontal, botón «atrás» de Android, sesión de 10 minutos. Si no se dispone de dispositivo físico, se indica y no se da por verificado.

## 8. Rendimiento

- Medición antes y después con la batería de `docs/performance/2026-11-14-referencia-rendimiento.md` en un escenario de combate: tiempo de fotograma y tiempo del bloque de UI.
- Objetivos: cero `createElement` en el bucle de juego, recuento de objetivos a 4 Hz, escrituras DOM solo al cambiar valores, sin `backdrop-filter` en el HUD de combate.

## 9. Cambios de comportamiento declarados

1. El cajón «Centro de Mando» desaparece; construir y entrenar están siempre en la barra.
2. Las recompensas pasan de tarjetas a botones siempre visibles; desaparecen las descripciones largas en combate (siguen en el menú principal).
3. Colocar y vender se muestran en la barra con cancelación visible.
4. Vender requiere confirmar; tras vender se sigue en modo vender.
5. Tocar una acción no disponible muestra el motivo (antes el botón estaba desactivado y no respondía).
6. Desaparece «IA: CONSTRUYENDO».
7. Aviso único al bajar el Nexo propio del 30 %.
8. Textos en español; ⚡ deja de representar el oro.
9. El botón «atrás» de Android cancela el modo activo antes de pausar (§5.4.1); Esc también sale del modo vender.
10. Una orden de producción a un edificio que no es el productor de la unidad se rechaza (hoy no puede ocurrir: todas salen de Barracas).

No cambian reglas, costes, reembolso, tiempos, cooldowns, IA ni balance.

## 10. Fuera de alcance

- Cola de producción por Barraca (cambia las reglas de producción).
- Atajos de teclado, apuntado manual de recompensas, colocación por arrastre, colocación en cadena.
- Descripciones por pulsación larga y tutorial.
- Encuadre automático de la cámara teniendo en cuenta el HUD.
- Menú principal, pausa y pantalla final (salvo lo que obligue la limpieza del CSS).
- Sistema de desbloqueos (auditoría §4.6).
- Copias `gold`/`enemyGold` y pendientes de R6 (R8).

## 11. Riesgos de regresión

| Área | Riesgo | Mitigación |
|---|---|---|
| Cámara | Controles sobre el lienzo bloquean arrastres; el dedo se levanta encima del HUD y queda un gesto pendiente | Contenedores con `pointer-events: none`; prueba de arrastre desde junto a la barra; `onPointerCancel` sigue limpiando el gesto |
| Construcción | Confirmación al levantar el dedo (10 px), ✕ que propaga el toque al lienzo | ✕ detiene la propagación; prueba de colocar y cancelar |
| Venta | Estado de confirmación al girar la pantalla, pausar o terminar la partida | Todas las salidas pasan por `InteractionMode`; prueba de la entidad que desaparece |
| Producción | La barra desincronizada con órdenes en paralelo | Presentador probado con varias barracas |
| Recompensas | Activación accidental; cinemática | Separación física; solo «LISTO» activa; prueba de cada recompensa |
| Reinicio | Valores recordados o modo de la partida anterior | Vaciado en `startNewGame` y `exitToMenu` |
| CSS | Borrar reglas antiguas afecta a pausa o fin de partida | Capturas antes/después en T3 |
| Rendimiento | Reconstrucciones de la barra o del anillo en cada fotograma | Pruebas de «sin asignaciones» y medición de §8 |

## 12. Orden de trabajo (para el plan)

| # | Tarea | Criterio de aceptación |
|---|---|---|
| T0 | Dominio: función de reembolso + `producer` por unidad (§6.8) | Pruebas nuevas en verde; todas las existentes sin cambios de resultado |
| T1 | Presentador + `HudView` alimentando el HUD actual | Sin cambio visual; paridad con el dominio; ningún coste escrito a mano |
| T2 | Escritura solo al cambiar + 4 Hz efectivos | Cero `createElement` en el bucle; reinicio correcto |
| T3 | Limpieza del CSS por posición + tokens + escala tipográfica | Sin selectores por posición; capturas iguales en los 4 tamaños |
| T4 | Franja superior | ≤ 48 px; mismo componente para los dos bandos; cabe en 360 px con 4 cifras; aviso crítico único con alternativa sin movimiento |
| T5 | `InteractionMode` + Esc, clic derecho y «atrás» según §5.4 y §5.4.1 | Pruebas de todas las transiciones y de la tabla de eventos |
| T6 | Catálogo + barra B+ con plegado + barra como modo | Sin desbordes a 360 y 390 px, también con 11 elementos; 1 toque por pedido; Ejército no se cierra al pedir; ≥ 44 px, ≥ 8 px, ≥ 11 px |
| T7 | Venta en dos pasos + resalte | No se vende sin confirmar; reembolso mostrado = real |
| T8 | Botones de recompensa; se elimina el cajón | 6 estados en español; motivo junto al botón |
| T9 | Horizontal, tablet, márgenes seguros | Zona propia libre en horizontal; notch respetado |
| T10 | Textos y avisos anclados | Sin inglés en pantalla; sin ⚡ para el oro |
| T11 | Verificación, documentación y critique final | §7 y §8 completos; critique > 25/40; auditoría y referencia de rendimiento actualizadas; `graphify update .` |

**Orden:** T1-T3 son la base (sin ella, el HUD nuevo heredaría la reconstrucción por fotograma y el CSS en capas). La franja superior va antes que la barra porque solo muestra información y valida el presentador con poco riesgo; la barra, los modos y la venta tocan la entrada táctil, donde se concentran las regresiones.

## 13. Decisiones del autor (a revisar por el usuario)

1. La confirmación de venta va en la barra, no flotando sobre la estructura (§4.3).
2. Grupo abierto por defecto: Construir; después, el último usado (§5.3).
3. Las recompensas se activan con un toque, sin confirmación (§5.6).
4. Los nombres de las recompensas no tienen rótulo fijo; están en avisos y accesibilidad (§5.6). Se revisará si en dispositivo cuesta aprenderlas.
5. Se mantienen oro y CP del rival (§5.1).
6. La pausa sigue arriba en el centro, a 44 px (§5.1).
7. Tras vender se permanece en modo vender (§5.5).
8. Ubicación de módulos: presentador y catálogo en `web/src/ui/hud/`, `InteractionMode` junto a `GameInputController` (§6).
9. Qué eventos terminan un modo y cuáles lo conservan (tabla de §5.4): pausa, segundo plano, recompensas y giro lo conservan.
10. El catálogo de 11 elementos se prueba en una página solo de desarrollo, sin tocar el juego (§7.2).

## 14. Lo que queda para quien implemente

- Dibujo exacto de los iconos nuevos (tanque, generador, torreta, vender, categorías), en el estilo de trazo de `uiIcons.ts`.
- Valores exactos de color, radio y duración de animaciones, dentro de los tokens de §6.6.
- Nombres exactos de tipos y métodos, respetando las responsabilidades de §6.
