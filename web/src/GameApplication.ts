import * as THREE from 'three';
import { COMPONENTS as ECS_COMPONENTS, FACTIONS as ECS_FACTIONS } from './game/ecs/components.ts';
import type { Entity, Position } from './game/ecs/components.ts';
import { BattleSimulation } from './game/ecs/BattleSimulation.ts';
import {
    createSoldier as createECSSoldier,
    createSoldierFactory,
    createStructure
} from './game/ecs/initialBattle.ts';
import { applyDamageSystem, requestSoldierProduction } from './game/ecs/systems.ts';
import { GameFrameLoop } from './game/GameFrameLoop.ts';
import type { FrameTiming } from './game/GameFrameLoop.ts';
import { GameInputController } from './game/GameInputController.ts';
import { GameSession } from './game/GameSession.ts';
import { ThreeRenderCoordinator } from './rendering/ThreeRenderCoordinator.ts';
import { advanceProjectile } from './rendering/ProjectilePool.ts';
import type { ProjectileFlight } from './rendering/ProjectilePool.ts';
import type { BuildingType, GameUiPort, UnitType, UnlockView } from './ui/contracts.ts';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SoldierVisualHandle } from './rendering/InstancedSoldierRenderer.ts';

interface HealthBar {
    group: THREE.Group;
    fillMesh: THREE.Mesh;
    maxWidth: number;
    update(currentHp: number, maxHp: number): void;
    billboard(camera: THREE.Camera): void;
}

interface RuntimeStructure {
    mesh: THREE.Group;
    hp: number;
    maxHp: number;
    position: THREE.Vector3;
    type: BuildingType | 'hq';
    isPlayer: boolean;
    lastAction?: number;
    healthBar?: HealthBar;
    ecsEntityId?: Entity;
}

interface RuntimeUnit {
    mesh: THREE.Group | SoldierVisualHandle;
    hp: number;
    maxHp: number;
    speed: number;
    damage: number;
    fireRate: number;
    range: number;
    lastFire: number;
    type: UnitType;
    isPlayer: boolean;
    healthBar?: HealthBar;
    ecsEntityId: Entity;
}

type RuntimeTarget = RuntimeStructure | RuntimeUnit;

interface RuntimeProjectile {
    mesh: THREE.Mesh;
    flight: ProjectileFlight;
    damage: number;
    color: number;
    targetObj: RuntimeTarget | null;
    isHeavy: boolean;
}

interface DiagnosticsSample {
    [metric: string]: number;
}

interface AudioWindow extends Window {
    webkitAudioContext?: typeof AudioContext;
}

interface PerformanceWithMemory extends Performance {
    memory?: { usedJSHeapSize: number };
}

interface GameDiagnostics {
    read(): Record<string, number | null>;
    runStressScenario(
        explosionCount?: number,
        intervalMs?: number
    ): Promise<Record<string, number | null>>;
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

    // Kill streaks and simple progression counters (used by UnlockManager)
    let playerKillStreak = 0;
    let enemyKillStreak = 0;
    let playerUnitsDestroyed = 0;
    let playerUnitsLost = 0;

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
        playCinematicExplosion: function(isNuclear = false) {
            if (!this.ctx) return;
            const dur = isNuclear ? 3.8 : 0.8;
            let buffer = this.noiseBuffers.get(dur);
            if (!buffer) {
                const bufferSize = this.ctx.sampleRate * dur;
                buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }
                this.noiseBuffers.set(dur, buffer);
            }
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
        }
    };

    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let controls: OrbitControls;
    let soldierRenderer: ThreeRenderCoordinator['soldiers'];
    let combatEffects: ThreeRenderCoordinator['effects'];
    let projectilePool: ThreeRenderCoordinator['projectiles'];
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const projectileOrigin = new THREE.Vector3();
    const turretProjectileOrigin = new THREE.Vector3();
    const turretTargetSearch: { target: RuntimeTarget | null; distanceSquared: number } = {
        target: null,
        distanceSquared: 484
    };

    // Active Game Collections
    let playerBuildings: RuntimeStructure[] = [];
    let enemyBuildings: RuntimeStructure[] = [];
    let playerUnits: RuntimeUnit[] = [];
    let enemyUnits: RuntimeUnit[] = [];
    let projectiles: RuntimeProjectile[] = [];
    let menuUnits: THREE.Group[] = [];
    let ruinsAndCorpses: THREE.Group[] = [];
    const MAX_BATTLEFIELD_REMAINS = 64;
    const diagnosticsEnabled = import.meta.env.DEV
        && new URLSearchParams(window.location.search).get('diagnostics') === '1';
    const diagnosticsSamples: DiagnosticsSample[] = [];
    let diagnosticsPreviousFrame = 0;
    let diagnosticsSimulationMs = 0;
    let diagnosticsEffectsMs = 0;

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
    let aiDifficulty = 'normal';

    // Enemy AI Satisfaction Thresholds
    let aiTargetGenerators = 3;
    let aiTargetBarracks = 2;
    let aiTargetTurrets = 3;

    let stats: { soldiersTrained: number; buildingsConstructed: number; startTime: number } = {
        soldiersTrained: 0,
        buildingsConstructed: 0,
        startTime: 0
    };

    let enemyAITimer = 0;
    let enemyAIEnabled = true;
    function showToast(msg: string) {
        ui.showToast(msg);
    }

    function create3DHealthBar(isPlayer: boolean, heightOffset = 2.0, width = 1.6): HealthBar {
        const barGroup = new THREE.Group();
        barGroup.position.y = heightOffset;

        // Background dark bar
        const bgGeo = new THREE.PlaneGeometry(width, 0.22);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide });
        const bgMesh = new THREE.Mesh(bgGeo, bgMat);
        barGroup.add(bgMesh);

        // Border outline frame
        const borderGeo = new THREE.PlaneGeometry(width + 0.06, 0.28);
        const borderMat = new THREE.MeshBasicMaterial({ color: 0x334155, side: THREE.DoubleSide });
        const borderMesh = new THREE.Mesh(borderGeo, borderMat);
        borderMesh.position.z = -0.005;
        barGroup.add(borderMesh);

        // Health Fill Bar (Cyan for player, Red for enemy)
        const colorHex = isPlayer ? 0x00f0ff : 0xff3344;
        const fillGeo = new THREE.PlaneGeometry(width, 0.18);
        const fillMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide });
        const fillMesh = new THREE.Mesh(fillGeo, fillMat);
        fillMesh.position.z = 0.01;
        barGroup.add(fillMesh);

        return {
            group: barGroup,
            fillMesh: fillMesh,
            maxWidth: width,
            update: function(currentHp: number, maxHp: number) {
                const ratio = Math.max(0, Math.min(1, currentHp / maxHp));
                this.fillMesh.scale.x = ratio;
                this.fillMesh.position.x = - (this.maxWidth * (1 - ratio)) / 2;
            },
            billboard: function(cam: THREE.Camera) {
                // Exact uniform angle matching camera view for both player and enemy
                barGroup.quaternion.copy(cam.quaternion);
            }
        };
    }

    function initEngine() {
        renderCoordinator = new ThreeRenderCoordinator(ui.getCanvasContainer());
        scene = renderCoordinator.scene;
        camera = renderCoordinator.camera;
        renderer = renderCoordinator.renderer;
        controls = renderCoordinator.controls;
        soldierRenderer = renderCoordinator.soldiers;
        combatEffects = renderCoordinator.effects;
        projectilePool = renderCoordinator.projectiles;
        createTerrain();

        inputController = new GameInputController({
            onPointerMove,
            onPointerClick,
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
                if (session.state === 'GAMEOVER') {
                    exitToMainMenu();
                    return true;
                }
                return false;
            },
            onApplicationInactive: () => {
                if (session.state === 'PLAYING') togglePause();
                frameLoop?.resetDelta();
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

        const gridHelper = new THREE.GridHelper(110, 22, 0x00f0ff, 0x1e293b);
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

    function createSoldierMesh(colorHex: number): THREE.Group {
        const group = new THREE.Group();

        const bodyGeo = new THREE.CylinderGeometry(0.3, 0.2, 1.2, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.5, roughness: 0.3 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.6;
        body.castShadow = true;
        group.add(body);

        const headGeo = new THREE.SphereGeometry(0.25, 8, 8);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.35;
        group.add(head);

        const visorGeo = new THREE.BoxGeometry(0.2, 0.08, 0.15);
        const visorMat = new THREE.MeshBasicMaterial({ color: colorHex });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 1.35, 0.18);
        group.add(visor);

        const gunGeo = new THREE.BoxGeometry(0.12, 0.12, 0.8);
        const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
        const gun = new THREE.Mesh(gunGeo, gunMat);
        gun.position.set(0.25, 0.8, 0.3);
        group.add(gun);

        const muzzleGeo = new THREE.SphereGeometry(0.15, 6, 6);
        const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 });
        const muzzle = new THREE.Mesh(muzzleGeo, muzzleMat);
        muzzle.position.set(0.25, 0.8, 0.75);
        group.add(muzzle);
        group.userData.muzzleMesh = muzzle;

        return group;
    }

    function createTankMesh(colorHex: number): THREE.Group {
        const group = new THREE.Group();

        const baseGeo = new THREE.BoxGeometry(2.2, 0.7, 3.2);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.35;
        base.castShadow = true;
        group.add(base);

        const turretGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.65, 8);
        const turretMat = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.6 });
        const turret = new THREE.Mesh(turretGeo, turretMat);
        turret.position.y = 0.9;
        group.add(turret);

        const barrelGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.8, 8);
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.9, 1.0);
        group.add(barrel);

        return group;
    }

    function createHQMesh(colorHex: number): THREE.Group {
        const group = new THREE.Group();

        const baseGeo = new THREE.CylinderGeometry(3.8, 4.4, 2.8, 8);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.7, roughness: 0.3 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 1.4;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);

        const domeGeo = new THREE.SphereGeometry(2.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.6 });
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.position.y = 2.6;
        group.add(dome);

        const antGeo = new THREE.CylinderGeometry(0.08, 0.12, 3.5);
        const antMat = new THREE.MeshBasicMaterial({ color: colorHex });
        const ant = new THREE.Mesh(antGeo, antMat);
        ant.position.set(0, 4.5, 0);
        group.add(ant);

        return group;
    }

    function createGeneratorMesh(colorHex = 0xeab308): THREE.Group {
        const group = new THREE.Group();
        const baseGeo = new THREE.BoxGeometry(2.6, 1.3, 2.6);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.65;
        group.add(base);

        const ringGeo = new THREE.TorusGeometry(1.0, 0.16, 8, 20);
        const ringMat = new THREE.MeshBasicMaterial({ color: colorHex });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 1.6;
        group.add(ring);
        group.userData.ring = ring;

        return group;
    }

    function createBarracksMesh(colorHex = 0x00f0ff): THREE.Group {
        const group = new THREE.Group();
        const mainGeo = new THREE.BoxGeometry(3.5, 2.2, 3.5);
        const mainMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.6 });
        const main = new THREE.Mesh(mainGeo, mainMat);
        main.position.y = 1.1;
        group.add(main);

        const doorGeo = new THREE.BoxGeometry(1.8, 1.4, 0.2);
        const doorMat = new THREE.MeshBasicMaterial({ color: colorHex });
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, 0.7, 1.77);
        group.add(door);

        return group;
    }

    function createTurretMesh(colorHex = 0x3b82f6): THREE.Group {
        const group = new THREE.Group();
        const baseGeo = new THREE.CylinderGeometry(1.3, 1.6, 1.2, 8);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.6;
        group.add(base);

        const headGeo = new THREE.SphereGeometry(0.9, 12, 12);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.2 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.4;

        const barrelGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.4);
        const barrelMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.4 });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, 0.7);
        head.add(barrel);

        group.add(head);
        group.userData.head = head;

        return group;
    }

    function instantiateBuildingMesh(type: BuildingType, isPlayer = true): THREE.Group {
        const colorHex = isPlayer ? 0x00f0ff : 0xff3344;
        switch (type) {
            case 'generator':
                return createGeneratorMesh(isPlayer ? 0xeab308 : 0xff2244);
            case 'barracks':
                return createBarracksMesh(colorHex);
            case 'turret':
                return createTurretMesh(colorHex);
        }
    }

    function spawnFireAndSmokeEmitter(position: THREE.Vector3, scale = 1.0) {
        combatEffects.addBurningEmitter(position, scale);
    }

    function disposeObjectResources(root: THREE.Object3D) {
        root.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) material.dispose();
        });
    }

    function trackBattlefieldRemains(group: THREE.Group) {
        if (ruinsAndCorpses.length >= MAX_BATTLEFIELD_REMAINS) {
            const oldest = ruinsAndCorpses.shift();
            if (oldest) {
                scene.remove(oldest);
                disposeObjectResources(oldest);
            }
        }
        scene.add(group);
        ruinsAndCorpses.push(group);
    }

    function clearBattlefieldRemains() {
        for (const remains of ruinsAndCorpses) {
            scene.remove(remains);
            disposeObjectResources(remains);
        }
        ruinsAndCorpses = [];
    }

    function createBuildingRuin(position: THREE.Vector3, type: BuildingType | 'hq') {
        const group = new THREE.Group();

        if (type === 'generator') {
            // Generator Ruin: Compact base, broken energy coils, glowing core ember
            const baseGeo = new THREE.BoxGeometry(2.8, 0.3, 2.8);
            const baseMat = new THREE.MeshStandardMaterial({ color: 0x111115, roughness: 0.95 });
            const base = new THREE.Mesh(baseGeo, baseMat);
            base.position.y = 0.15;
            group.add(base);

            const ringGeo = new THREE.TorusGeometry(0.9, 0.12, 6, 12);
            const ringMat = new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 0.8 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 3;
            ring.position.set(0.2, 0.4, 0.1);
            group.add(ring);

            const coreGeo = new THREE.SphereGeometry(0.4, 8, 8);
            const coreMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
            const core = new THREE.Mesh(coreGeo, coreMat);
            core.position.set(0, 0.3, 0);
            group.add(core);

            spawnFireAndSmokeEmitter(position, 0.9);

        } else if (type === 'barracks') {
            // Barracks Ruin: Large wide foundation, tall broken wall chunks & metal doors
            const baseGeo = new THREE.BoxGeometry(4.2, 0.4, 4.2);
            const baseMat = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.95 });
            const base = new THREE.Mesh(baseGeo, baseMat);
            base.position.y = 0.2;
            group.add(base);

            const wall1Geo = new THREE.BoxGeometry(3.6, 1.4, 0.5);
            const wallMat = new THREE.MeshStandardMaterial({ color: 0x181820, roughness: 0.9 });
            const wall1 = new THREE.Mesh(wall1Geo, wallMat);
            wall1.position.set(0, 0.7, -1.6);
            wall1.rotation.z = 0.15;
            group.add(wall1);

            const doorGeo = new THREE.BoxGeometry(1.4, 0.2, 1.2);
            const doorMat = new THREE.MeshStandardMaterial({ color: 0x101520, roughness: 0.8 });
            const door = new THREE.Mesh(doorGeo, doorMat);
            door.position.set(0.8, 0.3, 1.0);
            door.rotation.y = 0.4;
            group.add(door);

            for (let i = 0; i < 4; i++) {
                const chunkGeo = new THREE.BoxGeometry(0.8, 0.5, 0.8);
                const chunk = new THREE.Mesh(chunkGeo, wallMat);
                chunk.position.set((Math.random() - 0.5) * 3.2, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 3.2);
                chunk.rotation.set(Math.random(), Math.random(), Math.random());
                group.add(chunk);
            }

            spawnFireAndSmokeEmitter(position, 1.5);

        } else if (type === 'turret') {
            // Turret Ruin: Cylindrical jagged pedestal stump with detached cannon barrel
            const baseGeo = new THREE.CylinderGeometry(1.1, 1.5, 0.9, 8);
            const baseMat = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.95 });
            const base = new THREE.Mesh(baseGeo, baseMat);
            base.position.y = 0.45;
            group.add(base);

            const headGeo = new THREE.SphereGeometry(0.7, 8, 8);
            const headMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.8 });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.set(0.9, 0.3, 0.6);
            group.add(head);

            const barrelGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.3);
            const barrelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0d, metalness: 0.9 });
            const barrel = new THREE.Mesh(barrelGeo, barrelMat);
            barrel.rotation.z = Math.PI / 2;
            barrel.rotation.y = 0.6;
            barrel.position.set(-0.8, 0.15, 0.4);
            group.add(barrel);

            spawnFireAndSmokeEmitter(position, 1.1);

        } else {
            // HQ Ruin: Massive crater base with twisted structural girders
            const baseGeo = new THREE.CylinderGeometry(4.2, 4.8, 0.5, 12);
            const baseMat = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.98 });
            const base = new THREE.Mesh(baseGeo, baseMat);
            base.position.y = 0.25;
            group.add(base);

            for (let i = 0; i < 6; i++) {
                const girderGeo = new THREE.BoxGeometry(0.3, 2.5, 0.3);
                const girderMat = new THREE.MeshStandardMaterial({ color: 0x1c1c24, metalness: 0.8 });
                const girder = new THREE.Mesh(girderGeo, girderMat);
                const angle = (i / 6) * Math.PI * 2;
                girder.position.set(Math.cos(angle) * 2.5, 1.0, Math.sin(angle) * 2.5);
                girder.rotation.set((Math.random() - 0.5) * 0.8, Math.random(), (Math.random() - 0.5) * 0.8);
                group.add(girder);
            }

            spawnFireAndSmokeEmitter(position, 2.2);
        }

        group.position.copy(position);
        trackBattlefieldRemains(group);
    }

    function createTankWreck(position: THREE.Vector3, _colorHex: number) {
        const group = new THREE.Group();

        const baseGeo = new THREE.BoxGeometry(2.2, 0.7, 3.2);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.95 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.35;
        group.add(base);

        const turretGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.65, 8);
        const turretMat = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.9 });
        const turret = new THREE.Mesh(turretGeo, turretMat);
        turret.position.set(0.3, 0.8, -0.2);
        turret.rotation.set(0.2, 0.5, -0.3);
        group.add(turret);

        group.position.copy(position);
        group.rotation.y = Math.random() * Math.PI * 2;
        group.rotation.z = 0.12;
        trackBattlefieldRemains(group);

        spawnFireAndSmokeEmitter(position, 0.8);
    }

    function createSoldierCorpse(position: THREE.Vector3) {
        const group = new THREE.Group();

        const stainGeo = new THREE.CircleGeometry(0.8, 12);
        const stainMat = new THREE.MeshBasicMaterial({ color: 0x08080a, side: THREE.DoubleSide });
        const stain = new THREE.Mesh(stainGeo, stainMat);
        stain.rotation.x = -Math.PI / 2;
        stain.position.y = 0.02;
        group.add(stain);

        const bodyGeo = new THREE.CylinderGeometry(0.28, 0.2, 1.2, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.9 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.2;
        group.add(body);

        group.position.copy(position);
        group.rotation.y = Math.random() * Math.PI * 2;
        trackBattlefieldRemains(group);

        spawnFireAndSmokeEmitter(position, 0.4);
    }

    function startNewGame(settings = ui.getMissionSettings()) {
        SFX.init();

        aiDifficulty = settings.difficulty;
        cancelPlacement();

        // Reset Nuclear Explosion Sequence Flags
        hqExplodingSequence = false;
        hqExplodeTimer = 0;
        pendingVictoryState = false;

        // Clear Menu Preview Units
        menuUnits.forEach(u => scene.remove(u));
        menuUnits = [];

        // Clear Scene Objects & Previous Battlefield Ruins / Corpses / Fire
        clearBattlefieldRemains();

        [...playerBuildings, ...enemyBuildings].forEach(b => scene.remove(b.mesh));
        [...playerUnits, ...enemyUnits].forEach(u => {
            if (u.type !== 'rifleman' && u.mesh instanceof THREE.Object3D) scene.remove(u.mesh);
        });
        soldierRenderer.clear();
        projectilePool.clear();
        combatEffects.clear();

        playerBuildings = [];
        enemyBuildings = [];
        playerUnits = [];
        enemyUnits = [];
        battleSimulation = null;
        targetObjects.clear();
        projectiles = [];

        session.start();
        frameLoop?.resetDelta();

        ui.enterGameplay();
        setTimeout(() => {
            updateUnlockUI();
        }, 700);

        controls.target.set(0, 0, 0);
        camera.position.set(0, 50, 50);

        // BOTH sides start CLEAN with ONLY the Nexus and 200 Gold
        gold = 200;
        enemyGold = 200;
        isDemolishMode = false;
        updateDemolishUI();

        stats.soldiersTrained = 0;
        stats.buildingsConstructed = 0;
        stats.startTime = Date.now();
        enemyAITimer = 0;
        playerKillStreak = 0;
        enemyKillStreak = 0;
        playerUnitsDestroyed = 0;
        playerUnitsLost = 0;

        // Randomize enemy AI satisfaction thresholds based on difficulty
        if (aiDifficulty === 'easy') {
            aiTargetGenerators = 2 + Math.floor(Math.random() * 2);
            aiTargetBarracks = 1 + Math.floor(Math.random() * 2);
            aiTargetTurrets = 1 + Math.floor(Math.random() * 2);
        } else if (aiDifficulty === 'normal') {
            aiTargetGenerators = 3 + Math.floor(Math.random() * 2);
            aiTargetBarracks = 2 + Math.floor(Math.random() * 2);
            aiTargetTurrets = 2 + Math.floor(Math.random() * 3);
        } else { // Hard
            aiTargetGenerators = 4 + Math.floor(Math.random() * 2);
            aiTargetBarracks = 3 + Math.floor(Math.random() * 2);
            aiTargetTurrets = 4 + Math.floor(Math.random() * 3);
        }

        updateResourceUI();

        // Player Nexus (HQ)
        playerHQ = {
            mesh: createHQMesh(0x00f0ff),
            hp: 1200,
            maxHp: 1200,
            position: new THREE.Vector3(0, 0, 45),
            type: 'hq',
            isPlayer: true
        };
        playerHQ.mesh.position.copy(playerHQ.position);
        playerHQ.healthBar = create3DHealthBar(true, 5.2, 4.0);
        playerHQ.mesh.add(playerHQ.healthBar.group);

        scene.add(playerHQ.mesh);
        playerBuildings.push(playerHQ);

        // Enemy Nexus (HQ)
        enemyHQ = {
            mesh: createHQMesh(0xff3344),
            hp: 1200,
            maxHp: 1200,
            position: new THREE.Vector3(0, 0, -45),
            type: 'hq',
            isPlayer: false
        };
        enemyHQ.mesh.position.copy(enemyHQ.position);
        enemyHQ.healthBar = create3DHealthBar(false, 5.2, 4.0);
        enemyHQ.mesh.add(enemyHQ.healthBar.group);

        scene.add(enemyHQ.mesh);
        enemyBuildings.push(enemyHQ);

        battleSimulation = new BattleSimulation();
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
            ui.setPaused(true);
        } else if (session.resume()) {
            frameLoop?.resetDelta();
            ui.setPaused(false);
        }
    }

    function exitToMainMenu() {
        clearBattlefieldRemains();

        [...playerBuildings, ...enemyBuildings].forEach(b => scene.remove(b.mesh));
        [...playerUnits, ...enemyUnits].forEach(u => {
            if (u.mesh instanceof THREE.Object3D) scene.remove(u.mesh);
        });
        projectiles.forEach(p => scene.remove(p.mesh));
        projectilePool.clear();
        combatEffects.clear();

        playerBuildings = [];
        enemyBuildings = [];
        playerUnits = [];
        enemyUnits = [];
        projectiles = [];
        soldierRenderer.clear();
        targetObjects.clear();
        battleSimulation = null;

        if (placementGhost) {
            scene.remove(placementGhost);
            placementGhost = null;
        }
        selectedBuildType = null;

        session.returnToMenu();
        frameLoop?.resetDelta();

        ui.enterMainMenu();
        ui.setPlacementActive(false);

        setupMenuCinematic();
    }

    function updateResourceUI() {
        const activeBarracks = playerBuildings.filter(isValidSoldierFactory);
        const barracksCount = activeBarracks.length;
        ui.updateResources(gold, enemyGold, barracksCount);
    }

    function isValidSoldierFactory(
        building: RuntimeStructure
    ): building is RuntimeStructure & { ecsEntityId: Entity } {
        if (building.type !== 'barracks' || building.hp <= 0
            || building.ecsEntityId === undefined || !battleSimulation) return false;
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

    function getBuildingCost(type: BuildingType | 'hq'): number {
        return type === 'generator' ? 100 : (type === 'barracks' ? 150 : 125);
    }

    function onPointerMove(event: PointerEvent) {
        updatePointerPosition(event);
        updatePlacementGhost();
    }

    function updatePlacementGhost() {
        if (selectedBuildType && placementGhost && terrainFloor) {
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(terrainFloor);
            if (intersects.length > 0) {
                const point = intersects[0].point;
                if (point.z > 5 && point.z < 65 && Math.abs(point.x) < 48) {
                    placementGhost.position.set(Math.round(point.x), 0, Math.round(point.z));
                } else {
                    placementGhost.position.set(0, -100, 0);
                }
            }
        }
    }

    function updatePointerPosition(event: MouseEvent) {
        const bounds = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    }

    function onPointerClick(event: MouseEvent) {
        if (session.state !== 'PLAYING') return;
        if (event.target !== renderer.domElement) return;

        updatePointerPosition(event);
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
                    const refund = Math.floor(getBuildingCost(b.type) * 0.7);
                    gold += refund;

                    SFX.playBuild();
                    scene.remove(b.mesh);
                    playerBuildings.splice(buildingIndex, 1);

                    showToast(`🗑️ Estructura vendida. Recuperas +${refund} Oro.`);
                    updateResourceUI();
                    return;
                }
            }
        }

        // Building Placement Click
        if (selectedBuildType && placementGhost && placementGhost.position.y >= 0) {
            const pos = placementGhost.position;

            const tooClose = playerBuildings.some(b => b.position.distanceTo(pos) < 3.8);
            if (tooClose) {
                showToast("⚠️ Ubicación ocupada. Elige otro punto.");
                return;
            }

            const cost = getBuildingCost(selectedBuildType);

            if (gold >= cost) {
                gold -= cost;
                SFX.playBuild();
                stats.buildingsConstructed++;
                unlocks.recordEvent('building_constructed', {
                    buildingsPlaced: stats.buildingsConstructed,
                    buildingType: selectedBuildType
                });

                const realMesh = instantiateBuildingMesh(selectedBuildType, true);
                realMesh.position.copy(pos);

                const newB = {
                    mesh: realMesh,
                    hp: 380,
                    maxHp: 380,
                    position: pos.clone(),
                    type: selectedBuildType,
                    isPlayer: true,
                    lastAction: 0,
                    healthBar: create3DHealthBar(true, selectedBuildType === 'turret' ? 2.8 : 2.5, 2.2)
                };
                realMesh.add(newB.healthBar.group);

                scene.add(realMesh);
                registerStructureTarget(newB);
                playerBuildings.push(newB);

                showToast(`¡${selectedBuildType.toUpperCase()} CONSTRUIDO!`);
            } else {
                showToast("¡Recursos insuficientes!");
            }

            cancelPlacement();
            updateResourceUI();
        }
    }

    function registerStructureTarget(building: RuntimeStructure) {
        if (!battleSimulation) return;
        const faction = building.isPlayer ? ECS_FACTIONS.player : ECS_FACTIONS.enemy;
        const position = {
            x: building.position.x,
            y: building.position.y,
            z: building.position.z
        };
        const entity = building.type === 'barracks'
            ? createSoldierFactory(battleSimulation.world, faction, position, building.maxHp)
            : createStructure(battleSimulation.world, faction, position, building.maxHp);
        building.ecsEntityId = entity;
        targetObjects.set(entity, building);
    }

    function spawnTroop(type: UnitType, position: Position, isPlayer: boolean, producer: Entity): boolean {
        if (!battleSimulation || !soldierRenderer) {
            throw new Error('Cannot spawn soldiers before the battle renderer is initialized');
        }
        const faction = isPlayer ? ECS_FACTIONS.player : ECS_FACTIONS.enemy;
        const order = requestSoldierProduction(battleSimulation.world, producer, position);
        if (!order || order.faction !== faction) return false;
        const spawnPosition = new THREE.Vector3(order.position.x, order.position.y, order.position.z);
        const colorHex = isPlayer ? 0x00f0ff : 0xff3344;
        const hasVeteranArmor = isPlayer && type === 'tank' && unlocks.isUnlocked('veteran_armor');
        const hpVal = type === 'rifleman' ? 100 : Math.round(380 * (hasVeteranArmor ? 1.2 : 1));
        const speed = type === 'rifleman' ? 8 : 4.5;
        const range = type === 'rifleman' ? 14 : 18;
        const entity = createECSSoldier(
            battleSimulation.world,
            faction,
            order.position,
            speed,
            range,
            hpVal
        );
        const mesh = type === 'rifleman'
            ? soldierRenderer.add(entity, faction, spawnPosition)
            : createTankMesh(colorHex);
        mesh.position.copy(spawnPosition);

        const unitObj: RuntimeUnit = {
            mesh: mesh,
            hp: hpVal,
            maxHp: hpVal,
            speed: speed,
            damage: type === 'rifleman' ? 12 : Math.round(45 * (hasVeteranArmor ? 1.2 : 1)),
            fireRate: type === 'rifleman' ? 0.35 : 1.2,
            range: range,
            lastFire: 0,
            type: type,
            isPlayer: isPlayer,
            ecsEntityId: entity
        };

        if (type !== 'rifleman') {
            const healthBar = create3DHealthBar(isPlayer, 1.8, 1.4);
            unitObj.healthBar = healthBar;
            if (mesh instanceof THREE.Group) {
                mesh.add(healthBar.group);
                scene.add(mesh);
            }
        }

        targetObjects.set(entity, unitObj);

        if (isPlayer) playerUnits.push(unitObj);
        else enemyUnits.push(unitObj);
        return true;
    }

    function trainUnit(unitType: UnitType) {
        const activeBarracks = playerBuildings.filter(isValidSoldierFactory);
        if (activeBarracks.length === 0) {
            showToast("¡Debes construir una Barraca primero!");
            return;
        }

        const cost = (unitType === 'rifleman' ? 50 : 180) * activeBarracks.length;
        if (gold < cost) {
            showToast("¡No tienes suficiente Oro!");
            return;
        }

        gold -= cost;
        updateResourceUI();
        SFX.playBuild();

        activeBarracks.forEach(barracks => {
            const spawnPos = barracks.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, -3));
            if (spawnTroop(unitType, spawnPos, true, barracks.ecsEntityId)) {
                stats.soldiersTrained++;
            }
        });

        if (activeBarracks.length > 1) {
            showToast(`¡Desplegando tropas desde tus ${activeBarracks.length} Barracas!`);
        }
    }

    function spawnAIBuilding(type: BuildingType, position: THREE.Vector3) {
        const mesh = instantiateBuildingMesh(type, false);
        mesh.position.copy(position);

        const newB = {
            mesh: mesh,
            hp: 380,
            maxHp: 380,
            position: position.clone(),
            type: type,
            isPlayer: false,
            lastAction: 0,
            healthBar: create3DHealthBar(false, type === 'turret' ? 2.8 : 2.5, 2.2)
        };
        mesh.add(newB.healthBar.group);

        scene.add(mesh);
        registerStructureTarget(newB);
        enemyBuildings.push(newB);
    }

    function updateEnemyAI(delta: number) {
        if (!enemyAIEnabled) return;
        const goldMult = aiDifficulty === 'easy' ? 6.0 : (aiDifficulty === 'normal' ? 11.0 : 18.0);
        enemyGold += delta * goldMult;

        const enemyGens = enemyBuildings.filter(b => b.type === 'generator' && b.hp > 0).length;
        enemyGold += enemyGens * 16 * delta;

        const decisionCooldown = aiDifficulty === 'easy' ? 2.5 : (aiDifficulty === 'normal' ? 1.4 : 0.7);

        enemyAITimer += delta;
        if (enemyAITimer > decisionCooldown) {
            enemyAITimer = 0;

            const enemyBarracks = enemyBuildings.filter(isValidSoldierFactory);
            const enemyTurrets = enemyBuildings.filter(b => b.type === 'turret' && b.hp > 0);

            const hasReachedGenTarget = enemyGens >= aiTargetGenerators;
            const hasReachedBarracksTarget = enemyBarracks.length >= aiTargetBarracks;
            const hasReachedTurretTarget = enemyTurrets.length >= aiTargetTurrets;
            const isFullySatisfied = hasReachedGenTarget && hasReachedBarracksTarget && hasReachedTurretTarget;

            ui.setAiStatus(isFullySatisfied ? "ESTADO IA: BATALLÓN ACTIVO" : "ESTADO IA: CONSTRUYENDO");

            // AI places random structures until satisfied
            if (!hasReachedGenTarget && enemyGold >= 100 && Math.random() < 0.6) {
                enemyGold -= 100;
                const rx = (Math.random() - 0.5) * 44;
                const rz = -28 - Math.random() * 22;
                spawnAIBuilding('generator', new THREE.Vector3(rx, 0, rz));
            } else if (!hasReachedBarracksTarget && enemyGold >= 150 && Math.random() < 0.65) {
                enemyGold -= 150;
                const rx = (Math.random() - 0.5) * 40;
                const rz = -20 - Math.random() * 20;
                spawnAIBuilding('barracks', new THREE.Vector3(rx, 0, rz));
            } else if (!hasReachedTurretTarget && enemyGold >= 125 && Math.random() < 0.7) {
                enemyGold -= 125;
                const rx = (Math.random() - 0.5) * 42;
                const rz = -12 - Math.random() * 18;
                spawnAIBuilding('turret', new THREE.Vector3(rx, 0, rz));
            }

            // Barracks request units only when their faction can afford them.
            if (enemyBarracks.length > 0) {
                enemyBarracks.forEach(barracks => {
                    const spawnPos = barracks.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, 3));
                    const roll = Math.random();
                    if (enemyGold >= 180 && roll < 0.45) {
                        enemyGold -= 180;
                        spawnTroop('tank', spawnPos, false, barracks.ecsEntityId);
                    } else if (enemyGold >= 50 && roll >= 0.45) {
                        enemyGold -= 50;
                        spawnTroop('rifleman', spawnPos, false, barracks.ecsEntityId);
                    }
                });
            }
        }
    }

    function createMushroomCloud(position: THREE.Vector3) {
        cameraShake = 4.5;
        SFX.playCinematicExplosion(true);
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

    function updateUnitGroup(units: RuntimeUnit[], time: number, isPlayer: boolean) {
        const simulation = battleSimulation;
        if (!simulation) return;
        for (let i = units.length - 1; i >= 0; i--) {
            const unit = units[i];
            const entity = unit.ecsEntityId;

            if (unit.healthBar) {
                unit.healthBar.update(unit.hp, unit.maxHp);
                unit.healthBar.billboard(camera);
            } else {
                soldierRenderer.setHealth(entity, unit.hp, unit.maxHp);
            }

            if (unit.hp <= 0) {
                if (!isPlayer) {
                    playerKillStreak++;
                    enemyKillStreak = 0;
                    playerUnitsDestroyed++;
                    unlocks.recordEvent('unit_killed', {
                        byPlayer: true,
                        killStreak: playerKillStreak,
                        unitType: unit.type
                    });
                    unlocks.recordEvent('kill_streak', { killStreak: playerKillStreak });
                    if (playerUnitsDestroyed === 20) {
                        unlocks.recordEvent('achievement', { achievement: 'destroy_20_units' });
                    }
                } else {
                    enemyKillStreak++;
                    playerKillStreak = 0;
                    playerUnitsLost++;
                    unlocks.recordEvent('unit_killed', {
                        byPlayer: false,
                        killStreak: enemyKillStreak,
                        unitType: unit.type
                    });
                }

                createCinematicExplosion(unit.mesh.position, unit.type === 'tank' ? 1.2 : 0.6, false);

                if (unit.type === 'tank') {
                    createTankWreck(unit.mesh.position, isPlayer ? 0x00f0ff : 0xff3344);
                } else {
                    createSoldierCorpse(unit.mesh.position);
                }

                simulation.world.removeEntity(entity);
                targetObjects.delete(entity);
                if (unit.type === 'rifleman') soldierRenderer.remove(entity);
                else if (unit.mesh instanceof THREE.Object3D) scene.remove(unit.mesh);
                units.splice(i, 1);
                continue;
            }

            const targetEntity = simulation.getTarget(entity);
            const closestTarget = targetEntity === undefined ? null : targetObjects.get(targetEntity);
            const targetPosition = targetEntity === undefined
                ? null
                : simulation.world.getComponent(targetEntity, ECS_COMPONENTS.transform);
            const transform = simulation.world.getComponent(entity, ECS_COMPONENTS.transform);
            if (!closestTarget || !targetPosition || !transform) continue;

            unit.mesh.position.set(transform.x, transform.y, transform.z);
            unit.mesh.lookAt(targetPosition.x, transform.y, targetPosition.z);
            const distance = Math.hypot(targetPosition.x - transform.x, targetPosition.z - transform.z);
            if (distance > unit.range || time - unit.lastFire <= unit.fireRate) continue;

            unit.lastFire = time;
            projectileOrigin.copy(unit.mesh.position);
            projectileOrigin.y += unit.type === 'rifleman' ? 0.8 : 1.2;

            if (unit.type === 'rifleman') {
                SFX.playRifleShot();
                fireProjectile(
                    projectileOrigin,
                    targetPosition,
                    isPlayer,
                    unit.damage,
                    isPlayer ? 0x00f0ff : 0xff3344,
                    closestTarget,
                    false
                );
                soldierRenderer.showMuzzleFlash(entity, time + 0.05);
            } else {
                SFX.playHeavyCannon();
                fireProjectile(
                    projectileOrigin,
                    targetPosition,
                    isPlayer,
                    unit.damage,
                    isPlayer ? 0x00f0ff : 0xff3344,
                    closestTarget,
                    true
                );
            }
        }
    }

    function considerTurretTarget(turret: RuntimeStructure, candidate: RuntimeTarget) {
        if (candidate.hp <= 0) return;
        const position = candidate.mesh.position;
        const deltaX = position.x - turret.position.x;
        const deltaZ = position.z - turret.position.z;
        const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
        if (distanceSquared < turretTargetSearch.distanceSquared) {
            turretTargetSearch.distanceSquared = distanceSquared;
            turretTargetSearch.target = candidate;
        }
    }

    function updateTurret(
        turret: RuntimeStructure,
        targetUnits: RuntimeTarget[],
        targetBuildings: RuntimeTarget[],
        time: number
    ) {
        turretTargetSearch.target = null;
        turretTargetSearch.distanceSquared = 22 * 22;
        for (const unit of targetUnits) considerTurretTarget(turret, unit);
        for (const building of targetBuildings) considerTurretTarget(turret, building);

        const closest = turretTargetSearch.target as RuntimeTarget | null;
        if (!closest || !turret.mesh.userData.head) return;
        const targetPos = closest.mesh.position;
        turret.mesh.userData.head.lookAt(
            targetPos.x,
            turret.mesh.userData.head.position.y + turret.position.y,
            targetPos.z
        );
        if (time - (turret.lastAction ?? 0) <= 0.8) return;

        turret.lastAction = time;
        turretProjectileOrigin.copy(turret.position);
        turretProjectileOrigin.y += 1.8;
        fireProjectile(
            turretProjectileOrigin,
            targetPos,
            turret.isPlayer,
            35,
            turret.isPlayer ? 0x00f0ff : 0xff3344,
            closest,
            true
        );
        SFX.playHeavyCannon();
    }

    function updateTurrets(time: number) {
        for (const turret of playerBuildings) {
            if (turret.type === 'turret' && turret.hp > 0) {
                updateTurret(turret, enemyUnits, enemyBuildings, time);
            }
        }
        for (const turret of enemyBuildings) {
            if (turret.type === 'turret' && turret.hp > 0) {
                updateTurret(turret, playerUnits, playerBuildings, time);
            }
        }
    }

    function updateCombat(delta: number, time: number) {
        // Camera Shake Physics
        if (cameraShake > 0) {
            camera.position.x += (Math.random() - 0.5) * cameraShake;
            camera.position.y += (Math.random() - 0.5) * cameraShake;
            camera.position.z += (Math.random() - 0.5) * cameraShake;
            cameraShake = Math.max(0, cameraShake - delta * 4.0);
        }

        // Display Victory / Defeat card strictly AFTER nuclear detonation sequence completes
        if (hqExplodingSequence) {
            hqExplodeTimer += delta;
            if (hqExplodeTimer >= 4.0) {
                hqExplodingSequence = false;
                endGame(pendingVictoryState);
            }
        }

        // Passive Gold Generation
        const playerGens = playerBuildings.filter(b => b.type === 'generator' && b.hp > 0).length;
        gold += delta * 5 + playerGens * 12 * delta;

        updateResourceUI();

        if (playerHQ && enemyHQ) {
            ui.setBaseHealth(
                { current: playerHQ.hp, maximum: playerHQ.maxHp },
                { current: enemyHQ.hp, maximum: enemyHQ.maxHp }
            );
        }

        if (battleSimulation) {
            const simulationStart = diagnosticsEnabled ? performance.now() : 0;
            battleSimulation.advance(delta);
            if (diagnosticsEnabled) diagnosticsSimulationMs = performance.now() - simulationStart;
        }

        // Update Units with identical billboard camera health bars
        updateUnitGroup(playerUnits, time, true);
        updateUnitGroup(enemyUnits, time, false);

        updateTurrets(time);

        // Update Projectiles
        const effectsStart = diagnosticsEnabled ? performance.now() : 0;
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const proj = projectiles[i];
            const advanceResult = advanceProjectile(proj.flight, delta);
            if (advanceResult !== 'moving') {
                if (advanceResult === 'impact' && proj.targetObj && proj.targetObj.hp > 0) {
                    applyDamage(proj.targetObj, proj.damage);
                }
                if (advanceResult === 'impact' && proj.isHeavy) {
                    createCinematicExplosion(proj.mesh.position, 0.6, false);
                }
                projectilePool.release(proj.mesh);
                projectiles.splice(i, 1);
            }
        }
        combatEffects.update(delta);
        if (diagnosticsEnabled) diagnosticsEffectsMs = performance.now() - effectsStart;

        // Building Health Bars & Destruction Ruins
        const updateBuildingList = (bList: RuntimeStructure[]) => {
            for (let i = bList.length - 1; i >= 0; i--) {
                const b = bList[i];
                if (battleSimulation && b.ecsEntityId !== undefined) {
                    const health = battleSimulation.world.getComponent(b.ecsEntityId, ECS_COMPONENTS.health);
                    if (health) health.current = b.hp;
                }
                if (b.healthBar) {
                    b.healthBar.update(b.hp, b.maxHp);
                    b.healthBar.billboard(camera);
                }
                if (b.hp <= 0) {
                    const isHQ = b.type === 'hq';
                    createCinematicExplosion(b.position, isHQ ? 3.0 : 1.2, isHQ);

                    if (!isHQ) {
                        createBuildingRuin(b.position, b.type);
                    }

                    scene.remove(b.mesh);
                    if (battleSimulation && b.ecsEntityId !== undefined) {
                        battleSimulation.world.removeEntity(b.ecsEntityId);
                        targetObjects.delete(b.ecsEntityId);
                    }
                    bList.splice(i, 1);
                }
            }
        };
        updateBuildingList(playerBuildings);
        updateBuildingList(enemyBuildings);

        // HQ Nuclear Explosion Trigger
        if (!hqExplodingSequence) {
            if (playerHQ && playerHQ.hp <= 0) {
                hqExplodingSequence = true;
                hqExplodeTimer = 0;
                pendingVictoryState = false;
            } else if (enemyHQ && enemyHQ.hp <= 0) {
                hqExplodingSequence = true;
                hqExplodeTimer = 0;
                pendingVictoryState = true;
            }
        }
    }

    function applyDamage(target: RuntimeTarget, amount: number) {
        const entity = target.ecsEntityId;
        if (battleSimulation && entity !== undefined
            && battleSimulation.world.getComponent(entity, ECS_COMPONENTS.health)) {
            target.hp = applyDamageSystem(battleSimulation.world, entity, amount).current;
            return;
        }
        target.hp = Math.max(0, target.hp - amount);
    }

    function fireProjectile(
        fromPos: THREE.Vector3,
        toPos: Position,
        isPlayer: boolean,
        damage: number,
        colorHex: number,
        targetObj: RuntimeTarget | null = null,
        isHeavy = false
    ) {
        const mesh = projectilePool.acquire(fromPos, isPlayer, isHeavy);
        if (!mesh) return;
        const targetPos = new THREE.Vector3(toPos.x, toPos.y, toPos.z);

        projectiles.push({
            mesh: mesh,
            flight: { position: mesh.position, target: targetPos, remainingSeconds: 5 },
            damage: damage,
            color: colorHex,
            targetObj: targetObj,
            isHeavy: isHeavy
        });
    }

    function activateTemporaryUnlock(id: string | null) {
        if (!id) return;
        if (session.state !== 'PLAYING' || !unlocks.hasTemporary(id)) return;
        if (id !== 'helicopter_temp' && id !== 'airstrike_temp') return;

        if (id === 'helicopter_temp') {
            if (!playerHQ) return;
            const targets = [...enemyUnits, ...enemyBuildings.filter((building) => building.hp > 0)];
            if (targets.length === 0) {
                showToast('No quedan objetivos enemigos para el apoyo aéreo.');
                return;
            }
            if (!unlocks.consumeTemporary(id)) return;

            const playerBase = playerHQ;
            const target = targets.reduce((closest, candidate) => {
                const position = candidate.mesh.position;
                const distance = position.distanceTo(playerBase.position);
                return distance < closest.distance ? { candidate, distance } : closest;
            }, { candidate: targets[0], distance: Infinity }).candidate;
            const targetPosition = target.mesh.position;
            applyDamage(target, 180);
            createCinematicExplosion(targetPosition, 1.2, false);
            showToast('🚁 Apoyo de helicóptero: ataque al objetivo enemigo más cercano.');
        } else if (id === 'airstrike_temp') {
            const impact = new THREE.Vector3(0, 0, -42);
            const targets = [...enemyUnits, ...enemyBuildings.filter((building) => building.hp > 0)];
            let hits = 0;
            for (const target of targets) {
                const position = target.mesh.position;
                if (position.distanceTo(impact) > 18) continue;
                applyDamage(target, 220);
                hits++;
            }
            if (!unlocks.consumeTemporary(id)) return;
            createCinematicExplosion(impact, 2.2, false);
            showToast(hits ? `✈️ Ataque aéreo: ${hits} objetivo(s) alcanzado(s).` : '✈️ Ataque aéreo lanzado; no había objetivos en el área.');
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

        ui.showGameOver({
            victory: isVictory,
            soldiersTrained: stats.soldiersTrained,
            losses: playerUnitsLost,
            buildingsConstructed: stats.buildingsConstructed,
            duration: `${mins}:${secs}`,
            enemyBaseDamagePercent: enemyHQDamage
        });
    }

    function animate({ deltaSeconds: delta, elapsedSeconds: time }: FrameTiming) {
        const frameStart = diagnosticsEnabled ? performance.now() : 0;
        let combatMs = 0;

        if (session.state === 'MENU') {
            camera.position.x = Math.sin(time * 0.25) * 60;
            camera.position.z = Math.cos(time * 0.25) * 60;
            camera.position.y = 30 + Math.sin(time * 0.5) * 5;
            camera.lookAt(0, 0, 0);
        } else if (session.state === 'PLAYING') {
            controls.update();
            const combatStart = diagnosticsEnabled ? performance.now() : 0;
            updateEnemyAI(delta);
            updateCombat(delta, time);
            if (diagnosticsEnabled) combatMs = performance.now() - combatStart;
        }

        const renderStart = diagnosticsEnabled ? performance.now() : 0;
        renderCoordinator.render(time);
        if (diagnosticsEnabled) {
            const now = performance.now();
            if (diagnosticsPreviousFrame > 0) {
                const effectStats = combatEffects.stats();
                const projectileStats = projectilePool.stats();
                diagnosticsSamples.push({
                    frameMs: now - diagnosticsPreviousFrame,
                    workMs: now - frameStart,
                    combatMs,
                    simulationMs: diagnosticsSimulationMs,
                    effectsMs: diagnosticsEffectsMs,
                    renderMs: now - renderStart,
                    drawCalls: renderer.info.render.calls,
                    geometries: renderer.info.memory.geometries,
                    textures: renderer.info.memory.textures,
                    sceneObjects: scene.children.length,
                    particles: effectStats.activeParticles,
                    particleSlots: effectStats.particleSlots,
                    shockwaves: effectStats.activeShockwaves,
                    emitters: effectStats.activeEmitters,
                    effectGeometries: effectStats.geometries,
                    effectMaterials: effectStats.materials,
                    projectiles: projectiles.length,
                    cachedProjectiles: projectileStats.cached,
                    soldiers: playerUnits.length + enemyUnits.length,
                    playerSoldiers: playerUnits.length,
                    enemySoldiers: enemyUnits.length
                });
                if (diagnosticsSamples.length > 300) diagnosticsSamples.shift();
            }
            diagnosticsPreviousFrame = now;
        }
    }

    if (diagnosticsEnabled) {
        window.__gameDiagnostics = {
            read() {
                const samples = diagnosticsSamples;
                const effectStats = combatEffects.stats();
                const projectileStats = projectilePool.stats();
                const average = (key: string) => samples.reduce((sum, sample) => sum + sample[key], 0)
                    / Math.max(1, samples.length);
                const percentile = (key: string, ratio: number) => {
                    const values = samples.map((sample) => sample[key]).sort((a, b) => a - b);
                    return values[Math.min(values.length - 1, Math.floor(values.length * ratio))] || 0;
                };
                const maximum = (key: string) => samples.reduce((max, sample) => Math.max(max, sample[key]), 0);
                return {
                    sampleCount: samples.length,
                    frameMs: average('frameMs'),
                    p95FrameMs: percentile('frameMs', 0.95),
                    fps: 1000 / Math.max(average('frameMs'), 0.001),
                    workMs: average('workMs'),
                    combatMs: average('combatMs'),
                    simulationMs: average('simulationMs'),
                    effectsMs: average('effectsMs'),
                    renderMs: average('renderMs'),
                    drawCalls: average('drawCalls'),
                    geometries: samples.at(-1)?.geometries ?? renderer.info.memory.geometries,
                    textures: samples.at(-1)?.textures ?? renderer.info.memory.textures,
                    maxGeometries: maximum('geometries'),
                    sceneObjects: samples.at(-1)?.sceneObjects ?? scene.children.length,
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
                    projectiles: samples.at(-1)?.projectiles ?? 0,
                    cachedProjectiles: projectileStats.cached,
                    soldiers: samples.at(-1)?.soldiers ?? 0,
                    playerSoldiers: samples.at(-1)?.playerSoldiers ?? playerUnits.length,
                    enemySoldiers: samples.at(-1)?.enemySoldiers ?? enemyUnits.length,
                    memoryBytes: (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? null
                };
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
                const playerFactory = createSoldierFactory(
                    simulation.world,
                    ECS_FACTIONS.player,
                    { x: 0, y: 0, z: 45 }
                );
                const enemyFactory = createSoldierFactory(
                    simulation.world,
                    ECS_FACTIONS.enemy,
                    { x: 0, y: 0, z: -45 }
                );
                for (let index = 0; index < 5; index++) {
                    const x = (index - 2) * 1.4;
                    spawnTroop('rifleman', new THREE.Vector3(x, 0, 4), true, playerFactory);
                    spawnTroop('rifleman', new THREE.Vector3(x, 0, -4), false, enemyFactory);
                }
                simulation.world.removeEntity(playerFactory);
                simulation.world.removeEntity(enemyFactory);
                for (const x of [-5, 0, 5]) spawnAIBuilding('turret', new THREE.Vector3(x, 0, 0));
                diagnosticsSamples.length = 0;
                diagnosticsPreviousFrame = 0;
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
            activateUnlock: activateTemporaryUnlock
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
            renderCoordinator?.dispose();
            for (const unsubscribe of unlockSubscriptions.splice(0)) unsubscribe();
        },
        get state() {
            return session.state;
        }
    };
}
