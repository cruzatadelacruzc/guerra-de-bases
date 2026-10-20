export const canvasTemplate = `<!-- 3D Canvas Container -->
    <div id="canvas-container" class="absolute inset-0 w-full h-full z-0"></div>
    <div class="scanline-effect z-10"></div>`;

export const mainMenuTemplate = `<div id="main-menu" class="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 transition-opacity duration-500 md:p-8">
        <main class="menu-shell">
            <header class="menu-heading">
                <span class="menu-kicker">COMANDO TÁCTICO <i></i> SECTOR 07</span>
                <h1 class="font-orbitron">GUERRA <span>DE BASES</span></h1>
                <p>Construye. Resiste. Destruye el Nexo enemigo.</p>
            </header>

            <div class="menu-status-strip" aria-label="Estado de la misión">
                <span><i aria-hidden="true">✓</i> NEXO ALIADO <b>100%</b></span>
                <span>MODO <b>1 JUGADOR VS IA</b></span>
            </div>

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
                        <span id="difficulty-threat">AMENAZA: ESTÁNDAR</span>
                    </div>
                    <div class="menu-difficulty-options" role="group" aria-label="Dificultad enemiga">
                        <button type="button" data-difficulty="easy" aria-pressed="false">FÁCIL</button>
                        <button type="button" data-difficulty="normal" aria-pressed="true">NORMAL</button>
                        <button type="button" data-difficulty="hard" aria-pressed="false">PESADILLA</button>
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

                <details class="menu-rules">
                    <summary>Reglas de la misión <span>+</span></summary>
                    <p>Empiezas con tu Nexo y 200 de oro. Construye generadores, barracas y torretas; entrena soldados y tanques. La primera base que pierda su Nexo, pierde el sector.</p>
                </details>
            </section>

            <div class="menu-bottom">
                <button id="btn-start-game" class="cyber-button menu-start-button font-orbitron">
                    DESPLEGAR UNIDADES <span aria-hidden="true">→</span><small>ST-07</small>
                </button>
                <section id="menu-intel-panel" class="menu-intel-panel hidden" aria-live="polite"></section>
                <nav class="menu-nav" aria-label="Información del comando">
                    <button type="button" data-menu-tab="arsenal" aria-pressed="false">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V6.5A2.5 2.5 0 0 1 10.5 4h3A2.5 2.5 0 0 1 16 6.5V8M6 8h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"/><path d="M4 13h16M8 11v4m8-4v4"/></svg>
                        ARSENAL
                    </button>
                    <button type="button" data-menu-tab="profile" aria-pressed="false">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 3v5.5c0 4.2-2.8 7.8-7 9.5-4.2-1.7-7-5.3-7-9.5V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg>
                        PERFIL
                    </button>
                    <button type="button" data-menu-tab="system" aria-pressed="false">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3.5h4l.6 2.1a7 7 0 0 1 1.6.9l2-.8 2 3.5-1.5 1.6a7 7 0 0 1 0 1.8l1.5 1.6-2 3.5-2-.8a7 7 0 0 1-1.6.9L14 20.5h-4l-.6-2.1a7 7 0 0 1-1.6-.9l-2 .8-2-3.5 1.5-1.6a7 7 0 0 1 0-1.8L3.8 9.8l2-3.5 2 .8a7 7 0 0 1 1.6-.9L10 3.5Z"/><circle cx="12" cy="11.7" r="2.6"/></svg>
                        SISTEMA
                    </button>
                </nav>
            </div>
        </main>
    </div>`;

export const gameHudTemplate = `<div id="game-hud" class="hidden absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 md:p-6">
        <div class="flex justify-between items-start gap-4 w-full pointer-events-auto">
            <!-- Player Status Panel -->
            <div class="cyber-panel p-4 rounded-lg flex flex-col gap-2 min-w-[220px] md:min-w-[280px]">
                <div class="flex justify-between items-center border-b border-cyan-500/20 pb-1">
                    <span class="font-orbitron text-xs font-bold text-cyan-400 uppercase tracking-wider">NEXO ALIADO</span>
                    <span id="player-hq-hp-text" class="text-xs font-mono font-bold text-cyan-300">1200 / 1200 HP</span>
                </div>
                <div class="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-cyan-500/30">
                    <div id="player-hq-bar" class="bg-cyan-400 h-2.5 rounded-full transition-all duration-300 w-full"></div>
                </div>
                <div class="flex justify-between items-center mt-1">
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full bg-yellow-400 animate-ping"></div>
                        <span class="text-xs text-slate-400 uppercase">Oro / Energía:</span>
                    </div>
                    <span id="res-gold" class="font-orbitron font-black text-yellow-400 text-lg">200</span>
                </div>
            </div>

            <!-- Objective & Pause Control Center -->
            <div class="flex flex-col items-center gap-2">
                <button id="btn-pause-game" class="cyber-button px-4 py-1.5 text-xs font-orbitron font-bold text-amber-300 hover:text-white flex items-center gap-1 shadow-lg">
                    <span>⏸️ PAUSA / MENÚ</span>
                </button>
                <div class="hidden lg:flex flex-col items-center cyber-panel px-6 py-1.5 rounded-lg text-center">
                    <span class="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">OBJETIVO PRINCIPAL</span>
                    <span class="text-xs font-semibold text-slate-200">DESTRUYE EL NEXO ENEMIGO</span>
                </div>
            </div>

            <!-- Enemy Status Panel -->
            <div class="cyber-panel-red p-4 rounded-lg flex flex-col gap-2 min-w-[220px] md:min-w-[280px]">
                <div class="flex justify-between items-center border-b border-red-500/20 pb-1">
                    <span class="font-orbitron text-xs font-bold text-red-400 uppercase tracking-wider">NEXO ENEMIGO (IA)</span>
                    <span id="enemy-hq-hp-text" class="text-xs font-mono font-bold text-red-300">1200 / 1200 HP</span>
                </div>
                <div class="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-red-500/30">
                    <div id="enemy-hq-bar" class="bg-red-500 h-2.5 rounded-full transition-all duration-300 w-full"></div>
                </div>
                <div class="flex justify-between items-center mt-1 text-xs text-red-300">
                    <span id="enemy-gold-text" class="font-mono text-yellow-400">ORO ENEMIGO: 200</span>
                    <span id="ai-strat-tag" class="font-mono text-cyan-400 font-bold">ESTADO IA: CONSTRUYENDO</span>
                </div>
            </div>
        </div>

        <!-- Middle Toast Notifications -->
        <div class="self-center text-center pointer-events-none">
            <div id="game-toast" class="opacity-0 transition-opacity duration-300 cyber-panel px-6 py-2 rounded-full border-cyan-400/50 text-cyan-300 font-bold text-sm tracking-wide shadow-lg">
                Mensaje Táctico
            </div>
        </div>
        <div class="game-controls-drawer w-full pointer-events-auto">
            <button id="btn-toggle-controls" class="cyber-button game-controls-toggle" type="button" aria-expanded="false" aria-controls="game-controls-content">
                <span>ABRIR CENTRO DE MANDO</span><span id="controls-toggle-icon" aria-hidden="true">＋</span>
            </button>
            <div id="game-controls-content" class="hidden game-controls-content">

            <!-- Structure Build Menu -->
            <div class="cyber-panel p-3 rounded-xl flex flex-col gap-2 w-full md:w-auto">
                <div class="flex justify-between items-center px-1">
                    <span class="font-orbitron text-[11px] font-bold text-cyan-400 uppercase tracking-wider">CONSTRUIR ESTRUCTURAS</span>
                    <span id="cancel-build-hint" class="hidden text-[10px] text-yellow-400 font-mono animate-pulse">ESC: Cancelar</span>
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
            <div id="unlock-panel" class="hidden cyber-panel unlock-panel"></div>
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

export const gameOverTemplate = `<div id="game-over-modal" class="hidden absolute inset-0 z-40 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
        <div id="game-over-card" class="game-over-card">
            <header class="game-over-header">
                <div class="game-over-status">
                    <span class="game-over-status-light" aria-hidden="true"></span>
                    <span id="game-over-status">ALERTA CRÍTICA // SECTOR 07</span>
                </div>
                <div class="game-over-connectivity">ESTADO: <b id="game-over-state">OPERACIÓN FINALIZADA</b></div>
            </header>

            <div class="game-over-location">
                <span>SUB-RED COMANDO TÁCTICO</span>
                <span>SECTOR 07 / INFORME LOCAL</span>
            </div>

            <main class="game-over-body">
                <section class="game-over-hero">
                    <div class="game-over-emblem-wrap">
                        <div id="game-over-icon" class="game-over-emblem" aria-hidden="true">
                            <div class="game-over-emblem-inner">
                                <svg viewBox="0 0 48 48" role="presentation">
                                    <defs>
                                        <linearGradient id="game-over-blast" x1="2" y1="2" x2="46" y2="46" gradientUnits="userSpaceOnUse">
                                            <stop stop-color="#ff1744" />
                                            <stop offset=".5" stop-color="#ff5252" />
                                            <stop offset="1" stop-color="#ff9100" />
                                        </linearGradient>
                                    </defs>
                                    <path class="game-over-blast-shape" d="M24 2 28 17 44 14 32 25 46 36 30 33 27 46 21 32 7 40 16 26 2 20 18 19 24 2Z" />
                                    <path class="game-over-blast-crack" d="m24 10-2 12-10 6m12-4 10 2 4 8" />
                                </svg>
                            </div>
                        </div>
                        <span class="game-over-badge" id="game-over-badge">CRÍTICO</span>
                    </div>
                    <h2 id="game-over-title">DERROTA OPERATIVA</h2>
                    <p id="game-over-msg">Tu <b>Nexo Principal</b> fue destruido por el asedio blindado enemigo.</p>
                </section>

                <section class="game-over-report" aria-label="Resumen de la partida">
                    <header>
                        <span class="game-over-report-title"><span aria-hidden="true">▤</span> INFORME POSTERIOR</span>
                        <span>REGISTRO LOCAL</span>
                    </header>
                    <div class="game-over-metrics">
                        <div class="game-over-stat">
                            <span><i class="metric-marker is-cyan"></i>Tiempo de operación</span>
                            <b id="stat-time">00:00</b>
                        </div>
                        <div class="game-over-stat">
                            <span><i class="metric-marker"></i>Soldados desplegados</span>
                            <b><span id="stat-soldiers">0</span><small><em>/ <span id="stat-losses">0</span> bajas</em></small></b>
                        </div>
                        <div class="game-over-stat">
                            <span><i class="metric-marker"></i>Estructuras construidas</span>
                            <b id="stat-buildings">0</b>
                        </div>
                        <div class="game-over-damage">
                            <div class="game-over-stat">
                                <span><i class="metric-marker is-red"></i>Daño infligido al Nexo rival</span>
                                <b id="stat-enemy-hq-damage">0%</b>
                            </div>
                            <div class="game-over-progress"><span id="stat-enemy-hq-damage-bar"></span></div>
                        </div>
                    </div>
                    <span class="game-over-corner" aria-hidden="true"></span>
                </section>
            </main>

            <footer class="game-over-actions">
                <button id="btn-restart-game" class="game-over-primary" aria-label="Reiniciar batalla">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v5h5M4.6 9A8 8 0 1 1 4 14" /></svg>
                    <span>REINICIAR</span>
                </button>
                <button id="btn-gameover-menu" class="game-over-secondary" aria-label="Volver al comando central">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8M5 10v10h5v-6h4v6h5V10" /></svg>
                    <span>VOLVER</span>
                </button>
                <small>GUERRA DE BASES · PROTOCOLO DE DESPLIEGUE</small>
            </footer>
        </div>
    </div>`;
