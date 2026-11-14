# Referencia de rendimiento de la versión actual (R0)

Fecha: 2026-11-14 · Base medida: `c66346a` más la instrumentación de R0 (panel `?diagnostics=1`), sin cambios de comportamiento del juego · Fase 0b del plan `docs/superpowers/specs/2026-11-14-ia-enemiga-ordenes-niebla-design.md`

Esta es la referencia con la que se compararán R1-R8 y las fases de la IA. Cada fase estructural repite **los mismos escenarios, en el mismo entorno y con el mismo procedimiento** (§6), y compara contra estas tablas.

---

## 1. Resumen

- **La IA no cuesta casi nada:** unos 0,03-0,04 ms por fotograma de media. Sí confirma la doble ejecución, medida por primera vez: **2,00 llamadas por fotograma y 1,40 decisiones/s en Normal**, el doble del intervalo configurado de 1,4 s (0,71/s esperado). Hay picos de 3-6 ms en ciclos que construyen un edificio (ver §5).
- **La simulación ECS es barata:** 0,1 ms en partida inicial y 0,5-0,9 ms en combate. El sistema más caro es la **búsqueda de objetivos** (0,23-0,36 ms en combate), que crece con unidades × objetivos.
- **El coste dominante en combate es el render:**
  - 9-16 ms de CPU por fotograma;
  - **200-317 draw calls**, por encima del objetivo de <100 de `AGENTS.md`;
  - **310-330 geometrías vivas**.

  Causa verificada en el código: cada barra de vida crea 3 geometrías nuevas (`create3DHealthBar`) y cada tanque o edificio crea las suyas, en lugar de compartirlas o instanciarlas.
- **No se observaron fugas en partidas repetidas:**
  - 3 combates seguidos en la misma página terminan con el mismo número de geometrías (105 en escritorio, 90 en móvil emulado);
  - una partida nueva posterior vuelve a 22-23, igual que una partida en una página recién cargada;
  - la memoria JS oscila entre 13 y 25 MB sin tendencia.
- **Hallazgo de juego, no de rendimiento:** con el jugador inactivo, la IA en Normal destruye su Nexo en unos **35-40 s**.

## 2. Entorno

**No es un dispositivo móvil real.** Es Chrome sin ventana sobre la GPU integrada de un portátil. Sirve para comparar versiones entre sí en las mismas condiciones; no demuestra el rendimiento en teléfonos ni tabletas.

| Campo | Valor |
|---|---|
| Navegador | Chrome 155 headless (`HeadlessChrome/155.0.0.0`, Linux x86_64) |
| GPU | `ANGLE (Intel, Vulkan 1.3.255 (Intel(R) UHD Graphics 620 (KBL GT2)), Intel open-source Mesa driver)`, WebGL2 |
| Flags de Chrome | `--enable-gpu --ignore-gpu-blocklist --use-angle=vulkan --enable-features=Vulkan` (sin ellas Chrome headless usa SwiftShader, render por software) |
| Servidor | `vite` en modo desarrollo; `?diagnostics=1&overlay=0` (sin panel durante la medición) |

| Perfil | Viewport | DPR del dispositivo → del renderer | Buffer de dibujo | Antialias | Sombras | Puntero |
|---|---|---|---|---|---|---|
| **Escritorio** | 1280×720 | 1 → 1 | 1280×720 | Sí | Sí | Fino |
| **Móvil emulado** | 412×915, `isMobile`, táctil | 2,625 → 1,5 | 618×1372 | No | No | Táctil (`coarse`) |

El perfil móvil activa la configuración táctil real del renderer (`ThreeRenderCoordinator`), pero sigue usando la CPU y GPU del portátil.

## 3. Escenarios

| Escenario | Qué hace | Calentamiento → medición |
|---|---|---|
| **Menú** | Cinemática del menú, sin partida | 0 → 10 s |
| **Partida** | `runMatchScenario`: partida real en Normal contra la IA, con el jugador inactivo | 5 s → 25 s |
| **Combate** | `runCombatScenario`: combate simétrico guionizado. IA desactivada, oro ilimitado; por bando 2 generadores, 4 barracas y 2 torretas; producción continua de 3 soldados por cada tanque | 10 s → 30 s |
| **Estrés** | `runStressScenario()` existente: 10 soldados, 3 torretas y 30 explosiones cada 200 ms | — |
| **Repetición** | 3 combates cortos (2 s → 8 s) seguidos en la misma página y después una partida corta | — |

Antes de cada escenario se recarga la página, salvo en el de repetición. La partida y el combate se ejecutan dos veces para ver su variación.

**Nota sobre la partida:** una primera ejecución con 60 s de medición se descartó. La partida terminaba a los ~35-40 s (derrota del jugador inactivo) y la medición mezclaba la secuencia final y el fin del bucle. Con 25 s, el Nexo del jugador sigue en pie al terminar en las cuatro ejecuciones (696, 864, 1200 y 768 de vida).

## 4. Resultados

Valores medios por fotograma salvo que se indique "máx." o "p95". "CPU total" es el trabajo JavaScript del fotograma (gameplay + envío del render). "Resto gameplay" es el trabajo de gameplay fuera de la simulación, la IA y los efectos: sincronización visual, actualización de la UI, recompensas y cámara.

### 4.1 Escritorio (1280×720, antialias y sombras)

| Métrica | Menú | Partida 1 | Partida 2 | Combate 1 | Combate 2 | Estrés |
|---|---:|---:|---:|---:|---:|---:|
| FPS | 55.0 | 43.1 | 48.1 | 34.9 | 34.8 | 39.3 |
| Fotograma medio (ms) | 18.20 | 23.21 | 20.79 | 28.65 | 28.77 | 25.46 |
| Fotograma p95 (ms) | 29.50 | 41.50 | 33.40 | 49.90 | 50.50 | 37.10 |
| Fotograma máx. (ms) | 47.0 | 77.8 | 89.6 | 231.9 | 108.5 | 147.2 |
| CPU total (ms) | 4.26 | 2.45 | 2.25 | 11.27 | 10.84 | 5.76 |
| CPU p95 (ms) | 8.50 | 5.70 | 5.10 | 24.90 | 23.00 | 10.30 |
| Simulación (ms) | 0.000 | 0.105 | 0.084 | 0.551 | 0.506 | 0.143 |
| Pasos fijos/fotograma | 0.00 | 0.70 | 0.62 | 0.85 | 0.87 | 0.76 |
| ECS consultas (ms) | 0.000 | 0.022 | 0.021 | 0.076 | 0.078 | 0.035 |
| ECS objetivos (ms) | 0.000 | 0.015 | 0.019 | 0.263 | 0.232 | 0.027 |
| ECS movimiento (ms) | 0.000 | 0.026 | 0.013 | 0.114 | 0.101 | 0.028 |
| ECS armas (ms) | 0.000 | 0.009 | 0.007 | 0.042 | 0.039 | 0.020 |
| ECS producción (ms) | 0.000 | 0.007 | 0.007 | 0.019 | 0.017 | 0.006 |
| ECS recursos (ms) | 0.000 | 0.009 | 0.007 | 0.011 | 0.011 | 0.007 |
| ECS proyectiles (ms) | 0.000 | 0.008 | 0.004 | 0.020 | 0.013 | 0.014 |
| IA (ms) | 0.0000 | 0.0325 | 0.0330 | 0.0038 | 0.0038 | 0.0024 |
| IA máx. (ms) | 0.00 | 4.80 | 3.40 | 0.10 | 0.30 | 0.10 |
| IA llamadas/fotograma | 0.00 | 2.00 | 2.00 | 0.00 | 0.00 | 0.00 |
| IA decisiones/s | 0.00 | 1.40 | 1.40 | 0.00 | 0.00 | 0.00 |
| Efectos (ms) | 0.000 | 0.012 | 0.011 | 0.296 | 0.260 | 0.222 |
| Resto gameplay (ms) | 0.000 | 0.407 | 0.392 | 1.128 | 1.133 | 0.583 |
| Render CPU (ms) | 4.22 | 1.81 | 1.66 | 9.22 | 8.87 | 4.71 |
| Render CPU p95 (ms) | 8.40 | 4.70 | 4.20 | 21.70 | 19.20 | 9.20 |
| Draw calls medios | 84.0 | 16.2 | 15.8 | 208.0 | 199.9 | 46.1 |
| Draw calls máx. | 84 | 21 | 19 | 307 | 292 | 54 |
| Triángulos medios | 3664 | 1632 | 1242 | 26502 | 25654 | 16610 |
| Triángulos máx. | 3664 | 3710 | 2894 | 40512 | 39760 | 23886 |
| Geometrías máx. | 95 | 23 | 23 | 328 | 315 | 52 |
| Texturas máx. | 1 | 1 | 1 | 1 | 1 | 1 |
| Objetos en escena máx. | 44 | 41 | 39 | 150 | 146 | 54 |
| Unidades visibles máx. | 0 | 13 | 10 | 33 | 32 | 10 |
| Proyectiles máx. | 0 | 4 | 2 | 16 | 14 | 10 |
| Partículas máx. | 0 | 0 | 0 | 458 | 469 | 327 |
| Entidades ECS (final) | – | 26 | 21 | 54 | 54 | 15 |
| Heap JS final (MB) | 21.8 | 12.0 | 11.5 | 26.2 | 17.3 | 17.3 |
| Muestras | 549 | 1077 | 1202 | 1047 | 1038 | 333 |

### 4.2 Móvil emulado (412×915, DPR 1,5, sin antialias ni sombras)

| Métrica | Menú | Partida 1 | Partida 2 | Combate 1 | Combate 2 | Estrés |
|---|---:|---:|---:|---:|---:|---:|
| FPS | 59.3 | 53.6 | 46.2 | 34.5 | 26.5 | 48.8 |
| Fotograma medio (ms) | 16.86 | 18.64 | 21.63 | 29.02 | 37.67 | 20.50 |
| Fotograma p95 (ms) | 22.80 | 30.00 | 41.40 | 44.30 | 76.50 | 31.80 |
| Fotograma máx. (ms) | 39.8 | 61.5 | 75.5 | 747.3 | 179.1 | 92.6 |
| CPU total (ms) | 2.45 | 2.04 | 2.36 | 13.28 | 19.21 | 4.05 |
| CPU p95 (ms) | 5.40 | 4.20 | 5.60 | 21.70 | 54.00 | 9.40 |
| Simulación (ms) | 0.000 | 0.074 | 0.103 | 0.522 | 0.861 | 0.127 |
| Pasos fijos/fotograma | 0.00 | 0.56 | 0.65 | 0.79 | 1.12 | 0.62 |
| ECS consultas (ms) | 0.000 | 0.019 | 0.028 | 0.077 | 0.153 | 0.029 |
| ECS objetivos (ms) | 0.000 | 0.011 | 0.018 | 0.236 | 0.359 | 0.027 |
| ECS movimiento (ms) | 0.000 | 0.008 | 0.016 | 0.093 | 0.172 | 0.016 |
| ECS armas (ms) | 0.000 | 0.005 | 0.012 | 0.048 | 0.091 | 0.033 |
| ECS producción (ms) | 0.000 | 0.008 | 0.007 | 0.023 | 0.033 | 0.003 |
| ECS recursos (ms) | 0.000 | 0.009 | 0.010 | 0.011 | 0.024 | 0.006 |
| ECS proyectiles (ms) | 0.000 | 0.003 | 0.007 | 0.023 | 0.018 | 0.006 |
| IA (ms) | 0.0000 | 0.0389 | 0.0385 | 0.0044 | 0.0018 | 0.0024 |
| IA máx. (ms) | 0.00 | 5.80 | 3.20 | 0.80 | 0.10 | 0.10 |
| IA llamadas/fotograma | 0.00 | 2.00 | 2.00 | 0.00 | 0.00 | 0.00 |
| IA decisiones/s | 0.00 | 1.40 | 1.40 | 0.00 | 0.00 | 0.00 |
| Efectos (ms) | 0.000 | 0.009 | 0.014 | 0.298 | 0.417 | 0.214 |
| Resto gameplay (ms) | 0.000 | 0.413 | 0.494 | 1.167 | 1.729 | 0.503 |
| Render CPU (ms) | 2.42 | 1.41 | 1.62 | 11.19 | 16.03 | 3.07 |
| Render CPU p95 (ms) | 5.40 | 3.10 | 4.30 | 18.30 | 44.60 | 6.00 |
| Draw calls medios | 46.6 | 11.6 | 15.3 | 198.3 | 216.8 | 44.9 |
| Draw calls máx. | 55 | 17 | 19 | 306 | 317 | 55 |
| Triángulos medios | 1954 | 613 | 1101 | 25128 | 26444 | 16293 |
| Triángulos máx. | 2328 | 1614 | 2430 | 37434 | 39400 | 24546 |
| Geometrías máx. | 95 | 21 | 22 | 309 | 325 | 51 |
| Texturas máx. | 0 | 0 | 0 | 0 | 0 | 0 |
| Objetos en escena máx. | 44 | 41 | 41 | 144 | 145 | 54 |
| Unidades visibles máx. | 0 | 5 | 9 | 29 | 31 | 10 |
| Proyectiles máx. | 0 | 0 | 2 | 15 | 13 | 10 |
| Partículas máx. | 0 | 0 | 0 | 432 | 449 | 331 |
| Entidades ECS (final) | – | 18 | 21 | 53 | 54 | 13 |
| Heap JS final (MB) | 14.1 | 11.5 | 12.4 | 19.7 | 22.5 | 23.3 |
| Muestras | 592 | 1340 | 1155 | 1034 | 796 | 414 |

### 4.3 Repetición (fugas)

| Perfil | Combate 1 | Combate 2 | Combate 3 | Partida nueva después |
|---|---|---|---|---|
| Escritorio: geometrías / texturas / objetos / heap | 105 / 1 / 66 / 17,5 MB | 105 / 1 / 65 / 17,3 MB | 105 / 1 / 63 / 24,8 MB | 23 / 1 / 30 / 13,7 MB |
| Móvil emulado: geometrías / texturas / objetos / heap | 90 / 0 / 66 / 16,6 MB | 90 / 0 / 63 / 17,5 MB | 90 / 0 / 63 / 16,6 MB | 22 / 0 / 30 / 19,6 MB |

Las geometrías y los objetos vuelven al valor de una partida recién iniciada (22-23 geometrías). El heap varía sin tendencia en tres repeticiones; para afirmar que no hay fugas de memoria JS harían falta sesiones de 10 minutos o más (`AGENTS.md` §7.1).

### 4.4 Observación preliminar en un teléfono Android real (no es referencia definitiva)

Dos lecturas del panel tomadas por el usuario durante una partida normal en su teléfono, en Chrome para Android, apuntando al servidor de desarrollo del portátil. Cada lectura resume unos 2 s, no un escenario controlado. Se conservan para compararlas con las mediciones posteriores; **no sustituyen a la referencia definitiva** del dispositivo (§9).

**Dispositivo:** Samsung Galaxy A05 (gama de entrada), con 6 GB de RAM, 128 GB de almacenamiento y Android 14, según el usuario.

**Condiciones que empeoran o distorsionan el resultado:**
- batería al 5 %, con posible ahorro de energía;
- el teléfono compartía internet con el portátil;
- panel visible;
- modo desarrollo.

| Métrica | Lectura 18:13 | Lectura 18:14 |
|---|---:|---:|
| FPS | 16,9 | 21,2 |
| Fotograma medio / p95 (ms) | 59,1 / 117,0 | 47,2 / 94,0 |
| CPU total (ms) | 23,00 | 11,00 |
| Simulación (ms) / pasos fijos por fotograma | 0,83 / 1,4 | 0,79 / 1,4 |
| IA (ms) / llamadas por fotograma / decisiones/s | 0,12 / 2,0 / 1,4 | 0,08 / 2,0 / 1,2 |
| Efectos / resto gameplay / render CPU (ms) | 0,61 / 1,59 / 19,56 | 0,58 / 2,02 / 7,35 |
| ECS: consultas · objetivos · movimiento · armas (ms) | 0,14 · 0,22 · 0,23 · 0,06 | 0,17 · 0,19 · 0,17 · 0,07 |
| Draw calls / triángulos / geometrías | 75 / 17,1k / 99 | 36 / 13,5k / 206 |
| Entidades ECS / proyectiles | 30 / 2 | 31 / 4 |
| Partículas / emisores | 197 de 256 / 12 de 12 | 134 de 420 / 9 de 12 |
| Heap JS | 14,5 MB | 14,5 MB |

El usuario observó **congelaciones breves** de la pantalla.

**Lectura de estos datos (inferencia, sin medición controlada):**

- **En el teléfono no se alcanzan 30 FPS** ni con una carga pequeña (~30 entidades).
- El fotograma (47-59 ms) es mucho más largo que el trabajo de CPU medido (11-23 ms). La mayor parte del tiempo se va fuera de JavaScript: GPU, compositor del navegador o limitación por batería y temperatura.
- **1,4 pasos fijos por fotograma** indican que la simulación va recuperando tiempo en casi cada fotograma.
- **Los p95 de 94-117 ms** encajan con las congelaciones percibidas.
- **El render CPU** (7-20 ms) es entre 5 y 10 veces el del portátil con escenas parecidas.
- **Los emisores llegan a su tope** (12 de 12) en la lectura más lenta, que también es la de más draw calls (75).
- **206 geometrías con solo 36 draw calls** sugieren muchos objetos vivos fuera de cámara, como restos y barras de vida. Hay que vigilarlo en sesiones largas; la prueba de repetición del portátil no mostró crecimiento.

**Segunda tanda de lecturas (18:45, mismo teléfono, código de R1).** Condiciones también preliminares: batería al 23 % y el teléfono seguía compartiendo internet. Combates más grandes que en la primera tanda.

| Métrica | Combate grande | Combate medio | Menú tras la partida |
|---|---:|---:|---:|
| FPS | 14,0 | 19,7 | 48,0 |
| Fotograma medio / p95 (ms) | 71,7 / 156,3 | 50,7 / 117,1 | 20,8 / 33,6 |
| CPU total (ms) | 18,38 | 12,58 | 9,10 |
| Simulación (ms) / pasos fijos por fotograma | 1,84 / 1,9 | 1,10 / 1,5 | 0 / 0 |
| IA (ms) / llamadas por fotograma / decisiones/s | 0,14 / 2,0 / 1,4 | 0,10 / 2,0 / 1,3 | — |
| Efectos / resto gameplay / render CPU (ms) | 0,91 / 2,82 / 12,45 | 0,57 / 1,76 / 8,86 | 0 / 0 / 9,02 |
| ECS: consultas · objetivos · movimiento · armas (ms) | 0,35 · 0,56 · 0,50 · 0,17 | 0,21 · 0,34 · 0,31 · 0,09 | — |
| Draw calls / triángulos / geometrías | 85 / 18,1k / 185 | 71 / 16,9k / 183 | 67 / 3,4k / 113 |
| Entidades / proyectiles | 44 / 8 | 35 / 3 | — |
| Partículas / emisores | 224 de 260 / 12 de 12 | 223 de 248 / 12 de 12 | 0 de 267 / 0 de 12 |
| Heap JS | 17,4 MB | 17,4 MB | 17,4 MB |

**Lectura (inferencia salvo donde se indica):**

- **El fotograma excede al trabajo de CPU en 38-53 ms.** Las capturas muestran grandes efectos semitransparentes que cubren buena parte de la pantalla (onda de choque amarilla y humo oscuro), con los emisores al tope (12 de 12).
- **Hipótesis principal:** el teléfono está limitado por la GPU por el sobredibujado de esos efectos. No está verificado. Para confirmarlo haría falta comparar la misma escena variando el pixel ratio o desactivando efectos, una herramienta de diagnóstico que aún no existe.
- **Picos de fotograma.** Con fotogramas de más de 100 ms (p95 de 117-156 ms), el tope de 0,1 s por fotograma y de 3 pasos fijos (verificado en `GameFrameLoop` y `BattleSimulation`) hace que la batalla avance más despacio que el tiempo real durante esos picos. Es coherente con las congelaciones percibidas.
- **En la CPU del teléfono** la búsqueda de objetivos cuesta 0,56 ms con 44 entidades, frente a 0,23 ms con 54 en el portátil. Es unas 3 veces más lento por entidad, y el render CPU unas 5-8 veces.
- **El menú renderiza la escena 3D a pleno ritmo** (9 ms de render CPU, 48 FPS). `AGENTS.md` pide evitarlo; queda para las fases de render.
- **Las 113 geometrías del menú no indican una fuga.** Verificado en el portátil con el perfil móvil emulado: tras tres partidas seguidas, volviendo al menú cada vez, el menú tuvo 80, 76, 71 y 38 geometrías. El pico dentro de cada partida fue 117-119. El valor del menú depende de qué objetos ya se han dibujado con el giro de la cámara.

**Tercera tanda de lecturas (19:02-19:06, mismo teléfono, panel en vivo durante partidas normales, no el experimento de §9).** Condiciones aún preliminares:
- batería al 31-32 %;
- el icono de la barra de estado parece indicar ahorro de energía activo (sin confirmar);
- el teléfono se conectaba al portátil en 10.132.51.103 sin acceso a internet.

| Métrica | 19:03 (Centro de mando abierto) | 19:03 (Centro de mando abierto) | 19:06 (cerrado) | 19:02 (menú) |
|---|---:|---:|---:|---:|
| FPS | 14,1 | 13,0 | 20,1 | 59,1 |
| Fotograma medio / p95 (ms) | 71,1 / 168,4 | 76,9 / 190,2 | 49,7 / 105,7 | 16,9 / 23,0 |
| CPU total / render CPU (ms) | 22,79 / 17,73 | 21,10 / 16,33 | 13,52 / 9,56 | 5,08 / 4,99 |
| Simulación (ms) / pasos fijos por fotograma | 1,47 / 1,9 | 1,66 / 2,0 | 0,94 / 1,5 | 0 / 0 |
| IA: llamadas por fotograma / decisiones/s | 2,0 / 1,4 | 2,0 / 1,5 | 2,0 / 1,5 | — |
| Draw calls / triángulos / geometrías | 111 / 20,5k / 144 | 84 / 15,2k / 105 | 70 / 19,3k / 196 | 31 / 1,3k / 95 |
| Entidades / partículas / emisores | 35 / 189 / 10 de 12 | 37 / 164 / 12 de 12 | 31 / 194 / 11 de 12 | — |

**Pista nueva: el Centro de mando abierto.** Con el panel de construcción desplegado, el render CPU fue de 16-18 ms, frente a 9,6 ms con el panel cerrado y una carga de entidades parecida.

- **Verificado en el código:** el panel abierto (`.game-controls-content`) usa `backdrop-filter: blur(14-16px)` sobre el canvas WebGL. Los paneles de estado de los Nexos (`.game-faction-status`, `blur(10px)`) y el botón del panel (`blur(12px)`) también usan desenfoque y están siempre visibles durante la partida (`style.css`).
- **Inferencia, sin medir:** desenfocar en cada fotograma un fondo que cambia sin parar es caro para la GPU de un móvil de entrada. Cuando la GPU va saturada, las llamadas WebGL esperan, y esa espera aparece como render CPU.
- **Pendiente:** confirmarlo con una comparación controlada, la misma escena con y sin desenfoque. Lo que hay ahora son lecturas en vivo de escenas distintas.
- **Al medir el experimento de §9 hay que mantener cerrado el Centro de mando** para que la interfaz no altere las comparaciones.

**La doble ejecución de `updateEnemyAI` se confirma también en el dispositivo real** (2,0 llamadas por fotograma). Se corregirá en R2, en un cambio aislado con pruebas de los intervalos de decisión.

### 4.5 Experimento de cuello de botella en el Galaxy A05 (preliminar)

El usuario ejecutó la matriz de §9 entre las 19:18 y las 19:29 con el combate guionizado (`scenario=combat`), cuyo resultado queda fijo en el panel.

**Condiciones aún preliminares:**
- una sola ejecución por prueba;
- batería al 27-29 %, con el icono que parece de ahorro de energía;
- conexión al portátil en 10.132.51.103;
- modo desarrollo.

Lo comprobado: GPU `ANGLE (ARM, Mali-G52 MC2, OpenGL ES 3.2)`, IA desactivada en el escenario y una carga similar en todas las pruebas (53-59 entidades y 185-203 draw calls).

| Prueba | Buffer | Fotograma medio / p95 (ms) | FPS | CPU total (ms) | Render CPU (ms) | Simulación (ms) / pasos | Draw calls | Triángulos |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Referencia (dpr 1,5) | 576×1044 | 53,3 / 110,8 | 18,8 | 23,47 | 18,45 | 1,63 / 1,5 | 194 | 25,6k |
| `dpr=1` | 384×696 | 44,1 / 96,0 | 22,7 | 20,74 | 16,23 | 1,27 / 1,3 | 198 | 25,8k |
| `dpr=0.75` | 288×522 | 38,6 / 79,3 | 25,9 | 18,67 | 14,55 | 1,13 / 1,1 | 203 | 26,2k |
| `shockwaves=0` | 576×1044 | 55,6 / 115,5 | 18,0 | 23,91 | 18,55 | 1,73 / 1,6 | 195 | 25,3k |
| `smoke=0` | 576×1044 | 55,2 / 105,8 | 18,1 | 23,63 | 18,25 | 1,80 / 1,6 | 190 | 16,7k |
| `blur=0` | 576×1044 | 57,8 / 99,3 | 17,3 | 24,13 | 18,71 | 1,74 / 1,7 | 185 | 25,1k |
| Todo reducido (dpr 0,75 sin ondas, humo ni desenfoque) | 288×522 | 34,5 / 60,1 | 28,9 | 16,67 | 13,16 | 0,89 / 1,0 | 191 | 16,2k |

**Lectura (las magnitudes son de una sola ejecución; la dirección es lo fiable):**

1. **Ondas de choque, humo y desenfoque no son el cuello de botella** en este escenario. Quitar cada uno deja el fotograma entre 53 y 58 ms, dentro de la variación entre pruebas. El humo sí reduce mucho los triángulos (25,6k → 16,7k) sin mejorar el tiempo.
2. **La resolución pesa, pero no es la causa principal.**
   - Con 2,25 veces menos píxeles (`dpr=1`), el fotograma baja un 17 %. Con 4 veces menos (`dpr=0.75`), baja un 28 %.
   - Si el relleno de píxeles mandara, bajaría casi en proporción.
   - Ajustando los tres puntos, queda un **coste fijo de unos 33-36 ms por fotograma** que no depende de la resolución.
3. **Ese coste fijo coincide con las ~190-200 llamadas de dibujo**, que no cambian en ninguna prueba.
   - Incluso con todo reducido, el render CPU sigue en 13 ms y el fotograma en 34,5 ms, justo por encima del presupuesto de 30 FPS (33,3 ms).
   - El render CPU también baja con la resolución (18,5 → 14,6 ms). Indica que parte de ese tiempo es espera de la GPU, que bloquea las llamadas WebGL.
   - **Inferencia, sin medir directamente:** el principal limitador en este teléfono es el coste por llamada de dibujo (CPU del navegador y del driver), con el relleno de píxeles como segundo factor.
   - **Origen de esas llamadas (verificado en el código):** tanques, edificios y barras de vida usan mallas propias y no compartidas. Cada barra de vida son 3 mallas. Los soldados sí están instanciados (§5.3).
4. **La simulación y la IA no son el problema:** 0,9-1,8 ms y 0,01 ms. Los más de 1 pasos fijos por fotograma son consecuencia de fotogramas largos, no su causa.

**Comprobación con `bars=0` (19:41 y 19:43, misma sesión, una ejecución cada una, batería al 24-25 %):**

| Prueba | Draw calls | Fotograma medio / p95 (ms) | CPU total (ms) | Render CPU (ms) | Entidades |
|---|---:|---:|---:|---:|---:|
| `dpr=0.75` con barras (§4.5) | 203 | 38,6 / 79,3 | 18,67 | 14,55 | 56 |
| `dpr=0.75&bars=0` | 154 | 37,0 / 77,6 | 16,87 | 12,68 | 59 |
| Referencia dpr 1,5 con barras (§4.5) | 194 | 53,3 / 110,8 | 23,47 | 18,45 | 54 |
| `bars=0` (dpr 1,5) | 150 | 60,8 / 118,9 | 24,76 | 18,44 | 59 |

**Conclusión del diagnóstico:**

1. **La hipótesis de las llamadas de dibujo no se confirma como causa principal.** Quitar las barras elimina un 23-24 % de las llamadas, pero el fotograma no cambia de forma apreciable: −4 % a dpr 0,75, y un aumento dentro del ruido a dpr 1,5, con más entidades y menos batería. Cada llamada cuesta CPU (unos 40 µs, según la bajada de 1,9 ms del render CPU a dpr 0,75), pero no lo bastante para explicar el coste fijo.
2. **Ningún interruptor aislado explica el coste fijo:** ni ondas, ni humo, ni desenfoque, ni barras. Solo la resolución mueve el fotograma de forma clara (−17 % y −28 %).
3. **Interpretación más probable (inferencia):**
   - el teléfono está limitado en conjunto por su CPU: el JavaScript ocupa 17-25 ms por fotograma, con el envío del render como mayor parte, incluso con todo reducido;
   - el refresco de pantalla redondea los fotogramas a múltiplos de 16,7 ms, así que un trabajo de ~17-20 ms se convierte en fotogramas de 33 ms o más. Encaja con los ~34-38 ms observados en las configuraciones más ligeras;
   - con la resolución por defecto, la GPU añade su parte.
4. **Qué implica:** no hay una corrección única y barata. Mejorar el teléfono pediría varias reducciones a la vez en CPU y en render: menos objetos y llamadas en general (instanciar tanques y edificios), menos trabajo de JavaScript por fotograma (la UI se actualiza en cada fotograma, ver la auditoría) y quizá una resolución adaptativa en móviles débiles. Queda como trabajo de render pendiente, fuera de las fases actuales.
5. **Decisión del usuario:** el diagnóstico queda cerrado sin un culpable único y se continúa con las fases R. En este escenario hay unas 37 barras (tanques, edificios y Nexos), de 3 mallas cada una: hasta ~110 llamadas si todas están en cámara, menos con el recorte por cámara. Las correcciones que se derivan son trabajo de render y quedan fuera de las fases actuales: instanciar tanques, edificios y barras, y quizá una resolución adaptativa en móviles débiles.

## 5. Lectura de los resultados

1. **Doble ejecución de la IA confirmada con datos.** 2,00 llamadas por fotograma y 1,40 decisiones/s en Normal frente a 0,71/s configuradas. Es la cifra que la fase 1 debe llevar a 1 llamada por fotograma y al intervalo que se acuerde.
2. **Picos de la IA (3-6 ms).** La media de la IA es despreciable, pero sus máximos coinciden con ciclos en los que construye. **Inferencia:** el coste es crear mallas y barras de vida dentro de `spawnAIBuilding`, la mezcla IA-render señalada en la auditoría. La fase 1 lo hará visible por separado al sacar la creación visual de la decisión.
3. **El render manda en combate.** Con unas 30 unidades visibles, el render ocupa el 70-85 % del trabajo de CPU y los draw calls (200-317) triplican el objetivo de <100. **Verificado en el código:**
   - `create3DHealthBar` crea 3 `PlaneGeometry` nuevas por barra;
   - `createTankMesh` y las fábricas de edificios crean geometrías y materiales propios por instancia;
   - los soldados sí están instanciados (`InstancedSoldierRenderer`).

   **Inferencia, sin medir por separado:** atribuir la mayoría de los draw calls a tanques, edificios y barras de vida.
4. **La búsqueda de objetivos es el sistema ECS más caro** y el que más crece con la batalla. Hoy sigue por debajo de 0,4 ms. Es el candidato a una rejilla espacial **solo si** las órdenes globales o el límite de población aumentan mucho el número de entidades.
5. **Picos de fotograma aislados** (hasta 232 ms en escritorio y 747 ms en móvil emulado durante el combate). **Inferencia:** compilación de shaders o creación de materiales la primera vez que aparece un tipo de efecto o restos, o pausas de recolección de memoria. No se ha verificado.
6. **Variación entre ejecuciones.** En el combate del perfil móvil, la segunda ejecución fue un 30 % más lenta que la primera (37,7 frente a 29,0 ms por fotograma), con la misma carga de entidades. Por eso las comparaciones futuras deben usar al menos dos ejecuciones por escenario y fijarse en la tendencia, no en una sola cifra.

## 6. Cómo repetir la medición

1. `npx vite --config vite.config.js --port 5179 --strictPort`
2. Abrir Chrome headless con los flags de §2 (el perfil móvil añade el viewport 412×915, `deviceScaleFactor` 2,625, `isMobile` y táctil) en `http://localhost:5179/?diagnostics=1&overlay=0`.
3. Para cada escenario, recargar la página y evaluar en la consola:

```js
// Menú
__gameDiagnostics.reset(); await new Promise(r => setTimeout(r, 10000)); __gameDiagnostics.read();
// Partida (dos ejecuciones)
await __gameDiagnostics.runMatchScenario({ difficulty: 'normal', warmupSeconds: 5, durationSeconds: 25 });
// Combate (dos ejecuciones)
await __gameDiagnostics.runCombatScenario({ barracksPerSide: 4, warmupSeconds: 10, durationSeconds: 30 });
// Estrés
await __gameDiagnostics.runStressScenario();
// Entorno, para el informe
__gameDiagnostics.environment();
```

4. Para la repetición: tres `runCombatScenario({ warmupSeconds: 2, durationSeconds: 8 })` seguidos sin recargar, y después `runMatchScenario({ warmupSeconds: 1, durationSeconds: 2 })`.

Esta referencia se tomó automatizando esos pasos con `playwright-cli` (herramienta local, no es dependencia del proyecto).

## 7. Limitaciones

- **Las tablas 4.1-4.3 no se midieron en dispositivos reales.** La única observación en un teléfono (§4.4) no es un escenario controlado. Los FPS de Chrome headless no representan un teléfono, y el ritmo de fotogramas en headless es irregular: incluso el menú, con 2-4 ms de trabajo, no llega a 60 FPS estables.
- **No se mide el tiempo de GPU.** `renderMs` es el tiempo de CPU para enviar el fotograma. La diferencia entre "fotograma" y "CPU total" incluye espera de GPU, sincronización vertical y la planificación del navegador, sin poder separarlas.
- **Sobrecoste de la propia medición.** El tiempo por sistema ECS añade lecturas de reloj dentro de `simulationMs`; no se ha cuantificado aparte.
- **Escenarios no deterministas.** La partida contra la IA depende de `Math.random`, y el combate depende de la duración real de los fotogramas.
- **Medido en modo desarrollo.** Vite sin minificar y sin el build de producción, que es lo que ejecuta Capacitor. La referencia compara versiones entre sí en las mismas condiciones; no es un valor absoluto.
- **Sesiones cortas.** No se han ejecutado sesiones de 10 minutos, pruebas térmicas ni cambios de orientación.

## 8. Comparaciones posteriores

### 8.1 R1 — tabla única de edificios

Cambio medido: el coste y la vida de los edificios y del Nexo pasan a una tabla compartida (`game/definitions/structures.ts`). No cambia ningún valor. Se repitió la batería de §6 con los mismos perfiles. La única diferencia es que la partida mide 25 s, igual que la referencia final.

| Escenario · perfil | Métrica | R0 (1 / 2) | R1 (1 / 2 / 3) |
|---|---|---:|---:|
| Combate · escritorio | Fotograma (ms) | 28,65 / 28,77 | 46,43 / 29,01 / 34,77 |
| | CPU (ms) | 11,27 / 10,84 | 24,82 / 11,64 / 14,62 |
| | Render CPU (ms) | 9,22 / 8,87 | 20,57 / 9,61 / 12,11 |
| | Draw calls · geometrías máx. | 208 · 328 / 200 · 315 | 220 · 327 / 211 · 321 / 202 · 328 |
| Combate · móvil emulado | Fotograma (ms) | 29,02 / 37,67 | 26,30 / 24,85 |
| | CPU (ms) | 13,28 / 19,21 | 11,17 / 10,65 |
| | Draw calls · geometrías máx. | 198 · 309 / 217 · 325 | 215 · 328 / 216 · 337 |
| Partida · escritorio | Fotograma · CPU (ms) | 23,21 · 2,45 / 20,79 · 2,25 | 34,15 · 3,28 / 19,97 · 2,75 / 24,35 · 2,43 |
| Partida · móvil emulado | Fotograma · CPU (ms) | 18,64 · 2,04 / 21,63 · 2,36 | 19,43 · 2,14 / 21,67 · 2,10 |
| Partida · ambos perfiles | IA llamadas/fotograma · decisiones/s | 2,00 · 1,40 | 1,95-2,00 · 1,40-1,44 |
| Estrés · escritorio / móvil emulado | Fotograma (ms) · draw calls · geometrías | 25,46 · 46,1 · 52 / 20,50 · 44,9 · 51 | 25,55 · 46,1 · 52 / 21,17 · 44,5 · 51 |

Repetición en R1: tres combates seguidos terminan con 105 geometrías (escritorio) y 90-92 (móvil emulado), y la partida nueva posterior vuelve a 22-23, igual que en R0.

**Conclusión:**

- **Sin cambios atribuibles a R1.** Las métricas estructurales (draw calls, geometrías, unidades, llamadas y decisiones de la IA) coinciden con R0 dentro de la variación de la propia batalla.
- **Los tiempos de escritorio tuvieron un valor atípico** en la primera ejecución de combate y de partida. Al repetirlas (ejecución 3) los valores quedaron cerca de R0. El portátil tenía una carga media de ~6 durante la medición.
- **Por qué no puede ser R1:** el cambio solo sustituye constantes por la misma constante leída de una tabla, sin coste por fotograma.
- **Lección para próximas fases:** en esta máquina, los tiempos absolutos varían hasta un 2× entre ejecuciones. Para decidir si una fase mejora o empeora, las métricas estructurales son fiables; los tiempos requieren al menos tres ejecuciones con la máquina en reposo.
- **Nota de juego, no de rendimiento:** en una partida de escritorio el jugador inactivo perdió antes de los 30 s (al final ya no quedaba simulación). En R0 las cuatro partidas medidas seguían vivas. La IA depende de `Math.random`, así que la duración varía entre partidas.

### 8.2 R2 — IA fase 1 (una ejecución por fotograma y decisión pura)

Cambio medido:
- la IA enemiga se ejecuta **una vez por fotograma** con `DecisionClock`, a intervalos de 1,25 / 0,7 / 0,35 s;
- decide en `game/ai/` con `decideEnemyTurn`;
- el recuento de estructuras ya no se hace en cada fotograma, solo cuando decide.

Misma batería de §6 y mismos perfiles. Carga media del portátil durante la medición: ~5 (§8.1).

| Escenario · perfil | Métrica | R0 (1 / 2) | R2 (1 / 2) |
|---|---|---:|---:|
| Partida · escritorio | IA llamadas/fotograma · decisiones/s | 2,00 · 1,40 / 2,00 · 1,40 | 1,00 · 1,40 / 1,00 · 1,40 |
| | IA media / máx. (ms) | 0,0325 / 4,8 · 0,0330 / 3,4 | 0,0300 / 4,4 · 0,0223 / 7,7 |
| | Fotograma · CPU (ms) | 23,21 · 2,45 / 20,79 · 2,25 | 26,51 · 3,09 / 20,59 · 2,58 |
| | Draw calls · geometrías máx. | 16,2 · 23 / 15,8 · 23 | 11,7 · 22 / 12,3 · 22 |
| Partida · móvil emulado | IA llamadas/fotograma · decisiones/s | 2,00 · 1,40 / 2,00 · 1,40 | 1,00 · 1,40 / 1,00 · 1,40 |
| | IA media / máx. (ms) | 0,0389 / 5,8 · 0,0385 / 3,2 | 0,0212 / 3,5 · 0,0239 / 9,7 |
| | Fotograma · CPU (ms) | 18,64 · 2,04 / 21,63 · 2,36 | 22,95 · 2,33 / 17,86 · 2,10 |
| Combate · escritorio (IA desactivada) | Fotograma · CPU (ms) | 28,65 · 11,27 / 28,77 · 10,84 | 33,80 · 13,94 / 31,35 · 12,28 |
| | Draw calls · geometrías máx. | 208 · 328 / 200 · 315 | 208 · 322 / 211 · 323 |
| Combate · móvil emulado (IA desactivada) | Fotograma · CPU (ms) | 29,02 · 13,28 / 37,67 · 19,21 | 27,74 · 10,88 / 32,24 · 15,01 |
| | Draw calls · geometrías máx. | 198 · 309 / 217 · 325 | 211 · 331 / 191 · 331 |
| Estrés · escritorio / móvil emulado (IA desactivada) | Fotograma (ms) · draw calls · geometrías | 25,46 · 46,1 · 52 / 20,50 · 44,9 · 51 | 29,10 · 46,5 · 52 / 29,55 · 45,3 · 51 |
| Menú · escritorio / móvil emulado (sin IA) | Fotograma (ms) · draw calls | 18,20 · 84 / 16,86 · 46,6 | 27,03 · 84 / 17,93 · 47,1 |

Repetición en R2: tres combates seguidos terminan con 101-105 geometrías (escritorio) y 90 (móvil emulado), y la partida nueva posterior vuelve a 22-23, igual que en R0 y R1.

Comprobación por dificultad (móvil emulado, partida de 25 s, una ejecución): 1,00 llamadas por fotograma en las tres. Las decisiones por segundo fueron 0,80 (Fácil), 1,40 (Normal) y 2,84 (Difícil), frente a los intervalos de 1,25 / 0,7 / 0,35 s. La IA construyó generadores, barracas y torretas y entrenó tropas, sin errores de consola.

**Conclusión:**

- **Corrección verificada:** la IA pasa de 2 a 1 ejecución por fotograma en escritorio, en el móvil emulado y en las tres dificultades.
- **El ritmo de decisión se conserva:** 1,40 decisiones/s en Normal, igual que en R0. El +2 % previsto por conservar el sobrante del acumulador (§6.4 del diseño) queda dentro de la resolución de la medición y no se observa.
- **Sin cambios estructurales:** draw calls, geometrías, unidades y repetición sin crecimiento coinciden con R0.
- **El coste medio de la IA baja** (de 0,033-0,039 a 0,021-0,030 ms), coherente con quitar la segunda llamada y el recuento por fotograma. **No se presenta como una mejora significativa:** es menos de 0,02 ms por fotograma y los tiempos de esta medición son ruidosos.
- **Los picos de la IA (3-10 ms) siguen.** Corresponden a los turnos en que construye, porque la ejecución de la orden crea mallas dentro del tiempo medido de la IA (§5.2). La decisión ya no crea mallas, pero `spawnAIBuilding` sí, y sale de la IA con R4 (comandos compartidos).
- **Los tiempos de fotograma y de CPU variaron hasta un 45 %** también en escenarios que R2 no toca (menú, combate y estrés, con la IA desactivada o ausente), con el portátil cargado. Esas variaciones son ruido de la máquina, no efecto de R2.

## 9. Próximos pasos de medición

- **Referencia definitiva en el Samsung Galaxy A05 de §4.4**, con el procedimiento de §6 y estas condiciones (decisión del usuario):
  - batería suficiente;
  - ahorro de energía desactivado;
  - sin compartir conexión;
  - temperatura normal del dispositivo.

  Se compararán los resultados con las lecturas preliminares de §4.4.
- **Experimento de cuello de botella en el Galaxy A05**, con las mismas condiciones. Responde si el teléfono va lento por resolución, por ondas de choque, por humo o por otra causa.
  - **Cómo se mide:** cada fila es una URL que ejecuta el combate guionizado sola y deja el resultado fijo en el panel. Se repite tres veces y se guarda una captura de cada resultado.
  - **Cómo se conecta el teléfono:** sin compartir conexión, al servidor del portátil por USB (`adb reverse tcp:5173 tcp:5173` y `http://localhost:5173/…`) o por una red Wi-Fi común.

  | Prueba | URL (después de `/?diagnostics=1`) | Qué responde |
  |---|---|---|
  | Referencia | `&scenario=combat` | Punto de partida |
  | Resolución 1,0 | `&scenario=combat&dpr=1` | ¿Pesa la resolución? |
  | Resolución 0,75 | `&scenario=combat&dpr=0.75` | ¿Escala con los píxeles? |
  | Sin ondas de choque | `&scenario=combat&shockwaves=0` | ¿Pesan las ondas? |
  | Sin humo | `&scenario=combat&smoke=0` | ¿Pesa el humo? |
  | Sin desenfoque de la interfaz | `&scenario=combat&blur=0` | ¿Pesa el `backdrop-filter` de los paneles sobre el canvas? |
  | Todo reducido | `&scenario=combat&dpr=0.75&shockwaves=0&smoke=0&blur=0` | ¿Queda algo cuando se quita todo? |
  | Sin barras de vida | `&scenario=combat&bars=0` | ¿Pesan las llamadas de dibujo? (§4.5) |
  | Resolución 0,75 sin barras | `&scenario=combat&dpr=0.75&bars=0` | ¿Cuánto queda del coste fijo con menos llamadas? |

  **Comprobación de `bars=0` en el portátil** (perfil móvil emulado, combate guionizado, una ejecución): las llamadas de dibujo bajan de 205 a 157 (−23 %) y las geometrías de 316 a 235, con una carga parecida (54-57 entidades). El fotograma apenas cambia (25,3 → 24,5 ms), lo esperable en una máquina que no está limitada por llamadas.

  **Cómo leerlo en el teléfono:** si `bars=0` reduce el fotograma de forma clara (del orden de una cuarta parte del coste fijo de ~33-36 ms), la hipótesis de las llamadas de dibujo queda confirmada. Si apenas cambia, hay que buscar el coste fijo en otra parte.

  **Lectura del resultado:**
  - Si el fotograma baja casi en proporción a los píxeles, el cuello de botella es el relleno de píxeles de la GPU.
  - Si baja mucho sin ondas o sin humo, es el sobredibujado de ese efecto; si baja mucho sin desenfoque, es la composición de la interfaz sobre el canvas.
  - Si baja poco con todo reducido, queda por investigar: llamadas de dibujo (barras de vida y tanques no instanciados), luces dinámicas de los incendios y destellos o el propio navegador.
  - En todas las pruebas: no tocar la pantalla y no abrir el Centro de mando.

  Cualquier corrección será una fase aparte, con aprobación.

  Comprobación de la herramienta (no es una medición): la URL "todo reducido" en el portátil con el perfil móvil emulado terminó con el resultado fijo esperado (dpr 0,75 → buffer 309×686, ondas no, humo no).
- Repetir los escenarios en al menos un Android de gama baja y uno de gama media, con el build de producción en Capacitor. Requiere permitir el panel fuera de `DEV`, una decisión que queda abierta.
- Una sesión de 10 minutos del escenario de combate para confirmar la ausencia de crecimiento de memoria.
