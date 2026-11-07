import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface FocusBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Matches the terrain plane (110 x 150) built in GameApplication. */
export const MAP_FOCUS_BOUNDS: Readonly<FocusBounds> = { minX: -55, maxX: 55, minZ: -75, maxZ: 75 };

/**
 * How far (as a fraction of the map size) the view may reach past the map
 * edges. Looking across the field (low camera) leaves room to roam; looking
 * down from above the view is kept tight so little empty ground shows.
 */
export const VIEW_SLACK_LOW_ANGLE = 0.2;
export const VIEW_SLACK_TOP_DOWN = 0;
const SLACK_LOW_ANGLE_DEGREES = 45;
const SLACK_TOP_DOWN_DEGREES = 66;

export function viewSlackForElevation(elevation: number): number {
  const t = THREE.MathUtils.clamp(
    (THREE.MathUtils.radToDeg(elevation) - SLACK_LOW_ANGLE_DEGREES) / (SLACK_TOP_DOWN_DEGREES - SLACK_LOW_ANGLE_DEGREES),
    0,
    1
  );
  return THREE.MathUtils.lerp(VIEW_SLACK_LOW_ANGLE, VIEW_SLACK_TOP_DOWN, t);
}

/** The area the visible ground is kept inside at a camera elevation: the map plus its slack. */
export function viewBoundsForElevation(elevation: number, out: FocusBounds): FocusBounds {
  const scale = 1 + viewSlackForElevation(elevation);
  out.minX = MAP_FOCUS_BOUNDS.minX * scale;
  out.maxX = MAP_FOCUS_BOUNDS.maxX * scale;
  out.minZ = MAP_FOCUS_BOUNDS.minZ * scale;
  out.maxZ = MAP_FOCUS_BOUNDS.maxZ * scale;
  return out;
}

/** The subset of OrbitControls this controller drives (keeps it testable without a DOM). */
export type MapOrbitControls = Pick<
  OrbitControls,
  | 'target'
  | 'update'
  | 'enabled'
  | 'enableZoom'
  | 'screenSpacePanning'
  | 'minDistance'
  | 'maxDistance'
  | 'minPolarAngle'
  | 'maxPolarAngle'
  | 'minAzimuthAngle'
  | 'maxAzimuthAngle'
>;

export const FOCUS_NEAR_DISTANCE = 35;
export const FOCUS_FAR_DISTANCE = 70;
/** Double-tap zooms in when farther than this, otherwise zooms back out. */
export const FOCUS_TOGGLE_THRESHOLD = 45;

/** Portrait: camera on the +z side, the long axis of the map runs up the screen. */
export const PORTRAIT_AZIMUTH = 0;
/**
 * Landscape: camera on the +x side, so the map's long axis runs across the
 * wide screen with the player's side (+z) on the left and the enemy on the right.
 */
export const LANDSCAPE_AZIMUTH = Math.PI / 2;
/** How far one-finger rotation may turn away from the base orientation. */
export const AZIMUTH_RANGE = THREE.MathUtils.degToRad(45);
/** How far one-finger dragging may tilt the camera above or below the zoom's default tilt. */
export const TILT_RANGE = THREE.MathUtils.degToRad(12);
const MIN_ELEVATION = THREE.MathUtils.degToRad(30);
const MAX_ELEVATION = THREE.MathUtils.degToRad(82);

/** Close up the camera looks across the field; zoomed out it looks down more. */
const ELEVATION_NEAR_DEGREES = 55;
const ELEVATION_NEAR_DISTANCE = 35;
const ELEVATION_FAR_DEGREES = 68;
const ELEVATION_FAR_DISTANCE = 90;
/** Upper bound when searching the largest distance whose view still fits the map. */
const VIEW_DISTANCE_SEARCH_LIMIT = 130;

export interface StartView {
  readonly focusX: number;
  readonly focusZ: number;
  readonly distance: number;
}

/**
 * Match start shows the player's Nexus (z = 60) at a comfortable size; the view
 * bounds then slide the focus so the screen stays over the map.
 */
export const START_VIEW_LANDSCAPE: StartView = { focusX: 0, focusZ: 45, distance: 50 };
export const START_VIEW_PORTRAIT: StartView = { focusX: 0, focusZ: 58, distance: 68 };

const FOCUS_DURATION_SECONDS = 0.35;
const WHEEL_ZOOM_STEP = 0.95;

const AUTO_MARGIN = 1.3;
const AUTO_SAMPLE_INTERVAL_SECONDS = 0.25;
/** Time constant of the exponential ease toward the auto focus/zoom target. */
const AUTO_SMOOTHING_SECONDS = 2;
/** Distance target changes smaller than this fraction are ignored to avoid jitter. */
const AUTO_DEADBAND = 0.06;
/** With no fighting for this long, auto returns to the player's base view. */
const AUTO_HOME_DELAY_SECONDS = 4;
/** A pinch counts as a manual zoom once the finger spread changes by this fraction. */
const PINCH_MANUAL_THRESHOLD = 0.04;
/** A two-finger drag counts as a manual pan once its midpoint moves this far. */
const PAN_MANUAL_THRESHOLD_PX = 12;

/**
 * Screen points (NDC) that must land on the map: the near edge corners, the
 * ends of the middle row and the center of the far edge. The far corners may
 * peek past the edge (small, distant triangles) so the player's base is not
 * pinned against the side of the screen.
 */
const VIEW_LIMIT_POINTS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];

/** Calls `visit` once per position (x, z) auto mode should keep on screen. */
export type PointVisitor = (visit: (x: number, z: number) => void) => void;

export interface ViewBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function baseAzimuthFor(aspect: number): number {
  return aspect >= 1 ? LANDSCAPE_AZIMUTH : PORTRAIT_AZIMUTH;
}

/** Camera elevation above the ground, in radians, for a camera-to-focus distance. */
export function elevationForDistance(distance: number): number {
  const t = THREE.MathUtils.clamp(
    (distance - ELEVATION_NEAR_DISTANCE) / (ELEVATION_FAR_DISTANCE - ELEVATION_NEAR_DISTANCE),
    0,
    1
  );
  return THREE.MathUtils.degToRad(THREE.MathUtils.lerp(ELEVATION_NEAR_DEGREES, ELEVATION_FAR_DEGREES, t));
}

/** Unit vector from the focus toward the camera. */
export function viewDirection(azimuth: number, elevation: number, out: THREE.Vector3): THREE.Vector3 {
  const horizontal = Math.cos(elevation);
  return out.set(horizontal * Math.sin(azimuth), Math.sin(elevation), horizontal * Math.cos(azimuth));
}

/**
 * Scales camera and target about `anchor` so the anchor stays put on screen
 * (zoom toward fingers / cursor). The scale is limited so the camera-target
 * distance stays within [minDistance, maxDistance]. Mutates position/target.
 */
export function zoomTowardPoint(
  position: THREE.Vector3,
  target: THREE.Vector3,
  anchor: THREE.Vector3,
  scale: number,
  minDistance: number,
  maxDistance: number
): void {
  const distance = position.distanceTo(target);
  if (distance <= 0 || !Number.isFinite(scale) || scale <= 0) return;
  const clampedScale = THREE.MathUtils.clamp(distance * scale, minDistance, maxDistance) / distance;
  position.sub(anchor).multiplyScalar(clampedScale).add(anchor);
  target.sub(anchor).multiplyScalar(clampedScale).add(anchor);
}

const probeRaycaster = new THREE.Raycaster();
const probeGround = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const probeNdc = new THREE.Vector2();
const probeHit = new THREE.Vector3();
const probeBox: ViewBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
const probeBounds: FocusBounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
const probeCamera = new THREE.PerspectiveCamera();
const probeDirection = new THREE.Vector3();

/** Ground-plane box covered by the view limit points; false if one misses the ground. */
export function measureViewBox(camera: THREE.PerspectiveCamera, out: ViewBox): boolean {
  camera.updateMatrixWorld();
  out.minX = Infinity;
  out.maxX = -Infinity;
  out.minZ = Infinity;
  out.maxZ = -Infinity;
  for (const [x, y] of VIEW_LIMIT_POINTS) {
    probeNdc.set(x, y);
    probeRaycaster.setFromCamera(probeNdc, camera);
    if (!probeRaycaster.ray.intersectPlane(probeGround, probeHit)) return false;
    out.minX = Math.min(out.minX, probeHit.x);
    out.maxX = Math.max(out.maxX, probeHit.x);
    out.minZ = Math.min(out.minZ, probeHit.z);
    out.maxZ = Math.max(out.maxZ, probeHit.z);
  }
  return true;
}

function axisCorrection(min: number, max: number, low: number, high: number): number {
  if (max - min >= high - low) return (low + high) / 2 - (min + max) / 2;
  if (min < low) return low - min;
  if (max > high) return high - max;
  return 0;
}

/**
 * Slides camera and target together so the visible ground stays over the map
 * (centered on an axis where the view is wider than the map).
 */
export function clampViewToBounds(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  bounds: Readonly<FocusBounds>
): void {
  if (!measureViewBox(camera, probeBox)) return;
  const dx = axisCorrection(probeBox.minX, probeBox.maxX, bounds.minX, bounds.maxX);
  const dz = axisCorrection(probeBox.minZ, probeBox.maxZ, bounds.minZ, bounds.maxZ);
  if (dx === 0 && dz === 0) return;
  target.x += dx;
  target.z += dz;
  camera.position.x += dx;
  camera.position.z += dz;
}

/**
 * Largest camera distance whose view (at that distance's default elevation)
 * fits inside the map plus the slack allowed at that elevation.
 */
export function computeMaxViewDistance(
  fovDegrees: number,
  aspect: number,
  azimuth: number,
  minDistance: number
): number {
  probeCamera.fov = fovDegrees;
  probeCamera.aspect = aspect;
  probeCamera.updateProjectionMatrix();
  let best = minDistance;
  for (let distance = minDistance; distance <= VIEW_DISTANCE_SEARCH_LIMIT; distance += 1) {
    const elevation = elevationForDistance(distance);
    viewDirection(azimuth, elevation, probeDirection);
    probeCamera.position.copy(probeDirection).multiplyScalar(distance);
    probeCamera.lookAt(0, 0, 0);
    if (!measureViewBox(probeCamera, probeBox)) break;
    const bounds = viewBoundsForElevation(elevation, probeBounds);
    if (probeBox.maxX - probeBox.minX > bounds.maxX - bounds.minX
      || probeBox.maxZ - probeBox.minZ > bounds.maxZ - bounds.minZ) break;
    best = distance;
  }
  return best;
}

export interface ActionFrame {
  count: number;
  centerX: number;
  centerZ: number;
  /** Half extent across the screen. */
  halfWidth: number;
  /** Half extent along the viewing direction (on the ground). */
  halfDepth: number;
}

/**
 * Bounding frame of the visited points in the camera's ground axes for the
 * given azimuth: across the screen and along the view direction.
 */
export function measureActionFrame(points: PointVisitor, azimuth: number, out: ActionFrame): void {
  const cos = Math.cos(azimuth);
  const sin = Math.sin(azimuth);
  let count = 0;
  let minA = Infinity;
  let maxA = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  points((x, z) => {
    const across = x * cos - z * sin;
    const along = x * sin + z * cos;
    count++;
    minA = Math.min(minA, across);
    maxA = Math.max(maxA, across);
    minB = Math.min(minB, along);
    maxB = Math.max(maxB, along);
  });
  out.count = count;
  if (count === 0) {
    out.centerX = 0;
    out.centerZ = 0;
    out.halfWidth = 0;
    out.halfDepth = 0;
    return;
  }
  const centerA = (minA + maxA) / 2;
  const centerB = (minB + maxB) / 2;
  out.centerX = centerA * cos + centerB * sin;
  out.centerZ = -centerA * sin + centerB * cos;
  out.halfWidth = (maxA - minA) / 2;
  out.halfDepth = (maxB - minB) / 2;
}

export interface FitDistanceOptions {
  /** Vertical field of view in degrees. */
  readonly fovDegrees: number;
  readonly aspect: number;
  /** Sine of the camera's elevation angle above the ground (foreshortens depth). */
  readonly elevationSine: number;
  readonly margin: number;
  readonly minDistance: number;
  readonly maxDistance: number;
}

/** Camera distance that fits a frame of the given half extents on screen. */
export function computeFitDistance(halfWidth: number, halfDepth: number, options: FitDistanceOptions): number {
  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(options.fovDegrees) / 2);
  const widthDistance = halfWidth / (tanHalfFov * options.aspect);
  const depthDistance = (halfDepth * options.elevationSine) / tanHalfFov;
  const fit = Math.max(widthDistance, depthDistance) * options.margin;
  return THREE.MathUtils.clamp(fit, options.minDistance, options.maxDistance);
}

export function focusDistanceFor(currentDistance: number): number {
  return currentDistance > FOCUS_TOGGLE_THRESHOLD ? FOCUS_NEAR_DISTANCE : FOCUS_FAR_DISTANCE;
}

interface FocusAnimation {
  elapsed: number;
  readonly startTarget: THREE.Vector3;
  readonly endTarget: THREE.Vector3;
  readonly direction: THREE.Vector3;
  startDistance: number;
  endDistance: number;
}

/**
 * Touch-first camera on top of OrbitControls (three r128 has no zoomToCursor):
 * one finger turns the view within a small range, two fingers pan
 * (OrbitControls) and pinch-zoom toward the fingers (here), the wheel zooms
 * toward the cursor and `focusOn` glides the focus to a ground point. The view
 * follows the screen orientation, tilts down as it zooms out and is kept over
 * the map. Auto mode follows the fighting, framing it with focus and zoom.
 */
export class MapCameraController {
  readonly #camera: THREE.PerspectiveCamera;
  readonly #controls: MapOrbitControls;
  readonly #surface: HTMLElement;
  readonly #listeners = new AbortController();
  readonly #touches = new Map<number, { x: number; y: number }>();
  readonly #raycaster = new THREE.Raycaster();
  readonly #groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  readonly #ndc = new THREE.Vector2();
  readonly #anchor = new THREE.Vector3();
  readonly #offset = new THREE.Vector3();
  readonly #direction = new THREE.Vector3();
  readonly #focus: FocusAnimation = {
    elapsed: 0,
    startTarget: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    startDistance: 0,
    endDistance: 0,
  };
  readonly #actionFrame: ActionFrame = { count: 0, centerX: 0, centerZ: 0, halfWidth: 0, halfDepth: 0 };
  readonly #autoFocusTarget = new THREE.Vector3();
  readonly #viewBounds: FocusBounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  #focusActive = false;
  #pinchDistance = 0;
  #pinchStartDistance = 0;
  #pinchStartMidX = 0;
  #pinchStartMidY = 0;
  #baseAzimuth = Number.NaN;
  #layoutAspect = Number.NaN;
  #homeView: StartView = START_VIEW_PORTRAIT;
  #autoZoom = true;
  #autoSource: PointVisitor | undefined;
  #autoDistanceTarget = 0;
  #autoMinDistance = START_VIEW_LANDSCAPE.distance;
  #autoSampleElapsed = AUTO_SAMPLE_INTERVAL_SECONDS;
  #noCombatSeconds = 0;
  /** Notified whenever auto mode is switched on or off (e.g. by a manual zoom or pan). */
  onAutoZoomChange: ((enabled: boolean) => void) | undefined;

  constructor(camera: THREE.PerspectiveCamera, controls: MapOrbitControls, surface: HTMLElement) {
    this.#camera = camera;
    this.#controls = controls;
    this.#surface = surface;
    controls.enableZoom = false;
    controls.screenSpacePanning = false;

    const options = { signal: this.#listeners.signal };
    surface.addEventListener('pointerdown', this.#onPointerDown, options);
    surface.addEventListener('pointermove', this.#onPointerMove, options);
    surface.addEventListener('pointerup', this.#onPointerEnd, options);
    surface.addEventListener('pointercancel', this.#onPointerEnd, options);
    surface.addEventListener('wheel', this.#onWheel, { signal: this.#listeners.signal, passive: false });
  }

  get isFocusing(): boolean {
    return this.#focusActive;
  }

  get autoZoomEnabled(): boolean {
    return this.#autoZoom;
  }

  /** Largest zoom-out distance for the current screen (the whole view still fits the map). */
  get maxViewDistance(): number {
    return this.#controls.maxDistance;
  }

  /** Supplies the positions auto mode keeps on screen (the units currently fighting). */
  setAutoZoomSource(source: PointVisitor | undefined): void {
    this.#autoSource = source;
  }

  setAutoZoomEnabled(enabled: boolean): void {
    const changed = this.#autoZoom !== enabled;
    this.#autoZoom = enabled;
    if (enabled) {
      this.#autoFocusTarget.copy(this.#controls.target);
      this.#autoDistanceTarget = this.#camera.position.distanceTo(this.#controls.target);
      this.#autoSampleElapsed = AUTO_SAMPLE_INTERVAL_SECONDS;
      this.#noCombatSeconds = 0;
    }
    if (changed) this.onAutoZoomChange?.(enabled);
  }

  update(deltaSeconds: number): void {
    this.#syncLayout();
    if (this.#focusActive) this.#advanceFocus(deltaSeconds);
    else if (this.#autoZoom && this.#touches.size < 2) this.#advanceAuto(deltaSeconds);
    this.#applyElevation();
    this.#controls.update();
    this.#clampView();
  }

  reset(): void {
    this.#focusActive = false;
    this.#touches.clear();
    this.#layoutAspect = Number.NaN;
    this.#syncLayout();
    const view = this.#homeView;
    this.#controls.target.set(view.focusX, 0, view.focusZ);
    const distance = THREE.MathUtils.clamp(view.distance, this.#controls.minDistance, this.#controls.maxDistance);
    this.#placeCamera(distance, this.#baseAzimuth);
    this.#applyElevation();
    this.#controls.update();
    this.#clampView();
    // Auto never comes closer than the start view of the current orientation.
    this.#autoMinDistance = distance;
    this.#autoZoom = false;
    this.setAutoZoomEnabled(true);
  }

  /** Glides the focus to the ground point under the given client coordinates. */
  focusOnScreenPoint(clientX: number, clientY: number): boolean {
    if (!this.#groundPointAt(clientX, clientY, this.#anchor)) return false;
    this.focusOn(this.#anchor);
    return true;
  }

  focusOn(point: THREE.Vector3): void {
    this.setAutoZoomEnabled(false);
    const focus = this.#focus;
    const target = this.#controls.target;
    focus.elapsed = 0;
    focus.startTarget.copy(target);
    focus.endTarget.set(
      THREE.MathUtils.clamp(point.x, MAP_FOCUS_BOUNDS.minX, MAP_FOCUS_BOUNDS.maxX),
      0,
      THREE.MathUtils.clamp(point.z, MAP_FOCUS_BOUNDS.minZ, MAP_FOCUS_BOUNDS.maxZ)
    );
    focus.direction.subVectors(this.#camera.position, target);
    focus.startDistance = focus.direction.length();
    if (focus.startDistance <= 0) return;
    focus.direction.divideScalar(focus.startDistance);
    focus.endDistance = THREE.MathUtils.clamp(
      focusDistanceFor(focus.startDistance),
      this.#controls.minDistance,
      this.#controls.maxDistance
    );
    this.#focusActive = true;
  }

  dispose(): void {
    this.#listeners.abort();
    this.#touches.clear();
    this.#focusActive = false;
  }

  /** Follows screen orientation and size: base azimuth, rotation range and max zoom. */
  #syncLayout(): void {
    const aspect = this.#camera.aspect;
    if (aspect === this.#layoutAspect) return;
    this.#layoutAspect = aspect;
    const azimuth = baseAzimuthFor(aspect);
    const orientationChanged = azimuth !== this.#baseAzimuth;
    this.#baseAzimuth = azimuth;
    this.#homeView = azimuth === LANDSCAPE_AZIMUTH ? START_VIEW_LANDSCAPE : START_VIEW_PORTRAIT;
    this.#controls.minAzimuthAngle = azimuth - AZIMUTH_RANGE;
    this.#controls.maxAzimuthAngle = azimuth + AZIMUTH_RANGE;
    this.#controls.maxDistance = computeMaxViewDistance(
      this.#camera.fov,
      aspect,
      azimuth,
      this.#controls.minDistance
    );
    const distance = THREE.MathUtils.clamp(
      this.#camera.position.distanceTo(this.#controls.target),
      this.#controls.minDistance,
      this.#controls.maxDistance
    );
    if (orientationChanged) this.#placeCamera(distance, azimuth);
    this.#autoMinDistance = Math.min(this.#autoMinDistance, this.#controls.maxDistance);
  }

  #placeCamera(distance: number, azimuth: number): void {
    viewDirection(azimuth, elevationForDistance(distance), this.#direction);
    this.#camera.position.copy(this.#direction).multiplyScalar(distance).add(this.#controls.target);
  }

  /**
   * Ties the tilt to the zoom level (across the field up close, more top-down
   * far away) while letting a one-finger drag tilt it `TILT_RANGE` either way.
   */
  #applyElevation(): void {
    const distance = this.#camera.position.distanceTo(this.#controls.target);
    const elevation = elevationForDistance(distance);
    const lowest = Math.max(MIN_ELEVATION, elevation - TILT_RANGE);
    const highest = Math.min(MAX_ELEVATION, elevation + TILT_RANGE);
    this.#controls.minPolarAngle = Math.PI / 2 - highest;
    this.#controls.maxPolarAngle = Math.PI / 2 - lowest;
  }

  /** Keeps the visible ground over the map, with more slack the lower the camera looks. */
  #clampView(): void {
    this.#offset.subVectors(this.#camera.position, this.#controls.target);
    const distance = this.#offset.length();
    if (distance <= 0) return;
    const elevation = Math.asin(THREE.MathUtils.clamp(this.#offset.y / distance, -1, 1));
    clampViewToBounds(this.#camera, this.#controls.target, viewBoundsForElevation(elevation, this.#viewBounds));
  }

  #advanceFocus(deltaSeconds: number): void {
    const focus = this.#focus;
    focus.elapsed = Math.min(FOCUS_DURATION_SECONDS, focus.elapsed + deltaSeconds);
    const t = focus.elapsed / FOCUS_DURATION_SECONDS;
    const eased = 1 - (1 - t) ** 3;
    const distance = THREE.MathUtils.lerp(focus.startDistance, focus.endDistance, eased);
    this.#controls.target.lerpVectors(focus.startTarget, focus.endTarget, eased);
    this.#camera.position.copy(focus.direction).multiplyScalar(distance).add(this.#controls.target);
    if (t >= 1) this.#focusActive = false;
  }

  #advanceAuto(deltaSeconds: number): void {
    if (!this.#autoSource) return;
    const target = this.#controls.target;
    this.#offset.subVectors(this.#camera.position, target);
    const distance = this.#offset.length();
    if (distance <= 0) return;

    this.#autoSampleElapsed += deltaSeconds;
    if (this.#autoSampleElapsed >= AUTO_SAMPLE_INTERVAL_SECONDS) {
      const interval = this.#autoSampleElapsed;
      this.#autoSampleElapsed = 0;
      this.#sampleAutoTarget(interval, distance);
    }

    const blend = 1 - Math.exp(-deltaSeconds / AUTO_SMOOTHING_SECONDS);
    target.x += (this.#autoFocusTarget.x - target.x) * blend;
    target.z += (this.#autoFocusTarget.z - target.z) * blend;
    const next = distance + (this.#autoDistanceTarget - distance) * blend;
    this.#camera.position.copy(this.#offset).multiplyScalar(next / distance).add(target);
  }

  #sampleAutoTarget(intervalSeconds: number, distance: number): void {
    const source = this.#autoSource;
    if (!source) return;
    const azimuth = Math.atan2(this.#offset.x, this.#offset.z);
    measureActionFrame(source, azimuth, this.#actionFrame);
    const maxDistance = this.#controls.maxDistance;
    const minDistance = Math.min(Math.max(this.#autoMinDistance, this.#controls.minDistance), maxDistance);
    let desired: number;
    if (this.#actionFrame.count > 0) {
      this.#noCombatSeconds = 0;
      this.#autoFocusTarget.set(this.#actionFrame.centerX, 0, this.#actionFrame.centerZ);
      desired = computeFitDistance(this.#actionFrame.halfWidth, this.#actionFrame.halfDepth, {
        fovDegrees: this.#camera.fov,
        aspect: this.#camera.aspect,
        elevationSine: this.#offset.y / distance,
        margin: AUTO_MARGIN,
        minDistance,
        maxDistance,
      });
    } else {
      this.#noCombatSeconds += intervalSeconds;
      if (this.#noCombatSeconds < AUTO_HOME_DELAY_SECONDS) return;
      const home = this.#homeView;
      this.#autoFocusTarget.set(home.focusX, 0, home.focusZ);
      desired = THREE.MathUtils.clamp(home.distance, minDistance, maxDistance);
    }
    const current = this.#autoDistanceTarget;
    if (current <= 0 || Math.abs(desired - current) / current > AUTO_DEADBAND) {
      this.#autoDistanceTarget = desired;
    }
  }

  #groundPointAt(clientX: number, clientY: number, out: THREE.Vector3): boolean {
    const bounds = this.#surface.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return false;
    this.#ndc.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1
    );
    this.#raycaster.setFromCamera(this.#ndc, this.#camera);
    return this.#raycaster.ray.intersectPlane(this.#groundPlane, out) !== null;
  }

  #zoomAt(clientX: number, clientY: number, scale: number): void {
    if (!this.#controls.enabled || !this.#groundPointAt(clientX, clientY, this.#anchor)) return;
    zoomTowardPoint(
      this.#camera.position,
      this.#controls.target,
      this.#anchor,
      scale,
      this.#controls.minDistance,
      this.#controls.maxDistance
    );
  }

  #pinchMetrics(): { distance: number; midX: number; midY: number } | undefined {
    if (this.#touches.size !== 2) return undefined;
    const [a, b] = this.#touches.values();
    return {
      distance: Math.hypot(b.x - a.x, b.y - a.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  #resetPinchStart(): void {
    const pinch = this.#pinchMetrics();
    this.#pinchDistance = pinch?.distance ?? 0;
    this.#pinchStartDistance = this.#pinchDistance;
    this.#pinchStartMidX = pinch?.midX ?? 0;
    this.#pinchStartMidY = pinch?.midY ?? 0;
  }

  #onPointerDown = (event: PointerEvent): void => {
    // Any direct manipulation takes over from a running double-tap glide.
    this.#focusActive = false;
    if (event.pointerType !== 'touch') return;
    this.#touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.#resetPinchStart();
  };

  #onPointerMove = (event: PointerEvent): void => {
    // OrbitControls pans with the right mouse button; that takes the focus from auto mode.
    if (event.pointerType === 'mouse' && (event.buttons & 2) !== 0 && this.#autoZoom) {
      this.setAutoZoomEnabled(false);
    }
    const touch = this.#touches.get(event.pointerId);
    if (!touch) return;
    touch.x = event.clientX;
    touch.y = event.clientY;
    const pinch = this.#pinchMetrics();
    if (!pinch || pinch.distance <= 0) return;
    if (this.#autoZoom && this.#pinchStartDistance > 0) {
      // A two-finger pan wobbles the spread slightly; only a real pinch or drag is manual.
      const pinched = Math.abs(pinch.distance / this.#pinchStartDistance - 1) > PINCH_MANUAL_THRESHOLD;
      const dragged = Math.hypot(pinch.midX - this.#pinchStartMidX, pinch.midY - this.#pinchStartMidY)
        > PAN_MANUAL_THRESHOLD_PX;
      if (pinched || dragged) this.setAutoZoomEnabled(false);
    }
    if (this.#pinchDistance > 0 && !this.#autoZoom) {
      this.#zoomAt(pinch.midX, pinch.midY, this.#pinchDistance / pinch.distance);
    }
    this.#pinchDistance = pinch.distance;
  };

  #onPointerEnd = (event: PointerEvent): void => {
    if (!this.#touches.delete(event.pointerId)) return;
    this.#resetPinchStart();
  };

  #onWheel = (event: WheelEvent): void => {
    if (!this.#controls.enabled) return;
    event.preventDefault();
    this.#focusActive = false;
    if (event.deltaY === 0) return;
    this.setAutoZoomEnabled(false);
    this.#zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 1 / WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP);
  };
}
