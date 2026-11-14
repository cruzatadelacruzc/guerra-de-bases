import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDiagnosticsLines } from './DiagnosticsOverlay.ts';

test('the overlay lines cover frame time, CPU split, ECS systems, AI, GPU and entities', () => {
  const lines = formatDiagnosticsLines({
    fps: 59.94,
    frameMs: 16.68,
    p95FrameMs: 18.2,
    workMs: 4.25,
    simulationMs: 1.1,
    simulationSteps: 2,
    aiMs: 0.04,
    effectsMs: 0.3,
    gameplayOtherMs: 1.5,
    renderMs: 1.2,
    ecsQueriesMs: 0.2,
    ecsTargetingMs: 0.4,
    ecsMovementMs: 0.2,
    ecsWeaponsMs: 0.1,
    ecsProductionMs: 0,
    ecsResourcesMs: 0,
    ecsProjectilesMs: 0.1,
    aiCallsPerFrame: 2,
    aiDecisionsPerSecond: 2.86,
    drawCalls: 54,
    triangles: 120300,
    geometries: 85,
    textures: 12,
    playerRifleman: 12,
    playerTank: 3,
    playerGenerator: 2,
    playerBarracks: 1,
    playerTurret: 2,
    enemyRifleman: 9,
    enemyTank: 1,
    enemyGenerator: 3,
    enemyBarracks: 2,
    enemyTurret: 3,
    ecsEntities: 140,
    ecsProjectiles: 23,
    particles: 140,
    particleSlots: 512,
    emitters: 3,
    emitterSlots: 12,
    memoryBytes: 47_395_635
  });

  assert.deepEqual(lines, [
    'FPS 59.9 · fotograma 16.7 ms · p95 18.2 ms',
    'CPU 4.25 ms: simulación 1.10 (2.0 pasos) · IA 0.04 · efectos 0.30 · resto 1.50 · render 1.20',
    'ECS: consultas 0.20 · objetivos 0.40 · movimiento 0.20 · armas 0.10 · producción 0.00 · recursos 0.00 · proyectiles 0.10',
    'IA: 2.0 llamadas/fotograma · 2.9 decisiones/s',
    'GPU: 54 draw calls · 120.3k triángulos · 85 geometrías · 12 texturas',
    'Jugador: 12 soldados · 3 tanques · 2 gen · 1 bar · 2 tor',
    'Enemigo: 9 soldados · 1 tanques · 3 gen · 2 bar · 3 tor',
    'Entidades 140 · proyectiles 23 · partículas 140/512 · emisores 3/12',
    'Memoria JS 45.2 MB'
  ]);
});

test('missing metrics show a dash instead of a number', () => {
  const [first] = formatDiagnosticsLines({ fps: null });
  assert.equal(first, 'FPS – · fotograma – ms · p95 – ms');
});
