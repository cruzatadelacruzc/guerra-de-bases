import * as THREE from 'three';

type ParticleVisual =
  | 'core-gold'
  | 'core-red'
  | 'debris'
  | 'smoke'
  | 'stem-fire'
  | 'stem-smoke'
  | 'cap-fire'
  | 'cap-smoke';

type ParticleKind = 'core' | 'debris' | 'smoke' | 'stem' | 'cap';

interface ParticleState {
  visual: ParticleVisual;
  kind: ParticleKind;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
  growth: number;
  rotationSpeed: number;
  rotationX: number;
  rotationZ: number;
}

interface ParticleBatch {
  mesh: THREE.InstancedMesh;
  active: ParticleState[];
  available: ParticleState[];
}

interface BurningEmitter {
  position: THREE.Vector3;
  scale: number;
  life: number;
  timer: number;
  nextSmoke: number;
  fireLight: THREE.PointLight | undefined;
}

interface ShockwaveState {
  position: THREE.Vector3;
  life: number;
  speed: number;
  scale: number;
}

interface ShockwaveBatch {
  mesh: THREE.InstancedMesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  active: ShockwaveState[];
  available: ShockwaveState[];
}

interface FadingLight {
  light: THREE.PointLight;
  life: number;
  duration: number;
  intensity: number;
}

export interface CombatEffectStats {
  activeParticles: number;
  particleSlots: number;
  activeEmitters: number;
  emitterSlots: number;
  activeShockwaves: number;
  shockwaveSlots: number;
  activeLights: number;
  lightSlots: number;
  geometries: number;
  materials: number;
}

const MAX_PARTICLE_SLOTS = 512;
const MAX_BURNING_EMITTERS = 12;
const MAX_SHOCKWAVE_MESHES = 32;
const MAX_LIGHTS = 8;
const EMITTER_LIFETIME = 8;
const SMOKE_INTERVAL = 0.12;

export class CombatEffects {
  #scene: THREE.Scene;
  #geometries: {
    particle: THREE.SphereGeometry;
    debris: THREE.BoxGeometry;
    smoke: THREE.SphereGeometry;
    flame: THREE.ConeGeometry;
    ring: THREE.RingGeometry;
  };
  #materials: Record<ParticleVisual, THREE.Material>;
  #ownedMaterials = new Set<THREE.Material>();
  #particleBatches = new Map<ParticleVisual, ParticleBatch>();
  #particleSlots = 0;
  #emitters: BurningEmitter[] = [];
  #freeEmitters: BurningEmitter[] = [];
  #emitterSlots = 0;
  #shockwaveBatch: ShockwaveBatch;
  #shockwaveSlots = 0;
  #flameMeshes: readonly THREE.InstancedMesh[];
  #lights = new Set<THREE.PointLight>();
  #freeLights: THREE.PointLight[] = [];
  #lightSlots = 0;
  #fadingLights: FadingLight[] = [];
  #scratchPosition = new THREE.Vector3();
  #scratchVelocity = new THREE.Vector3();
  #disposed = false;
  #matrix = new THREE.Matrix4();
  #position = new THREE.Vector3();
  #scale = new THREE.Vector3(1, 1, 1);
  #rotation = new THREE.Quaternion();
  #euler = new THREE.Euler();

  constructor(scene: THREE.Scene) {
    this.#scene = scene;
    this.#geometries = {
      particle: new THREE.SphereGeometry(1, 8, 8),
      debris: new THREE.BoxGeometry(1, 1, 1),
      smoke: new THREE.SphereGeometry(1, 6, 6),
      flame: new THREE.ConeGeometry(0.35, 1.1, 6),
      ring: new THREE.RingGeometry(0.2, 1, 32)
    };
    this.#materials = {
      'core-gold': this.#ownMaterial(new THREE.MeshBasicMaterial({ color: 0xffaa00 })),
      'core-red': this.#ownMaterial(new THREE.MeshBasicMaterial({ color: 0xff3300 })),
      debris: this.#ownMaterial(new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 })),
      smoke: this.#ownMaterial(new THREE.MeshBasicMaterial({
        color: 0x18181c,
        transparent: true,
        opacity: 0.6
      })),
      'stem-fire': this.#ownMaterial(new THREE.MeshStandardMaterial({
        color: 0xff4500,
        emissive: 0xff2200,
        emissiveIntensity: 0.85,
        roughness: 0.9,
        transparent: true,
        opacity: 0.95
      })),
      'stem-smoke': this.#ownMaterial(new THREE.MeshStandardMaterial({
        color: 0x202025,
        emissive: 0xff2200,
        emissiveIntensity: 0.85,
        roughness: 0.9,
        transparent: true,
        opacity: 0.95
      })),
      'cap-fire': this.#ownMaterial(new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff3300,
        emissiveIntensity: 0.9,
        roughness: 0.8,
        transparent: true,
        opacity: 0.9
      })),
      'cap-smoke': this.#ownMaterial(new THREE.MeshStandardMaterial({
        color: 0x151518,
        emissive: 0xff3300,
        emissiveIntensity: 0.9,
        roughness: 0.8,
        transparent: true,
        opacity: 0.9
      }))
    };
    const flameMaterials = [
      this.#ownMaterial(new THREE.MeshBasicMaterial({
        color: 0xff4500,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })),
      this.#ownMaterial(new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      }))
    ];
    for (const visual of Object.keys(this.#materials) as ParticleVisual[]) {
      const geometry = this.#geometryFor(visual);
      const mesh = new THREE.InstancedMesh(geometry, this.#materials[visual], MAX_PARTICLE_SLOTS);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.#scene.add(mesh);
      this.#particleBatches.set(visual, { mesh, active: [], available: [] });
    }
    this.#flameMeshes = flameMaterials.map((material) => {
      const mesh = new THREE.InstancedMesh(this.#geometries.flame, material, MAX_BURNING_EMITTERS * 2);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.#scene.add(mesh);
      return mesh;
    });
    const shockwaveMaterial = this.#ownMaterial(new THREE.MeshBasicMaterial({
      color: 0xffbb00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    }));
    const shockwaveMesh = new THREE.InstancedMesh(
      this.#geometries.ring,
      shockwaveMaterial,
      MAX_SHOCKWAVE_MESHES
    );
    shockwaveMesh.count = 0;
    shockwaveMesh.frustumCulled = false;
    shockwaveMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#scene.add(shockwaveMesh);
    this.#shockwaveBatch = { mesh: shockwaveMesh, active: [], available: [] };
  }

  createExplosion(position: THREE.Vector3, scale = 1): void {
    this.#assertUsable();
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new RangeError('Explosion scale must be positive and finite');
    }

    this.addBurningEmitter(position, Math.max(0.5, scale * 0.8));
    this.#addFadingLight(position, 8 * scale, 30 * scale, 0.85, 2);

    const coreCount = Math.floor(18 * scale);
    for (let index = 0; index < coreCount; index++) {
      this.#addParticle(
        Math.random() > 0.3 ? 'core-gold' : 'core-red',
        'core',
        position,
        new THREE.Vector3(
          (Math.random() - 0.5) * 14 * scale,
          Math.random() * 12 * scale + 4,
          (Math.random() - 0.5) * 14 * scale
        ),
        0.35 * scale,
        1,
        0
      );
    }

    const debrisCount = Math.floor(12 * scale);
    for (let index = 0; index < debrisCount; index++) {
      this.#addParticle(
        'debris',
        'debris',
        position,
        new THREE.Vector3(
          (Math.random() - 0.5) * 18 * scale,
          Math.random() * 16 * scale + 6,
          (Math.random() - 0.5) * 18 * scale
        ),
        0.25 * scale,
        1.2,
        0,
        (Math.random() - 0.5) * 15
      );
    }
    this.#addShockwave(position, 20 * scale, 0.9);
  }

  createNuclearExplosion(position: THREE.Vector3): void {
    this.#assertUsable();
    this.#addFadingLight(position, 35, 200, 3.8, 10);
    for (let index = 0; index < 110; index++) {
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 3.8,
        Math.random() * 2,
        (Math.random() - 0.5) * 3.8
      );
      const origin = position.clone().add(offset);
      this.#addParticle(
        Math.random() > 0.4 ? 'stem-fire' : 'stem-smoke',
        'stem',
        origin,
        new THREE.Vector3((Math.random() - 0.5) * 1, 9.5 + Math.random() * 7, (Math.random() - 0.5) * 1),
        0.9 + Math.random() * 1.3,
        3.8 + Math.random() * 1.2,
        1.5
      );
    }

    for (let index = 0; index < 160; index++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1 + Math.random() * 5.5;
      const origin = position.clone().add(new THREE.Vector3(
        Math.cos(angle) * radius,
        14.5 + Math.random() * 3.5,
        Math.sin(angle) * radius
      ));
      this.#addParticle(
        Math.random() > 0.3 ? 'cap-fire' : 'cap-smoke',
        'cap',
        origin,
        new THREE.Vector3(
          Math.cos(angle) * (7.5 + Math.random() * 9.5),
          2.8 + Math.random() * 3,
          Math.sin(angle) * (7.5 + Math.random() * 9.5)
        ),
        1.4 + Math.random() * 1.6,
        4.2 + Math.random() * 1.8,
        2.2
      );
    }

    for (let index = 0; index < 3; index++) {
      this.#addShockwave(position, 32 + index * 10, 0.95);
    }
  }

  addBurningEmitter(position: THREE.Vector3, scale = 1): void {
    this.#assertUsable();
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new RangeError('Emitter scale must be positive and finite');
    }

    if (this.#freeEmitters.length === 0 && this.#emitterSlots >= MAX_BURNING_EMITTERS) {
      this.#releaseEmitter(0);
    }

    const emitter = this.#freeEmitters.pop() ?? this.#createEmitter();
    emitter.position.copy(position);
    emitter.scale = scale;
    emitter.life = EMITTER_LIFETIME;
    emitter.timer = 0;
    emitter.nextSmoke = 0;
    if (emitter.fireLight) {
      emitter.fireLight.position.copy(position);
      emitter.fireLight.position.y += 1.2 * scale;
      emitter.fireLight.intensity = 4.5 * scale;
      emitter.fireLight.distance = 18 * scale;
      this.#scene.add(emitter.fireLight);
    }

    this.#emitters.push(emitter);
  }

  update(deltaSeconds: number): void {
    this.#assertUsable();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError('Effect delta must be finite and non-negative');
    }

    for (const [visual, batch] of this.#particleBatches) {
      for (let index = batch.active.length - 1; index >= 0; index--) {
        const particle = batch.active[index];
        particle.position.addScaledVector(particle.velocity, deltaSeconds);
        particle.life -= deltaSeconds;
        particle.scale += particle.growth * deltaSeconds;

        if (particle.kind === 'core' || particle.kind === 'debris') {
          particle.velocity.y -= 22 * deltaSeconds;
        } else if (particle.kind === 'cap') {
          particle.velocity.y += 0.5 * deltaSeconds;
        }

        if (particle.rotationSpeed !== 0) {
          particle.rotationX += particle.rotationSpeed * deltaSeconds;
          particle.rotationZ += particle.rotationSpeed * deltaSeconds;
        }

        const belowGround = (particle.kind === 'core' || particle.kind === 'debris')
          && particle.position.y < 0;
        if (particle.life <= 0 || belowGround) this.#releaseParticle(visual, index);
      }
      batch.mesh.count = batch.active.length;
      for (let index = 0; index < batch.active.length; index++) {
        const particle = batch.active[index];
        const fadeStart = particle.maxLife * 0.2;
        const fade = particle.life < fadeStart ? Math.max(0, particle.life / fadeStart) : 1;
        this.#writeTransform(
          batch.mesh,
          index,
          particle.position,
          particle.scale * fade,
          particle.rotationX,
          particle.rotationZ
        );
      }
      batch.mesh.instanceMatrix.needsUpdate = true;
    }

    for (let index = this.#shockwaveBatch.active.length - 1; index >= 0; index--) {
      const shockwave = this.#shockwaveBatch.active[index];
      shockwave.scale += deltaSeconds * shockwave.speed;
      shockwave.life -= deltaSeconds;
      if (shockwave.life <= 0) this.#releaseShockwave(index);
    }
    this.#shockwaveBatch.mesh.count = this.#shockwaveBatch.active.length;
    for (let index = 0; index < this.#shockwaveBatch.active.length; index++) {
      const shockwave = this.#shockwaveBatch.active[index];
      this.#writeTransform(
        this.#shockwaveBatch.mesh,
        index,
        shockwave.position,
        shockwave.scale,
        -Math.PI / 2
      );
    }
    this.#shockwaveBatch.mesh.instanceMatrix.needsUpdate = true;

    for (let index = this.#fadingLights.length - 1; index >= 0; index--) {
      const effect = this.#fadingLights[index];
      effect.life -= deltaSeconds;
      effect.light.intensity = effect.intensity * Math.max(0, effect.life / effect.duration);
      if (effect.life <= 0) {
        this.#releaseLight(effect.light);
        this.#fadingLights.splice(index, 1);
      }
    }

    for (let index = this.#emitters.length - 1; index >= 0; index--) {
      const emitter = this.#emitters[index];
      emitter.life -= deltaSeconds;
      emitter.timer += deltaSeconds;
      emitter.nextSmoke += deltaSeconds;
      if (emitter.fireLight) {
        emitter.fireLight.intensity = (3.5 + Math.sin(emitter.timer * 12) * 1.5) * emitter.scale;
      }
      if (emitter.life <= 0) {
        this.#releaseEmitter(index);
        continue;
      }
      if (emitter.nextSmoke >= SMOKE_INTERVAL) {
        emitter.nextSmoke %= SMOKE_INTERVAL;
        this.#emitSmoke(emitter);
      }
    }
    this.#syncFlames();
  }

  stats(): CombatEffectStats {
    let activeParticles = 0;
    for (const batch of this.#particleBatches.values()) activeParticles += batch.active.length;
    return {
      activeParticles,
      particleSlots: this.#particleSlots,
      activeEmitters: this.#emitters.length,
      emitterSlots: this.#emitterSlots,
      activeShockwaves: this.#shockwaveBatch.active.length,
      shockwaveSlots: this.#shockwaveSlots,
      activeLights: this.#lights.size,
      lightSlots: this.#lightSlots,
      geometries: Object.keys(this.#geometries).length,
      materials: this.#ownedMaterials.size
    };
  }

  clear(): void {
    for (const [visual, batch] of this.#particleBatches) {
      for (let index = batch.active.length - 1; index >= 0; index--) this.#releaseParticle(visual, index);
      batch.mesh.count = 0;
    }
    for (let index = this.#shockwaveBatch.active.length - 1; index >= 0; index--) {
      this.#releaseShockwave(index);
    }
    this.#shockwaveBatch.mesh.count = 0;
    for (let index = this.#fadingLights.length - 1; index >= 0; index--) {
      this.#releaseLight(this.#fadingLights[index].light);
    }
    this.#fadingLights.length = 0;
    for (let index = this.#emitters.length - 1; index >= 0; index--) this.#releaseEmitter(index);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.clear();

    for (const batch of this.#particleBatches.values()) {
      this.#scene.remove(batch.mesh);
      batch.active.length = 0;
      batch.available.length = 0;
    }
    this.#scene.remove(this.#shockwaveBatch.mesh);
    for (const flame of this.#flameMeshes) this.#scene.remove(flame);
    this.#freeEmitters.length = 0;
    for (const light of this.#freeLights) this.#scene.remove(light);
    this.#freeLights.length = 0;

    for (const geometry of Object.values(this.#geometries)) geometry.dispose();
    for (const material of this.#ownedMaterials) material.dispose();
    this.#ownedMaterials.clear();
    this.#particleBatches.clear();
    this.#particleSlots = 0;
    this.#emitterSlots = 0;
    this.#shockwaveSlots = 0;
    this.#lightSlots = 0;
    this.#disposed = true;
  }

  #addParticle(
    visual: ParticleVisual,
    kind: ParticleKind,
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    scale: number,
    life: number,
    growth: number,
    rotationSpeed = 0
  ): void {
    const batch = this.#particleBatches.get(visual);
    if (!batch) return;
    let particle = batch.available.pop();
    if (!particle) {
      if (this.#particleSlots >= MAX_PARTICLE_SLOTS) return;
      particle = {
        visual,
        kind,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life,
        maxLife: life,
        scale,
        growth,
        rotationSpeed,
        rotationX: 0,
        rotationZ: 0
      };
      this.#particleSlots++;
    }
    particle.kind = kind;
    particle.position.copy(position);
    particle.velocity.copy(velocity);
    particle.life = life;
    particle.maxLife = life;
    particle.scale = scale;
    particle.growth = growth;
    particle.rotationSpeed = rotationSpeed;
    particle.rotationX = 0;
    particle.rotationZ = 0;
    batch.active.push(particle);
  }

  #emitSmoke(emitter: BurningEmitter): void {
    this.#scratchPosition.copy(emitter.position);
    this.#scratchPosition.x += (Math.random() - 0.5) * 0.6 * emitter.scale;
    this.#scratchPosition.y += 0.8 * emitter.scale;
    this.#scratchPosition.z += (Math.random() - 0.5) * 0.6 * emitter.scale;
    this.#scratchVelocity.set(
      (Math.random() - 0.5) * 0.8,
      2.5 + Math.random() * 2,
      (Math.random() - 0.5) * 0.8
    );
    this.#addParticle(
      'smoke',
      'smoke',
      this.#scratchPosition,
      this.#scratchVelocity,
      0.35 * emitter.scale,
      1 / 0.6,
      1.2
    );
  }

  #addShockwave(position: THREE.Vector3, speed: number, opacity: number): void {
    let shockwave = this.#shockwaveBatch.available.pop();
    if (!shockwave) {
      if (this.#shockwaveSlots >= MAX_SHOCKWAVE_MESHES) return;
      shockwave = {
        position: new THREE.Vector3(),
        life: 0,
        speed: 0,
        scale: 1
      };
      this.#shockwaveSlots++;
    }
    shockwave.position.copy(position);
    shockwave.position.y = 0.2;
    shockwave.life = opacity / 1.2;
    shockwave.speed = speed;
    shockwave.scale = 1;
    this.#shockwaveBatch.active.push(shockwave);
  }

  #addFadingLight(
    position: THREE.Vector3,
    intensity: number,
    distance: number,
    duration: number,
    height: number
  ): void {
    const light = this.#acquireLight();
    if (!light) return;
    light.color.setHex(0xff6600);
    light.position.copy(position);
    light.position.y += height;
    light.intensity = intensity;
    light.distance = distance;
    this.#fadingLights.push({ light, life: duration, duration, intensity });
  }

  #acquireLight(): THREE.PointLight | undefined {
    let light = this.#freeLights.pop();
    if (!light) {
      if (this.#lightSlots >= MAX_LIGHTS) return undefined;
      light = new THREE.PointLight(0xff5500, 0, 18);
      this.#lightSlots++;
    }
    this.#lights.add(light);
    this.#scene.add(light);
    return light;
  }

  #releaseLight(light: THREE.PointLight): void {
    if (!this.#lights.delete(light)) return;
    light.intensity = 0;
    this.#scene.remove(light);
    this.#freeLights.push(light);
  }

  #createEmitter(): BurningEmitter {
    this.#emitterSlots++;
    return {
      position: new THREE.Vector3(),
      scale: 1,
      life: EMITTER_LIFETIME,
      timer: 0,
      nextSmoke: 0,
      fireLight: this.#acquireLight()
    };
  }

  #releaseEmitter(index: number): void {
    const emitter = this.#emitters[index];
    if (!emitter) return;
    this.#emitters[index] = this.#emitters[this.#emitters.length - 1];
    this.#emitters.pop();
    if (emitter.fireLight) this.#releaseLight(emitter.fireLight);
    this.#freeEmitters.push(emitter);
  }

  #releaseParticle(visual: ParticleVisual, index: number): void {
    const batch = this.#particleBatches.get(visual);
    const particle = batch?.active[index];
    if (!particle) return;
    batch.active[index] = batch.active[batch.active.length - 1];
    batch.active.pop();
    batch.available.push(particle);
  }

  #releaseShockwave(index: number): void {
    const shockwave = this.#shockwaveBatch.active[index];
    if (!shockwave) return;
    this.#shockwaveBatch.active[index] =
      this.#shockwaveBatch.active[this.#shockwaveBatch.active.length - 1];
    this.#shockwaveBatch.active.pop();
    this.#shockwaveBatch.available.push(shockwave);
  }

  #geometryFor(visual: ParticleVisual): THREE.BufferGeometry {
    if (visual === 'debris') return this.#geometries.debris;
    if (visual === 'smoke') return this.#geometries.smoke;
    return this.#geometries.particle;
  }

  #syncFlames(): void {
    const counts = [0, 0];
    for (const emitter of this.#emitters) {
      for (let flameIndex = 0; flameIndex < 4; flameIndex++) {
        const colorIndex = flameIndex % 2;
        const instanceIndex = counts[colorIndex]++;
        this.#position.copy(emitter.position);
        this.#position.x += ((flameIndex % 2) * 2 - 0.5) * 0.25 * emitter.scale;
        this.#position.y += emitter.scale * (
          0.5 + Math.sin(emitter.timer * 15 + flameIndex) * 0.1
        );
        this.#position.z += (Math.floor(flameIndex / 2) - 0.5) * 0.25 * emitter.scale;
        const flameScale = emitter.scale * (
          0.8 + Math.sin(emitter.timer * 15 + flameIndex) * 0.3
        );
        this.#writeTransform(this.#flameMeshes[colorIndex], instanceIndex, this.#position, flameScale);
      }
    }
    for (let index = 0; index < this.#flameMeshes.length; index++) {
      this.#flameMeshes[index].count = counts[index];
      this.#flameMeshes[index].instanceMatrix.needsUpdate = true;
    }
  }

  #writeTransform(
    mesh: THREE.InstancedMesh,
    index: number,
    position: THREE.Vector3,
    scale: number,
    rotationX = 0,
    rotationZ = 0
  ): void {
    this.#euler.set(rotationX, 0, rotationZ);
    this.#rotation.setFromEuler(this.#euler);
    this.#scale.set(scale, scale, scale);
    this.#matrix.compose(position, this.#rotation, this.#scale);
    mesh.setMatrixAt(index, this.#matrix);
  }

  #ownMaterial<T extends THREE.Material>(material: T): T {
    this.#ownedMaterials.add(material);
    return material;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error('CombatEffects has been disposed');
  }
}
