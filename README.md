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
