import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CombatEffects } from './CombatEffects.ts';
import { InstancedSoldierRenderer } from './InstancedSoldierRenderer.ts';
import { ProjectilePool } from './ProjectilePool.ts';

export class ThreeRenderCoordinator {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly directionalLight: THREE.DirectionalLight;
  readonly soldiers: InstancedSoldierRenderer;
  readonly effects: CombatEffects;
  readonly projectiles: ProjectilePool;
  #disposed = false;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.soldiers = new InstancedSoldierRenderer(this.scene);
    this.effects = new CombatEffects(this.scene);
    this.projectiles = new ProjectilePool(this.scene);
    this.scene.background = new THREE.Color(0x050811);
    this.scene.fog = new THREE.FogExp2(0x050811, 0.011);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 50, 70);

    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !isTouchDevice,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));
    this.renderer.shadowMap.enabled = !isTouchDevice || window.innerWidth >= 900;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 130;
    this.controls.target.set(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0x708090, 0.85));
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
    this.directionalLight.position.set(40, 60, 20);
    this.directionalLight.castShadow = this.renderer.shadowMap.enabled;
    this.directionalLight.shadow.mapSize.width = isTouchDevice ? 1024 : 2048;
    this.directionalLight.shadow.mapSize.height = isTouchDevice ? 1024 : 2048;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 200;
    const shadowExtent = 50;
    this.directionalLight.shadow.camera.left = -shadowExtent;
    this.directionalLight.shadow.camera.right = shadowExtent;
    this.directionalLight.shadow.camera.top = shadowExtent;
    this.directionalLight.shadow.camera.bottom = -shadowExtent;
    this.scene.add(this.directionalLight);

    const blueSpot = new THREE.SpotLight(0x00f0ff, 3, 90, Math.PI / 4, 0.5);
    blueSpot.position.set(-30, 25, 40);
    this.scene.add(blueSpot);

    const redSpot = new THREE.SpotLight(0xff2244, 3, 90, Math.PI / 4, 0.5);
    redSpot.position.set(30, 25, -40);
    this.scene.add(redSpot);

    window.addEventListener('resize', this.#handleResize);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  render(elapsedSeconds: number): void {
    this.soldiers.sync(this.camera.quaternion, elapsedSeconds);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    window.removeEventListener('resize', this.#handleResize);
    this.controls.dispose();
    this.soldiers.dispose();
    this.effects.dispose();
    this.projectiles.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  #handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));
    this.renderer.shadowMap.enabled = !isTouchDevice || window.innerWidth >= 900;
    this.directionalLight.castShadow = this.renderer.shadowMap.enabled;
  };
}
