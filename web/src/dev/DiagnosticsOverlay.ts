export type DiagnosticsReading = Readonly<Record<string, number | null>>;

function value(reading: DiagnosticsReading, key: string, digits = 1): string {
  const number = reading[key];
  return typeof number === 'number' && Number.isFinite(number) ? number.toFixed(digits) : '–';
}

function count(reading: DiagnosticsReading, key: string): string {
  return value(reading, key, 0);
}

function thousands(reading: DiagnosticsReading, key: string): string {
  const number = reading[key];
  return typeof number === 'number' && Number.isFinite(number) ? `${(number / 1000).toFixed(1)}k` : '–';
}

function factionLine(label: string, prefix: 'player' | 'enemy', reading: DiagnosticsReading): string {
  return `${label}: ${count(reading, `${prefix}Rifleman`)} soldados · ${count(reading, `${prefix}Tank`)} tanques · `
    + `${count(reading, `${prefix}Generator`)} gen · ${count(reading, `${prefix}Barracks`)} bar · `
    + `${count(reading, `${prefix}Turret`)} tor`;
}

/** Turns a diagnostics reading into the overlay's text lines. */
export function formatDiagnosticsLines(reading: DiagnosticsReading): string[] {
  const lines = [
    `FPS ${value(reading, 'fps')} · fotograma ${value(reading, 'frameMs')} ms · p95 ${value(reading, 'p95FrameMs')} ms`,
    `CPU ${value(reading, 'workMs', 2)} ms: simulación ${value(reading, 'simulationMs', 2)} `
      + `(${value(reading, 'simulationSteps')} pasos) · IA ${value(reading, 'aiMs', 2)} · `
      + `efectos ${value(reading, 'effectsMs', 2)} · resto ${value(reading, 'gameplayOtherMs', 2)} · `
      + `render ${value(reading, 'renderMs', 2)}`,
    `ECS: consultas ${value(reading, 'ecsQueriesMs', 2)} · objetivos ${value(reading, 'ecsTargetingMs', 2)} · `
      + `movimiento ${value(reading, 'ecsMovementMs', 2)} · armas ${value(reading, 'ecsWeaponsMs', 2)} · `
      + `producción ${value(reading, 'ecsProductionMs', 2)} · recursos ${value(reading, 'ecsResourcesMs', 2)} · `
      + `proyectiles ${value(reading, 'ecsProjectilesMs', 2)}`,
    `IA: ${value(reading, 'aiCallsPerFrame')} llamadas/fotograma · ${value(reading, 'aiDecisionsPerSecond')} decisiones/s`,
    `GPU: ${count(reading, 'drawCalls')} draw calls · ${thousands(reading, 'triangles')} triángulos · `
      + `${count(reading, 'geometries')} geometrías · ${count(reading, 'textures')} texturas`,
    factionLine('Jugador', 'player', reading),
    factionLine('Enemigo', 'enemy', reading),
    `Entidades ${count(reading, 'ecsEntities')} · proyectiles ${count(reading, 'ecsProjectiles')} · `
      + `partículas ${count(reading, 'particles')}/${count(reading, 'particleSlots')} · `
      + `emisores ${count(reading, 'emitters')}/${count(reading, 'emitterSlots')}`
  ];
  const memoryBytes = reading.memoryBytes;
  if (typeof memoryBytes === 'number') lines.push(`Memoria JS ${(memoryBytes / 1048576).toFixed(1)} MB`);
  return lines;
}

/**
 * Development-only panel for `?diagnostics=1`, kept apart from the player HUD.
 * Tapping it toggles between the full panel and the FPS line.
 */
export class DiagnosticsOverlay {
  readonly #element: HTMLElement;
  #compact = false;

  constructor(parent: HTMLElement) {
    const element = document.createElement('div');
    element.setAttribute('aria-hidden', 'true');
    element.style.cssText = [
      'position:fixed',
      'top:calc(env(safe-area-inset-top, 0px) + 4px)',
      'left:4px',
      'z-index:2147483647',
      'max-width:calc(100vw - 8px)',
      'padding:6px 8px',
      'border-radius:6px',
      'background:rgba(2,6,23,0.8)',
      'color:#d1fae5',
      'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
      'white-space:pre-wrap',
      'cursor:pointer',
      'user-select:none'
    ].join(';');
    element.addEventListener('click', this.#toggle);
    parent.appendChild(element);
    this.#element = element;
  }

  show(reading: DiagnosticsReading): void {
    const lines = formatDiagnosticsLines(reading);
    this.#element.textContent = this.#compact ? lines[0] : lines.join('\n');
  }

  dispose(): void {
    this.#element.removeEventListener('click', this.#toggle);
    this.#element.remove();
  }

  #toggle = (): void => {
    this.#compact = !this.#compact;
  };
}
