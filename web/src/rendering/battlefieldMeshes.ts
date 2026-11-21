import * as THREE from 'three';
import type { BuildableStructureKind } from '../game/definitions/structures.ts';

export function createSoldierMesh(colorHex: number): THREE.Group {
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

export function createTankMesh(colorHex: number): THREE.Group {
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

export function createHQMesh(colorHex: number): THREE.Group {
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

export function createNexusShieldVisual(color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(9, 18, 12),
        new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.24,
            wireframe: true,
            depthWrite: false
        })
    );
    mesh.visible = false;
    mesh.name = 'nexus-defensive-shield';
    return mesh;
}

export function createGeneratorMesh(colorHex = 0xeab308): THREE.Group {
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

export function createBarracksMesh(colorHex = 0x00f0ff): THREE.Group {
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

export function createTurretMesh(colorHex = 0x3b82f6): THREE.Group {
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

export function instantiateBuildingMesh(type: BuildableStructureKind, isPlayer = true): THREE.Group {
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

/** Only for trees whose resources are exclusive; never for shared batches or pools. */
export function disposeObjectResources(root: THREE.Object3D): void {
    root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
    });
}
