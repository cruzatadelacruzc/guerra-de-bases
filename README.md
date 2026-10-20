# Guerra de Bases

Juego de estrategia 3D web empaquetable como aplicación Android con Capacitor. El original `index .html` se conserva como referencia; la versión de la aplicación vive en `web/`.

## Requisitos

- Node.js 20 o posterior
- JDK 17
- Android Studio con Android SDK instalado y `ANDROID_HOME` o `ANDROID_SDK_ROOT` configurado

## Ejecutar y compilar la web

```sh
npm install
npm run dev
npm run build
```

Las dependencias de Three.js, OrbitControls, las fuentes y el CSS se incluyen en el paquete; la partida no necesita descargar recursos de CDN.

## Arquitectura del juego

La partida arranca con dos Nexos opuestos y sin soldados gratuitos. El Nexo es el centro de mando y determina la derrota cuando es destruido; no produce unidades. Las Barracas son fábricas: la orden manual de entrenamiento requiere una Barraca viva y oro suficiente. La IA también solicita unidades solo desde sus Barracas y tras comprobar sus recursos. No hay producción automática por temporizador.

- `web/src/game/ecs/` contiene el mundo ECS tipado, componentes de bases, fábricas, unidades y estructuras, la autorización de solicitudes de producción, targeting, movimiento, daño y simulación con paso fijo. Los módulos de gameplay no importan Three.js.
- `web/src/rendering/` contiene adaptadores Three.js: los fusileros compatibles comparten geometría/materiales mediante `InstancedMesh`; proyectiles y efectos visuales reutilizan recursos con límites de actividad y ciclos de vida finitos.
- `web/index.html` inicializa y coordina la aplicación, la escena, la cámara, la interfaz y la sincronización entre ECS y rendering. La cámara, la escena y los recursos de rendering no pertenecen al ECS.

Se conserva el ECS propio en lugar de migrar a bitECS. Para el alcance actual (decenas de unidades), el ECS compacto con componentes tipados y consultas reutilizables cubre las necesidades sin añadir una dependencia ni resolver un problema que no era el cuello de botella observado. El coste dominante era la representación: cada fusilero y sus barras generaban objetos y draw calls independientes. La instanciación ataca esa causa directamente; cambiar de ECS por sí solo no habría optimizado el rendering.

## Diagnóstico y medición de rendimiento

El benchmark usa Chromium headless en el contenedor, con la misma configuración antes y después y escenarios de 2, 15, 30 y 60 fusileros. Los promedios posteriores tienen solo 5–7 muestras por escenario. El intervalo entre frames registrado fue de aproximadamente 371–527 ms incluso con pocos soldados, por lo que el scheduler del navegador headless no ofrece una medida fiable de FPS o frame time de un dispositivo. La comparación de abajo sirve para el coste interno medido y los draw calls, no para afirmar una tasa real de FPS. No se probó en teléfonos o tablets.

| Soldados | Draw calls antes → después | Render antes → después (ms) | Gameplay antes → después (ms) |
|---:|---:|---:|---:|
| 2  | 36 → 21.7   | 11.1 → 3.23 | 6.4 → 3.96 |
| 15 | 164 → 54    | 17.5 → 6.52 | 7.3 → 7.40 |
| 30 | 359 → 86    | 19.2 → 7.42 | 12.1 → 15.74 |
| 60 | 609 → 124.7  | 51.2 → 5.90 | 44.4 → 17.08 |

La reducción de draw calls fue aproximadamente del 40 %, 67 %, 76 % y 80 %, respectivamente; el tiempo de render medido también bajó en los cuatro escenarios. El gameplay medido no mejoró de forma uniforme: aumentó ligeramente a 15 unidades y más visiblemente a 30, aunque bajó a 60. Por tanto, estos datos respaldan la mejora del cuello de botella de rendering, pero no demuestran que todos los escenarios alcancen 60 FPS (16,7 ms) o 30 FPS (33,3 ms). El aviso de Vite sobre el tamaño del bundle es independiente de este problema de ejecución.

### Regresión de congelaciones por efectos de combate

La inspección y la reproducción en Chromium headless localizaron la causa en los efectos: cada explosión creaba muchos meshes, geometrías y materiales para partículas; los emisores seguían produciendo humo sin límite de vida, y los restos podían acumularse. La búsqueda de objetivos de las torretas también asignaba listas temporales de forma repetida, pero no fue el factor dominante.

Los efectos usan ahora lotes `InstancedMesh`, geometrías y materiales compartidos, pools acotados y ciclos de vida finitos. Los límites son 512 slots de partículas, 12 emisores, 32 ondas de choque, 8 luces y 128 proyectiles activos; los restos de escena se limitan a 64 grupos. La instrumentación ligera está disponible solo en desarrollo con `?diagnostics=1`, mediante `window.__gameDiagnostics.read()` y `runStressScenario()`.

Comparación del mismo escenario de estrés (10 soldados, 3 torretas y 6 explosiones separadas por 500 ms):

| Medida | Antes | Después |
|---|---:|---:|
| Muestras | 11 | 12 |
| Intervalo medio entre frames (no fiable como FPS) | 4451,8 ms | 2027,8 ms |
| Trabajo medio medido | 1582,6 ms | 168,1 ms |
| Render medio medido | 1562,6 ms | 156,1 ms |
| Draw calls medios | 455 | 51,9 |
| Geometrías registradas | 920 | 131 |
| Máximo de objetos en escena | 630 | 51 |
| Máximo de partículas activas | 403 | 488 (pool acotado a 512 slots) |
| Emisores activos máximos | 35 | 12 |
| Heap observado | 27,6 MB | 11,9 MB |

Una prueba posterior más intensa (30 explosiones separadas por 250 ms) terminó sin errores de JavaScript: trabajo medio medido 50,16 ms, render 46,0 ms, 51,2 draw calls, 131 geometrías, máximo de 52 objetos en escena, 475 partículas, 12 emisores y 10 proyectiles. Chromium headless produjo intervalos de frame muy irregulares; sus valores de FPS no representan el rendimiento de un navegador normal ni de un dispositivo. No se probaron móviles y no se afirma que se alcancen 30 o 60 FPS. Sí se observó que los recursos y objetos permanecen acotados y que el coste de render y los draw calls bajaron frente al escenario comparable.

Smoke test de navegador: después de 13 segundos sin Barraca del jugador, había cero soldados propios y el entrenamiento estaba deshabilitado; al construir una Barraca con oro suficiente, el botón se habilitó y una orden manual descontó el coste y creó un soldado. No hubo errores de consola ni excepciones de página.

El bundle principal de producción mide 594,94 kB (154,41 kB gzip), por encima del umbral de aviso de 500 kB de Vite. El baseline era 679,45 kB (178,06 kB gzip): tree-shaking al importar directamente los módulos Three.js usados, en vez de exponer su namespace completo en `window`, redujo el bundle aproximadamente un 12,4 % (13,3 % gzip), pero no elimina el aviso. No se añadió división de código: la escena 3D es necesaria al iniciar la partida, y reducir este bundle no explica ni corrige el coste de render en tiempo de ejecución.

## Desarrollo y pruebas

```sh
npm run dev
npm run typecheck
npm test
npm run build
```

El sistema de recompensas y las instrucciones para probar desbloqueos manualmente están en [README_UNLOCKS.md](./README_UNLOCKS.md).

## Crear y sincronizar Android

```sh
npm run android:add
npm run android:sync
npm run android:open
```

`android:add` se ejecuta una sola vez. Para generar un APK de depuración desde un entorno con Android SDK:

```sh
npm run android:build
```

La interfaz admite orientación vertical y horizontal; en teléfonos se recomienda girar el dispositivo a horizontal. La cámara responde a gestos de uno y dos dedos mediante OrbitControls. Los botones de construcción, reclutamiento, pausa y menús usan áreas táctiles ampliadas.
