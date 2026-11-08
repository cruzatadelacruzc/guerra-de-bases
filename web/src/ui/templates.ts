import { uiIconMarkup } from './uiIcons.ts';

export const canvasTemplate = `<!-- 3D Canvas Container -->
    <div id="canvas-container" class="absolute inset-0 w-full h-full z-0"></div>
    <!-- Kept outside #game-hud: its panels are laid out with child-position selectors. -->
    <div id="nexus-alert-vignette" class="nexus-alert-vignette" aria-hidden="true"></div>`;

export const mainMenuTemplate = `<div id="main-menu" class="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 transition-opacity duration-500 md:p-8">
        <main class="menu-shell">
            <header class="menu-heading">
                <h1 class="font-orbitron">GUERRA <span>DE BASES</span></h1>
                <p class="menu-tagline">Construye, defiende y destruye el Nexo enemigo.</p>
            </header>

            <section class="menu-brief cyber-panel" aria-label="Configuración de misión">
                <div class="menu-brief-heading">
                    <div>
                        <span class="menu-label">MISIÓN ACTIVA</span>
                        <h2>Dominio del sector</h2>
                    </div>
                    <div class="menu-starting-resources">
                        <div class="menu-resource-value">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.5 8 4.4v10.2l-8 4.4-8-4.4V6.9l8-4.4Z"/><path d="M12 7v10m-2.5-6.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/></svg>
                            <b>200</b>
                        </div>
                        <span>ORO INICIAL</span>
                    </div>
                </div>

                <div class="menu-difficulty">
                    <div class="menu-difficulty-heading">
                        <span>DIFICULTAD ENEMIGA</span>
                        <!-- Starting gold stays in view while the rewards list (with gold costs) is open. -->
                        <span class="menu-open-gold" aria-hidden="true">${uiIconMarkup('coin')}<b>200</b> ORO</span>
                    </div>
                    <div class="menu-difficulty-options" role="group" aria-label="Dificultad enemiga">
                        <button type="button" data-difficulty="easy" aria-pressed="false">${uiIconMarkup('smile')}<span>FÁCIL</span></button>
                        <button type="button" data-difficulty="normal" aria-pressed="true">${uiIconMarkup('swords')}<span>NORMAL</span></button>
                        <button type="button" data-difficulty="hard" aria-pressed="false">${uiIconMarkup('skull')}<span>PESADILLA</span></button>
                    </div>
                    <select id="select-difficulty" class="sr-only" tabindex="-1" aria-hidden="true">
                        <option value="easy">Fácil</option>
                        <option value="normal" selected>Normal</option>
                        <option value="hard">Pesadilla</option>
                    </select>
                    <select id="select-mode" class="sr-only" tabindex="-1" aria-hidden="true">
                        <option value="ai" selected>Un jugador vs IA</option>
                    </select>
                </div>

                <details id="menu-rewards" class="menu-rewards">
                    <summary class="menu-rewards-summary">
                        <span class="menu-rewards-icons" aria-hidden="true"></span>
                        <span class="menu-rewards-copy">
                            <strong>RECOMPENSAS DE COMBATE</strong>
                            <span class="menu-rewards-hint">Gana CP y desbloquea 3 ataques especiales</span>
                        </span>
                        <span class="menu-rewards-toggle" aria-hidden="true">${uiIconMarkup('chevron-down')}</span>
                    </summary>
                    <div class="menu-rewards-scroll-wrap">
                        <button type="button" class="menu-scroll-cue is-up" data-scroll-cue="up" tabindex="-1" aria-hidden="true">${uiIconMarkup('double-up')}</button>
                        <div id="mission-rules-content" class="mission-rules-content" tabindex="0" aria-label="Recompensas de combate"></div>
                        <button type="button" class="menu-scroll-cue is-down" data-scroll-cue="down" tabindex="-1" aria-hidden="true">${uiIconMarkup('double-down')}</button>
                    </div>
                </details>
            </section>

            <div class="menu-bottom">
                <button id="btn-start-game" class="cyber-button menu-start-button font-orbitron">
                    DESPLEGAR UNIDADES <span aria-hidden="true">→</span>
                </button>
                <section id="menu-intel-panel" class="menu-intel-panel hidden" aria-live="polite" aria-label="Información del arsenal"></section>
            </div>
        </main>
    </div>`;

export const gameHudTemplate = `<div id="game-hud" class="hidden absolute inset-0 z-20 pointer-events-none">
        <div class="game-status-rail pointer-events-auto">
            <section class="game-faction-status game-faction-player cyber-panel" aria-label="Estado del Nexo aliado">
                <div class="game-faction-heading">
                    <span class="game-faction-name"><span class="game-faction-prefix">NEXO </span><b>ALIADO</b></span>
                    <span id="player-hq-hp-text" class="game-hp-value">1200 / 1200 HP</span>
                </div>
                <div class="game-health-track"><div id="player-hq-bar" class="game-health-fill w-full"></div></div>
                <div class="game-faction-meta">
                    <span class="game-meta-gold">ORO <b id="res-gold">200</b></span>
                    <span class="game-meta-cp"><b id="res-combat-points">0 CP</b></span>
                </div>
            </section>

            <div class="game-center-controls">
                <button id="btn-pause-game" class="cyber-button game-pause-button pointer-events-auto" aria-label="Pausar partida">
                    <span aria-hidden="true">Ⅱ</span><span class="game-pause-label">PAUSA</span>
                </button>
                <button id="btn-auto-zoom" class="cyber-button game-auto-zoom pointer-events-auto" type="button" aria-pressed="true" aria-label="Zoom automático activado">AUTO</button>
            </div>

            <section class="game-faction-status game-faction-enemy cyber-panel-red" aria-label="Estado del Nexo enemigo">
                <div class="game-faction-heading">
                    <span class="game-faction-name"><span class="game-faction-prefix">NEXO </span><b>HOSTIL</b></span>
                    <span id="enemy-hq-hp-text" class="game-hp-value">1200 / 1200 HP</span>
                </div>
                <div class="game-health-track"><div id="enemy-hq-bar" class="game-health-fill w-full"></div></div>
                <div class="game-faction-meta">
                    <span class="game-meta-gold">ORO <b id="enemy-gold-text">200</b></span>
                    <span class="game-meta-status">IA: <span id="ai-strat-tag">CONSTRUYENDO</span></span>
                </div>
            </section>
        </div>

        <div class="game-toast-anchor self-center text-center pointer-events-none">
            <div id="game-toast" class="opacity-0 transition-opacity duration-300 cyber-panel px-6 py-2 rounded-full border-cyan-400/50 text-cyan-300 font-bold text-sm tracking-wide shadow-lg">
                Mensaje Táctico
            </div>
        </div>
        <div class="game-controls-drawer pointer-events-auto">
            <button id="btn-toggle-controls" class="cyber-button game-controls-toggle" type="button" aria-expanded="false" aria-controls="game-controls-content">
                <span class="game-controls-toggle-copy"><span class="game-controls-kicker">COMANDO DE CAMPO</span><span class="game-controls-label">ABRIR CENTRO DE MANDO</span></span>
                <span id="controls-toggle-icon" class="game-controls-toggle-icon" aria-hidden="true">＋</span>
            </button>
            <div id="game-controls-content" class="hidden game-controls-content">

            <!-- Structure Build Menu -->
            <div class="cyber-panel p-3 rounded-xl flex flex-col gap-2 w-full md:w-auto">
                <div class="flex justify-between items-center px-1">
                    <span class="font-orbitron text-[11px] font-bold text-cyan-400 uppercase tracking-wider">CONSTRUIR ESTRUCTURAS</span>
                    <span id="cancel-build-hint" class="hidden text-[10px] text-yellow-400 font-mono animate-pulse"><span class="game-keyboard-hint">ESC · CANCELAR</span><span class="game-touch-hint">TOCA EL TERRENO PARA COLOCAR</span></span>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button id="build-generator" class="cyber-button p-2.5 flex flex-col items-center min-w-[105px] text-left">
                        <span class="text-xs font-bold text-yellow-300">Generador</span>
                        <span class="text-[10px] text-slate-300">+12 Oro/sec</span>
                        <span class="text-xs font-mono text-yellow-400 font-bold mt-1">⚡ 100 ORO</span>
                    </button>
                    <button id="build-barracks" class="cyber-button p-2.5 flex flex-col items-center min-w-[105px] text-left">
                        <span class="text-xs font-bold text-cyan-300">Barracas</span>
                        <span class="text-[10px] text-slate-300">Entrena Tropas</span>
                        <span class="text-xs font-mono text-yellow-400 font-bold mt-1">⚡ 150 ORO</span>
                    </button>
                    <button id="build-turret" class="cyber-button p-2.5 flex flex-col items-center min-w-[105px] text-left">
                        <span class="text-xs font-bold text-indigo-300">Torreta Láser</span>
                        <span class="text-[10px] text-slate-300">Defensa Base</span>
                        <span class="text-xs font-mono text-yellow-400 font-bold mt-1">⚡ 125 ORO</span>
                    </button>
                    <button id="demolish-mode" class="cyber-button p-2.5 flex flex-col items-center min-w-[100px] text-left border-red-500/60 hover:border-red-400">
                        <span class="text-xs font-bold text-red-400">🗑️ Borrar / Vender</span>
                        <span class="text-[10px] text-slate-300">Recupera 70% Oro</span>
                        <span id="demolish-status" class="text-[10px] font-mono text-slate-400 mt-1">INACTIVO</span>
                    </button>
                </div>
            </div>

            <!-- Troop Recruitment Menu -->
            <div class="cyber-panel p-3 rounded-xl flex flex-col gap-2 w-full md:w-auto">
                <div class="flex justify-between items-center px-1">
                    <span class="font-orbitron text-[11px] font-bold text-cyan-400 uppercase tracking-wider">BATALLÓN DE ATAQUE</span>
                    <span id="barracks-status" class="text-[10px] text-slate-400">Barracas: <span class="text-red-400 font-bold">No construida</span></span>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button id="train-rifleman" disabled class="cyber-button p-3 flex flex-col items-center min-w-[130px] text-left border-cyan-400">
                        <div class="flex items-center gap-1">
                            <span class="text-xs font-bold text-cyan-200">Soldado Ráfaga</span>
                        </div>
                        <span class="text-[10px] text-cyan-400 font-medium">Disparo Rápido / Ligero</span>
                        <span class="text-xs font-mono text-yellow-400 font-bold mt-1">⚡ 50 ORO</span>
                    </button>

                    <button id="train-tank" disabled class="cyber-button p-3 flex flex-col items-center min-w-[130px] text-left border-indigo-500">
                        <div class="flex items-center gap-1">
                            <span class="text-xs font-bold text-indigo-200">Tanque Blindado</span>
                        </div>
                        <span class="text-[10px] text-slate-300">Ataque Pesado / Explosivo</span>
                        <span class="text-xs font-mono text-yellow-400 font-bold mt-1">⚡ 180 ORO</span>
                    </button>
                </div>
            </div>
            <section id="tactical-rewards-panel" class="cyber-panel tactical-rewards-panel" aria-label="Apoyo táctico">
                <div class="tactical-rewards-heading">
                    <div>
                        <span class="tactical-rewards-kicker">APOYO TÁCTICO</span>
                        <h2>RECOMPENSAS DE COMBATE</h2>
                    </div>
                    <div class="tactical-rewards-balance">
                        <span><b id="reward-combat-points">0</b> CP DISPONIBLES</span>
                        <span><b id="reward-gold-balance">200</b> ORO</span>
                    </div>
                </div>
                <div id="tactical-reward-cards" class="tactical-reward-cards" aria-live="polite"></div>
            </section>
            </div>
        </div>
    </div>`;

export const pauseModalTemplate = `<div id="pause-modal" class="hidden absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
        <div class="cyber-panel p-6 rounded-2xl max-w-sm w-full text-center border-cyan-500/50 flex flex-col gap-4">
            <h2 class="font-orbitron text-2xl font-black text-cyan-300 uppercase tracking-wider">PAUSA TÁCTICA</h2>
            <p class="text-slate-300 text-xs">Operación suspendida temporalmente.</p>

            <button id="btn-resume-game" class="cyber-button py-3 px-6 font-orbitron font-bold text-cyan-300 text-sm w-full">
                ▶ REANUDAR COMBATE
            </button>
            <button id="btn-pause-restart" class="cyber-button py-3 px-6 font-orbitron font-bold text-yellow-300 text-sm w-full">
                🔄 REINICIAR BATALLA
            </button>
            <button id="btn-exit-menu" class="cyber-button py-3 px-6 font-orbitron font-bold text-red-400 text-sm w-full border-red-500/60 hover:border-red-400">
                🚪 SALIR AL MENÚ PRINCIPAL
            </button>
        </div>
    </div>`;

export const gameOverTemplate = `<div id="game-over-modal" class="hidden absolute inset-0 z-40 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="game-over-title" aria-describedby="game-over-msg">
        <div id="game-over-card" class="game-over-card">
            <section class="game-over-hero">
                <div class="game-over-insignia">
                    <div class="game-over-emblem-wrap">
                        <span class="game-over-burst" aria-hidden="true"></span>
                        <div id="game-over-icon" class="game-over-emblem" aria-hidden="true">
                            <div class="game-over-emblem-inner">
                                <!-- Defeat: the Nexus hexagon split along a fracture. -->
                                <svg class="game-over-icon-defeat" viewBox="0 0 48 48" role="presentation">
                                    <defs>
                                        <linearGradient id="game-over-defeat-fill" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
                                            <stop stop-color="#ff5a73" />
                                            <stop offset=".55" stop-color="#e0153d" />
                                            <stop offset="1" stop-color="#ff8a3d" />
                                        </linearGradient>
                                    </defs>
                                    <path class="game-over-icon-shape game-over-shard-left" d="M24 4 6 14.5v19L24 44l-2.5-12 5.5-8.5-6.5-7.5L24 4Z" />
                                    <path class="game-over-icon-shape game-over-shard-right" d="M24 4 42 14.5v19L24 44l-2.5-12 5.5-8.5-6.5-7.5L24 4Z" />
                                    <path class="game-over-icon-spark" d="m35 3.5 4-1.5-1 4Zm-24 39.5-3.6 2.2.3-4.2Zm30.5-5 3.3.6-2.3 2.4Z" />
                                </svg>
                                <!-- Victory: a flag planted on the captured Nexus. -->
                                <svg class="game-over-icon-victory" viewBox="0 0 48 48" role="presentation">
                                    <defs>
                                        <linearGradient id="game-over-victory-fill" x1="16" y1="8" x2="38" y2="24" gradientUnits="userSpaceOnUse">
                                            <stop stop-color="#e6fdff" />
                                            <stop offset=".5" stop-color="#4deeff" />
                                            <stop offset="1" stop-color="#0891b2" />
                                        </linearGradient>
                                    </defs>
                                    <path class="game-over-icon-base" d="M7 39.5 14 35h20l7 4.5-7 4.5H14Z" />
                                    <path class="game-over-icon-pole" d="M17 39V3.5" />
                                    <path class="game-over-icon-shape" d="M17 5h25l-6 8 6 8H17Z" />
                                    <path class="game-over-icon-detail" d="m22.5 10.5 4 3 4-3" />
                                </svg>
                            </div>
                        </div>
                    </div>
                    <span class="game-over-badge" id="game-over-badge">CRÍTICO</span>
                </div>
                <h2 id="game-over-title">DERROTA</h2>
                <p id="game-over-msg">Tu Nexo principal fue destruido por el asedio enemigo.</p>
            </section>

            <section class="game-over-report" aria-labelledby="game-over-report-title">
                <h3 id="game-over-report-title">INFORME DE BATALLA</h3>
                <div class="game-over-stat">
                    <span class="game-over-stat-icon">${uiIconMarkup('clock')}</span>
                    <span>Tiempo</span>
                    <b class="game-over-stat-value is-time" id="stat-time">00:00</b>
                </div>
                <div class="game-over-stat">
                    <span class="game-over-stat-icon">${uiIconMarkup('soldier')}</span>
                    <span>Soldados desplegados</span>
                    <b class="game-over-stat-value"><span id="stat-soldiers">0</span><span class="game-over-losses">${uiIconMarkup('cross')}<span id="stat-losses">0</span> bajas</span></b>
                </div>
                <div class="game-over-stat">
                    <span class="game-over-stat-icon">${uiIconMarkup('building')}</span>
                    <span>Estructuras construidas</span>
                    <b class="game-over-stat-value" id="stat-buildings">0</b>
                </div>
                <div class="game-over-stat is-damage">
                    <span class="game-over-stat-icon">${uiIconMarkup('target')}</span>
                    <span>Daño al Nexo rival</span>
                    <b class="game-over-stat-value" id="stat-enemy-hq-damage">0%</b>
                </div>
                <div class="game-over-progress"><span id="stat-enemy-hq-damage-bar"></span></div>
                <p id="game-over-hint" class="game-over-hint" hidden></p>
            </section>

            <footer class="game-over-actions">
                <button id="btn-restart-game" class="game-over-primary" aria-label="Jugar de nuevo">
                    ${uiIconMarkup('replay')}
                    <span>JUGAR DE NUEVO</span>
                </button>
                <button id="btn-gameover-menu" class="game-over-secondary" aria-label="Volver al menú">
                    ${uiIconMarkup('home')}
                    <span>MENÚ</span>
                </button>
            </footer>
        </div>
    </div>`;
