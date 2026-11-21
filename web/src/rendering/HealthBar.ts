import * as THREE from 'three';

export interface HealthBar {
    readonly group: THREE.Group;
    readonly fillMesh: THREE.Mesh;
    readonly maxWidth: number;
    update(currentHp: number, maxHp: number): void;
    billboard(camera: THREE.Camera): void;
}

export function createHealthBar(isPlayer: boolean, heightOffset = 2.0, width = 1.6, visible = true): HealthBar {
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
    // `bars=0` diagnostics: hidden bars cost no draw calls; health itself is untouched.
    if (!visible) barGroup.visible = false;

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
