import * as THREE from 'three';
import { COMPONENTS as ECS_COMPONENTS, FACTIONS as ECS_FACTIONS } from './game/ecs/components.ts';
import type { Entity, Position } from './game/ecs/components.ts';
import { BattleSimulation } from './game/ecs/BattleSimulation.ts';
import type { SimulationPhase, SimulationProfiler } from './game/ecs/BattleSimulation.ts';
import { visitCombatPositions } from './game/ecs/combatFocus.ts';
import { ENEMY_BASE_POSITION, PLAYER_BASE_POSITION } from './game/ecs/initialBattle.ts';
import { requestUnitProduction } from './game/ecs/systems.ts';
import type {
    ProductionCompletedEvent,
    ProductionOverrides,
    ProjectileImpact,
    WeaponFireEvent
} from './game/ecs/systems.ts';
import { EnemyAiController } from './game/ai/EnemyAiController.ts';
import type { EnemyAiTurn } from './game/ai/enemyAi.ts';
import { getEnemyAiProfile } from './game/ai/enemyAiProfile.ts';
import { buildEnemyAiSnapshot } from './game/ai/aiSnapshot.ts';
import { executeEnemyTurn } from './game/ai/executeEnemyTurn.ts';
import type { CommandContext } from './game/commands/CommandContext.ts';
import { activateReward, rewardTargetCandidates } from './game/commands/rewardCommand.ts';
import type { RewardRejection } from './game/commands/rewardCommand.ts';
import { buildStructure, sellStructure } from './game/commands/structureCommands.ts';
import { idleFactories, liveFactories, trainUnit as trainUnitCommand } from './game/commands/trainCommand.ts';
import { placeDiagnosticStructure } from './dev/diagnosticStructures.ts';
import { NEXUS_HEALTH } from './game/definitions/structures.ts';
import { GameFrameLoop } from './game/GameFrameLoop.ts';
import type { FrameTiming } from './game/GameFrameLoop.ts';
import { exceedsTapTolerance, GameInputController, isDoubleTap, type TapSample } from './game/GameInputController.ts';
import { GameSession } from './game/GameSession.ts';
import { DeathResolver } from './game/match/DeathResolver.ts';
import type { MatchEvent } from './game/match/matchEvents.ts';
import { createMatchState } from './game/match/MatchState.ts';
import { advanceStrikes, clearStrikes } from './game/match/rewardExecution.ts';
import type { StrikeEvent } from './game/match/rewardExecution.ts';
import { applyFactionShield } from './game/match/shield.ts';
import { unlockEventsFor } from './game/match/unlockEvents.ts';
import { createNexusDamageAlert } from './game/nexusDamageAlert.ts';
import { createHapticFeedback, createPlatformVibrate } from './platform/HapticFeedback.ts';
import {
    AIR_STRIKE_BOMB_OFFSETS,
    AIR_STRIKE_FLIGHT_SECONDS,
    ARTILLERY_IMPACT_OFFSETS,
    ARTILLERY_LAUNCH_DELAY_SECONDS,
    ARTILLERY_SALVO_INTERVAL_SECONDS,
    ARTILLERY_SHELL_FLIGHT_SECONDS,
    artilleryStrikeDurationSeconds,
    ENEMY_AIR_STRIKE_HEADING,
    getDifficultyProfile,
    getRewardDefinitionForDifficulty,
    nominalBombLandingSeconds,
    type RewardId,
    type StrikeAim
} from './game/rewardSystem.ts';
import { ThreeRenderCoordinator } from './rendering/ThreeRenderCoordinator.ts';
import type {
    BarracksProductionView,
    BuildingType,
    RewardStatus,
    RewardUiState,
    GameUiPort,
    UnitType,
    UnlockView
} from './ui/contracts.ts';
import type { MapCameraController } from './rendering/MapCameraController.ts';
import { createTerrainGrid } from './rendering/TerrainGrid.ts';
import { BattlefieldRemains } from './rendering/BattlefieldRemains.ts';
import {
    createHQMesh,
    createNexusShieldVisual,
    createSoldierMesh,
    createTankMesh,
    disposeObjectResources,
    instantiateBuildingMesh
} from './rendering/battlefieldMeshes.ts';
import { createHealthBar, type HealthBar } from './rendering/HealthBar.ts';
import { muzzleOrigin, RewardEffectsView } from './rendering/RewardEffectsView.ts';
import type { SoldierVisualHandle } from './rendering/InstancedSoldierRenderer.ts';
import { DiagnosticsOverlay, formatDiagnosticsResult } from './dev/DiagnosticsOverlay.ts';
import { parseDiagnosticsOptions } from './dev/diagnosticsOptions.ts';
import { disableBackdropBlur } from './dev/backdropBlur.ts';
import { countEntities, createEntityCensus } from './dev/entityCensus.ts';
import { MetricRing } from './dev/MetricRing.ts';

interface RuntimeStructure {
    mesh: THREE.Group;
    hp: number;
    maxHp: number;
    position: THREE.Vector3;
    type: BuildingType | 'hq';
    isPlayer: boolean;
    healthBar?: HealthBar;
    ecsEntityId?: Entity;
}

interface RuntimeUnit {
    mesh: THREE.Group | SoldierVisualHandle;
    hp: number;
    maxHp: number;
    type: UnitType;
    isPlayer: boolean;
    healthBar?: HealthBar;
    ecsEntityId: Entity;
}

type RuntimeTarget = RuntimeStructure | RuntimeUnit;

interface RuntimeProjectile {
    ecsEntityId: Entity;
    mesh: THREE.Mesh;
}

interface AudioWindow extends Window {
    webkitAudioContext?: typeof AudioContext;
}

interface PerformanceWithMemory extends Performance {
    memory?: { usedJSHeapSize: number };
}

interface GameDiagnostics {
    /** Summarizes the latest `latest` frames (every stored frame by default). */
    read(latest?: number): Record<string, number | null>;
    /** Forgets every stored frame so the next read covers only what follows. */
    reset(): void;
    environment(): Record<string, string | number | boolean>;
    runStressScenario(
        explosionCount?: number,
        intervalMs?: number
    ): Promise<Record<string, number | null>>;
    runMatchScenario(options?: {
        difficulty?: 'easy' | 'normal' | 'hard';
        warmupSeconds?: number;
        durationSeconds?: number;
    }): Promise<Record<string, number | null>>;
    runCombatScenario(options?: {
        barracksPerSide?: number;
        warmupSeconds?: number;
        durationSeconds?: number;
    }): Promise<Record<string, number | null>>;
    prepareRewardScenario(mode?: 'ready' | 'insufficient-gold' | 'no-target'): void;
    /**
     * Writes a Nexus's ECS health only; the next frame's death resolution
     * decides the result, so 0 forces the normal victory or defeat flow.
     */
    setNexusHealth(faction: 'player' | 'enemy', value: number): void;
}

declare global {
    interface Window {
        __gameDiagnostics?: GameDiagnostics;
    }
}

interface SoundEffects {
    ctx: AudioContext | null;
    noiseBuffers: Map<number, AudioBuffer>;
    init(): void;
    playBuild(): void;
    playRifleShot(): void;
    playHeavyCannon(): void;
    playCinematicExplosion(isNuclear?: boolean): void;
    playShellWhistle(flightSeconds: number): void;
    playJetFlyby(durationSeconds: number): void;
    playAirRaidSiren(): void;
    getNoiseBuffer(durationSeconds: number): AudioBuffer | null;
    suspend(): void;
    resume(): void;
}

interface UnlockEvent {
    definition?: { title?: string };
}

interface UnlockService {
    readonly unlocked: ReadonlySet<string>;
    resetProgress(): void;
    recordEvent(eventName: string, payload?: Record<string, unknown>): void;
    isUnlocked(id: string): boolean;
    hasTemporary(id: string): boolean;
    consumeTemporary(id: string): boolean;
    getAvailable(): Array<UnlockView & { meta?: { description?: string } }>;
    on(
        eventName: 'unlocked' | 'expired' | 'consumed',
        listener: (event: UnlockEvent) => void
    ): () => void;
}

export function createGameRuntime(ui: GameUiPort, unlocks: UnlockService) {
    const session = new GameSession();
    let renderCoordinator: ThreeRenderCoordinator;
    let frameLoop: GameFrameLoop;
    let inputController: GameInputController;
    const unlockSubscriptions: Array<() => void> = [];

    // Nuclear Explosion Sequence Timer & Victory Modal Delay
    let hqExplodingSequence = false;
    let hqExplodeTimer = 0;
    let pendingVictoryState = false;
    let matchEndTimeout: number | undefined;

    // Combat points, kill streaks, counters and the result: decided by the match layer
    let matchState = createMatchState();
    const deathResolver = new DeathResolver();

    const haptics = createHapticFeedback({ vibrate: createPlatformVibrate(), now: () => performance.now() });
    const nexusDamageAlert = createNexusDamageAlert();

    const SFX: SoundEffects = {
        ctx: null,
        noiseBuffers: new Map<number, AudioBuffer>(),
        init: function() {
            if (!this.ctx) {
                const AudioContextConstructor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
                if (AudioContextConstructor) this.ctx = new AudioContextConstructor();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        },
        playBuild: function() {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.15);
        },
        playRifleShot: function() {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(320, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.08);
        },
        playHeavyCannon: function() {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(25, this.ctx.currentTime + 0.28);
            gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.28);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.28);
        },
        getNoiseBuffer: function(durationSeconds: number) {
            if (!this.ctx) return null;
            let buffer = this.noiseBuffers.get(durationSeconds);
            if (!buffer) {
                const bufferSize = this.ctx.sampleRate * durationSeconds;
                buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }
                this.noiseBuffers.set(durationSeconds, buffer);
            }
            return buffer;
        },
        playCinematicExplosion: function(isNuclear = false) {
            if (!this.ctx) return;
            const dur = isNuclear ? 3.8 : 0.8;
            const buffer = this.getNoiseBuffer(dur);
            if (!buffer) return;
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(isNuclear ? 700 : 850, this.ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + dur);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(isNuclear ? 0.85 : 0.35, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start();
        },
        /** Falling whistle over the last stretch of a shell's flight, ending on impact. */
        playShellWhistle: function(flightSeconds: number) {
            if (!this.ctx) return;
            const impactAt = this.ctx.currentTime + flightSeconds;
            const startAt = Math.max(this.ctx.currentTime, impactAt - 1.2);
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1800, startAt);
            osc.frequency.exponentialRampToValueAtTime(350, impactAt);
            gain.gain.setValueAtTime(0.001, startAt);
            gain.gain.exponentialRampToValueAtTime(0.06, startAt + 0.1);
            gain.gain.setValueAtTime(0.06, impactAt - 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, impactAt);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(startAt);
            osc.stop(impactAt);
        },
        /** Jet roar that swells as the aircraft passes overhead and drops in pitch (doppler). */
        playJetFlyby: function(durationSeconds: number) {
            if (!this.ctx) return;
            const buffer = this.getNoiseBuffer(0.8);
            if (!buffer) return;
            const now = this.ctx.currentTime;
            const end = now + durationSeconds;
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.Q.value = 0.8;
            filter.frequency.setValueAtTime(900, now);
            filter.frequency.exponentialRampToValueAtTime(250, end);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.exponentialRampToValueAtTime(0.22, now + durationSeconds / 2);
            gain.gain.exponentialRampToValueAtTime(0.001, end);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now);
            noise.stop(end);
        },
        /** Two rise-and-fall sweeps warning that an enemy strike is incoming. */
        playAirRaidSiren: function() {
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const sweep = 1.2;
            const end = now + sweep * 2;
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(850, now + sweep / 2);
            osc.frequency.linearRampToValueAtTime(400, now + sweep);
            osc.frequency.linearRampToValueAtTime(850, now + sweep * 1.5);
            osc.frequency.linearRampToValueAtTime(400, end);
            filter.type = 'lowpass';
            filter.frequency.value = 1200;
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.exponentialRampToValueAtTime(0.1, now + 0.15);
            gain.gain.setValueAtTime(0.1, end - 0.3);
            gain.gain.exponentialRampToValueAtTime(0.001, end);
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(end);
        },
        // Freezing the audio clock keeps scheduled whistles and engines in sync with a paused simulation.
        suspend: function() {
            if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
        },
        resume: function() {
            if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
        }
    };

    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let cameraController: MapCameraController;
    let soldierRenderer: ThreeRenderCoordinator['soldiers'];
    let combatEffects: ThreeRenderCoordinator['effects'];
    let remains: BattlefieldRemains;
    let projectilePool: ThreeRenderCoordinator['projectiles'];
    let rewardEffectsView: RewardEffectsView;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Active Game Collections
    let playerBuildings: RuntimeStructure[] = [];
    let enemyBuildings: RuntimeStructure[] = [];
    let rewardScenarioBuildings: RuntimeStructure[] = [];
    let playerUnits: RuntimeUnit[] = [];
    let enemyUnits: RuntimeUnit[] = [];
    let projectiles: RuntimeProjectile[] = [];
    const projectileVisuals = new Map<Entity, RuntimeProjectile>();
    let menuUnits: THREE.Group[] = [];
    const diagnosticsEnabled = import.meta.env.DEV
        && new URLSearchParams(window.location.search).get('diagnostics') === '1';
    const diagnosticsOptions = diagnosticsEnabled ? parseDiagnosticsOptions(window.location.search) : null;
    // About one minute of frames at 60 FPS, so a whole scenario fits in one summary.
    const diagnosticsSamples = diagnosticsEnabled ? new MetricRing(3600) : null;
    let diagnosticsPreviousFrame = 0;
    let diagnosticsSimulationMs = 0;
    let diagnosticsEffectsMs = 0;
    let diagnosticsAiMs = 0;
    let diagnosticsAiCalls = 0;
    let diagnosticsAiDecisions = 0;
    const diagnosticsPhaseMs = {
        queries: 0,
        targeting: 0,
        movement: 0,
        weapons: 0,
        production: 0,
        resources: 0,
        projectiles: 0
    } satisfies Record<SimulationPhase, number>;
    const diagnosticsProfiler: SimulationProfiler | undefined = diagnosticsEnabled
        ? {
            now: () => performance.now(),
            record: (phase, milliseconds) => {
                diagnosticsPhaseMs[phase] += milliseconds;
            }
        }
        : undefined;
    let diagnosticsOverlay: DiagnosticsOverlay | null = null;
    let diagnosticsOverlayRefresh: (() => void) | null = null;
    let diagnosticsOverlayRefreshedAt = 0;

    // Economy & AI Targets
    let gold = 200;
    let enemyGold = 200;
    let playerHQ: RuntimeStructure | null = null;
    let enemyHQ: RuntimeStructure | null = null;
    let battleSimulation: BattleSimulation | null = null;
    const targetObjects = new Map<Entity, RuntimeTarget>();
    let selectedBuildType: BuildingType | null = null;
    let placementGhost: THREE.Group | null = null;
    let isDemolishMode = false;
    let terrainFloor: THREE.Mesh | null = null;
    let cameraShake = 0;
    let aiDifficulty: 'easy' | 'normal' | 'hard' = 'normal';
    let gameplayClockMs = 0;
    let lastRewardUiUpdateMs = -Infinity;
    let playerShieldVisual: THREE.Mesh | null = null;
    let enemyShieldVisual: THREE.Mesh | null = null;

    let stats: { soldiersTrained: number; buildingsConstructed: number; startTime: number } = {
        soldiersTrained: 0,
        buildingsConstructed: 0,
        startTime: 0
    };

    let enemyAi: EnemyAiController | null = null;
    let enemyAIEnabled = true;
    function showToast(msg: string) {
        ui.showToast(msg);
    }

    function initEngine() {
        renderCoordinator = new ThreeRenderCoordinator(
            ui.getCanvasContainer(),
            diagnosticsOptions
                ? {
                    maxPixelRatio: diagnosticsOptions.maxPixelRatio,
                    effects: { shockwaves: diagnosticsOptions.shockwaves, smoke: diagnosticsOptions.smoke }
                }
                : undefined
        );
        scene = renderCoordinator.scene;
        camera = renderCoordinator.camera;
        renderer = renderCoordinator.renderer;
        cameraController = renderCoordinator.cameraController;
        // Auto mode follows the fighting; the camera only receives plain coordinates.
        const combatEntities: Entity[] = [];
        cameraController.setAutoZoomSource((visit) => {
            const world = battleSimulation?.world;
            if (world) visitCombatPositions(world, combatEntities, visit);
        });
        cameraController.onAutoZoomChange = (enabled) => ui.setAutoZoom(enabled);
        soldierRenderer = renderCoordinator.soldiers;
        combatEffects = renderCoordinator.effects;
        remains = new BattlefieldRemains(scene, combatEffects);
        projectilePool = renderCoordinator.projectiles;
        rewardEffectsView = new RewardEffectsView({ scene, shellOrigin: strikeShellOrigin });
        createTerrain();

        inputController = new GameInputController(renderCoordinator.canvas, {
            onPointerMove,
            onPointerDown,
            onPointerUp,
            onPointerCancel,
            onEscape: cancelPlacement,
            onCancelPlacement: () => {
                if (selectedBuildType || isDemolishMode) {
                    cancelPlacement();
                    isDemolishMode = false;
                    updateDemolishUI();
                    return true;
                }
                return false;
            },
            onNativeBack: () => {
                if (session.state === 'PLAYING' || session.state === 'PAUSED') {
                    togglePause();
                    return true;
                }
                if (session.state === 'MATCH_ENDING') {
                    // Swallow the back press so the app doesn't exit mid-sequence
                    // (the session isn't pausable here - togglePause() would be a
                    // no-op anyway). The end sequence keeps running to completion
                    // on its own; see completeMatchEnd().
                    return true;
                }
                if (session.state === 'GAMEOVER') {
                    exitToMainMenu();
                    return true;
                }
                return false;
            },
            onApplicationInactive: () => {
                if (session.state === 'PLAYING') togglePause();
                frameLoop?.resetDelta();
            },
            onApplicationActive: () => {
                frameLoop?.resetDelta();
                if (session.state === 'MATCH_ENDING') completeMatchEnd();
            }
        });
        inputController.attach();

        setupMenuCinematic();
    }

    function createTerrain() {
        const planeGeo = new THREE.PlaneGeometry(110, 150);
        const planeMat = new THREE.MeshStandardMaterial({
            color: 0x0a0f1d,
            roughness: 0.8,
            metalness: 0.2
        });
        terrainFloor = new THREE.Mesh(planeGeo, planeMat);
        terrainFloor.rotation.x = -Math.PI / 2;
        terrainFloor.receiveShadow = true;
        scene.add(terrainFloor);

        // Plain unlit ground around the map so its edges don't float in a void;
        // it sits below the terrain (which hides it inside the map) and the far
        // fog blends it into the background before its own edge is seen.
        const outerGround = new THREE.Mesh(
            new THREE.PlaneGeometry(2000, 2000),
            new THREE.MeshBasicMaterial({ color: 0x0c1222 })
        );
        outerGround.rotation.x = -Math.PI / 2;
        outerGround.position.y = -0.1;
        scene.add(outerGround);

        const gridHelper = createTerrainGrid(110, 150, 5, 0x00f0ff, 0x1e293b);
        gridHelper.position.y = 0.05;
        scene.add(gridHelper);

        const centerLineGeo = new THREE.BoxGeometry(110, 0.2, 1);
        const centerLineMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6 });
        const centerLine = new THREE.Mesh(centerLineGeo, centerLineMat);
        centerLine.position.set(0, 0.1, 0);
        scene.add(centerLine);
    }

    function setupMenuCinematic() {
        for (let i = 0; i < 8; i++) {
            const s = createSoldierMesh(0x00f0ff);
            s.position.set(-15 + Math.random() * 10, 0, 10 + Math.random() * 10);
            scene.add(s);
            menuUnits.push(s);
        }
        for (let i = 0; i < 8; i++) {
            const s = createSoldierMesh(0xff3344);
            s.position.set(-15 + Math.random() * 10, 0, -10 - Math.random() * 10);
            scene.add(s);
            menuUnits.push(s);
        }
    }

    function startNewGame(settings = ui.getMissionSettings()) {
        SFX.init();
        nexusDamageAlert.reset();

        aiDifficulty = settings.difficulty;
        cancelPlacement();

        // Reset Nuclear Explosion Sequence Flags
        hqExplodingSequence = false;
        hqExplodeTimer = 0;
        pendingVictoryState = false;

        // Clear Menu Preview Units
        menuUnits.forEach((unit) => {
            scene.remove(unit);
            disposeObjectResources(unit);
        });
        menuUnits = [];

        teardownMatch();

        session.start();
        frameLoop?.start();
        frameLoop?.resetDelta();

        ui.enterGameplay();
        setTimeout(() => {
            updateUnlockUI();
        }, 700);

        cameraController.reset();

        // BOTH sides start CLEAN with ONLY the Nexus and 200 Gold
        gold = 200;
        enemyGold = 200;
        isDemolishMode = false;
        updateDemolishUI();

        stats.soldiersTrained = 0;
        stats.buildingsConstructed = 0;
        stats.startTime = Date.now();
        matchState = createMatchState();
        gameplayClockMs = 0;
        lastRewardUiUpdateMs = -Infinity;
        playerShieldVisual = null;
        enemyShieldVisual = null;

        // A fresh enemy AI per match: its own decision clock and structure targets.
        enemyAi = new EnemyAiController(getEnemyAiProfile(aiDifficulty), Math.random);

        updateResourceUI();

        // Player Nexus (HQ)
        playerHQ = {
            mesh: createHQMesh(0x00f0ff),
            hp: NEXUS_HEALTH,
            maxHp: NEXUS_HEALTH,
            position: new THREE.Vector3(PLAYER_BASE_POSITION.x, PLAYER_BASE_POSITION.y, PLAYER_BASE_POSITION.z),
            type: 'hq',
            isPlayer: true
        };
        playerHQ.mesh.position.copy(playerHQ.position);
        playerHQ.healthBar = createHealthBar(true, 5.2, 4.0, !diagnosticsOptions || diagnosticsOptions.bars);
        playerHQ.mesh.add(playerHQ.healthBar.group);
        playerShieldVisual = createNexusShieldVisual(0x22d3ee);
        playerHQ.mesh.add(playerShieldVisual);

        scene.add(playerHQ.mesh);
        playerBuildings.push(playerHQ);

        // Enemy Nexus (HQ)
        enemyHQ = {
            mesh: createHQMesh(0xff3344),
            hp: NEXUS_HEALTH,
            maxHp: NEXUS_HEALTH,
            position: new THREE.Vector3(ENEMY_BASE_POSITION.x, ENEMY_BASE_POSITION.y, ENEMY_BASE_POSITION.z),
            type: 'hq',
            isPlayer: false
        };
        enemyHQ.mesh.position.copy(enemyHQ.position);
        enemyHQ.healthBar = createHealthBar(false, 5.2, 4.0, !diagnosticsOptions || diagnosticsOptions.bars);
        enemyHQ.mesh.add(enemyHQ.healthBar.group);
        enemyShieldVisual = createNexusShieldVisual(0xfb7185);
        enemyHQ.mesh.add(enemyShieldVisual);

        scene.add(enemyHQ.mesh);
        enemyBuildings.push(enemyHQ);

        const enemyBaseIncome = getDifficultyProfile(aiDifficulty).enemyBaseIncome;
        battleSimulation = new BattleSimulation({
            enemyBaseIncome,
            profiler: diagnosticsProfiler,
            modifyDamage: (target, amount) => {
                const simulation = battleSimulation;
                if (!simulation) return amount;
                return applyFactionShield(
                    matchState,
                    { player: simulation.playerBase, enemy: simulation.enemyBase },
                    target,
                    amount,
                    gameplayClockMs,
                    aiDifficulty
                );
            }
        });
        playerHQ.ecsEntityId = battleSimulation.playerBase;
        enemyHQ.ecsEntityId = battleSimulation.enemyBase;
        targetObjects.set(playerHQ.ecsEntityId, playerHQ);
        targetObjects.set(enemyHQ.ecsEntityId, enemyHQ);

        showToast("¡Construye Barracas para desplegar tropas!");
    }

    function resetGame() {
        unlocks.resetProgress();
        startNewGame();
    }

    function togglePause() {
        if (session.pause()) {
            SFX.suspend();
            ui.setPaused(true);
        } else if (session.resume()) {
            frameLoop?.resetDelta();
            SFX.resume();
            ui.setPaused(false);
        }
    }

    function exitToMainMenu() {
        teardownMatch();

        session.returnToMenu();
        frameLoop?.start();
        frameLoop?.resetDelta();

        ui.enterMainMenu();
        ui.setPlacementActive(false);

        setupMenuCinematic();
    }

    function teardownMatch(): void {
        if (matchEndTimeout !== undefined) {
            window.clearTimeout(matchEndTimeout);
            matchEndTimeout = undefined;
        }
        remains.clear();
        rewardEffectsView.clear();
        disposeNexusShieldVisuals();
        for (const building of [...playerBuildings, ...enemyBuildings]) {
            scene.remove(building.mesh);
            disposeObjectResources(building.mesh);
        }
        for (const unit of [...playerUnits, ...enemyUnits]) {
            if (unit.type === 'rifleman') soldierRenderer.remove(unit.ecsEntityId);
            else if (unit.mesh instanceof THREE.Object3D) {
                scene.remove(unit.mesh);
                disposeObjectResources(unit.mesh);
            }
        }
        projectilePool.clear();
        combatEffects.clear();
        battleSimulation?.world.clear();
        cameraShake = 0;
        playerBuildings = [];
        enemyBuildings = [];
        rewardScenarioBuildings = [];
        playerUnits = [];
        enemyUnits = [];
        playerHQ = null;
        enemyHQ = null;
        projectiles = [];
        projectileVisuals.clear();
        targetObjects.clear();
        battleSimulation = null;
        cancelPlacement();
        isDemolishMode = false;
        updateDemolishUI();
    }

    function updateResourceUI() {
        const activeBarracks = playerBuildings.filter(isValidSoldierFactory);
        const production: BarracksProductionView[] = [];
        let availableFactories = 0;
        const simulation = battleSimulation;
        if (simulation) {
            for (const barracks of activeBarracks) {
                const order = simulation.world.getComponent(
                    barracks.ecsEntityId,
                    ECS_COMPONENTS.production
                )?.order;
                if (!order) {
                    availableFactories++;
                    continue;
                }
                production.push({
                    unit: order.kind,
                    remainingSeconds: order.remainingSeconds,
                    durationSeconds: order.durationSeconds
                });
            }
            gold = getFactionGold(ECS_FACTIONS.player);
            enemyGold = getFactionGold(ECS_FACTIONS.enemy);
        }
        ui.updateResources(gold, enemyGold, activeBarracks.length, availableFactories, production);
        updateRewardUI();
    }

    function updateRewardUI() {
        const targetCount = battleSimulation ? rewardTargetCandidates(battleSimulation.world, ECS_FACTIONS.player).length : 0;
        const rewards: RewardUiState['rewards'][number][] = [];
        for (const id of ['artillery_strike', 'air_strike', 'defensive_shield'] as const) {
            const definition = getRewardDefinitionForDifficulty(id, aiDifficulty);
            const activeUntil = id === 'defensive_shield'
                ? matchState.rewards.player.shieldUntilMs
                : matchState.rewards.player.strikeActiveUntilMs[id] ?? 0;
            const activeRemaining = Math.max(0, (activeUntil - gameplayClockMs) / 1000);
            const cooldownRemaining = Math.max(0, (matchState.rewards.player.cooldownUntilMs - gameplayClockMs) / 1000);
            let status: RewardStatus;
            if (activeRemaining > 0) {
                status = 'ACTIVE';
            } else if (matchState.combatPoints.player < definition.pointsCost) {
                status = 'LOCKED';
            } else if (getFactionGold(ECS_FACTIONS.player) < definition.goldCost) {
                status = 'INSUFFICIENT GOLD';
            } else if (id !== 'defensive_shield' && targetCount === 0) {
                status = 'NO VALID TARGET';
            } else if (cooldownRemaining > 0) {
                status = 'COOLDOWN';
            } else {
                status = 'READY';
            }
            rewards.push({
                id,
                status,
                remainingSeconds: activeRemaining,
                cooldownSeconds: cooldownRemaining
            });
        }
        ui.updateRewardState({
            difficulty: aiDifficulty,
            combatPoints: matchState.combatPoints.player,
            gold: getFactionGold(ECS_FACTIONS.player),
            rewards
        });
    }

    function getEconomyEntity(faction: 'player' | 'enemy'): Entity | undefined {
        if (!battleSimulation) return undefined;
        return faction === ECS_FACTIONS.player
            ? battleSimulation.playerBase
            : battleSimulation.enemyBase;
    }

    function getFactionGold(faction: 'player' | 'enemy'): number {
        const economyEntity = getEconomyEntity(faction);
        const balance = economyEntity === undefined || !battleSimulation
            ? undefined
            : battleSimulation.world.getComponent(economyEntity, ECS_COMPONENTS.economy)?.gold;
        return balance ?? (faction === ECS_FACTIONS.player ? gold : enemyGold);
    }

    /** Keeps the gold mirrors in step after a command spent or refunded gold. */
    function syncGoldMirrors(): void {
        gold = getFactionGold(ECS_FACTIONS.player);
        enemyGold = getFactionGold(ECS_FACTIONS.enemy);
    }

    /** A fresh view of the match for one game command; the session phase is read now. */
    function commandContext(simulation: BattleSimulation): CommandContext {
        return {
            world: simulation.world,
            bases: { player: simulation.playerBase, enemy: simulation.enemyBase },
            match: matchState,
            sessionPhase: session.state,
            difficulty: aiDifficulty,
            nowMs: gameplayClockMs
        };
    }

    function isValidSoldierFactory(
        building: RuntimeStructure
    ): building is RuntimeStructure & { ecsEntityId: Entity } {
        if (building.ecsEntityId === undefined || !battleSimulation
            || battleSimulation.world.getComponent(building.ecsEntityId, ECS_COMPONENTS.building)?.kind
                !== 'barracks') return false;
        if (!battleSimulation.world.getComponent(building.ecsEntityId, ECS_COMPONENTS.factory)) return false;
        const health = battleSimulation.world.getComponent(building.ecsEntityId, ECS_COMPONENTS.health);
        return health !== undefined && health.current > 0;
    }

    function toggleDemolishMode() {
        cancelPlacement();
        isDemolishMode = !isDemolishMode;
        updateDemolishUI();
        if (isDemolishMode) {
            showToast("🗑️ MODO BORRAR: Haz click en una de tus estructuras para venderla.");
        }
    }

    function updateDemolishUI() {
        ui.setDemolishMode(isDemolishMode);
    }

    function selectBuildingToPlace(type: BuildingType) {
        if (isDemolishMode) {
            isDemolishMode = false;
            updateDemolishUI();
        }
        if (placementGhost) scene.remove(placementGhost);

        selectedBuildType = type;
        placementGhost = instantiateBuildingMesh(type, true);

        if (placementGhost) {
            placementGhost.position.set(0, -100, 0);
            scene.add(placementGhost);
            ui.setPlacementActive(true);
            showToast("Haz click en tu territorio para posicionar la estructura.");
        }
    }

    function cancelPlacement() {
        if (placementGhost) scene.remove(placementGhost);
        placementGhost = null;
        selectedBuildType = null;
        ui.setPlacementActive(false);
    }

    function onPointerMove(event: PointerEvent) {
        updatePointerPosition(event);
        updatePlacementGhost();
    }

    // Player build zone: own half of the 110 x 150 terrain, from just behind
    // the center line up to 2 units short of the side and back edges.
    const BUILD_ZONE_MIN_Z = 5;
    const BUILD_ZONE_MAX_Z = 73;
    const BUILD_ZONE_MAX_ABS_X = 53;

    function getPlacementPosition(): THREE.Vector3 | undefined {
        if (!terrainFloor) return undefined;
        raycaster.setFromCamera(mouse, camera);
        const point = raycaster.intersectObject(terrainFloor)[0]?.point;
        if (!point
            || point.z <= BUILD_ZONE_MIN_Z
            || point.z >= BUILD_ZONE_MAX_Z
            || Math.abs(point.x) >= BUILD_ZONE_MAX_ABS_X) return undefined;
        return new THREE.Vector3(Math.round(point.x), 0, Math.round(point.z));
    }

    function updatePlacementGhost() {
        if (!selectedBuildType || !placementGhost) return;
        const position = getPlacementPosition();
        if (position) placementGhost.position.copy(position);
        else placementGhost.position.set(0, -100, 0);
    }

    function updatePointerPosition(event: MouseEvent) {
        const bounds = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    }

    // Tap-vs-drag disambiguation for Finding G: `pointerdown` fires the
    // instant a finger/mouse touches the canvas, before any movement, and
    // OrbitControls listens for pointer events on the same canvas to drive
    // camera orbiting. Committing immediately on `pointerdown` meant a
    // one-finger orbit/pan gesture that merely started while a build type was
    // selected (or demolish mode was active) would place or sell a building
    // at the drag's starting point before the gesture finished. Instead, a
    // `pointerdown` only records where the gesture started; the actual
    // commit happens on `pointerup`, gated by this movement tolerance, using
    // a fresh raycast from the pointerup position.
    const TAP_MOVEMENT_TOLERANCE_PX = 10;
    const DOUBLE_TAP_INTERVAL_MS = 300;
    const DOUBLE_TAP_DISTANCE_PX = 30;
    let pendingGesture: { pointerId: number; startX: number; startY: number } | null = null;
    // Previous plain tap (no build type selected, not demolishing), used to
    // detect a double tap that glides the camera focus to that point.
    let lastFocusTap: TapSample | null = null;

    function onPointerDown(event: PointerEvent) {
        if (session.state !== 'PLAYING') return;
        pendingGesture = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    }

    function onPointerCancel() {
        pendingGesture = null;
    }

    function onPointerUp(event: PointerEvent) {
        const gesture = pendingGesture;
        pendingGesture = null;
        if (session.state !== 'PLAYING' || !gesture || gesture.pointerId !== event.pointerId) return;

        if (exceedsTapTolerance(gesture.startX, gesture.startY, event.clientX, event.clientY, TAP_MOVEMENT_TOLERANCE_PX)) {
            lastFocusTap = null;
            return;
        }

        // Double tap only refocuses the camera outside build/demolish modes so
        // a single tap there still commits instantly.
        if (!selectedBuildType && !isDemolishMode) {
            const tap: TapSample = { timeMs: event.timeStamp, x: event.clientX, y: event.clientY };
            if (isDoubleTap(lastFocusTap, tap, DOUBLE_TAP_INTERVAL_MS, DOUBLE_TAP_DISTANCE_PX)) {
                lastFocusTap = null;
                cameraController.focusOnScreenPoint(event.clientX, event.clientY);
                return;
            }
            lastFocusTap = tap;
        } else {
            lastFocusTap = null;
        }

        updatePointerPosition(event);
        const committedPosition = getPlacementPosition();
        updatePlacementGhost();

        // Demolish Click
        if (isDemolishMode) {
            raycaster.setFromCamera(mouse, camera);
            const playerMeshes = playerBuildings
                .filter(b => b.type !== 'hq')
                .map(b => b.mesh);

            const intersects = raycaster.intersectObjects(playerMeshes, true);
            if (intersects.length > 0) {
                let hitMesh = intersects[0].object;
                while (hitMesh.parent && hitMesh.parent.type === "Group" && !playerBuildings.some(b => b.mesh === hitMesh)) {
                    hitMesh = hitMesh.parent;
                }

                const buildingIndex = playerBuildings.findIndex(b => b.mesh === hitMesh);
                if (buildingIndex !== -1) {
                    const b = playerBuildings[buildingIndex];
                    const simulation = battleSimulation;
                    if (!simulation || b.ecsEntityId === undefined) return;
                    const sale = sellStructure(commandContext(simulation), ECS_FACTIONS.player, b.ecsEntityId);
                    // Only non-Nexus meshes are hit-tested above, so a rejection only happens outside play.
                    if (!sale.accepted) return;
                    syncGoldMirrors();

                    SFX.playBuild();
                    scene.remove(b.mesh);
                    disposeObjectResources(b.mesh);
                    targetObjects.delete(b.ecsEntityId);
                    playerBuildings.splice(buildingIndex, 1);

                    showToast(`🗑️ Estructura vendida. Recuperas +${sale.refund} Oro.`);
                    updateResourceUI();
                    return;
                }
            }
        }

        // Building Placement Click
        if (selectedBuildType && committedPosition) {
            const type = selectedBuildType;
            const simulation = battleSimulation;
            if (!simulation) return;
            const build = buildStructure(
                commandContext(simulation),
                ECS_FACTIONS.player,
                type,
                { x: committedPosition.x, y: committedPosition.y, z: committedPosition.z }
            );
            if (!build.accepted && build.reason === 'too-close') {
                showToast("⚠️ Ubicación ocupada. Elige otro punto.");
                return;
            }
            // The raycast already keeps taps inside the zone, and play is checked above.
            if (!build.accepted && build.reason !== 'insufficient-gold') return;

            if (build.accepted) {
                syncGoldMirrors();
                SFX.playBuild();
                stats.buildingsConstructed++;
                unlocks.recordEvent('building_constructed', {
                    buildingsPlaced: stats.buildingsConstructed,
                    buildingType: type
                });
                representStructure(build.entity);
                showToast(`¡${type.toUpperCase()} CONSTRUIDO!`);
            } else {
                showToast("¡Recursos insuficientes!");
            }

            cancelPlacement();
            updateResourceUI();
        }
    }

    /** Creates the visual of a structure the ECS already holds, from its ECS state. */
    function representStructure(entity: Entity): RuntimeStructure {
        const simulation = battleSimulation;
        if (!simulation) throw new Error('Cannot represent a structure without a battle');
        const { world } = simulation;
        const type = world.getComponent(entity, ECS_COMPONENTS.building)?.kind;
        const faction = world.getComponent(entity, ECS_COMPONENTS.faction);
        const position = world.getComponent(entity, ECS_COMPONENTS.transform);
        const health = world.getComponent(entity, ECS_COMPONENTS.health);
        if (!type || type === 'hq' || !faction || !position || !health) {
            throw new Error(`Entity ${entity} is not a placeable structure`);
        }
        const isPlayer = faction === ECS_FACTIONS.player;
        const mesh = instantiateBuildingMesh(type, isPlayer);
        mesh.position.set(position.x, position.y, position.z);
        const building: RuntimeStructure = {
            mesh,
            hp: health.current,
            maxHp: health.max,
            position: new THREE.Vector3(position.x, position.y, position.z),
            type,
            isPlayer,
            healthBar: createHealthBar(isPlayer, type === 'turret' ? 2.8 : 2.5, 2.2, !diagnosticsOptions || diagnosticsOptions.bars),
            ecsEntityId: entity
        };
        if (building.healthBar) mesh.add(building.healthBar.group);
        scene.add(mesh);
        targetObjects.set(entity, building);
        (isPlayer ? playerBuildings : enemyBuildings).push(building);
        return building;
    }

    function createTroopVisual(event: ProductionCompletedEvent): void {
        if (!battleSimulation || !soldierRenderer) {
            throw new Error('Cannot render a completed production order before the battle renderer is initialized');
        }
        const { world } = battleSimulation;
        const position = world.getComponent(event.soldier, ECS_COMPONENTS.transform);
        const health = world.getComponent(event.soldier, ECS_COMPONENTS.health);
        const kind = world.getComponent(event.soldier, ECS_COMPONENTS.soldierKind);
        if (!position || !health || !kind) {
            throw new Error(`Completed production entity ${event.soldier} is missing soldier state`);
        }

        const isPlayer = event.faction === ECS_FACTIONS.player;
        const spawnPosition = new THREE.Vector3(position.x, position.y, position.z);
        const mesh = kind === 'rifleman'
            ? soldierRenderer.add(event.soldier, event.faction, spawnPosition)
            : createTankMesh(isPlayer ? 0x00f0ff : 0xff3344);
        mesh.position.copy(spawnPosition);

        const unitObj: RuntimeUnit = {
            mesh: mesh,
            hp: health.current,
            maxHp: health.max,
            type: kind,
            isPlayer: isPlayer,
            ecsEntityId: event.soldier
        };

        if (kind !== 'rifleman') {
            const healthBar = createHealthBar(isPlayer, 1.8, 1.4, !diagnosticsOptions || diagnosticsOptions.bars);
            unitObj.healthBar = healthBar;
            if (mesh instanceof THREE.Group) {
                mesh.add(healthBar.group);
                scene.add(mesh);
            }
        }

        targetObjects.set(event.soldier, unitObj);

        if (isPlayer) playerUnits.push(unitObj);
        else enemyUnits.push(unitObj);
        if (isPlayer) stats.soldiersTrained++;
    }

    function trainUnit(unitType: UnitType) {
        if (session.state !== 'PLAYING') return;
        const simulation = battleSimulation;
        if (!simulation) return;
        const { world } = simulation;
        if (liveFactories(world, ECS_FACTIONS.player).length === 0) {
            showToast("¡Debes construir una Barraca primero!");
            return;
        }

        const barracks = idleFactories(world, ECS_FACTIONS.player)[0];
        if (barracks === undefined) {
            showToast("Todas las Barracas están produciendo.");
            return;
        }

        const barracksPosition = world.getComponent(barracks, ECS_COMPONENTS.transform);
        if (!barracksPosition) throw new Error(`Barracks ${barracks} has no position`);
        const hasVeteranArmor = unitType === 'tank' && unlocks.isUnlocked('veteran_armor');
        const overrides: ProductionOverrides = hasVeteranArmor
            ? { health: 456, weaponDamage: 54 }
            : {};
        const result = trainUnitCommand(
            commandContext(simulation),
            ECS_FACTIONS.player,
            barracks,
            unitType,
            {
                x: barracksPosition.x + (Math.random() - 0.5) * 3,
                y: barracksPosition.y,
                z: barracksPosition.z - 3
            },
            overrides
        );
        syncGoldMirrors();
        updateResourceUI();
        if (!result.accepted && (result.reason === 'match-over' || result.reason === 'not-playing')) return;
        if (!result.accepted) {
            showToast(result.reason === 'insufficient-resources'
                ? "¡No tienes suficiente Oro!"
                : "La Barraca no está disponible para producir.");
            return;
        }
        SFX.playBuild();
        showToast(`Orden aceptada: ${unitType === 'rifleman' ? 'soldado' : 'tanque'}.`);
    }

    /** Represents what the AI's commands changed; the rules already ran in the domain. */
    function representEnemyTurn(turn: EnemyAiTurn, simulation: BattleSimulation): void {
        ui.setAiStatus(turn.status === 'satisfied' ? "BATALLÓN ACTIVO" : "CONSTRUYENDO");
        const outcomes = executeEnemyTurn(commandContext(simulation), turn);
        for (const outcome of outcomes) {
            if (!outcome.result.accepted) continue;
            const { command, result } = outcome;
            if (command.type === 'build' && 'entity' in result) {
                representStructure(result.entity);
            } else if (command.type === 'activateReward' && 'definition' in result) {
                representRewardActivation(ECS_FACTIONS.enemy, command.reward, result);
            }
        }
        // As before, a rejected enemy reward still refreshed the reward panel.
        if (turn.commands.some((command, index) => command.type === 'activateReward' && !outcomes[index].result.accepted)) {
            updateRewardUI();
        }
        syncGoldMirrors();
    }

    function updateEnemyAI(delta: number) {
        const simulation = battleSimulation;
        if (!enemyAIEnabled || !enemyAi || !simulation) return;
        if (diagnosticsEnabled) diagnosticsAiCalls++;
        const turn = enemyAi.update(delta, () => buildEnemyAiSnapshot(commandContext(simulation)));
        if (!turn) return;
        if (diagnosticsEnabled) diagnosticsAiDecisions++;
        representEnemyTurn(turn, simulation);
    }

    function createMushroomCloud(position: THREE.Vector3) {
        cameraShake = 4.5;
        SFX.playCinematicExplosion(true);
        haptics.nexusDestroyed();
        combatEffects.createNuclearExplosion(position);
    }

    function createCinematicExplosion(position: THREE.Vector3, scale = 1.0, isHQ = false) {
        if (isHQ) {
            createMushroomCloud(position);
            return;
        }

        SFX.playCinematicExplosion(false);
        cameraShake = Math.max(cameraShake, scale * 0.7);
        combatEffects.createExplosion(position, scale);
    }

    function representUnitDeath(event: Extract<MatchEvent, { type: 'unitDied' }>) {
        for (const call of unlockEventsFor(event)) unlocks.recordEvent(call.name, call.payload);
        targetObjects.delete(event.entity);
        const units = event.faction === ECS_FACTIONS.player ? playerUnits : enemyUnits;
        const index = units.findIndex((unit) => unit.ecsEntityId === event.entity);
        if (index < 0) return;
        const unit = units[index];
        unit.mesh.position.set(event.position.x, event.position.y, event.position.z);
        createCinematicExplosion(unit.mesh.position, event.kind === 'tank' ? 1.2 : 0.6, false);
        if (event.kind === 'tank') {
            remains.addTankWreck(unit.mesh.position);
        } else {
            remains.addSoldierCorpse(unit.mesh.position);
        }
        if (unit.type === 'rifleman') {
            soldierRenderer.remove(event.entity);
        } else if (unit.mesh instanceof THREE.Object3D) {
            scene.remove(unit.mesh);
            disposeObjectResources(unit.mesh);
        }
        units.splice(index, 1);
    }

    function representStructureDestruction(event: Extract<MatchEvent, { type: 'structureDestroyed' }>) {
        targetObjects.delete(event.entity);
        const buildings = event.faction === ECS_FACTIONS.player ? playerBuildings : enemyBuildings;
        const index = buildings.findIndex((building) => building.ecsEntityId === event.entity);
        if (index < 0) return;
        const building = buildings[index];
        const isHQ = event.kind === 'hq';
        if (!isHQ) remains.addBuildingRuin(building.position, event.kind);
        createCinematicExplosion(building.position, isHQ ? 3.0 : 1.2, isHQ);
        scene.remove(building.mesh);
        disposeObjectResources(building.mesh);
        buildings.splice(index, 1);
    }

    function updateUnitGroup(units: RuntimeUnit[]) {
        const simulation = battleSimulation;
        if (!simulation) return;
        for (let i = units.length - 1; i >= 0; i--) {
            const unit = units[i];
            const entity = unit.ecsEntityId;
            const health = simulation.world.getComponent(entity, ECS_COMPONENTS.health);
            const transform = simulation.world.getComponent(entity, ECS_COMPONENTS.transform);
            if (health) {
                unit.hp = health.current;
                unit.maxHp = health.max;
            }
            if (transform) unit.mesh.position.set(transform.x, transform.y, transform.z);

            if (unit.healthBar) {
                unit.healthBar.update(unit.hp, unit.maxHp);
                unit.healthBar.billboard(camera);
            } else {
                soldierRenderer.setHealth(entity, unit.hp, unit.maxHp);
            }

            const targetEntity = simulation.getTarget(entity);
            const targetPosition = targetEntity === undefined
                ? null
                : simulation.world.getComponent(targetEntity, ECS_COMPONENTS.transform);
            if (targetPosition && transform) {
                unit.mesh.lookAt(targetPosition.x, transform.y, targetPosition.z);
            }
        }
    }

    function updateTurretAim(turret: RuntimeStructure) {
        const simulation = battleSimulation;
        const entity = turret.ecsEntityId;
        if (!simulation || entity === undefined) return;
        const target = simulation.getTarget(entity);
        const targetPosition = target === undefined
            ? undefined
            : simulation.world.getComponent(target, ECS_COMPONENTS.transform);
        const head = turret.mesh.userData.head as THREE.Object3D | undefined;
        if (targetPosition && head) {
            head.lookAt(targetPosition.x, head.position.y + turret.position.y, targetPosition.z);
        }
    }

    function updateTurrets() {
        for (const turret of playerBuildings) {
            if (turret.type === 'turret') updateTurretAim(turret);
        }
        for (const turret of enemyBuildings) {
            if (turret.type === 'turret') updateTurretAim(turret);
        }
    }

    function advanceBattleSimulation(delta: number, time: number) {
        const simulation = battleSimulation;
        if (!simulation) return;

        const simulationStart = diagnosticsEnabled ? performance.now() : 0;
        simulation.advance(delta);
        if (diagnosticsEnabled) diagnosticsSimulationMs = performance.now() - simulationStart;

        simulation.drainGeneratedIncome();

        for (const event of simulation.drainWeaponEvents()) {
            createProjectileVisual(event, time);
        }
        for (const event of simulation.drainProductionEvents()) {
            createTroopVisual(event);
        }
        for (const impact of simulation.drainProjectileImpacts()) {
            finishProjectileVisual(impact);
        }
        syncProjectileVisuals();
    }

    function createProjectileVisual(event: WeaponFireEvent, time: number) {
        const simulation = battleSimulation;
        if (!simulation) return;
        const projectile = simulation.world.getComponent(event.projectile, ECS_COMPONENTS.projectile);
        const position = simulation.world.getComponent(event.projectile, ECS_COMPONENTS.transform);
        const faction = simulation.world.getComponent(event.source, ECS_COMPONENTS.faction);
        if (!projectile || !position || !faction) return;

        const source = targetObjects.get(event.source);
        if (source && 'type' in source && source.type === 'rifleman') {
            SFX.playRifleShot();
            soldierRenderer.showMuzzleFlash(event.source, time + 0.05);
        } else {
            SFX.playHeavyCannon();
        }

        const mesh = projectilePool.acquire(
            new THREE.Vector3(position.x, position.y, position.z),
            faction === ECS_FACTIONS.player,
            projectile.isHeavy
        );
        if (!mesh) return;

        const visual: RuntimeProjectile = {
            ecsEntityId: event.projectile,
            mesh
        };
        projectiles.push(visual);
        projectileVisuals.set(event.projectile, visual);
    }

    function finishProjectileVisual(impact: ProjectileImpact) {
        const visual = projectileVisuals.get(impact.projectile);
        if (visual) {
            projectilePool.release(visual.mesh);
            projectileVisuals.delete(impact.projectile);
            const index = projectiles.indexOf(visual);
            if (index !== -1) projectiles.splice(index, 1);
        }
        if (impact.isHeavy) {
            createCinematicExplosion(
                new THREE.Vector3(impact.position.x, impact.position.y, impact.position.z),
                0.6,
                false
            );
        }
    }

    function syncProjectileVisuals() {
        const simulation = battleSimulation;
        if (!simulation) return;
        for (let index = projectiles.length - 1; index >= 0; index--) {
            const visual = projectiles[index];
            const position = simulation.world.getComponent(
                visual.ecsEntityId,
                ECS_COMPONENTS.transform
            );
            if (!position) {
                projectilePool.release(visual.mesh);
                projectileVisuals.delete(visual.ecsEntityId);
                projectiles.splice(index, 1);
                continue;
            }
            visual.mesh.position.set(position.x, position.y, position.z);
        }
    }

    function updateCombat(delta: number) {
        // Camera Shake Physics
        if (cameraShake > 0) {
            camera.position.x += (Math.random() - 0.5) * cameraShake;
            camera.position.y += (Math.random() - 0.5) * cameraShake;
            camera.position.z += (Math.random() - 0.5) * cameraShake;
            cameraShake = Math.max(0, cameraShake - delta * 4.0);
        }

        updateResourceUI();

        if (playerHQ && enemyHQ) {
            const playerHealth = playerHQ.ecsEntityId === undefined || !battleSimulation
                ? undefined
                : battleSimulation.world.getComponent(playerHQ.ecsEntityId, ECS_COMPONENTS.health);
            const enemyHealth = enemyHQ.ecsEntityId === undefined || !battleSimulation
                ? undefined
                : battleSimulation.world.getComponent(enemyHQ.ecsEntityId, ECS_COMPONENTS.health);
            if (playerHealth) {
                if (nexusDamageAlert.report(playerHQ.hp, playerHealth.current, gameplayClockMs)) {
                    ui.flashNexusAlert();
                    showToast('¡NEXUS BAJO ATAQUE!');
                    haptics.nexusUnderAttack();
                }
                playerHQ.hp = playerHealth.current;
                playerHQ.maxHp = playerHealth.max;
            }
            if (enemyHealth) {
                enemyHQ.hp = enemyHealth.current;
                enemyHQ.maxHp = enemyHealth.max;
            }
            ui.setBaseHealth(
                { current: playerHQ.hp, maximum: playerHQ.maxHp },
                { current: enemyHQ.hp, maximum: enemyHQ.maxHp }
            );
        }

        const resolution = battleSimulation
            ? deathResolver.resolve(battleSimulation.world, matchState, aiDifficulty, {
                player: battleSimulation.playerBase,
                enemy: battleSimulation.enemyBase
            })
            : undefined;
        for (const event of resolution?.events ?? []) {
            if (event.type === 'unitDied') representUnitDeath(event);
        }

        // Update Units with identical billboard camera health bars
        updateUnitGroup(playerUnits);
        updateUnitGroup(enemyUnits);

        updateTurrets();

        const effectsStart = diagnosticsEnabled ? performance.now() : 0;
        combatEffects.update(delta);
        if (diagnosticsEnabled) diagnosticsEffectsMs = performance.now() - effectsStart;

        for (const event of resolution?.events ?? []) {
            if (event.type === 'structureDestroyed') representStructureDestruction(event);
        }

        // Building Health Bars
        const updateBuildingList = (bList: RuntimeStructure[]) => {
            for (const b of bList) {
                if (battleSimulation && b.ecsEntityId !== undefined) {
                    const health = battleSimulation.world.getComponent(b.ecsEntityId, ECS_COMPONENTS.health);
                    if (health) {
                        b.hp = health.current;
                        b.maxHp = health.max;
                    }
                }
                if (b.healthBar) {
                    b.healthBar.update(b.hp, b.maxHp);
                    b.healthBar.billboard(camera);
                }
            }
        };
        updateBuildingList(playerBuildings);
        updateBuildingList(enemyBuildings);

        // HQ Nuclear Explosion Trigger. The result is reported as new only once, so this
        // relies on beginMatchEnding succeeding: updateCombat only runs while PLAYING.
        if (resolution?.outcomeIsNew && !hqExplodingSequence) {
            beginMatchEnding(resolution.outcome === 'victory');
        }
    }

    function isShieldActiveForFaction(faction: 'player' | 'enemy', now = gameplayClockMs): boolean {
        return matchState.rewards[faction].shieldUntilMs > now;
    }

    const ARTILLERY_CAMERA_NEXUS_DISTANCE = 38;
    const ARTILLERY_CAMERA_IMPACT_DISTANCE = 50;
    const AIR_STRIKE_CAMERA_LEAD_SECONDS = 1;
    const AIR_STRIKE_CAMERA_DISTANCE = 45;
    /** Filled by advanceStrikes each frame and read right after; one array for the whole app. */
    const strikeEvents: StrikeEvent[] = [];

    /** Where shell `index` leaves the faction's Nexus (only visual; the domain never reads it). */
    function strikeShellOrigin(faction: 'player' | 'enemy', index: number, shellCount: number) {
        const nexus = faction === ECS_FACTIONS.player ? playerHQ : enemyHQ;
        const base = nexus?.position ?? (faction === ECS_FACTIONS.player ? PLAYER_BASE_POSITION : ENEMY_BASE_POSITION);
        return muzzleOrigin(base, index, shellCount);
    }

    /** Lands this frame's due strike impacts on the gameplay clock, then plays and draws them. */
    function advanceRewardStrikes(delta: number): void {
        const simulation = battleSimulation;
        if (!simulation) return;
        advanceStrikes(
            simulation.world,
            matchState,
            { player: simulation.playerBase, enemy: simulation.enemyBase },
            delta,
            gameplayClockMs,
            aiDifficulty,
            strikeEvents
        );
        representStrikeEvents(strikeEvents);
        rewardEffectsView.sync(matchState.strikes);
    }

    /** Plays this frame's launches and impacts; the domain already applied their damage. */
    function representStrikeEvents(events: readonly StrikeEvent[]): void {
        for (const event of events) {
            if (event.type === 'shell-launched') {
                const origin = strikeShellOrigin(event.faction, event.index, ARTILLERY_IMPACT_OFFSETS.length);
                combatEffects.createExplosion(new THREE.Vector3(origin.x, origin.y, origin.z), 0.3);
                SFX.playHeavyCannon();
                SFX.playShellWhistle(ARTILLERY_SHELL_FLIGHT_SECONDS);
            } else if (event.type === 'impact') {
                createCinematicExplosion(
                    new THREE.Vector3(event.x, 0, event.z),
                    event.kind === 'artillery_strike' ? 0.85 : 0.82,
                    false
                );
                haptics.strikeImpact();
            }
        }
    }

    function disposeNexusShieldVisuals(): void {
        if (playerShieldVisual) disposeObjectResources(playerShieldVisual);
        if (enemyShieldVisual) disposeObjectResources(enemyShieldVisual);
        playerShieldVisual = null;
        enemyShieldVisual = null;
    }

    /** Player-only cinematic: show the salvo leaving the Nexus, then follow it to the impact zone. */
    function playArtilleryCinematic(impactCenter: StrikeAim): void {
        if (!playerHQ) return;
        const shellCount = ARTILLERY_IMPACT_OFFSETS.length;
        const firstImpactAt = ARTILLERY_LAUNCH_DELAY_SECONDS + ARTILLERY_SHELL_FLIGHT_SECONDS;
        // Stay on the Nexus until the second shell is out, then arrive just before the first lands.
        const leaveNexusAt = ARTILLERY_LAUNCH_DELAY_SECONDS + ARTILLERY_SALVO_INTERVAL_SECONDS + 0.1;
        const arriveAt = firstImpactAt - 0.15;
        cameraController.playShots([
            {
                x: playerHQ.position.x,
                z: playerHQ.position.z,
                durationSeconds: ARTILLERY_LAUNCH_DELAY_SECONDS,
                holdSeconds: leaveNexusAt - ARTILLERY_LAUNCH_DELAY_SECONDS,
                distance: ARTILLERY_CAMERA_NEXUS_DISTANCE
            },
            {
                x: impactCenter.x,
                z: impactCenter.z,
                durationSeconds: arriveAt - leaveNexusAt,
                holdSeconds: artilleryStrikeDurationSeconds(shellCount) - arriveAt + 0.8,
                distance: ARTILLERY_CAMERA_IMPACT_DISTANCE
            }
        ]);
    }

    /** Unit ground direction the camera looks along; the player's aircraft flies this way to stay in view. */
    function cameraGroundHeading(): StrikeAim {
        const forward = camera.getWorldDirection(new THREE.Vector3());
        const length = Math.hypot(forward.x, forward.z);
        return length > 1e-6 ? { x: forward.x / length, z: forward.z / length } : { x: 0, z: -1 };
    }

    /** Player-only cinematic: reach the target before the aircraft so its bombs are seen leaving it. */
    function playAirStrikeCinematic(target: StrikeAim, heading: StrikeAim): void {
        // The bomb furthest along the run drops, and lands, last.
        const lastLandingAt = Math.max(...AIR_STRIKE_BOMB_OFFSETS.map((offset) => nominalBombLandingSeconds(offset, heading)));
        cameraController.playShots([
            {
                x: target.x,
                z: target.z,
                durationSeconds: AIR_STRIKE_CAMERA_LEAD_SECONDS,
                holdSeconds: lastLandingAt + 0.6 - AIR_STRIKE_CAMERA_LEAD_SECONDS,
                distance: AIR_STRIKE_CAMERA_DISTANCE
            }
        ]);
    }

    function getRewardFailureMessage(reason: RewardRejection): string {
        if (reason === 'insufficient-points') return 'Puntos de combate insuficientes.';
        if (reason === 'insufficient-gold') return 'Oro insuficiente para activar el apoyo.';
        if (reason === 'no-valid-target') return 'No hay objetivos terrestres enemigos válidos.';
        if (reason === 'shield-active') return 'El escudo del Nexo ya está activo.';
        if (reason === 'cooldown') return 'El apoyo táctico aún está en recarga.';
        return 'No se pudo validar el apoyo táctico.';
    }

    function activateRewardForFaction(faction: 'player' | 'enemy', id: RewardId): boolean {
        const simulation = battleSimulation;
        if (!simulation || session.state !== 'PLAYING') return false;
        const heading = id === 'air_strike'
            ? (faction === ECS_FACTIONS.player ? cameraGroundHeading() : ENEMY_AIR_STRIKE_HEADING)
            : undefined;
        const result = activateReward(commandContext(simulation), faction, id, heading ? { heading } : undefined);
        if (!result.accepted) {
            const outsidePlay = result.reason === 'match-over' || result.reason === 'not-playing';
            if (faction === ECS_FACTIONS.player && !outsidePlay) showToast(getRewardFailureMessage(result.reason));
            updateRewardUI();
            return false;
        }
        representRewardActivation(faction, id, result);
        return true;
    }

    /** Plays an accepted reward: the command already spent it and started its cooldown and shield. */
    function representRewardActivation(
        faction: 'player' | 'enemy',
        id: RewardId,
        result: Extract<ReturnType<typeof activateReward>, { accepted: true }>
    ): void {
        syncGoldMirrors();
        const { definition, aim } = result;
        if (id === 'defensive_shield') {
            if (faction === ECS_FACTIONS.player) showToast(`Escudo activado: daño al Nexo reducido durante ${definition.durationSeconds} s.`);
        } else {
            if (!aim) throw new Error(`Validated reward ${id} has no aim point`);
            // The command scheduled the strike; the domain advances it and the view draws it.
            if (id === 'artillery_strike') {
                if (faction === ECS_FACTIONS.player) playArtilleryCinematic(aim);
            } else {
                // The command froze the heading in the scheduled strike; the cinematic frames exactly that run.
                const scheduled = matchState.strikes.active.find((strike) => strike.id === result.strikeId);
                if (!scheduled || scheduled.kind !== 'air_strike') throw new Error('The activated air strike was not scheduled');
                SFX.playJetFlyby(AIR_STRIKE_FLIGHT_SECONDS);
                if (faction === ECS_FACTIONS.player) playAirStrikeCinematic(aim, scheduled.heading);
            }
            if (faction === ECS_FACTIONS.player) {
                showToast(id === 'artillery_strike'
                    ? 'Bombardeo de artillería activado: impactos en camino.'
                    : 'Ataque aéreo activado: avión cruzando el campo.');
            } else {
                SFX.playAirRaidSiren();
                showToast('¡ALERTA! Ataque enemigo entrante');
            }
        }
        updateResourceUI();
        updateRewardUI();
    }

    function activatePlayerReward(id: RewardId): boolean {
        return session.state === 'PLAYING' && activateRewardForFaction(ECS_FACTIONS.player, id);
    }

    function updateNexusShieldVisuals(): void {
        if (playerShieldVisual) {
            playerShieldVisual.visible = isShieldActiveForFaction(ECS_FACTIONS.player);
            const scale = 1 + Math.sin(gameplayClockMs * 0.004) * 0.035;
            playerShieldVisual.scale.setScalar(scale);
        }
        if (enemyShieldVisual) {
            enemyShieldVisual.visible = isShieldActiveForFaction(ECS_FACTIONS.enemy);
            const scale = 1 + Math.sin(gameplayClockMs * 0.004) * 0.035;
            enemyShieldVisual.scale.setScalar(scale);
        }
    }

    function updateUnlockUI() {
        const available = unlocks.getAvailable();
        ui.setUnlocks(available.map((item) => ({
            id: item.id,
            title: item.title,
            type: item.type,
            unlocked: item.unlocked,
            ready: item.ready,
            description: item.meta?.description
        })));
        ui.setPermanentUnlockCount(unlocks.unlocked.size);
    }

    function beginMatchEnding(isVictory: boolean): void {
        if (!session.beginEnding()) return;
        hqExplodingSequence = true;
        hqExplodeTimer = 0;
        pendingVictoryState = isVictory;
        cancelPlacement();
        matchEndTimeout = window.setTimeout(() => completeMatchEnd(), 5000);
    }

    function updateMatchEnding(delta: number): void {
        hqExplodeTimer += delta;
        // Decay camera shake during the end sequence too (duplicated from
        // updateCombat, which stops running once MATCH_ENDING begins) so the
        // explosion's shake settles smoothly instead of staying frozen for the
        // whole 4-5 second sequence; see the `combatEffects.update(delta)`
        // duplication just below for the same pattern already in this file.
        if (cameraShake > 0) cameraShake = Math.max(0, cameraShake - delta * 4.0);
        combatEffects.update(delta);
        if (hqExplodeTimer >= 4.0) completeMatchEnd();
    }

    function completeMatchEnd(): void {
        if (session.state !== 'MATCH_ENDING') return;
        hqExplodingSequence = false;
        endGame(pendingVictoryState);
    }

    function endGame(isVictory: boolean) {
        session.finish();
        unlocks.recordEvent('match_end', {
            victory: isVictory,
            buildingsPlaced: stats.buildingsConstructed,
            soldiersTrained: stats.soldiersTrained
        });
        updateUnlockUI();

        const durationSec = Math.floor((Date.now() - stats.startTime) / 1000);
        const mins = Math.floor(durationSec / 60).toString().padStart(2, '0');
        const secs = (durationSec % 60).toString().padStart(2, '0');
        const enemyHQDamage = enemyHQ
            ? Math.round((1 - Math.max(0, Math.min(enemyHQ.maxHp, enemyHQ.hp)) / enemyHQ.maxHp) * 100)
            : 0;

        const summary = {
            victory: isVictory,
            soldiersTrained: stats.soldiersTrained,
            losses: matchState.playerUnitsLost,
            buildingsConstructed: stats.buildingsConstructed,
            duration: `${mins}:${secs}`,
            enemyBaseDamagePercent: enemyHQDamage
        };
        teardownMatch();
        ui.showGameOver(summary);
        frameLoop?.stop();
    }

    /** Runs one enemy AI update and, with diagnostics on, adds its cost to this frame. */
    function runEnemyAIUpdate(delta: number): void {
        if (!diagnosticsEnabled) {
            updateEnemyAI(delta);
            return;
        }
        const start = performance.now();
        updateEnemyAI(delta);
        diagnosticsAiMs += performance.now() - start;
    }

    function resetDiagnosticsFrame(): void {
        diagnosticsSimulationMs = 0;
        diagnosticsEffectsMs = 0;
        diagnosticsAiMs = 0;
        diagnosticsAiCalls = 0;
        diagnosticsAiDecisions = 0;
        diagnosticsPhaseMs.queries = 0;
        diagnosticsPhaseMs.targeting = 0;
        diagnosticsPhaseMs.movement = 0;
        diagnosticsPhaseMs.weapons = 0;
        diagnosticsPhaseMs.production = 0;
        diagnosticsPhaseMs.resources = 0;
        diagnosticsPhaseMs.projectiles = 0;
    }

    function recordDiagnosticsFrame(
        ring: MetricRing,
        now: number,
        frameStart: number,
        renderStart: number,
        combatMs: number,
        gameplayDeltaSeconds: number
    ): void {
        const effectStats = combatEffects.stats();
        const projectileStats = projectilePool.stats();
        ring.record('frameMs', now - diagnosticsPreviousFrame);
        ring.record('workMs', now - frameStart);
        ring.record('combatMs', combatMs);
        ring.record('simulationMs', diagnosticsSimulationMs);
        ring.record('simulationSteps', gameplayDeltaSeconds > 0 ? battleSimulation?.lastStepCount ?? 0 : 0);
        ring.record('ecsQueriesMs', diagnosticsPhaseMs.queries);
        ring.record('ecsTargetingMs', diagnosticsPhaseMs.targeting);
        ring.record('ecsMovementMs', diagnosticsPhaseMs.movement);
        ring.record('ecsWeaponsMs', diagnosticsPhaseMs.weapons);
        ring.record('ecsProductionMs', diagnosticsPhaseMs.production);
        ring.record('ecsResourcesMs', diagnosticsPhaseMs.resources);
        ring.record('ecsProjectilesMs', diagnosticsPhaseMs.projectiles);
        ring.record('aiMs', diagnosticsAiMs);
        ring.record('aiCalls', diagnosticsAiCalls);
        ring.record('aiDecisions', diagnosticsAiDecisions);
        ring.record('gameplayDeltaSeconds', gameplayDeltaSeconds);
        ring.record('effectsMs', diagnosticsEffectsMs);
        // Gameplay work outside the simulation, AI and effects: visual sync, UI, rewards, camera.
        ring.record('gameplayOtherMs', Math.max(
            0,
            combatMs - diagnosticsSimulationMs - diagnosticsAiMs - diagnosticsEffectsMs
        ));
        ring.record('renderMs', now - renderStart);
        ring.record('drawCalls', renderer.info.render.calls);
        ring.record('triangles', renderer.info.render.triangles);
        ring.record('geometries', renderer.info.memory.geometries);
        ring.record('textures', renderer.info.memory.textures);
        ring.record('sceneObjects', scene.children.length);
        ring.record('particles', effectStats.activeParticles);
        ring.record('shockwaves', effectStats.activeShockwaves);
        ring.record('emitters', effectStats.activeEmitters);
        ring.record('projectiles', projectiles.length);
        ring.record('cachedProjectiles', projectileStats.cached);
        ring.record('soldiers', playerUnits.length + enemyUnits.length);
        ring.record('playerSoldiers', playerUnits.length);
        ring.record('enemySoldiers', enemyUnits.length);
    }

    function animate({ deltaSeconds: delta, elapsedSeconds: time }: FrameTiming) {
        const frameStart = diagnosticsEnabled ? performance.now() : 0;
        let combatMs = 0;
        if (diagnosticsEnabled) resetDiagnosticsFrame();

        if (session.state === 'MENU') {
            camera.position.x = Math.sin(time * 0.25) * 60;
            camera.position.z = Math.cos(time * 0.25) * 60;
            camera.position.y = 30 + Math.sin(time * 0.5) * 5;
            camera.lookAt(0, 0, 0);
        } else if (session.state === 'PLAYING') {
            gameplayClockMs += delta * 1000;
            cameraController.update(delta);
            const combatStart = diagnosticsEnabled ? performance.now() : 0;
            runEnemyAIUpdate(delta);
            advanceBattleSimulation(delta, time);
            advanceRewardStrikes(delta);
            updateNexusShieldVisuals();
            updateCombat(delta);
            if (gameplayClockMs - lastRewardUiUpdateMs >= 250) {
                lastRewardUiUpdateMs = gameplayClockMs;
                updateRewardUI();
            }
            if (diagnosticsEnabled) combatMs = performance.now() - combatStart;
        } else if (session.state === 'MATCH_ENDING') {
            updateMatchEnding(delta);
        }

        const renderStart = diagnosticsEnabled ? performance.now() : 0;
        renderCoordinator.render(time);
        if (diagnosticsEnabled && diagnosticsSamples) {
            const now = performance.now();
            if (diagnosticsPreviousFrame > 0) {
                recordDiagnosticsFrame(
                    diagnosticsSamples,
                    now,
                    frameStart,
                    renderStart,
                    combatMs,
                    session.state === 'PLAYING' ? delta : 0
                );
            }
            diagnosticsPreviousFrame = now;
            if (diagnosticsOverlayRefresh && now - diagnosticsOverlayRefreshedAt >= 500) {
                diagnosticsOverlayRefreshedAt = now;
                diagnosticsOverlayRefresh();
            }
        }
    }

    if (diagnosticsEnabled && diagnosticsSamples) {
        const samples = diagnosticsSamples;
        const census = createEntityCensus();
        const censusScratch: Entity[] = [];
        const waitSeconds = (seconds: number) => new Promise<void>((resolve) => {
            window.setTimeout(resolve, seconds * 1000);
        });
        const resetSamples = () => {
            samples.clear();
            diagnosticsPreviousFrame = 0;
        };
        const readDiagnostics = (latest?: number): Record<string, number | null> => {
            const effectStats = combatEffects.stats();
            const projectileStats = projectilePool.stats();
            const average = (key: string) => samples.summary(key, latest).average;
            const maximum = (key: string) => samples.summary(key, latest).maximum;
            const lastOr = (key: string, fallback: number) => {
                const summary = samples.summary(key, latest);
                return summary.count > 0 ? summary.last : fallback;
            };
            const frame = samples.summary('frameMs', latest);
            const gameplaySeconds = average('gameplayDeltaSeconds');
            const simulation = battleSimulation;
            if (simulation) countEntities(simulation.world, censusScratch, census);
            const playerNexusHealth = simulation?.world
                .getComponent(simulation.playerBase, ECS_COMPONENTS.health)?.current ?? null;
            const rewardScenarioHealth = simulation
                ? rewardScenarioBuildings.reduce((total, building) => total + (
                    building.ecsEntityId === undefined
                        ? 0
                        : simulation.world.getComponent(
                            building.ecsEntityId,
                            ECS_COMPONENTS.health
                        )?.current ?? 0
                ), 0)
                : null;
            const factionCounts = (prefix: 'player' | 'enemy') => {
                const counts = census[prefix];
                return simulation
                    ? {
                        [`${prefix}Rifleman`]: counts.rifleman,
                        [`${prefix}Tank`]: counts.tank,
                        [`${prefix}Hq`]: counts.hq,
                        [`${prefix}Generator`]: counts.generator,
                        [`${prefix}Barracks`]: counts.barracks,
                        [`${prefix}Turret`]: counts.turret
                    }
                    : {};
            };
            return {
                sampleCount: frame.count,
                frameMs: frame.average,
                p95FrameMs: frame.p95,
                maxFrameMs: frame.maximum,
                fps: 1000 / Math.max(frame.average, 0.001),
                workMs: average('workMs'),
                p95WorkMs: samples.summary('workMs', latest).p95,
                idleMs: Math.max(0, frame.average - average('workMs')),
                combatMs: average('combatMs'),
                simulationMs: average('simulationMs'),
                simulationSteps: average('simulationSteps'),
                ecsQueriesMs: average('ecsQueriesMs'),
                ecsTargetingMs: average('ecsTargetingMs'),
                ecsMovementMs: average('ecsMovementMs'),
                ecsWeaponsMs: average('ecsWeaponsMs'),
                ecsProductionMs: average('ecsProductionMs'),
                ecsResourcesMs: average('ecsResourcesMs'),
                ecsProjectilesMs: average('ecsProjectilesMs'),
                aiMs: average('aiMs'),
                maxAiMs: maximum('aiMs'),
                aiCallsPerFrame: average('aiCalls'),
                aiDecisionsPerSecond: gameplaySeconds > 0 ? average('aiDecisions') / gameplaySeconds : 0,
                effectsMs: average('effectsMs'),
                gameplayOtherMs: average('gameplayOtherMs'),
                renderMs: average('renderMs'),
                p95RenderMs: samples.summary('renderMs', latest).p95,
                drawCalls: average('drawCalls'),
                maxDrawCalls: maximum('drawCalls'),
                triangles: average('triangles'),
                maxTriangles: maximum('triangles'),
                geometries: lastOr('geometries', renderer.info.memory.geometries),
                textures: lastOr('textures', renderer.info.memory.textures),
                maxGeometries: maximum('geometries'),
                maxTextures: maximum('textures'),
                sceneObjects: lastOr('sceneObjects', scene.children.length),
                maxSceneObjects: maximum('sceneObjects'),
                particles: effectStats.activeParticles,
                maxParticles: maximum('particles'),
                particleSlots: effectStats.particleSlots,
                shockwaves: effectStats.activeShockwaves,
                maxShockwaves: maximum('shockwaves'),
                shockwaveSlots: effectStats.shockwaveSlots,
                emitters: effectStats.activeEmitters,
                maxEmitters: maximum('emitters'),
                emitterSlots: effectStats.emitterSlots,
                effectGeometries: effectStats.geometries,
                effectMaterials: effectStats.materials,
                projectiles: lastOr('projectiles', 0),
                maxProjectiles: maximum('projectiles'),
                cachedProjectiles: projectileStats.cached,
                soldiers: lastOr('soldiers', 0),
                maxSoldiers: maximum('soldiers'),
                playerSoldiers: lastOr('playerSoldiers', playerUnits.length),
                enemySoldiers: lastOr('enemySoldiers', enemyUnits.length),
                ecsEntities: simulation ? census.total : null,
                ecsProjectiles: simulation ? census.projectiles : null,
                ...factionCounts('player'),
                ...factionCounts('enemy'),
                playerCombatPoints: matchState.combatPoints.player,
                playerGold: getFactionGold(ECS_FACTIONS.player),
                playerNexusHealth,
                playerShieldRemainingMs: Math.max(0, matchState.rewards.player.shieldUntilMs - gameplayClockMs),
                rewardScenarioHealth,
                activeArtilleryStrikes: matchState.strikes.active.filter((strike) => strike.kind === 'artillery_strike').length,
                activeAirStrikes: matchState.strikes.active.filter((strike) => strike.kind === 'air_strike').length,
                memoryBytes: (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? null
            };
        };
        // A scenario run keeps the live panel off so it measures like a console run.
        if (diagnosticsOptions?.overlay && !diagnosticsOptions.scenario) {
            const overlay = new DiagnosticsOverlay(document.body);
            diagnosticsOverlay = overlay;
            // The overlay summarizes about the last two seconds so its own cost stays small.
            diagnosticsOverlayRefresh = () => overlay.show(readDiagnostics(120));
        }
        /** A side's structure, placed without validation or cost (scenario use only). */
        const spawnScenarioStructure = (type: BuildingType, isPlayer: boolean, position: Position) => {
            const simulation = battleSimulation;
            if (!simulation) throw new Error('Start a match before placing scenario structures');
            const faction = isPlayer ? ECS_FACTIONS.player : ECS_FACTIONS.enemy;
            return representStructure(placeDiagnosticStructure(simulation.world, faction, type, position));
        };
        window.__gameDiagnostics = {
            read: readDiagnostics,
            reset: resetSamples,
            environment() {
                const gl = renderer.getContext();
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                return {
                    userAgent: navigator.userAgent,
                    gpuVendor: String(gl.getParameter(debugInfo ? debugInfo.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
                    gpuRenderer: String(gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
                    webgl: renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1',
                    devicePixelRatio: window.devicePixelRatio,
                    rendererPixelRatio: renderer.getPixelRatio(),
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                    drawingBuffer: `${renderer.domElement.width}x${renderer.domElement.height}`,
                    antialias: gl.getContextAttributes()?.antialias ?? false,
                    shadows: renderer.shadowMap.enabled,
                    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
                    overlay: diagnosticsOverlay !== null
                };
            },
            // 25 s by default: an idle player usually loses a Normal match within 35-40 s.
            async runMatchScenario({ difficulty = 'normal', warmupSeconds = 5, durationSeconds = 25 } = {}) {
                startNewGame({ difficulty, mode: 'ai' });
                await waitSeconds(warmupSeconds);
                resetSamples();
                await waitSeconds(durationSeconds);
                return readDiagnostics();
            },
            async runCombatScenario({ barracksPerSide = 4, warmupSeconds = 10, durationSeconds = 30 } = {}) {
                if (!Number.isInteger(barracksPerSide) || barracksPerSide < 1) {
                    throw new RangeError('Combat scenario needs at least one barracks per side');
                }
                startNewGame({ difficulty: 'normal', mode: 'ai' });
                enemyAIEnabled = false;
                const simulation = battleSimulation;
                if (!simulation) throw new Error('The battle simulation was not initialized');
                for (const base of [simulation.playerBase, simulation.enemyBase]) {
                    const economy = simulation.world.getComponent(base, ECS_COMPONENTS.economy);
                    if (!economy) throw new Error('Combat scenario requires initialized faction economies');
                    economy.gold = 1_000_000;
                }
                // Mirrored layout: generators behind the Nexus, barracks in front of it, turrets ahead.
                for (const isPlayer of [true, false]) {
                    const side = isPlayer ? 1 : -1;
                    for (const x of [-12, 12]) {
                        spawnScenarioStructure('generator', isPlayer, { x, y: 0, z: side * 68 });
                        spawnScenarioStructure('turret', isPlayer, { x, y: 0, z: side * 30 });
                    }
                    for (let index = 0; index < barracksPerSide; index++) {
                        const x = (index - (barracksPerSide - 1) / 2) * 10;
                        spawnScenarioStructure('barracks', isPlayer, { x, y: 0, z: side * 42 });
                    }
                }
                // Keep every barracks busy: three riflemen for every tank.
                let ordersPlaced = 0;
                const feeder = window.setInterval(() => {
                    if (session.state !== 'PLAYING' || battleSimulation !== simulation) return;
                    for (const building of [...playerBuildings, ...enemyBuildings]) {
                        if (!isValidSoldierFactory(building)) continue;
                        if (simulation.world.getComponent(building.ecsEntityId, ECS_COMPONENTS.production)?.order) {
                            continue;
                        }
                        const accepted = requestUnitProduction(
                            simulation.world,
                            building.ecsEntityId,
                            building.isPlayer ? simulation.playerBase : simulation.enemyBase,
                            ordersPlaced % 4 === 3 ? 'tank' : 'rifleman'
                        ).accepted;
                        if (accepted) ordersPlaced++;
                    }
                }, 250);
                try {
                    await waitSeconds(warmupSeconds);
                    resetSamples();
                    await waitSeconds(durationSeconds);
                } finally {
                    window.clearInterval(feeder);
                }
                return readDiagnostics();
            },
            prepareRewardScenario(mode = 'ready') {
                if (session.state !== 'PLAYING' || !battleSimulation) {
                    throw new Error('Start a match before preparing the reward scenario');
                }
                enemyAIEnabled = false;
                clearStrikes(matchState);
                matchState.rewards.player.strikeActiveUntilMs = {};
                rewardEffectsView.clear();
                matchState.rewards.player.cooldownUntilMs = gameplayClockMs;
                matchState.rewards.player.shieldUntilMs = 0;
                if (playerShieldVisual) playerShieldVisual.visible = false;
                for (const building of enemyBuildings.filter((candidate) => candidate.type !== 'hq')) {
                    scene.remove(building.mesh);
                    if (building.ecsEntityId !== undefined) {
                        battleSimulation.world.removeEntity(building.ecsEntityId);
                        targetObjects.delete(building.ecsEntityId);
                    }
                }
                enemyBuildings = enemyBuildings.filter((building) => building.type === 'hq');
                rewardScenarioBuildings = [];
                if (mode === 'no-target') {
                    for (const unit of enemyUnits) {
                        const entity = unit.ecsEntityId;
                        if (entity === undefined) continue;
                        battleSimulation.world.removeEntity(entity);
                        targetObjects.delete(entity);
                        if (unit.type === 'rifleman') {
                            soldierRenderer.remove(entity);
                        } else if (unit.mesh instanceof THREE.Object3D) {
                            scene.remove(unit.mesh);
                            disposeObjectResources(unit.mesh);
                        }
                    }
                    enemyUnits = [];
                }
                const playerEconomy = battleSimulation.world.getComponent(
                    battleSimulation.playerBase,
                    ECS_COMPONENTS.economy
                );
                if (!playerEconomy) throw new Error('Player economy is unavailable in the reward scenario');
                playerEconomy.gold = mode === 'insufficient-gold' ? 0 : 1200;
                gold = playerEconomy.gold;
                matchState.combatPoints.player = 100;
                const previousBuildings = enemyBuildings.length;
                if (mode !== 'no-target') {
                    for (const x of [-56, -25, 7, 38]) {
                        spawnScenarioStructure('turret', false, { x, y: 0, z: -15 });
                    }
                    spawnScenarioStructure('turret', false, { x: 0, y: 0, z: 30 });
                    rewardScenarioBuildings = enemyBuildings.slice(previousBuildings);
                }
                updateResourceUI();
                updateRewardUI();
            },
            setNexusHealth(faction, value) {
                if (session.state !== 'PLAYING' || !battleSimulation) {
                    throw new Error('Start a match before setting a Nexus health');
                }
                if (!Number.isFinite(value) || value < 0) {
                    throw new RangeError('Nexus health must be a finite number of zero or more');
                }
                const base = faction === ECS_FACTIONS.player ? battleSimulation.playerBase : battleSimulation.enemyBase;
                const health = battleSimulation.world.getComponent(base, ECS_COMPONENTS.health);
                if (!health) throw new Error('That Nexus has already been destroyed');
                health.current = Math.min(value, health.max);
            },
            async runStressScenario(explosionCount = 30, intervalMs = 200) {
                if (!Number.isInteger(explosionCount) || explosionCount < 1
                    || !Number.isFinite(intervalMs) || intervalMs < 1) {
                    throw new RangeError('Stress scenario requires a positive count and interval');
                }
                startNewGame();
                enemyAIEnabled = false;
                const simulation = battleSimulation;
                if (!simulation) throw new Error('The battle simulation was not initialized');
                const playerEconomy = simulation.world.getComponent(
                    simulation.playerBase,
                    ECS_COMPONENTS.economy
                );
                const enemyEconomy = simulation.world.getComponent(
                    simulation.enemyBase,
                    ECS_COMPONENTS.economy
                );
                if (!playerEconomy || !enemyEconomy) {
                    throw new Error('Stress scenario requires initialized faction economies');
                }
                playerEconomy.gold = 500;
                enemyEconomy.gold = 500;
                const testFactories: Entity[] = [];
                for (let index = 0; index < 5; index++) {
                    const x = (index - 2) * 1.4;
                    // Invisible factories inside each Nexus: no visual, as before.
                    const playerFactory = placeDiagnosticStructure(
                        simulation.world,
                        ECS_FACTIONS.player,
                        'barracks',
                        { x, y: 0, z: PLAYER_BASE_POSITION.z }
                    );
                    const enemyFactory = placeDiagnosticStructure(
                        simulation.world,
                        ECS_FACTIONS.enemy,
                        'barracks',
                        { x, y: 0, z: ENEMY_BASE_POSITION.z }
                    );
                    testFactories.push(playerFactory, enemyFactory);
                    const playerOrder = requestUnitProduction(
                        simulation.world,
                        playerFactory,
                        simulation.playerBase,
                        'rifleman',
                        { x, y: 0, z: 4 }
                    );
                    const enemyOrder = requestUnitProduction(
                        simulation.world,
                        enemyFactory,
                        simulation.enemyBase,
                        'rifleman',
                        { x, y: 0, z: -4 }
                    );
                    if (!playerOrder.accepted || !enemyOrder.accepted) {
                        throw new Error('Stress scenario failed to accept a production order');
                    }
                }
                for (let index = 0; index < 21; index++) simulation.advance(0.1);
                for (const event of simulation.drainProductionEvents()) createTroopVisual(event);
                for (const factory of testFactories) simulation.world.removeEntity(factory);
                for (const x of [-5, 0, 5]) spawnScenarioStructure('turret', false, { x, y: 0, z: 0 });
                resetSamples();
                let explosionIndex = 0;
                await new Promise((resolve) => {
                    const timer = window.setInterval(() => {
                        createCinematicExplosion(
                            new THREE.Vector3((explosionIndex % 5 - 2) * 2, 0, (explosionIndex % 3 - 1) * 2),
                            0.6,
                            false
                        );
                        explosionIndex++;
                        if (explosionIndex >= explosionCount) {
                            window.clearInterval(timer);
                            window.setTimeout(resolve, 2500);
                        }
                    }, intervalMs);
                });
                return this.read();
            }
        };
        if (diagnosticsOptions && !diagnosticsOptions.blur) disableBackdropBlur(document);
        const scenario = diagnosticsOptions?.scenario;
        if (diagnosticsOptions && scenario) {
            // `?scenario=` runs a scenario on load and leaves its result on screen, so a
            // phone can be measured without a debugging console.
            const overlay = diagnosticsOverlay ?? new DiagnosticsOverlay(document.body);
            diagnosticsOverlay = overlay;
            const scenarioName = scenario === 'combat' ? 'combate' : 'partida (Normal)';
            overlay.showMessage(`Midiendo ${scenarioName}… no toques la pantalla (unos 40 s)`);
            const runScenario = async () => {
                const diagnostics = window.__gameDiagnostics;
                if (!diagnostics) return;
                const reading = scenario === 'combat'
                    ? await diagnostics.runCombatScenario()
                    : await diagnostics.runMatchScenario();
                const environment = diagnostics.environment();
                const heading = [
                    `RESULTADO · ${scenarioName} · ${reading.sampleCount ?? 0} fotogramas`,
                    `Ajustes: dpr ${diagnosticsOptions.maxPixelRatio ?? 'por defecto'} → renderer `
                        + `${environment.rendererPixelRatio} (${environment.drawingBuffer}) · `
                        + `ondas ${diagnosticsOptions.shockwaves ? 'sí' : 'no'} · humo ${diagnosticsOptions.smoke ? 'sí' : 'no'} · `
                        + `desenfoque ${diagnosticsOptions.blur ? 'sí' : 'no'} · barras ${diagnosticsOptions.bars ? 'sí' : 'no'}`,
                    `GPU: ${environment.gpuRenderer}`
                ];
                if (scenario === 'match') {
                    heading.push(`Nexo del jugador al final: ${reading.playerNexusHealth ?? 'partida terminada'}`);
                }
                overlay.showResult(formatDiagnosticsResult(heading, reading));
                console.info('[diagnostics] result', JSON.stringify({ options: diagnosticsOptions, environment, reading }));
            };
            window.setTimeout(() => {
                runScenario().catch((error: unknown) => {
                    overlay.showResult([`El escenario falló: ${error instanceof Error ? error.message : String(error)}`]);
                });
            }, 1000);
        }
    }

    let initialized = false;
    function initApp() {
        if (initialized) return;
        initialized = true;
        initEngine();
        ui.bindActions({
            startGame: (settings) => startNewGame(settings),
            restartGame: resetGame,
            exitToMenu: exitToMainMenu,
            pauseGame: togglePause,
            resumeGame: togglePause,
            toggleDemolishMode,
            selectBuilding: selectBuildingToPlace,
            trainUnit,
            activateReward: activatePlayerReward,
            toggleAutoZoom: () => {
                const enabled = !cameraController.autoZoomEnabled;
                cameraController.setAutoZoomEnabled(enabled);
                if (enabled) showToast('Zoom automático activado');
            }
        });
        unlockSubscriptions.push(unlocks.on('unlocked', ({ definition }) => {
            updateUnlockUI();
            if (session.state === 'PLAYING') {
                showToast(`RECOMPENSA: ${definition?.title ?? ''}`);
            }
        }));
        unlockSubscriptions.push(unlocks.on('expired', () => updateUnlockUI()));
        unlockSubscriptions.push(unlocks.on('consumed', () => updateUnlockUI()));
        updateUnlockUI();
        frameLoop = new GameFrameLoop(animate);
        frameLoop.start();
    }

    initApp();

    return {
        dispose() {
            frameLoop?.stop();
            inputController?.detach();
            rewardEffectsView?.dispose();
            renderCoordinator?.dispose();
            diagnosticsOverlay?.dispose();
            for (const unsubscribe of unlockSubscriptions.splice(0)) unsubscribe();
        },
        get state() {
            return session.state;
        }
    };
}
