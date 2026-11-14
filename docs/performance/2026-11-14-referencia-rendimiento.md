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

### 4.4 Observación en un teléfono Android real (no comparable con las tablas anteriores)

Dos lecturas del panel tomadas por el usuario durante una partida normal en su teléfono, en Chrome para Android, apuntando al servidor de desarrollo del portátil. Cada lectura resume unos 2 s, no un escenario controlado.

**Condiciones que empeoran o distorsionan el resultado:**
- modelo del teléfono sin registrar;
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

Para que esta medición sea comparable hace falta repetir el procedimiento de §6 en ese teléfono, con batería suficiente y sin compartir internet, y registrar el modelo.

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

## 8. Próximos pasos de medición (no incluidos en R0)

- Repetir los escenarios en al menos un Android de gama baja y uno de gama media, con el build de producción en Capacitor. Requiere permitir el panel fuera de `DEV`, una decisión que queda abierta.
- Una sesión de 10 minutos del escenario de combate para confirmar la ausencia de crecimiento de memoria.
