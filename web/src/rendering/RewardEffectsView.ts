import * as THREE from 'three';
import type { Faction } from '../game/ecs/components.ts';
import {
  AIR_STRIKE_BOMB_FALL_SECONDS,
  AIR_STRIKE_FLIGHT_SECONDS,
  ARTILLERY_SHELL_FLIGHT_SECONDS
} from '../game/rewardSystem.ts';
import type { ActiveStrike, StrikeTimeline } from '../game/match/strikeState.ts';
import { apexHeightFor, ballisticPoint } from './ballisticArc.ts';
import type { ArcPoint } from './ballisticArc.ts';

/** Shells leave from just above the Nexus dome, side by side. */
export const ARTILLERY_MUZZLE_HEIGHT = 5.5;
export const ARTILLERY_MUZZLE_SPACING = 1.2;
// Low enough to stay on screen when the camera frames the target, above the tallest buildings.
const AIR_STRIKE_CRUISE_HEIGHT = 8;
const AIR_STRIKE_FLIGHT_ARC_HEIGHT = 1.2;
/** A bomb leaves this far below the aircraft and lands this high above its impact point. */
const BOMB_DROP_OFFSET = 0.6;

/** Where shell `index` of `shellCount` leaves a Nexus at `base`: side by side, centred, above the dome. */
export function muzzleOrigin(
  base: Readonly<{ x: number; z: number }>,
  index: number,
  shellCount: number
): ArcPoint {
  const middle = (shellCount - 1) / 2;
  return { x: base.x + (index - middle) * ARTILLERY_MUZZLE_SPACING, y: ARTILLERY_MUZZLE_HEIGHT, z: base.z };
}

export interface RewardEffectsViewOptions {
  readonly scene: THREE.Scene;
  /** Origen visual del proyectil i de la facción (sobre su Nexo); solo se lee al crear el visual. */
  readonly shellOrigin: (faction: Faction, index: number, shellCount: number) => Readonly<{ x: number; y: number; z: number }>;
}

interface ShellVisual {
  readonly mesh: THREE.Mesh;
  readonly origin: Readonly<ArcPoint>;
  readonly point: Readonly<ArcPoint>;
  readonly apexHeight: number;
}

type StrikeVisual =
  | { kind: 'artillery_strike'; syncedAt: number; readonly shells: readonly ShellVisual[] }
  | { kind: 'air_strike'; syncedAt: number; readonly aircraft: THREE.Group; readonly bombs: readonly THREE.Mesh[] };

// The fuselage and tail are laid out along local X, with the nose at +X.
const aircraftForwardAxis = new THREE.Vector3(1, 0, 0);
const aircraftFlightTangent = new THREE.Vector3();

function orientAircraftAlongFlightPath(
  aircraft: THREE.Group,
  strike: Extract<ActiveStrike, { kind: 'air_strike' }>,
  progress: number
): void {
  const verticalTangent = progress < 1
    ? AIR_STRIKE_FLIGHT_ARC_HEIGHT * Math.PI * Math.cos(progress * Math.PI)
    : 0;
  aircraftFlightTangent
    .set(strike.endX - strike.startX, verticalTangent, strike.endZ - strike.startZ)
    .normalize();
  aircraft.quaternion.setFromUnitVectors(aircraftForwardAxis, aircraftFlightTangent);
}

function createAttackAircraft(faction: Faction): THREE.Group {
  const aircraft = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.85, 7.5, 10),
    new THREE.MeshStandardMaterial({
      color: faction === 'player' ? 0x67e8f9 : 0xfb7185,
      metalness: 0.45,
      roughness: 0.42
    })
  );
  body.rotation.z = -Math.PI / 2;
  aircraft.add(body);
  const wings = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.18, 7),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 })
  );
  wings.position.x = -0.5;
  aircraft.add(wings);
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.15, 2.5),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
  );
  tail.position.x = -2.6;
  aircraft.add(tail);
  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.25, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 })
  );
  fin.position.set(-2.8, 0.6, 0);
  aircraft.add(fin);
  return aircraft;
}

function disposeVisualTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

/**
 * Draws the strikes in flight from the domain's state: shells, aircraft and bombs. It never
 * decides an impact; explosions, sounds and haptics come from the domain's events elsewhere.
 */
export class RewardEffectsView {
  readonly #scene: THREE.Scene;
  readonly #shellOrigin: RewardEffectsViewOptions['shellOrigin'];
  readonly #visuals = new Map<number, StrikeVisual>();
  // Shells share one geometry/material; they are only released by dispose().
  readonly #shellGeometry = new THREE.SphereGeometry(0.42, 8, 8);
  readonly #shellMaterial = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  #generation = 0;
  #sceneObjects = 0;

  constructor(options: RewardEffectsViewOptions) {
    this.#scene = options.scene;
    this.#shellOrigin = options.shellOrigin;
  }

  /** Once per frame after the domain advanced: creates, places and drops visuals to match `strikes`. */
  sync(strikes: StrikeTimeline): void {
    const generation = ++this.#generation;
    for (const strike of strikes.active) {
      let visual = this.#visuals.get(strike.id);
      if (!visual) {
        visual = this.#create(strike);
        this.#visuals.set(strike.id, visual);
      }
      visual.syncedAt = generation;
      if (strike.kind === 'artillery_strike' && visual.kind === 'artillery_strike') this.#placeArtillery(strike, visual);
      else if (strike.kind === 'air_strike' && visual.kind === 'air_strike') this.#placeAirStrike(strike, visual);
    }
    for (const [id, visual] of this.#visuals) {
      if (visual.syncedAt === generation) continue;
      this.#release(visual);
      this.#visuals.delete(id);
    }
  }

  /** Removes and frees every strike visual; the shared shell resources stay for later strikes. */
  clear(): void {
    for (const visual of this.#visuals.values()) this.#release(visual);
    this.#visuals.clear();
  }

  stats(): { strikes: number; sceneObjects: number } {
    return { strikes: this.#visuals.size, sceneObjects: this.#sceneObjects };
  }

  /** Clears and also frees the shared shell geometry and material. */
  dispose(): void {
    this.clear();
    this.#shellGeometry.dispose();
    this.#shellMaterial.dispose();
  }

  #add(object: THREE.Object3D): void {
    this.#scene.add(object);
    this.#sceneObjects++;
  }

  #remove(object: THREE.Object3D): void {
    this.#scene.remove(object);
    this.#sceneObjects--;
  }

  #create(strike: ActiveStrike): StrikeVisual {
    if (strike.kind === 'artillery_strike') {
      const shellCount = strike.shells.length;
      const shells = strike.shells.map((shell, index): ShellVisual => {
        const from = this.#shellOrigin(strike.faction, index, shellCount);
        const origin = { x: from.x, y: from.y, z: from.z };
        const point = { x: shell.x, y: 0, z: shell.z };
        const mesh = new THREE.Mesh(this.#shellGeometry, this.#shellMaterial);
        mesh.name = `strike-${strike.id}-shell-${index}`;
        mesh.visible = false;
        this.#add(mesh);
        return { mesh, origin, point, apexHeight: apexHeightFor(origin, point) };
      });
      return { kind: 'artillery_strike', syncedAt: 0, shells };
    }
    const aircraft = createAttackAircraft(strike.faction);
    aircraft.name = `strike-${strike.id}-aircraft`;
    this.#add(aircraft);
    const bombs = strike.bombs.map((_, index) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
      );
      mesh.name = `strike-${strike.id}-bomb-${index}`;
      mesh.visible = false;
      this.#add(mesh);
      return mesh;
    });
    return { kind: 'air_strike', syncedAt: 0, aircraft, bombs };
  }

  #placeArtillery(
    strike: Extract<ActiveStrike, { kind: 'artillery_strike' }>,
    visual: Extract<StrikeVisual, { kind: 'artillery_strike' }>
  ): void {
    for (let index = 0; index < strike.shells.length; index++) {
      const shell = strike.shells[index];
      const shellVisual = visual.shells[index];
      shellVisual.mesh.visible = shell.launched && !shell.landed;
      if (!shellVisual.mesh.visible) continue;
      const flightProgress = Math.min(1, (strike.elapsedSeconds - shell.launchAtSeconds) / ARTILLERY_SHELL_FLIGHT_SECONDS);
      ballisticPoint(shellVisual.origin, shellVisual.point, shellVisual.apexHeight, flightProgress, shellVisual.mesh.position);
    }
  }

  #placeAirStrike(
    strike: Extract<ActiveStrike, { kind: 'air_strike' }>,
    visual: Extract<StrikeVisual, { kind: 'air_strike' }>
  ): void {
    const progress = Math.min(1, strike.elapsedSeconds / AIR_STRIKE_FLIGHT_SECONDS);
    visual.aircraft.position.set(
      THREE.MathUtils.lerp(strike.startX, strike.endX, progress),
      AIR_STRIKE_CRUISE_HEIGHT + Math.sin(progress * Math.PI) * AIR_STRIKE_FLIGHT_ARC_HEIGHT,
      THREE.MathUtils.lerp(strike.startZ, strike.endZ, progress)
    );
    orientAircraftAlongFlightPath(visual.aircraft, strike, progress);

    for (let index = 0; index < strike.bombs.length; index++) {
      const bomb = strike.bombs[index];
      const mesh = visual.bombs[index];
      mesh.visible = bomb.released && !bomb.landed;
      if (!mesh.visible) continue;
      const releaseY = AIR_STRIKE_CRUISE_HEIGHT
        + Math.sin(bomb.releaseProgress * Math.PI) * AIR_STRIKE_FLIGHT_ARC_HEIGHT
        - BOMB_DROP_OFFSET;
      const fallProgress = Math.min(1, bomb.fallElapsedSeconds / AIR_STRIKE_BOMB_FALL_SECONDS);
      mesh.position.set(
        THREE.MathUtils.lerp(bomb.releaseX, bomb.x, fallProgress),
        THREE.MathUtils.lerp(releaseY, BOMB_DROP_OFFSET, fallProgress),
        THREE.MathUtils.lerp(bomb.releaseZ, bomb.z, fallProgress)
      );
    }
  }

  #release(visual: StrikeVisual): void {
    if (visual.kind === 'artillery_strike') {
      // The shell geometry and material are shared; only the meshes go.
      for (const shell of visual.shells) this.#remove(shell.mesh);
      return;
    }
    this.#remove(visual.aircraft);
    disposeVisualTree(visual.aircraft);
    for (const bomb of visual.bombs) {
      this.#remove(bomb);
      disposeVisualTree(bomb);
    }
  }
}
