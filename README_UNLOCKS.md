# Recompensas y desbloqueos

El sistema vive en `web/src/game/unlocks/` y se carga como parte del bundle de Vite, por lo que las definiciones también están disponibles offline en Capacitor.

## Recompensas incluidas

- **Apoyo de helicóptero:** al lograr una racha de 5 bajas, queda disponible durante 25 segundos. Al activarlo, inflige 180 de daño al objetivo enemigo más cercano.
- **Bombardeo:** al lograr una racha de 10 bajas, queda disponible durante 15 segundos. Al activarlo, inflige 220 de daño a los objetivos en el radio del impacto.
- **Blindaje de veterano:** al destruir 20 unidades enemigas, se desbloquea permanentemente. Los tanques entrenados desde entonces obtienen 20% más de vida y daño.

El progreso permanente y las recompensas temporales pendientes se guardan en `localStorage`. Para probar las recompensas desde la consola del navegador, inicia una partida y ejecuta:

```js
Unlocks.grant('helicopter_temp');
Unlocks.grant('airstrike_temp');
Unlocks.grant('veteran_armor');
```

La opción **Reiniciar batalla** inicia una partida limpia y también borra los desbloqueos permanentes y las recompensas temporales guardados en este dispositivo. Volver al menú e iniciar otra partida no borra ese progreso.

Las recompensas temporales deben activarse desde el panel **Premios** antes de que expire su ventana. Para borrar el progreso local durante las pruebas:

```js
localStorage.removeItem('gdb_unlocks_v1');
location.reload();
```

Para añadir recompensas, agrega una definición a `web/src/game/unlocks/unlocks.json` y conecta su evento y efecto en el juego. El `UnlockManager` admite eventos por racha (`kill_streak`), logros (`achievement`) y cualquier evento de juego suministrado por `recordEvent`.
