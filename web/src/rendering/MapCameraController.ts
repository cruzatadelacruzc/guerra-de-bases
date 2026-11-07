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
  | 'enableRotate'
  | 'enablePan'
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
/** How far two-finger twisting (or a right-button drag) may turn away from the base orientation. */
export const AZIMUTH_RANGE = THREE.MathUtils.degToRad(45);
/** How far a two-finger vertical slide may tilt the camera above or below the zoom's default tilt. */
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
/**
 * A drag starts once the pointer moves this far; shorter presses stay taps
 * (matches TAP_MOVEMENT_TOLERANCE_PX in GameApplication, which builds/sells on tap).
 */
export const PAN_START_THRESHOLD_PX = 10;
/** Two fingers start a pinch/rotate once their spread or angle changes this much. */
const PINCH_START_FRACTION = 0.04;
const TWIST_START_RADIANS = THREE.MathUtils.degToRad(6);
/** Two fingers sliding together vertically this far (keeping spread and angle) tilt instead. */
const TILT_START_PX = 12;
const TILT_MAX_SPREAD_CHANGE = 0.06;
const TILT_MAX_TWIST_RADIANS = THREE.MathUtils.degToRad(8);
/** A released drag keeps gliding if it was moving at least this fast (world units/s)... */
const INERTIA_MIN_SPEED = 4;
/** ...and was still moving this recently before release. */
const INERTIA_MAX_IDLE_MS = 80;
/** Time constant of the glide's slowdown. */
const INERTIA_DECAY_SECONDS = 0.35;
const INERTIA_STOP_SPEED = 0.5;

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

interface DragGesture {
  pointerId: number;
  /** Left button / one finger grabs the map; the right button orbits. */
  kind: 'pan' | 'orbit';
  active: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  /** Ground point grabbed at pointerdown; panning keeps it under the pointer. */
  readonly grab: THREE.Vector3;
}

interface TwoFingerGesture {
  mode: 'undecided' | 'transform' | 'tilt';
  startSpread: number;
  startAngle: number;
  startMidX: number;
  startMidY: number;
  lastSpread: number;
  lastAngle: number;
  lastMidX: number;
  lastMidY: number;
}

/** Signed smallest difference between two angles, in (-PI, PI]. */
function angleDelta(to: number, from: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * Touch-first map camera driving OrbitControls' limits (three r128 has no
 * zoomToCursor or grab panning):
 * - one finger / left mouse drag grabs the map (the grabbed ground point stays
 *   under the pointer) and glides on with inertia when released while moving;
 * - two fingers pinch-zoom toward the fingers, twist to rotate and pan with
 *   their midpoint, or slide vertically together to tilt;
 * - right mouse drag rotates and tilts, the wheel zooms toward the cursor;
 * - `focusOn` glides the focus to a ground point (double tap).
 * The view follows the screen orientation, tilts down as it zooms out and is
 * kept over the map. Auto mode follows the fighting with focus and zoom.
 */
export class MapCameraController {
  readonly #camera: THREE.PerspectiveCamera;
  readonly #controls: MapOrbitControls;
  readonly #surface: HTMLElement;
  readonly #listeners = new AbortController();
  readonly #touches = new Map<number, { x: number; y: number }>();
  readonly #drag: DragGesture = {
    pointerId: -1,
    kind: 'pan',
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    grab: new THREE.Vector3(),
  };
  readonly #twoFinger: TwoFingerGesture = {
    mode: 'undecided',
    startSpread: 0,
    startAngle: 0,
    startMidX: 0,
    startMidY: 0,
    lastSpread: 0,
    lastAngle: 0,
    lastMidX: 0,
    lastMidY: 0,
  };
  readonly #velocity = new THREE.Vector2();
  readonly #inertia = new THREE.Vector2();
  readonly #groundA = new THREE.Vector3();
  readonly #groundB = new THREE.Vector3();
  readonly #spherical = new THREE.Spherical();
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
  #dragging = false;
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
    // Every gesture is handled here; OrbitControls only applies limits in update().
    controls.enableZoom = false;
    controls.enableRotate = false;
    controls.enablePan = false;
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
    this.#advanceInertia(deltaSeconds);
    if (this.#focusActive) this.#advanceFocus(deltaSeconds);
    else if (this.#autoZoom && this.#touches.size < 2) this.#advanceAuto(deltaSeconds);
    this.#applyElevation();
    this.#controls.update();
    this.#clampView();
  }

  reset(): void {
    this.#focusActive = false;
    this.#touches.clear();
    this.#dragging = false;
    this.#inertia.set(0, 0);
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
    this.#dragging = false;
    this.#inertia.set(0, 0);
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

  /** Moves camera and focus together across the ground. */
  #translate(dx: number, dz: number): void {
    const target = this.#controls.target;
    target.x += dx;
    target.z += dz;
    this.#camera.position.x += dx;
    this.#camera.position.z += dz;
  }

  /** Moves the view so the ground point under (fromX, fromY) ends up under (toX, toY). */
  #dragGround(fromX: number, fromY: number, toX: number, toY: number): void {
    this.#camera.updateMatrixWorld();
    if (!this.#groundPointAt(fromX, fromY, this.#groundA)) return;
    if (!this.#groundPointAt(toX, toY, this.#groundB)) return;
    this.#translate(this.#groundA.x - this.#groundB.x, this.#groundA.z - this.#groundB.z);
  }

  /** Orbits the camera around the focus; the controls' limits are applied right away. */
  #orbitBy(deltaAzimuth: number, deltaPolar: number): void {
    const target = this.#controls.target;
    this.#offset.subVectors(this.#camera.position, target);
    this.#spherical.setFromVector3(this.#offset);
    this.#spherical.theta = THREE.MathUtils.clamp(
      this.#spherical.theta + deltaAzimuth,
      this.#controls.minAzimuthAngle,
      this.#controls.maxAzimuthAngle
    );
    this.#spherical.phi = THREE.MathUtils.clamp(
      this.#spherical.phi + deltaPolar,
      this.#controls.minPolarAngle,
      this.#controls.maxPolarAngle
    );
    this.#offset.setFromSpherical(this.#spherical);
    this.#camera.position.copy(target).add(this.#offset);
  }

  /** Same feel as OrbitControls: a drag across the full screen height turns a full circle. */
  #orbitByPixels(dx: number, dy: number): void {
    const height = Math.max(1, this.#surface.getBoundingClientRect().height);
    this.#orbitBy((-2 * Math.PI * dx) / height, (-2 * Math.PI * dy) / height);
  }

  #advanceInertia(deltaSeconds: number): void {
    if (this.#inertia.x === 0 && this.#inertia.y === 0) return;
    this.#translate(this.#inertia.x * deltaSeconds, this.#inertia.y * deltaSeconds);
    this.#inertia.multiplyScalar(Math.exp(-deltaSeconds / INERTIA_DECAY_SECONDS));
    if (this.#inertia.length() < INERTIA_STOP_SPEED) this.#inertia.set(0, 0);
  }

  #startDrag(pointerId: number, kind: DragGesture['kind'], x: number, y: number, time: number): void {
    const drag = this.#drag;
    drag.pointerId = pointerId;
    drag.kind = kind;
    drag.active = false;
    drag.startX = x;
    drag.startY = y;
    drag.lastX = x;
    drag.lastY = y;
    drag.lastTime = time;
    this.#velocity.set(0, 0);
    this.#camera.updateMatrixWorld();
    // Grabbing off the ground (should not happen above the map) falls back to plain dragging.
    if (!this.#groundPointAt(x, y, drag.grab)) drag.grab.set(Number.NaN, 0, Number.NaN);
    this.#dragging = true;
  }

  #moveDrag(x: number, y: number, time: number): void {
    const drag = this.#drag;
    if (!drag.active) {
      if (Math.hypot(x - drag.startX, y - drag.startY) <= PAN_START_THRESHOLD_PX) return;
      drag.active = true;
      if (drag.kind === 'pan') this.setAutoZoomEnabled(false);
    }
    if (drag.kind === 'orbit') {
      this.#orbitByPixels(x - drag.lastX, y - drag.lastY);
    } else {
      const beforeX = this.#controls.target.x;
      const beforeZ = this.#controls.target.z;
      this.#camera.updateMatrixWorld();
      if (Number.isFinite(drag.grab.x) && this.#groundPointAt(x, y, this.#groundB)) {
        this.#translate(drag.grab.x - this.#groundB.x, drag.grab.z - this.#groundB.z);
      } else {
        this.#dragGround(drag.lastX, drag.lastY, x, y);
      }
      const seconds = (time - drag.lastTime) / 1000;
      if (seconds > 0) {
        const vx = (this.#controls.target.x - beforeX) / seconds;
        const vz = (this.#controls.target.z - beforeZ) / seconds;
        this.#velocity.set(this.#velocity.x * 0.6 + vx * 0.4, this.#velocity.y * 0.6 + vz * 0.4);
      }
    }
    drag.lastX = x;
    drag.lastY = y;
    drag.lastTime = time;
  }

  #endDrag(time: number): void {
    const drag = this.#drag;
    if (this.#dragging && drag.active && drag.kind === 'pan'
      && time - drag.lastTime <= INERTIA_MAX_IDLE_MS && this.#velocity.length() >= INERTIA_MIN_SPEED) {
      this.#inertia.copy(this.#velocity);
    }
    this.#dragging = false;
    drag.pointerId = -1;
  }

  #startTwoFinger(): void {
    const [a, b] = this.#touches.values();
    const gesture = this.#twoFinger;
    gesture.mode = 'undecided';
    gesture.startSpread = gesture.lastSpread = Math.hypot(b.x - a.x, b.y - a.y);
    gesture.startAngle = gesture.lastAngle = Math.atan2(b.y - a.y, b.x - a.x);
    gesture.startMidX = gesture.lastMidX = (a.x + b.x) / 2;
    gesture.startMidY = gesture.lastMidY = (a.y + b.y) / 2;
  }

  #moveTwoFinger(): void {
    const [a, b] = this.#touches.values();
    const gesture = this.#twoFinger;
    const spread = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    if (spread <= 0 || gesture.startSpread <= 0) return;

    if (gesture.mode === 'undecided') {
      const spreadChange = Math.abs(spread / gesture.startSpread - 1);
      const twist = Math.abs(angleDelta(angle, gesture.startAngle));
      const moveX = midX - gesture.startMidX;
      const moveY = midY - gesture.startMidY;
      if (Math.abs(moveY) > TILT_START_PX && spreadChange < TILT_MAX_SPREAD_CHANGE
        && twist < TILT_MAX_TWIST_RADIANS && Math.abs(moveY) > 2 * Math.abs(moveX)) {
        gesture.mode = 'tilt';
      } else if (spreadChange > PINCH_START_FRACTION || twist > TWIST_START_RADIANS
        || Math.hypot(moveX, moveY) > PAN_START_THRESHOLD_PX) {
        gesture.mode = 'transform';
        this.setAutoZoomEnabled(false);
      } else {
        return;
      }
    }

    if (gesture.mode === 'tilt') {
      this.#orbitByPixels(0, midY - gesture.lastMidY);
    } else {
      this.#dragGround(gesture.lastMidX, gesture.lastMidY, midX, midY);
      if (gesture.lastSpread > 0) this.#zoomAt(midX, midY, gesture.lastSpread / spread);
      // Twisting the fingers clockwise on screen turns the map clockwise with them.
      this.#orbitBy(angleDelta(angle, gesture.lastAngle), 0);
    }
    gesture.lastSpread = spread;
    gesture.lastAngle = angle;
    gesture.lastMidX = midX;
    gesture.lastMidY = midY;
  }

  #capture(event: PointerEvent): void {
    const surface = this.#surface as Partial<Pick<HTMLElement, 'setPointerCapture'>>;
    try {
      surface.setPointerCapture?.(event.pointerId);
    } catch {
      // Capture is best-effort (the pointer may already be gone).
    }
  }

  #onPointerDown = (event: PointerEvent): void => {
    // Any direct manipulation takes over from a double-tap glide or a released fling.
    this.#focusActive = false;
    this.#inertia.set(0, 0);
    if (event.pointerType === 'touch') {
      this.#touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.#touches.size === 1) {
        this.#startDrag(event.pointerId, 'pan', event.clientX, event.clientY, event.timeStamp);
      } else if (this.#touches.size === 2) {
        this.#dragging = false;
        this.#startTwoFinger();
      }
      this.#capture(event);
      return;
    }
    if (event.button === 0 || event.button === 2) {
      this.#startDrag(event.pointerId, event.button === 0 ? 'pan' : 'orbit', event.clientX, event.clientY, event.timeStamp);
      this.#capture(event);
    }
  };

  #onPointerMove = (event: PointerEvent): void => {
    const touch = this.#touches.get(event.pointerId);
    if (touch) {
      touch.x = event.clientX;
      touch.y = event.clientY;
      if (this.#touches.size === 2) {
        this.#moveTwoFinger();
        return;
      }
    }
    if (this.#dragging && event.pointerId === this.#drag.pointerId) {
      this.#moveDrag(event.clientX, event.clientY, event.timeStamp);
    }
  };

  #onPointerEnd = (event: PointerEvent): void => {
    const wasTouch = this.#touches.delete(event.pointerId);
    if (this.#dragging && event.pointerId === this.#drag.pointerId) this.#endDrag(event.timeStamp);
    // Lifting one of two fingers keeps panning with the one that stays down.
    if (wasTouch && this.#touches.size === 1) {
      const [[id, remaining]] = this.#touches;
      this.#startDrag(id, 'pan', remaining.x, remaining.y, event.timeStamp);
      this.#drag.active = true;
    }
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
