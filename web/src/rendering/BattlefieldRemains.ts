import * as THREE from 'three';
import type { BuildingKind, Position } from '../game/ecs/components.ts';
import type { CombatEffects } from './CombatEffects.ts';
import { disposeObjectResources } from './battlefieldMeshes.ts';

export const MAX_BATTLEFIELD_REMAINS = 64;

export class BattlefieldRemains {
    readonly #scene: THREE.Scene;
    readonly #effects: Pick<CombatEffects, 'addBurningEmitter'>;
    #remains: THREE.Group[] = [];

    constructor(scene: THREE.Scene, effects: Pick<CombatEffects, 'addBurningEmitter'>) {
        this.#scene = scene;
        this.#effects = effects;
    }

    get count(): number {
        return this.#remains.length;
    }

    addBuildingRuin(source: Readonly<Position>, type: BuildingKind): void {
        const position = new THREE.Vector3(source.x, source.y, source.z);
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

            this.#spawnFireAndSmokeEmitter(position, 0.9);

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

            this.#spawnFireAndSmokeEmitter(position, 1.5);

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

            this.#spawnFireAndSmokeEmitter(position, 1.1);

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

            this.#spawnFireAndSmokeEmitter(position, 2.2);
        }

        group.position.copy(position);
        this.#track(group);
    }

    addTankWreck(source: Readonly<Position>): void {
        const position = new THREE.Vector3(source.x, source.y, source.z);
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
        this.#track(group);

        this.#spawnFireAndSmokeEmitter(position, 0.8);
    }

    addSoldierCorpse(source: Readonly<Position>): void {
        const position = new THREE.Vector3(source.x, source.y, source.z);
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
        this.#track(group);

        this.#spawnFireAndSmokeEmitter(position, 0.4);
    }

    clear(): void {
        for (const remains of this.#remains) {
            this.#scene.remove(remains);
            disposeObjectResources(remains);
        }
        this.#remains = [];
    }

    #spawnFireAndSmokeEmitter(position: THREE.Vector3, scale = 1.0): void {
        this.#effects.addBurningEmitter(position, scale);
    }

    #track(group: THREE.Group): void {
        if (this.#remains.length >= MAX_BATTLEFIELD_REMAINS) {
            const oldest = this.#remains.shift();
            if (oldest) {
                this.#scene.remove(oldest);
                disposeObjectResources(oldest);
            }
        }
        this.#scene.add(group);
        this.#remains.push(group);
    }
}
