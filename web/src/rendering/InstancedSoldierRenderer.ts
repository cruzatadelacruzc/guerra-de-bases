import * as THREE from 'three';
import type { Entity, Faction, Position } from '../game/ecs/components.ts';

export interface SoldierVisualHandle {
  readonly position: THREE.Vector3;
  lookAt(x: number, y: number, z: number): void;
}

interface SoldierState {
  entity: Entity;
  faction: Faction;
  position: THREE.Vector3;
  yaw: number;
  healthRatio: number;
  muzzleFlashUntil: number;
}

interface Batch {
  mesh: THREE.InstancedMesh;
}

interface FactionBatches {
  entities: Entity[];
  slots: Map<Entity, number>;
  body: Batch;
  visor: Batch;
}

const INITIAL_CAPACITY = 128;
const HEALTH_BAR_WIDTH = 1.4;

function removeSlot(entity: Entity, entities: Entity[], slots: Map<Entity, number>): void {
  const index = slots.get(entity);
  if (index === undefined) return;
  const lastIndex = entities.length - 1;
  const lastEntity = entities[lastIndex];
  entities.pop();
  slots.delete(entity);
  if (index !== lastIndex && lastEntity !== undefined) {
    entities[index] = lastEntity;
    slots.set(lastEntity, index);
  }
}

export class InstancedSoldierRenderer {
  #capacity = INITIAL_CAPACITY;
  #scene: THREE.Scene;
  #states = new Map<Entity, SoldierState>();
  #allEntities: Entity[] = [];
  #allSlots = new Map<Entity, number>();
  #factions: Record<Faction, FactionBatches>;
  #batches: Batch[] = [];
  #ownedGeometries = new Set<THREE.BufferGeometry>();
  #ownedMaterials = new Set<THREE.Material>();
  #head: Batch;
  #rifle: Batch;
  #muzzle: Batch;
  #healthBackground: Batch;
  #healthFill: Batch;
  #bodyLocal: THREE.Matrix4;
  #headLocal: THREE.Matrix4;
  #visorLocal: THREE.Matrix4;
  #rifleLocal: THREE.Matrix4;
  #muzzleLocal: THREE.Matrix4;
  #unitMatrix = new THREE.Matrix4();
  #partMatrix = new THREE.Matrix4();
  #position = new THREE.Vector3();
  #scale = new THREE.Vector3(1, 1, 1);
  #yaw = new THREE.Quaternion();
  #offset = new THREE.Vector3();
  #fillScale = new THREE.Vector3(1, 1, 1);
  #playerColor = new THREE.Color(0x00f0ff);
  #enemyColor = new THREE.Color(0xff3344);

  constructor(scene: THREE.Scene) {
    this.#scene = scene;

    const bodyGeometry = this.#ownGeometry(new THREE.CylinderGeometry(0.3, 0.2, 1.2, 8));
    const headGeometry = this.#ownGeometry(new THREE.SphereGeometry(0.25, 8, 8));
    const visorGeometry = this.#ownGeometry(new THREE.BoxGeometry(0.2, 0.08, 0.15));
    const rifleGeometry = this.#ownGeometry(new THREE.BoxGeometry(0.12, 0.12, 0.8));
    const muzzleGeometry = this.#ownGeometry(new THREE.SphereGeometry(0.15, 6, 6));
    const healthGeometry = this.#ownGeometry(new THREE.PlaneGeometry(HEALTH_BAR_WIDTH, 0.18));

    const bodyMaterials: Record<Faction, THREE.Material> = {
      player: this.#ownMaterial(new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        metalness: 0.5,
        roughness: 0.3
      })),
      enemy: this.#ownMaterial(new THREE.MeshStandardMaterial({
        color: 0xff3344,
        metalness: 0.5,
        roughness: 0.3
      }))
    };
    const visorMaterials: Record<Faction, THREE.Material> = {
      player: this.#ownMaterial(new THREE.MeshBasicMaterial({ color: 0x00f0ff })),
      enemy: this.#ownMaterial(new THREE.MeshBasicMaterial({ color: 0xff3344 }))
    };
    const headMaterial = this.#ownMaterial(new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.2
    }));
    const rifleMaterial = this.#ownMaterial(new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.8
    }));
    const muzzleMaterial = this.#ownMaterial(new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    }));
    const healthBackgroundMaterial = this.#ownMaterial(new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      side: THREE.DoubleSide
    }));
    const healthFillMaterial = this.#ownMaterial(new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    }));

    this.#factions = {
      player: {
        entities: [],
        slots: new Map(),
        body: this.#createBatch(bodyGeometry, bodyMaterials.player, true),
        visor: this.#createBatch(visorGeometry, visorMaterials.player, false)
      },
      enemy: {
        entities: [],
        slots: new Map(),
        body: this.#createBatch(bodyGeometry, bodyMaterials.enemy, true),
        visor: this.#createBatch(visorGeometry, visorMaterials.enemy, false)
      }
    };
    this.#head = this.#createBatch(headGeometry, headMaterial, false);
    this.#rifle = this.#createBatch(rifleGeometry, rifleMaterial, false);
    this.#muzzle = this.#createBatch(muzzleGeometry, muzzleMaterial, false);
    this.#healthBackground = this.#createBatch(healthGeometry, healthBackgroundMaterial, false);
    this.#healthFill = this.#createBatch(healthGeometry, healthFillMaterial, false);

    this.#bodyLocal = this.#createLocalMatrix(0, 0.6, 0);
    this.#headLocal = this.#createLocalMatrix(0, 1.35, 0);
    this.#visorLocal = this.#createLocalMatrix(0, 1.35, 0.18);
    this.#rifleLocal = this.#createLocalMatrix(0.25, 0.8, 0.3);
    this.#muzzleLocal = this.#createLocalMatrix(0.25, 0.8, 0.75);
  }

  add(entity: Entity, faction: Faction, position: Position): SoldierVisualHandle {
    if (this.#states.has(entity)) throw new Error(`Soldier ${entity} is already rendered`);
    this.#ensureCapacity(this.#states.size + 1);

    const state: SoldierState = {
      entity,
      faction,
      position: new THREE.Vector3(position.x, position.y, position.z),
      yaw: 0,
      healthRatio: 1,
      muzzleFlashUntil: 0
    };
    this.#states.set(entity, state);
    this.#allSlots.set(entity, this.#allEntities.length);
    this.#allEntities.push(entity);

    const factionBatch = this.#factions[faction];
    factionBatch.slots.set(entity, factionBatch.entities.length);
    factionBatch.entities.push(entity);

    return {
      position: state.position,
      lookAt: (x, _y, z) => {
        state.yaw = Math.atan2(x - state.position.x, z - state.position.z);
      }
    };
  }

  remove(entity: Entity): void {
    const state = this.#states.get(entity);
    if (!state) return;
    removeSlot(entity, this.#factions[state.faction].entities, this.#factions[state.faction].slots);
    removeSlot(entity, this.#allEntities, this.#allSlots);
    this.#states.delete(entity);
  }

  setHealth(entity: Entity, current: number, max: number): void {
    const state = this.#states.get(entity);
    if (state) state.healthRatio = max > 0 ? THREE.MathUtils.clamp(current / max, 0, 1) : 0;
  }

  showMuzzleFlash(entity: Entity, visibleUntil: number): void {
    const state = this.#states.get(entity);
    if (state) state.muzzleFlashUntil = visibleUntil;
  }

  sync(cameraQuaternion: THREE.Quaternion, elapsedSeconds: number): void {
    const count = this.#allEntities.length;
    for (const faction of ['player', 'enemy'] as const) {
      const batches = this.#factions[faction];
      batches.body.mesh.count = batches.entities.length;
      batches.visor.mesh.count = batches.entities.length;
      for (let index = 0; index < batches.entities.length; index++) {
        const state = this.#stateFor(batches.entities[index]);
        if (!state) continue;
        this.#composeUnit(state);
        this.#writePart(batches.body.mesh, index, this.#bodyLocal);
        this.#writePart(batches.visor.mesh, index, this.#visorLocal);
      }
      batches.body.mesh.instanceMatrix.needsUpdate = true;
      batches.visor.mesh.instanceMatrix.needsUpdate = true;
    }

    this.#head.mesh.count = count;
    this.#rifle.mesh.count = count;
    this.#muzzle.mesh.count = count;
    this.#healthBackground.mesh.count = count;
    this.#healthFill.mesh.count = count;

    for (let index = 0; index < count; index++) {
      const state = this.#stateFor(this.#allEntities[index]);
      if (!state) continue;
      this.#composeUnit(state);
      this.#writePart(this.#head.mesh, index, this.#headLocal);
      this.#writePart(this.#rifle.mesh, index, this.#rifleLocal);
      this.#writePart(
        this.#muzzle.mesh,
        index,
        this.#muzzleLocal,
        state.muzzleFlashUntil > elapsedSeconds ? this.#scale : ZERO_SCALE
      );
      this.#syncHealthBar(this.#healthBackground.mesh, index, state, cameraQuaternion, 1, 0);
      this.#syncHealthBar(this.#healthFill.mesh, index, state, cameraQuaternion, state.healthRatio, state.healthRatio);
      this.#healthFill.mesh.setColorAt(index, state.faction === 'player' ? this.#playerColor : this.#enemyColor);
    }

    this.#head.mesh.instanceMatrix.needsUpdate = true;
    this.#rifle.mesh.instanceMatrix.needsUpdate = true;
    this.#muzzle.mesh.instanceMatrix.needsUpdate = true;
    this.#healthBackground.mesh.instanceMatrix.needsUpdate = true;
    this.#healthFill.mesh.instanceMatrix.needsUpdate = true;
    if (this.#healthFill.mesh.instanceColor) this.#healthFill.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.#states.clear();
    this.#allEntities.length = 0;
    this.#allSlots.clear();
    for (const faction of ['player', 'enemy'] as const) {
      this.#factions[faction].entities.length = 0;
      this.#factions[faction].slots.clear();
    }
    this.sync(IDENTITY_QUATERNION, 0);
  }

  dispose(): void {
    for (const batch of this.#batches) {
      this.#scene.remove(batch.mesh);
      batch.mesh.dispose();
    }
    for (const geometry of this.#ownedGeometries) geometry.dispose();
    for (const material of this.#ownedMaterials) material.dispose();
    this.#batches.length = 0;
    this.#states.clear();
    this.#allEntities.length = 0;
  }

  #createLocalMatrix(x: number, y: number, z: number): THREE.Matrix4 {
    const position = new THREE.Vector3(x, y, z);
    return new THREE.Matrix4().compose(position, IDENTITY_QUATERNION, UNIT_SCALE);
  }

  #createBatch(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    castShadow: boolean
  ): Batch {
    const batch = { mesh: new THREE.InstancedMesh(geometry, material, this.#capacity) };
    batch.mesh.castShadow = castShadow;
    batch.mesh.receiveShadow = false;
    batch.mesh.frustumCulled = false;
    batch.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#batches.push(batch);
    this.#scene.add(batch.mesh);
    return batch;
  }

  #ensureCapacity(required: number): void {
    if (required <= this.#capacity) return;
    this.#capacity = Math.max(required, this.#capacity * 2);

    for (const batch of this.#batches) {
      const previous = batch.mesh;
      const replacement = new THREE.InstancedMesh(previous.geometry, previous.material, this.#capacity);
      replacement.castShadow = previous.castShadow;
      replacement.receiveShadow = previous.receiveShadow;
      replacement.frustumCulled = false;
      replacement.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.#scene.remove(previous);
      previous.dispose();
      batch.mesh = replacement;
      this.#scene.add(replacement);
    }
  }

  #composeUnit(state: SoldierState): void {
    this.#yaw.setFromAxisAngle(Y_AXIS, state.yaw);
    this.#unitMatrix.compose(state.position, this.#yaw, this.#scale);
  }

  #writePart(
    mesh: THREE.InstancedMesh,
    index: number,
    localMatrix: THREE.Matrix4,
    scale: THREE.Vector3 = this.#scale
  ): void {
    if (scale === this.#scale) {
      this.#partMatrix.multiplyMatrices(this.#unitMatrix, localMatrix);
    } else {
      this.#partMatrix.compose(this.#position.setFromMatrixPosition(this.#unitMatrix), this.#yaw, scale)
        .multiply(localMatrix);
    }
    mesh.setMatrixAt(index, this.#partMatrix);
  }

  #syncHealthBar(
    mesh: THREE.InstancedMesh,
    index: number,
    state: SoldierState,
    cameraQuaternion: THREE.Quaternion,
    widthRatio: number,
    horizontalOffsetRatio: number
  ): void {
    this.#position.copy(state.position);
    this.#position.y += 1.8;
    if (horizontalOffsetRatio < 1) {
      this.#offset.set(((horizontalOffsetRatio - 1) * HEALTH_BAR_WIDTH) / 2, 0, 0)
        .applyQuaternion(cameraQuaternion);
      this.#position.add(this.#offset);
    }
    this.#fillScale.set(widthRatio, 1, 1);
    this.#partMatrix.compose(this.#position, cameraQuaternion, this.#fillScale);
    mesh.setMatrixAt(index, this.#partMatrix);
  }

  #stateFor(entity: Entity | undefined): SoldierState | undefined {
    return entity === undefined ? undefined : this.#states.get(entity);
  }

  #ownGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.#ownedGeometries.add(geometry);
    return geometry;
  }

  #ownMaterial<T extends THREE.Material>(material: T): T {
    this.#ownedMaterials.add(material);
    return material;
  }
}

const IDENTITY_QUATERNION = new THREE.Quaternion();
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const ZERO_SCALE = new THREE.Vector3(0, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
