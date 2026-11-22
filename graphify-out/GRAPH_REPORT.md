# Graph Report - Guerra de bases  (2026-11-22)

## Corpus Check
- 169 files · ~174,904 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1633 nodes · 3941 edges · 91 communities (75 shown, 16 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 80 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `faa09928`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- rewardExecution.comparison.test.ts
- strikeScenarios.ts
- CombatEffects
- DeathResolver
- MapCameraController.ts
- scripts
- RewardEffectsView.ts
- disposeObjectResources
- Entity
- GameHud.ts
- BattleSimulation.test.ts
- UnlockManager
- Faction
- initialBattle.ts
- rewardSystem.ts
- MapCameraController
- GameUI
- aiMatchRunner.strikes.test.ts
- InstancedSoldierRenderer
- BattlefieldView.test.ts
- BattlefieldView
- CombatEffects.ts
- rewardExecution.ts: scheduleStrike / advanceStrikes / clearStrikes
- aiMatchRunner.ts
- R4 - Comandos compartidos: construir, vender, entrenar y activar recompensas - diseno
- getRewardDefinitionForDifficulty
- GameFrameLoop
- GameInputActions
- GameUiPort
- Enemy AI, Orders and Fog Design Spec
- createGameRuntime (monolithic closure)
- EnemyAi: decideEnemyTurn (funcion pura) + EnemyAiController
- compilerOptions
- Mobile Performance Requirements
- Menu inicial, acordeon de Recompensas y pantalla final - diseno
- createGameRuntime
- ProjectilePool
- computeMaxViewDistance
- GameActions
- Rendering Engine Independence
- battlefieldScene.ts
- R6 — Separación de la presentación — diseño
- Typed ECS World (game/ecs)
- rewardExecution.ts
- DeathResolver.resolve / resolveDeaths
- GameSession
- HapticFeedback.ts
- Shared Game Commands (game/commands)
- MetricRing
- battlefieldMeshes.test.ts
- UnlockService
- ScrollCues
- Match Layer (game/match)
- DiagnosticsOverlay.ts
- diagnosticsOptions.ts
- GameHud
- LegacyRewardTimeline
- strikeCinematics.ts
- Fases de implementacion 0a-11
- clampViewToBounds
- constructionBoundary.test.ts
- rewardExecutionBoundary.test.ts
- testUtilitiesBoundary.test.ts
- rewardExecution.test.ts
- GameUI.ts
- setNexusHealth (dev diagnostic)
- WorldReader
- Review Focus
- legacyEnemyExecutor.ts
- executeEnemyTurn.test.ts
- legacyRewardTimeline.test.ts
- Compact Game Over Battle Report
- ThreeRenderCoordinator.ts
- contracts.ts
- BattlefieldView.ts
- .update
- visualConsistency.ts
- presentationBoundary.test.ts
- runStrikeScenario
- components.ts
- InstancedSoldierRenderer.ts
- PlacementGhost
- nexusDamageAlert.ts
- ControlsDrawer
- SoundEffects
- BuildMenu
- GameApplication.ts

## God Nodes (most connected - your core abstractions)
1. `Entity` - 96 edges
2. `Faction` - 60 edges
3. `MapCameraController` - 46 edges
4. `World` - 44 edges
5. `COMPONENTS` - 40 edges
6. `Position` - 39 edges
7. `CombatEffects` - 37 edges
8. `GameUI` - 37 edges
9. `BattlefieldView` - 35 edges
10. `InstancedSoldierRenderer` - 32 edges

## Surprising Connections (you probably didn't know these)
- `DecisionClock` --semantically_similar_to--> `Fixed-step Simulation with Accumulator`  [INFERRED] [semantically similar]
  README.md → AGENTS.md
- `Bombardment Reward (airstrike_temp)` --conceptually_related_to--> `Strike Timeline (scheduleStrike / advanceStrikes)`  [AMBIGUOUS]
  README_UNLOCKS.md → README.md
- `Bounded Combat Effect Pools` --semantically_similar_to--> `Non-shared Health Bar and Tank/Building Meshes`  [INFERRED] [semantically similar]
  README.md → docs/performance/2026-11-14-referencia-rendimiento.md
- `Module Boundary Rules` --implements--> `Rendering Engine Independence`  [INFERRED]
  docs/audits/2026-11-14-auditoria-responsabilidades.md → AGENTS.md
- `GameSession / GameFrameLoop / GameInputController` --implements--> `Fixed-step Simulation with Accumulator`  [INFERRED]
  README.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **R0-R8 Refactor Roadmap Phases** — docs_audits_2026_11_14_auditoria_responsabilidades_r0, docs_audits_2026_11_14_auditoria_responsabilidades_r1, docs_audits_2026_11_14_auditoria_responsabilidades_r2, docs_audits_2026_11_14_auditoria_responsabilidades_r3, docs_audits_2026_11_14_auditoria_responsabilidades_r4, docs_audits_2026_11_14_auditoria_responsabilidades_r5, docs_audits_2026_11_14_auditoria_responsabilidades_r6, docs_audits_2026_11_14_auditoria_responsabilidades_r7, docs_audits_2026_11_14_auditoria_responsabilidades_r8 [EXTRACTED 1.00]
- **Commands Shared by Player and AI** — readme_game_commands, readme_buildstructure, readme_sellstructure, readme_trainunit, readme_activatereward, readme_executeenemyturn [EXTRACTED 1.00]
- **Reward Strike Pipeline (activate, schedule, advance, draw)** — readme_activatereward, readme_reward_execution, readme_matchstate, readme_rewardeffectsview, readme_deathresolver [INFERRED 0.85]
- **Legacy Transcription + Differential Comparison Pattern** — docs_superpowers_plans_2026_11_14_r3_capa_de_partida_legacydeathreference, docs_superpowers_plans_2026_11_14_r3_capa_de_partida_differential_test, docs_superpowers_plans_2026_11_20_r4_comandos_compartidos_legacy_strategy, docs_superpowers_plans_2026_11_20_r4_comandos_compartidos_aimatchrunner, docs_superpowers_plans_2026_11_20_r5_recompensas_en_el_reloj_de_juego_legacy_reward_timeline, docs_superpowers_plans_2026_11_20_r5_recompensas_en_el_reloj_de_juego_strike_scenarios [INFERRED 0.85]
- **Shared Game Commands for Player and AI (R4)** — docs_superpowers_plans_2026_11_20_r4_comandos_compartidos_commandcontext, docs_superpowers_plans_2026_11_20_r4_comandos_compartidos_placement, docs_superpowers_plans_2026_11_20_r4_comandos_compartidos_structurecommands, docs_superpowers_plans_2026_11_20_r4_comandos_compartidos_trainunit, docs_superpowers_plans_2026_11_20_r4_comandos_compartidos_activatereward, docs_superpowers_plans_2026_11_20_r4_comandos_compartidos_executeenemyturn [EXTRACTED 1.00]
- **Domain Strike Execution Pipeline (R5)** — docs_superpowers_plans_2026_11_20_r4_comandos_compartidos_activatereward, docs_superpowers_plans_2026_11_20_r5_recompensas_en_el_reloj_de_juego_schedulestrike, docs_superpowers_plans_2026_11_20_r5_recompensas_en_el_reloj_de_juego_strike_timeline, docs_superpowers_plans_2026_11_20_r5_recompensas_en_el_reloj_de_juego_advancestrikes, docs_superpowers_plans_2026_11_20_r5_recompensas_en_el_reloj_de_juego_strikeevent, docs_superpowers_plans_2026_11_20_r5_recompensas_en_el_reloj_de_juego_reward_effects_view [EXTRACTED 1.00]
- **Extraccion de reglas de GameApplication al dominio sin Three.js (R3-R5)** — docs_superpowers_specs_2026_11_14_r3_capa_de_partida_design_death_resolver, docs_superpowers_specs_2026_11_20_r4_comandos_compartidos_design_structure_commands, docs_superpowers_specs_2026_11_20_r4_comandos_compartidos_design_reward_command, docs_superpowers_specs_2026_11_20_r4_comandos_compartidos_design_shield, docs_superpowers_specs_2026_11_20_r5_recompensas_en_el_reloj_de_juego_design_reward_execution, docs_superpowers_specs_2026_11_14_ia_enemiga_ordenes_niebla_design_gameapplication [INFERRED 0.85]
- **Patron de referencia heredada + comparacion determinista antes de tocar produccion** — docs_superpowers_specs_2026_11_14_r3_capa_de_partida_design_legacy_death_reference, docs_superpowers_specs_2026_11_20_r4_comandos_compartidos_design_legacy_enemy_executor, docs_superpowers_specs_2026_11_20_r5_recompensas_en_el_reloj_de_juego_design_legacy_reward_timeline, docs_superpowers_specs_2026_11_20_r5_recompensas_en_el_reloj_de_juego_design_reward_comparison [INFERRED 0.85]
- **Pruebas de frontera de modulos y bundle** — docs_superpowers_specs_2026_11_20_r4_comandos_compartidos_design_construction_boundary_test, docs_superpowers_specs_2026_11_20_r5_recompensas_en_el_reloj_de_juego_design_reward_execution_boundary_test, docs_superpowers_specs_2026_11_20_r5_recompensas_en_el_reloj_de_juego_design_test_utilities_boundary_test, docs_superpowers_specs_2026_11_20_r4_comandos_compartidos_design_place_diagnostic_structure [INFERRED 0.85]

## Communities (91 total, 16 thin omitted)

### Community 0 - "rewardExecution.comparison.test.ts"
Cohesion: 0.16
Nodes (17): aggregate(), attacked(), byEntity(), compare(), compareIdentity(), forEveryRun(), identity(), keyOf() (+9 more)

### Community 1 - "strikeScenarios.ts"
Cohesion: 0.15
Nodes (24): activate(), addBuilding(), addUnit(), AI_HEADING, jitter(), pausedSixty(), s1(), s10() (+16 more)

### Community 3 - "DeathResolver"
Cohesion: 0.05
Nodes (55): decideEnemyTurn, DecisionClock, Double updateEnemyAI Execution Fix, EnemyAiCommand (build / train / activateReward), EnemyAiController, EnemyAiProfile / ENEMY_AI_PROFILES, EnemyAiSnapshot, executeEnemyAiTurn / buildEnemyAiSnapshot (GameApplication, R2) (+47 more)

### Community 4 - "MapCameraController.ts"
Cohesion: 0.06
Nodes (44): ActionFrame, AZIMUTH_RANGE, DragGesture, FitDistanceOptions, FOCUS_FAR_DISTANCE, FOCUS_NEAR_DISTANCE, FOCUS_TOGGLE_THRESHOLD, FocusAnimation (+36 more)

### Community 5 - "scripts"
Cohesion: 0.04
Nodes (46): autoprefixer, @capacitor/android, @capacitor/app, @capacitor/cli, @capacitor/core, @capacitor/haptics, @fontsource/orbitron, @fontsource/rajdhani (+38 more)

### Community 6 - "RewardEffectsView.ts"
Cohesion: 0.08
Nodes (29): FactionRewardState, DueImpact, ActiveStrike, ArtilleryShellState, BombState, StrikeBase, StrikeTimeline, AIR_STRIKE_BOMB_FALL_SECONDS (+21 more)

### Community 7 - "disposeObjectResources"
Cohesion: 0.21
Nodes (4): disposeObjectResources(), BattlefieldRemains, MAX_BATTLEFIELD_REMAINS, at

### Community 8 - "Entity"
Cohesion: 0.10
Nodes (30): validatePlacement(), BattleSimulation, ComponentName, Entity, ProductionOrder, Projectile, PLAYER_BASE_POSITION, advanceProjectile() (+22 more)

### Community 9 - "GameHud.ts"
Cohesion: 0.11
Nodes (12): GameOverSummary, browserScheduler, CountUpAnimator, CountUpTarget, countValueAt(), easeOutCubic(), formatClockDuration(), FrameScheduler (+4 more)

### Community 10 - "BattleSimulation.test.ts"
Cohesion: 0.29
Nodes (3): SIMULATION_PHASES, SimulationPhase, SimulationProfiler

### Community 11 - "UnlockManager"
Cohesion: 0.10
Nodes (17): web/index.html Document Shell, #app Root Container, PWA Manifest and Icons, ActiveTemporaryUnlock, EventListener, isCustomCondition(), isRecord(), isTemporaryUnlock() (+9 more)

### Community 12 - "Faction"
Cohesion: 0.11
Nodes (15): AiRunState, CommandStateSnapshot, BUILD_ZONE, MIN_STRUCTURE_SPACING, PlacementRejection, emptyBattle(), Faction, Position (+7 more)

### Community 13 - "initialBattle.ts"
Cohesion: 0.13
Nodes (23): contextWith(), STRUCTURE_DEFINITIONS, StructureDefinition, COMPONENTS, FACTIONS, SoldierKind, Weapon, createInitialBattle() (+15 more)

### Community 14 - "rewardSystem.ts"
Cohesion: 0.09
Nodes (27): ENEMY_BASE_POSITION, AirStrikeBomb, AirStrikeEffect, ArtilleryEffect, ArtilleryImpact, ScenarioStep, AIR_STRIKE_EFFECTIVE_RADIUS, AIR_STRIKE_SPEED (+19 more)

### Community 15 - "MapCameraController"
Cohesion: 0.12
Nodes (4): angleDelta(), focusDistanceFor(), MapCameraController, zoomTowardPoint()

### Community 16 - "GameUI"
Cohesion: 0.12
Nodes (3): MissionSettings, GameUI, createRewardIcon()

### Community 17 - "aiMatchRunner.strikes.test.ts"
Cohesion: 0.17
Nodes (14): consistent(), origin, scene(), viewOf(), CURRENT_STRATEGY, setup(), targets, createBase() (+6 more)

### Community 19 - "BattlefieldView.test.ts"
Cohesion: 0.09
Nodes (15): ExplosionCue, advanceUntilProduced(), Harness, instancedBatch(), kill(), produce(), soldierBody(), soldierHealthFill() (+7 more)

### Community 21 - "CombatEffects.ts"
Cohesion: 0.18
Nodes (9): BurningEmitter, CombatEffectStats, FadingLight, ParticleBatch, ParticleKind, ParticleState, ParticleVisual, ShockwaveBatch (+1 more)

### Community 22 - "rewardExecution.ts: scheduleStrike / advanceStrikes / clearStrikes"
Cohesion: 0.14
Nodes (22): Criterios de aprobacion por dificultad (Wilson 95 %, 200 partidas), Banco de partidas sin graficos (tsx), Acoplamiento: dano de recompensas aplicado por el efecto visual, MatchState (CP, rachas, contadores, outcome), Decision 1: procesar muertes por fotograma (no en el paso fijo), applyFactionShield (match/shield.ts): unico camino del escudo, R5 - Recompensas independientes de las animaciones - diseno, aiMatchRunner opcion strikes (por defecto apagada) (+14 more)

### Community 23 - "aiMatchRunner.ts"
Cohesion: 0.06
Nodes (50): BASELINE, CONTROL, CURRENT, CURRENT_STRATEGY, DIFFICULTIES, AiRunMetrics, AiRunRewardMetrics, AiStrategy (+42 more)

### Community 24 - "R4 - Comandos compartidos: construir, vender, entrenar y activar recompensas - diseno"
Cohesion: 0.18
Nodes (19): EnemyAiSnapshot / aiSnapshot.ts, FactionKnowledge (FullKnowledge / FogKnowledge), Niebla de guerra simetrica (Normal y Dificil), GameCommand / gameCommands.ts (comandos compartidos jugador e IA), Anti-objetivo: la IA no hace trampas, selectStrikeAim, validatePlacement (zona espejada y distancia minima 3.8), R4 - Comandos compartidos: construir, vender, entrenar y activar recompensas - diseno (+11 more)

### Community 25 - "getRewardDefinitionForDifficulty"
Cohesion: 0.22
Nodes (12): getRewardDefinition(), getRewardDefinitionForDifficulty(), getStrikePattern(), getRewardCategory(), getRewardFacts(), ICON_PATHS, RewardFact, createUiIcon() (+4 more)

### Community 26 - "GameFrameLoop"
Cohesion: 0.13
Nodes (5): browserScheduler, FrameScheduler, FrameTiming, GameFrameLoop, TestScheduler

### Community 29 - "Enemy AI, Orders and Fog Design Spec"
Cohesion: 0.19
Nodes (18): AGENTS.md Project Engineering Guidelines, Definition of Done, Performance Monitoring and Device Testing, TypeScript-only Application Source, CLAUDE.md (imports AGENTS.md), Responsibilities Audit of GameApplication.ts (2026-11-14), R0 Performance Panel and Baseline, Performance Reference of Current Version (R0) (+10 more)

### Community 30 - "createGameRuntime (monolithic closure)"
Cohesion: 0.16
Nodes (15): Fixed-step Simulation with Accumulator, Enemy AI Executed Twice per Frame, BattleSimulation (1/30 s fixed step), createGameRuntime (monolithic closure), Duplicated Values and Rules, R1 Behaviorless Leaves (structures table, SFX, meshes), R2 AI Phase 1 (pure decision, single call), R8 Composition Root (+7 more)

### Community 31 - "EnemyAi: decideEnemyTurn (funcion pura) + EnemyAiController"
Cohesion: 0.14
Nodes (15): Maquina de posturas Desarrollar / Defender / Presionar, Ordenes globales Mantener posicion / Atacar, Dificultad como calidad de decision, Doble llamada de la IA por fotograma, EnemyAi: decideEnemyTurn (funcion pura) + EnemyAiController, enemyAiProfile.ts (parametros por dificultad), GameApplication.ts / createGameRuntime, rng inyectado con semilla (sin dependencias) (+7 more)

### Community 32 - "compilerOptions"
Cohesion: 0.13
Nodes (14): node, web/src/**/*.ts, compilerOptions, allowImportingTsExtensions, module, moduleResolution, noEmit, noUnusedLocals (+6 more)

### Community 33 - "Mobile Performance Requirements"
Cohesion: 0.20
Nodes (14): Capacitor Lifecycle Conventions, Fewer than 100 Draw Calls Target, InstancedMesh and Object Pooling, Mobile Performance Requirements, R6 BattlefieldView (Entity-indexed visuals), backdrop-filter Blur over WebGL Canvas, Galaxy A05 Bottleneck Experiment (dpr, shockwaves, smoke, blur, bars), Samsung Galaxy A05 Preliminary Readings (+6 more)

### Community 34 - "Menu inicial, acordeon de Recompensas y pantalla final - diseno"
Cohesion: 0.19
Nodes (14): Menu inicial, acordeon de Recompensas y pantalla final - diseno, Animacion de conteo del informe (requestAnimationFrame, ease-out 1.1 s), createRewardIcon (web/src/ui/rewardPresentation.ts), Sustituir capas de CSS superpuestas por un bloque unico por pantalla, DESPLEGAR UNIDADES siempre visible, Pantalla final: INFORME DE BATALLA, GameHud.showGameOver, getStrikePattern (impactos y bombas por dificultad) (+6 more)

### Community 35 - "createGameRuntime"
Cohesion: 0.09
Nodes (6): DiagnosticsOverlay, placeDiagnosticStructure(), createGameRuntime(), GameDiagnostics, createPlatformVibrate(), LifecycleCounts

### Community 37 - "computeMaxViewDistance"
Cohesion: 0.38
Nodes (4): baseAzimuthFor(), computeMaxViewDistance(), elevationForDistance(), viewDirection()

### Community 39 - "Rendering Engine Independence"
Cohesion: 0.22
Nodes (10): Babylon.js Migration Candidate, Rendering Adapter, Rendering Engine Independence, Three.js (initial rendering engine), Module Boundary Rules, R0-R8 Refactor Roadmap, Run-to-run Timing Variance Lesson, Per-phase Comparisons R1-R5 (+2 more)

### Community 40 - "battlefieldScene.ts"
Cohesion: 0.19
Nodes (5): createSoldierMesh(), BattlefieldTerrain, createBattlefieldTerrain(), MenuSoldiers, createTerrainGrid()

### Community 41 - "R6 — Separación de la presentación — diseño"
Cohesion: 0.05
Nodes (43): 10. Riesgos, 11. Para el plan (lo deja abierto el diseño), 12. Decisiones aprobadas por el usuario (2026-11-21), 13.1 Commits, 13.2 Pruebas y comprobaciones, 13.3 Navegador (§6.2 y comprobaciones añadidas por las revisiones), 13.4 Recursos, 13.5 Medición (+35 more)

### Community 42 - "Typed ECS World (game/ecs)"
Cohesion: 0.15
Nodes (16): Data-oriented ECS Architecture, Streak System Separated from Rewards, UI and ECS Boundary, GameUiPort, R7 GamePresenter (change-controlled UI), Unlock System Has No Effect, Target Search is Most Expensive ECS System, README Guerra de Bases (+8 more)

### Community 43 - "rewardExecution.ts"
Cohesion: 0.17
Nodes (16): DamageResult, advanceStrikes(), applyImpact(), compareDue(), FALLBACK_DAMAGE, isFinished(), lerp(), StrikeEvent (+8 more)

### Community 44 - "DeathResolver.resolve / resolveDeaths"
Cohesion: 0.22
Nodes (11): BattleSimulation (paso fijo 1/30 s), R3 - Capa de partida: muertes, puntos de combate, rachas y resultado - diseno, Reglas de CP: soldado 1, tanque 3, torreta 4, generador 4, barraca 6, Nexo 0, DeathResolver.resolve / resolveDeaths, Caida simultanea de ambos Nexos = derrota, ECS como unica fuente de verdad de vida y ciclo de vida, legacyDeathReference.ts + prueba diferencial (temporal), MatchEvent (unitDied, structureDestroyed) / DeathResolution (+3 more)

### Community 46 - "HapticFeedback.ts"
Cohesion: 0.20
Nodes (10): createHapticFeedback(), HapticFeedback, HapticFeedbackOptions, NEXUS_ALERT_PULSE_GAP_MS, NEXUS_ALERT_PULSE_MS, NEXUS_DESTROYED_DURATION_MS, STRIKE_IMPACT_DURATION_MS, STRIKE_IMPACT_MIN_INTERVAL_MS (+2 more)

### Community 47 - "Shared Game Commands (game/commands)"
Cohesion: 0.33
Nodes (6): R4 Shared Commands, buildStructure, Shared Game Commands (game/commands), Mirrored Placement Zone Rules, sellStructure (70% refund), Nexus Shield Rule (shield.ts)

### Community 48 - "MetricRing"
Cohesion: 0.22
Nodes (3): MetricRing, MetricSummary, Series

### Community 49 - "battlefieldMeshes.test.ts"
Cohesion: 0.14
Nodes (14): createBarracksMesh(), createGeneratorMesh(), createHQMesh(), createNexusShieldVisual(), createTurretMesh(), instantiateBuildingMesh(), assertMaterial(), assertMesh() (+6 more)

### Community 51 - "ScrollCues"
Cohesion: 0.27
Nodes (4): getScrollCueState(), ScrollCues, ScrollCueState, ScrollMetrics

### Community 52 - "Match Layer (game/match)"
Cohesion: 0.24
Nodes (11): Deaths Processed in Visual Sync Loop, R3 Match Layer (deaths, CP, streaks, outcome), R5 Reward Execution on Game Clock, Reward Damage Tied to Visual Animation, activateReward, DeathResolver, legacyRewardTimeline Reference Tests, Match Layer (game/match) (+3 more)

### Community 53 - "DiagnosticsOverlay.ts"
Cohesion: 0.47
Nodes (7): count(), DiagnosticsReading, factionLine(), formatDiagnosticsLines(), formatDiagnosticsResult(), thousands(), value()

### Community 54 - "diagnosticsOptions.ts"
Cohesion: 0.43
Nodes (5): DiagnosticsOptions, DiagnosticsScenario, parseDiagnosticsOptions(), readPixelRatio(), readScenario()

### Community 56 - "LegacyRewardTimeline"
Cohesion: 0.27
Nodes (3): LegacyRewardTimeline, lerp(), StrikeHit

### Community 57 - "strikeCinematics.ts"
Cohesion: 0.24
Nodes (10): AIR_STRIKE_BOMB_OFFSETS, artilleryStrikeDurationSeconds(), nominalBombLandingSeconds(), CameraShot, AIR_STRIKE_CAMERA_DISTANCE, AIR_STRIKE_CAMERA_LEAD_SECONDS, airStrikeShots(), ARTILLERY_CAMERA_IMPACT_DISTANCE (+2 more)

### Community 58 - "Fases de implementacion 0a-11"
Cohesion: 0.40
Nodes (6): Fases de implementacion 0a-11, Panel de rendimiento ?diagnostics=1 (fase 0b), Auditoria de responsabilidades (fase 0a), constructionBoundary.test.ts, createBuildableStructure (primitiva ECS en initialBattle.ts), placeDiagnosticStructure (dev/diagnosticStructures.ts, solo desarrollo)

### Community 59 - "clampViewToBounds"
Cohesion: 0.33
Nodes (5): axisCorrection(), clampViewToBounds(), measureViewBox(), assertViewInsideMap(), viewBoxOf()

### Community 60 - "constructionBoundary.test.ts"
Cohesion: 0.40
Nodes (3): ALLOWED, SOURCE_ROOT, TEST_UTILITIES

### Community 62 - "testUtilitiesBoundary.test.ts"
Cohesion: 0.50
Nodes (4): reachableModules(), relativeSpecifiers(), SOURCE_ROOT, TEST_UTILITIES

### Community 63 - "rewardExecution.test.ts"
Cohesion: 0.14
Nodes (9): scheduleStrike(), activate(), AirStrike, ArtilleryStrike, ENEMY_AIM, PLAYER_AIM, STRIKE_SCENARIOS, airStrike() (+1 more)

### Community 64 - "GameUI.ts"
Cohesion: 0.23
Nodes (8): NEXUS_HEALTH, REWARD_DEFINITIONS, canvasTemplate, gameHudTemplate, gameOverTemplate, mainMenuTemplate, pauseModalTemplate, ToastNotifications

### Community 70 - "WorldReader"
Cohesion: 0.20
Nodes (5): writesThroughAReaderDoNotCompile(), WorldReader, createTankMesh(), setup(), createBattlefieldTestView()

### Community 71 - "Review Focus"
Cohesion: 0.13
Nodes (14): Dependencias entre tareas, Después de la Tarea 8: revisión independiente, Global Constraints, R6 — Separación de la presentación — Plan de implementación, Resumen para quien ejecuta (detalle en el diseño), Review Focus, Task 1: `WorldReader` y prueba de límites (solo tipos y pruebas), Task 2: Fábricas de mallas, barras de vida y restos (movimiento literal) (+6 more)

### Community 72 - "legacyEnemyExecutor.ts"
Cohesion: 0.18
Nodes (13): countEntities(), createEntityCensus(), createFactionCensus(), EntityCensus, FactionCensus, resetFactionCensus(), enemyStructures(), isAlive() (+5 more)

### Community 73 - "executeEnemyTurn.test.ts"
Cohesion: 0.15
Nodes (30): buildEnemyAiSnapshot(), EnemyCommandOutcome, executeEnemyTurn(), enemyBarracks(), checkMatchPlaying(), CommandContext, CommandResult, MatchNotPlaying (+22 more)

### Community 74 - "legacyRewardTimeline.test.ts"
Cohesion: 0.21
Nodes (12): activateAt(), AI_HEADING, AIM, assertAirStrike(), DIFFICULTIES, firstFrameReaching(), frameEndSeconds(), run() (+4 more)

### Community 75 - "Compact Game Over Battle Report"
Cohesion: 0.25
Nodes (11): Plan: Menú inicial, acordeón de Recompensas y pantalla final, parseClockDuration / formatClockDuration, Compact Game Over Battle Report, CountUpAnimator, Main-menu and Game-over CSS Extraction, getRewardFacts, prefers-reduced-motion Handling, Golden Rewards Accordion (RECOMPENSAS DE COMBATE) (+3 more)

### Community 76 - "ThreeRenderCoordinator.ts"
Cohesion: 0.21
Nodes (4): CombatEffectsOptions, RenderCoordinatorOptions, resolvePixelRatio(), ThreeRenderCoordinator

### Community 77 - "contracts.ts"
Cohesion: 0.15
Nodes (11): BUILDING_IDS, keepsControlsOpen(), TRAIN_UNIT_IDS, BarracksProductionView, BuildingType, Difficulty, RewardCardState, RewardId (+3 more)

### Community 78 - "BattlefieldView.ts"
Cohesion: 0.15
Nodes (11): EntityVisual, FACTION_ORDER, FactionVisualStats, RemovalCause, RiflemanVisual, SHIELD_COLORS, TankVisual, UnitVisual (+3 more)

### Community 79 - ".update"
Cohesion: 0.22
Nodes (4): computeFitDistance(), easeFocus(), measureActionFrame(), advance()

### Community 80 - "visualConsistency.ts"
Cohesion: 0.29
Nodes (8): CATEGORIES, checkVisualConsistency(), ConsistencyReport, ConsistencyView, describeInconsistencies(), isConsistent(), assertConsistent(), VisualKind

### Community 81 - "presentationBoundary.test.ts"
Cohesion: 0.14
Nodes (14): DOM_EXCEPTIONS, ENTITY_VIEWS, EXTRA_PRESENTATION_MODULES, gameFiles, gameUrl, ImportRecord, isForbiddenForEntityView(), isForbiddenForGame() (+6 more)

### Community 82 - "runStrikeScenario"
Cohesion: 0.24
Nodes (7): StrikeImpactRecord, Run, createStrikeWorld(), livingHealth(), livingTargets(), runStrikeScenario(), StrikeDriver

### Community 83 - "components.ts"
Cohesion: 0.11
Nodes (17): COMBAT_QUERY, COMBAT_RANGE_FACTOR, aim(), collect(), visitCombatPositions(), Building, Collider, ComponentData (+9 more)

### Community 84 - "InstancedSoldierRenderer.ts"
Cohesion: 0.18
Nodes (8): Batch, FactionBatches, IDENTITY_QUATERNION, removeSlot(), SoldierState, UNIT_SCALE, Y_AXIS, ZERO_SCALE

### Community 89 - "nexusDamageAlert.ts"
Cohesion: 0.33
Nodes (3): createNexusDamageAlert(), NEXUS_DAMAGE_ALERT_COOLDOWN_MS, NexusDamageAlert

### Community 96 - "GameApplication.ts"
Cohesion: 0.13
Nodes (13): disableBackdropBlur(), NO_BACKDROP_BLUR_CSS, RewardRejection, exceedsTapTolerance(), GameInputController, isDoubleTap(), TapSample, AudioWindow (+5 more)

## Ambiguous Edges - Review These
- `Strike Timeline (scheduleStrike / advanceStrikes)` → `Bombardment Reward (airstrike_temp)`  [AMBIGUOUS]
  README_UNLOCKS.md · relation: conceptually_related_to

## Knowledge Gaps
- **305 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+300 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Strike Timeline (scheduleStrike / advanceStrikes)` and `Bombardment Reward (airstrike_temp)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `README Guerra de Bases` connect `Typed ECS World (game/ecs)` to `UnlockManager`, `Enemy AI, Orders and Fog Design Spec`?**
  _High betweenness centrality (0.231) - this node is a cross-community bridge._
- **Why does `web/index.html Document Shell` connect `UnlockManager` to `Typed ECS World (game/ecs)`?**
  _High betweenness centrality (0.229) - this node is a cross-community bridge._
- **Why does `Performance Reference of Current Version (R0)` connect `Enemy AI, Orders and Fog Design Spec` to `Typed ECS World (game/ecs)`?**
  _High betweenness centrality (0.184) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _305 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `strikeScenarios.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1476923076923077 - nodes in this community are weakly interconnected._
- **Should `DeathResolver` be split into smaller, more focused modules?**
  _Cohesion score 0.052525252525252523 - nodes in this community are weakly interconnected._