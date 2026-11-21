import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createBarracksMesh,
  createGeneratorMesh,
  createHQMesh,
  createNexusShieldVisual,
  createSoldierMesh,
  createTankMesh,
  createTurretMesh,
  disposeObjectResources,
  instantiateBuildingMesh
} from './battlefieldMeshes.ts';

type Vec3 = [number, number, number];

interface MaterialSpec {
  type: 'MeshStandardMaterial' | 'MeshBasicMaterial';
  color: number;
  emissive?: number;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  wireframe?: boolean;
  depthWrite?: boolean;
}

interface MeshSpec {
  geometry: string;
  parameters: Record<string, number>;
  material: MaterialSpec;
  position?: Vec3;
  rotation?: Vec3;
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function assertMaterial(material: THREE.Material, spec: MaterialSpec): void {
  assert.equal(material.type, spec.type);
  assert.ok(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial);
  assert.equal(material.color.getHex(), spec.color);
  assert.equal(material.transparent, spec.transparent ?? false);
  assert.equal(material.opacity, spec.opacity ?? 1);
  assert.equal(material.side, spec.side ?? THREE.FrontSide);
  assert.equal(material.wireframe, spec.wireframe ?? false);
  assert.equal(material.depthWrite, spec.depthWrite ?? true);
  if (material instanceof THREE.MeshStandardMaterial) {
    assert.equal(material.emissive.getHex(), spec.emissive ?? 0);
    assert.equal(material.emissiveIntensity, spec.emissiveIntensity ?? 1);
    assert.equal(material.metalness, spec.metalness ?? 0);
    assert.equal(material.roughness, spec.roughness ?? 1);
  }
}

function assertMesh(mesh: THREE.Mesh, spec: MeshSpec): void {
  assert.equal(mesh.geometry.type, spec.geometry);
  assert.ok('parameters' in mesh.geometry);
  const parameters: Record<string, unknown> = Object.fromEntries(Object.entries(mesh.geometry.parameters ?? {}));
  for (const [key, value] of Object.entries(spec.parameters)) {
    assert.equal(parameters[key], value, `${spec.geometry}.${key}`);
  }
  assert.ok(!Array.isArray(mesh.material));
  assertMaterial(mesh.material, spec.material);
  const [px, py, pz] = spec.position ?? [0, 0, 0];
  assert.deepEqual([mesh.position.x, mesh.position.y, mesh.position.z], [px, py, pz]);
  const [rx, ry, rz] = spec.rotation ?? [0, 0, 0];
  assert.deepEqual([mesh.rotation.x, mesh.rotation.y, mesh.rotation.z], [rx, ry, rz]);
}

function assertTree(group: THREE.Group, specs: MeshSpec[]): void {
  const meshes = meshesOf(group);
  assert.equal(meshes.length, specs.length);
  specs.forEach((spec, index) => assertMesh(meshes[index], spec));
}

const box = (width: number, height: number, depth: number): Record<string, number> => ({ width, height, depth });
const cylinder = (
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments?: number
): Record<string, number> => ({ radiusTop, radiusBottom, height, ...(radialSegments === undefined ? {} : { radialSegments }) });

test('createSoldierMesh keeps its five parts and exposes the muzzle', () => {
  const group = createSoldierMesh(0x00f0ff);
  assert.equal(group.children.length, 5);
  assertTree(group, [
    { geometry: 'CylinderGeometry', parameters: cylinder(0.3, 0.2, 1.2, 8),
      material: { type: 'MeshStandardMaterial', color: 0x00f0ff, metalness: 0.5, roughness: 0.3 }, position: [0, 0.6, 0] },
    { geometry: 'SphereGeometry', parameters: { radius: 0.25, widthSegments: 8, heightSegments: 8 },
      material: { type: 'MeshStandardMaterial', color: 0x111111, roughness: 0.2 }, position: [0, 1.35, 0] },
    { geometry: 'BoxGeometry', parameters: box(0.2, 0.08, 0.15),
      material: { type: 'MeshBasicMaterial', color: 0x00f0ff }, position: [0, 1.35, 0.18] },
    { geometry: 'BoxGeometry', parameters: box(0.12, 0.12, 0.8),
      material: { type: 'MeshStandardMaterial', color: 0x222222, metalness: 0.8 }, position: [0.25, 0.8, 0.3] },
    { geometry: 'SphereGeometry', parameters: { radius: 0.15, widthSegments: 6, heightSegments: 6 },
      material: { type: 'MeshBasicMaterial', color: 0xffaa00, transparent: true, opacity: 0 }, position: [0.25, 0.8, 0.75] }
  ]);
  assert.equal(group.userData.muzzleMesh, group.children[4]);
  assert.equal(meshesOf(group)[0].castShadow, true);
});

test('createTankMesh keeps its three parts', () => {
  const group = createTankMesh(0xff3344);
  assert.equal(group.children.length, 3);
  assertTree(group, [
    { geometry: 'BoxGeometry', parameters: box(2.2, 0.7, 3.2),
      material: { type: 'MeshStandardMaterial', color: 0x1e293b, metalness: 0.8 }, position: [0, 0.35, 0] },
    { geometry: 'CylinderGeometry', parameters: cylinder(0.85, 0.95, 0.65, 8),
      material: { type: 'MeshStandardMaterial', color: 0xff3344, metalness: 0.6 }, position: [0, 0.9, 0] },
    { geometry: 'CylinderGeometry', parameters: cylinder(0.14, 0.14, 1.8, 8),
      material: { type: 'MeshStandardMaterial', color: 0x111111, metalness: 0.9 }, position: [0, 0.9, 1.0], rotation: [Math.PI / 2, 0, 0] }
  ]);
  assert.equal(meshesOf(group)[0].castShadow, true);
});

test('createHQMesh keeps its base, dome and antenna', () => {
  const group = createHQMesh(0x00f0ff);
  assert.equal(group.children.length, 3);
  assertTree(group, [
    { geometry: 'CylinderGeometry', parameters: cylinder(3.8, 4.4, 2.8, 8),
      material: { type: 'MeshStandardMaterial', color: 0x1f2937, metalness: 0.7, roughness: 0.3 }, position: [0, 1.4, 0] },
    { geometry: 'SphereGeometry',
      parameters: { radius: 2.2, widthSegments: 16, heightSegments: 12, phiStart: 0, phiLength: Math.PI * 2, thetaStart: 0, thetaLength: Math.PI / 2 },
      material: { type: 'MeshStandardMaterial', color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.6 }, position: [0, 2.6, 0] },
    { geometry: 'CylinderGeometry', parameters: cylinder(0.08, 0.12, 3.5),
      material: { type: 'MeshBasicMaterial', color: 0x00f0ff }, position: [0, 4.5, 0] }
  ]);
  const [base] = meshesOf(group);
  assert.equal(base.castShadow, true);
  assert.equal(base.receiveShadow, true);
});

test('createNexusShieldVisual builds a hidden translucent wireframe sphere', () => {
  const shield = createNexusShieldVisual(0x22d3ee);
  assert.equal(shield.name, 'nexus-defensive-shield');
  assert.equal(shield.visible, false);
  assertMesh(shield, {
    geometry: 'SphereGeometry',
    parameters: { radius: 9, widthSegments: 18, heightSegments: 12 },
    material: { type: 'MeshBasicMaterial', color: 0x22d3ee, transparent: true, opacity: 0.24, wireframe: true, depthWrite: false }
  });
});

test('createGeneratorMesh keeps its base and ring and exposes the ring', () => {
  const group = createGeneratorMesh();
  assert.equal(group.children.length, 2);
  assertTree(group, [
    { geometry: 'BoxGeometry', parameters: box(2.6, 1.3, 2.6),
      material: { type: 'MeshStandardMaterial', color: 0x334155, metalness: 0.5 }, position: [0, 0.65, 0] },
    { geometry: 'TorusGeometry', parameters: { radius: 1.0, tube: 0.16, radialSegments: 8, tubularSegments: 20 },
      material: { type: 'MeshBasicMaterial', color: 0xeab308 }, position: [0, 1.6, 0], rotation: [Math.PI / 2, 0, 0] }
  ]);
  assert.equal(group.userData.ring, group.children[1]);
});

test('createBarracksMesh keeps its body and door', () => {
  const group = createBarracksMesh();
  assert.equal(group.children.length, 2);
  assertTree(group, [
    { geometry: 'BoxGeometry', parameters: box(3.5, 2.2, 3.5),
      material: { type: 'MeshStandardMaterial', color: 0x0f172a, metalness: 0.6 }, position: [0, 1.1, 0] },
    { geometry: 'BoxGeometry', parameters: box(1.8, 1.4, 0.2),
      material: { type: 'MeshBasicMaterial', color: 0x00f0ff }, position: [0, 0.7, 1.77] }
  ]);
});

test('createTurretMesh keeps its base, head and the barrel attached to the head', () => {
  const group = createTurretMesh();
  assert.equal(group.children.length, 2);
  const head = group.children[1];
  assert.equal(group.userData.head, head);
  assert.equal(head.children.length, 1);
  assertTree(group, [
    { geometry: 'CylinderGeometry', parameters: cylinder(1.3, 1.6, 1.2, 8),
      material: { type: 'MeshStandardMaterial', color: 0x1e293b, metalness: 0.8 }, position: [0, 0.6, 0] },
    { geometry: 'SphereGeometry', parameters: { radius: 0.9, widthSegments: 12, heightSegments: 12 },
      material: { type: 'MeshStandardMaterial', color: 0x111111, metalness: 0.9, roughness: 0.2 }, position: [0, 1.4, 0] },
    { geometry: 'CylinderGeometry', parameters: cylinder(0.12, 0.12, 1.4),
      material: { type: 'MeshStandardMaterial', color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 0.4 },
      position: [0, 0, 0.7], rotation: [Math.PI / 2, 0, 0] }
  ]);
});

test('instantiateBuildingMesh uses the player and enemy colors of today', () => {
  const colorsOf = (group: THREE.Group): number[] =>
    meshesOf(group).map((mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHex());

  assert.equal(colorsOf(instantiateBuildingMesh('generator', true))[1], 0xeab308);
  assert.equal(colorsOf(instantiateBuildingMesh('generator', false))[1], 0xff2244);
  assert.equal(colorsOf(instantiateBuildingMesh('barracks', true))[1], 0x00f0ff);
  assert.equal(colorsOf(instantiateBuildingMesh('barracks', false))[1], 0xff3344);
  assert.equal(colorsOf(instantiateBuildingMesh('turret', true))[2], 0x00f0ff);
  assert.equal(colorsOf(instantiateBuildingMesh('turret', false))[2], 0xff3344);
  assert.equal(colorsOf(instantiateBuildingMesh('turret'))[2], 0x00f0ff);
});

test('two calls never share a geometry or a material', () => {
  const factories: Array<() => THREE.Object3D> = [
    () => createSoldierMesh(0x00f0ff),
    () => createTankMesh(0x00f0ff),
    () => createHQMesh(0x00f0ff),
    () => createNexusShieldVisual(0x22d3ee),
    () => createGeneratorMesh(),
    () => createBarracksMesh(),
    () => createTurretMesh()
  ];
  for (const make of factories) {
    const first = meshesOf(make());
    const second = meshesOf(make());
    assert.equal(first.length, second.length);
    const resources = new Set<unknown>();
    for (const mesh of [...first, ...second]) {
      assert.ok(!resources.has(mesh.geometry));
      assert.ok(!resources.has(mesh.material));
      resources.add(mesh.geometry);
      resources.add(mesh.material);
    }
    assert.equal(resources.size, (first.length + second.length) * 2);
  }
});

test('disposeObjectResources disposes every geometry and material of the tree once', () => {
  const tree = createTurretMesh();
  const disposed = new Map<unknown, number>();
  const watch = (resource: THREE.BufferGeometry | THREE.Material): void => {
    resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  };
  const meshes = meshesOf(tree);
  for (const mesh of meshes) {
    watch(mesh.geometry);
    assert.ok(!Array.isArray(mesh.material));
    watch(mesh.material);
  }

  disposeObjectResources(tree);

  assert.equal(disposed.size, meshes.length * 2);
  for (const count of disposed.values()) assert.equal(count, 1);
});
