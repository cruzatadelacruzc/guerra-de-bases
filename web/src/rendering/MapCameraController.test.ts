import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  AZIMUTH_RANGE,
  baseAzimuthFor,
  clampViewToBounds,
  computeFitDistance,
  computeMaxViewDistance,
  elevationForDistance,
  FOCUS_FAR_DISTANCE,
  FOCUS_NEAR_DISTANCE,
  focusDistanceFor,
  LANDSCAPE_AZIMUTH,
  MAP_FOCUS_BOUNDS,
  MapCameraController,
  measureActionFrame,
  measureViewBox,
  PORTRAIT_AZIMUTH,
  START_VIEW_LANDSCAPE,
  START_VIEW_PORTRAIT,
  viewDirection,
  zoomTowardPoint,
  type ActionFrame,
  type FitDistanceOptions,
  type MapOrbitControls,
  type PointVisitor,
  type FocusBounds,
  type ViewBox,
  VIEW_SLACK_LOW_ANGLE,
  VIEW_SLACK_TOP_DOWN,
  viewBoundsForElevation,
  viewSlackForElevation,
} from './MapCameraController.ts';

function assertVectorClose(actual: THREE.Vector3, expected: THREE.Vector3, epsilon = 1e-6): void {
  assert.ok(actual.distanceTo(expected) < epsilon, `expected ${actual.toArray()} to equal ${expected.toArray()}`);
}

function pointsOf(points: ReadonlyArray<readonly [number, number]>): PointVisitor {
  return (visit) => {
    for (const [x, z] of points) visit(x, z);
  };
}

/** Minimal OrbitControls stand-in: applies the polar/azimuth/distance limits and looks at the target. */
function createControls(camera: THREE.PerspectiveCamera): MapOrbitControls {
  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();
  const controls: MapOrbitControls = {
    target: new THREE.Vector3(),
    enabled: true,
    enableZoom: true,
    screenSpacePanning: true,
    minDistance: 15,
    maxDistance: 130,
    minPolarAngle: 0,
    maxPolarAngle: Math.PI,
    minAzimuthAngle: -Infinity,
    maxAzimuthAngle: Infinity,
    update: () => {
      offset.subVectors(camera.position, controls.target);
      spherical.setFromVector3(offset);
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);
      spherical.theta = THREE.MathUtils.clamp(spherical.theta, controls.minAzimuthAngle, controls.maxAzimuthAngle);
      spherical.radius = THREE.MathUtils.clamp(spherical.radius, controls.minDistance, controls.maxDistance);
      offset.setFromSpherical(spherical);
      camera.position.copy(controls.target).add(offset);
      camera.lookAt(controls.target);
      return true;
    },
  };
  return controls;
}

function createRig(width = 852, height = 393) {
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  const surfaceTarget = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  });
  const surface = surfaceTarget as unknown as HTMLElement;
  const controls = createControls(camera);
  const rig = new MapCameraController(camera, controls, surface);
  return { camera, controls, surface, rig };
}

function viewBoxOf(camera: THREE.PerspectiveCamera): ViewBox {
  const box: ViewBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  assert.ok(measureViewBox(camera, box));
  return box;
}

/** The bounds allowed for the camera's current elevation (more slack when it looks across the field). */
function allowedBoundsOf(camera: THREE.PerspectiveCamera, target = new THREE.Vector3()): FocusBounds {
  const offset = new THREE.Vector3().subVectors(camera.position, target);
  const elevation = Math.asin(offset.y / offset.length());
  return viewBoundsForElevation(elevation, { minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
}

function assertViewInsideMap(camera: THREE.PerspectiveCamera, bounds: FocusBounds): void {
  const box = viewBoxOf(camera);
  const epsilon = 1e-3;
  assert.ok(box.minX >= bounds.minX - epsilon && box.maxX <= bounds.maxX + epsilon,
    `view x ${box.minX}..${box.maxX} leaves the map`);
  assert.ok(box.minZ >= bounds.minZ - epsilon && box.maxZ <= bounds.maxZ + epsilon,
    `view z ${box.minZ}..${box.maxZ} leaves the map`);
}

test('zoomTowardPoint keeps the anchor fixed and preserves the view direction', () => {
  const position = new THREE.Vector3(0, 50, 50);
  const target = new THREE.Vector3(0, 0, 0);
  const anchor = new THREE.Vector3(20, 0, 10);
  const directionBefore = new THREE.Vector3().subVectors(position, anchor).normalize();

  zoomTowardPoint(position, target, anchor, 0.5, 15, 130);

  assertVectorClose(position, new THREE.Vector3(10, 25, 30));
  assertVectorClose(target, new THREE.Vector3(10, 0, 5));
  const directionAfter = new THREE.Vector3().subVectors(position, anchor).normalize();
  assertVectorClose(directionAfter, directionBefore);
});

test('zoomTowardPoint limits the camera-target distance to the controls range', () => {
  const position = new THREE.Vector3(0, 0, 20);
  const target = new THREE.Vector3(0, 0, 0);
  zoomTowardPoint(position, target, new THREE.Vector3(0, 0, 0), 0.1, 15, 130);
  assert.ok(Math.abs(position.distanceTo(target) - 15) < 1e-9);
  zoomTowardPoint(position, target, new THREE.Vector3(0, 0, 0), 100, 15, 130);
  assert.ok(Math.abs(position.distanceTo(target) - 130) < 1e-9);
});

test('orientation: portrait looks up the map, landscape looks across it with the player on the left', () => {
  assert.equal(baseAzimuthFor(393 / 852), PORTRAIT_AZIMUTH);
  assert.equal(baseAzimuthFor(852 / 393), LANDSCAPE_AZIMUTH);

  const { camera, rig } = createRig(852, 393);
  try {
    rig.reset();
    const player = new THREE.Vector3(0, 0, 60).project(camera);
    const enemy = new THREE.Vector3(0, 0, -60).project(camera);
    assert.ok(player.x < enemy.x, 'player Nexus should be left of the enemy Nexus in landscape');
  } finally {
    rig.dispose();
  }
});

test('the camera tilts down as it zooms out', () => {
  assert.ok(elevationForDistance(20) < elevationForDistance(60));
  assert.ok(elevationForDistance(60) < elevationForDistance(90));
  assert.equal(elevationForDistance(200), elevationForDistance(90));
});

test('clampViewToBounds slides a view that looks past the back edge onto the map', () => {
  const camera = new THREE.PerspectiveCamera(45, 393 / 852, 0.1, 1000);
  const target = new THREE.Vector3(0, 0, 70);
  camera.position.copy(viewDirection(PORTRAIT_AZIMUTH, elevationForDistance(68), new THREE.Vector3()))
    .multiplyScalar(68).add(target);
  camera.lookAt(target);
  assert.ok(viewBoxOf(camera).maxZ > MAP_FOCUS_BOUNDS.maxZ, 'precondition: view starts past the edge');

  clampViewToBounds(camera, target, MAP_FOCUS_BOUNDS);
  assertViewInsideMap(camera, MAP_FOCUS_BOUNDS);
  assert.ok(target.z < 70);
});

test('computeMaxViewDistance keeps the whole view within the allowed bounds', () => {
  for (const [aspect, azimuth] of [[852 / 393, LANDSCAPE_AZIMUTH], [393 / 852, PORTRAIT_AZIMUTH]] as const) {
    const max = computeMaxViewDistance(45, aspect, azimuth, 15);
    assert.ok(max > 40, `max distance ${max} is too close to be useful`);
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    const target = new THREE.Vector3();
    camera.position.copy(viewDirection(azimuth, elevationForDistance(max), new THREE.Vector3())).multiplyScalar(max);
    camera.lookAt(target);
    // It fits, so sliding it over the allowed area leaves nothing outside.
    const bounds = allowedBoundsOf(camera, target);
    clampViewToBounds(camera, target, bounds);
    assertViewInsideMap(camera, bounds);
  }
});

test('reset starts over the map with rotation limited around the base orientation', () => {
  for (const [width, height, view, azimuth] of [
    [852, 393, START_VIEW_LANDSCAPE, LANDSCAPE_AZIMUTH],
    [393, 852, START_VIEW_PORTRAIT, PORTRAIT_AZIMUTH],
  ] as const) {
    const { camera, controls, rig } = createRig(width, height);
    try {
      rig.reset();
      assertViewInsideMap(camera, allowedBoundsOf(camera, controls.target));
      assert.ok(Math.abs(controls.minAzimuthAngle - (azimuth - AZIMUTH_RANGE)) < 1e-9);
      assert.ok(Math.abs(controls.maxAzimuthAngle - (azimuth + AZIMUTH_RANGE)) < 1e-9);
      const distance = camera.position.distanceTo(controls.target);
      assert.ok(Math.abs(distance - Math.min(view.distance, rig.maxViewDistance)) < 1e-6);
    } finally {
      rig.dispose();
    }
  }
});

test('looking across the field allows more room past the map edge than looking down', () => {
  const low = viewSlackForElevation(THREE.MathUtils.degToRad(35));
  const mid = viewSlackForElevation(THREE.MathUtils.degToRad(55));
  const top = viewSlackForElevation(THREE.MathUtils.degToRad(75));
  assert.equal(low, VIEW_SLACK_LOW_ANGLE);
  assert.ok(mid < low && mid > top);
  assert.equal(top, VIEW_SLACK_TOP_DOWN);
});

test('a one-finger drag may tilt the camera around the zoom default', () => {
  const { camera, controls, rig } = createRig(852, 393);
  try {
    rig.reset();
    rig.update(1 / 60);
    const distance = camera.position.distanceTo(controls.target);
    const polar = Math.PI / 2 - elevationForDistance(distance);
    assert.ok(controls.minPolarAngle < polar - 0.1 && controls.maxPolarAngle > polar + 0.1,
      'the tilt range should open around the default tilt');
  } finally {
    rig.dispose();
  }
});

test('double-tap focus distance toggles between near and far views', () => {
  assert.equal(focusDistanceFor(70.7), FOCUS_NEAR_DISTANCE);
  assert.equal(focusDistanceFor(FOCUS_NEAR_DISTANCE), FOCUS_FAR_DISTANCE);
});

test('measureActionFrame reports the center and extents in the camera axes', () => {
  const frame: ActionFrame = { count: 0, centerX: 0, centerZ: 0, halfWidth: 0, halfDepth: 0 };
  const points = pointsOf([[-10, 0], [10, 0], [0, 20]]);

  measureActionFrame(points, PORTRAIT_AZIMUTH, frame);
  assert.equal(frame.count, 3);
  assert.ok(Math.abs(frame.centerX) < 1e-9 && Math.abs(frame.centerZ - 10) < 1e-9);
  assert.ok(Math.abs(frame.halfWidth - 10) < 1e-9 && Math.abs(frame.halfDepth - 10) < 1e-9);

  // Sideways (landscape) the map's z axis runs across the screen.
  measureActionFrame(points, LANDSCAPE_AZIMUTH, frame);
  assert.ok(Math.abs(frame.centerX) < 1e-9 && Math.abs(frame.centerZ - 10) < 1e-9);
  assert.ok(Math.abs(frame.halfWidth - 10) < 1e-9 && Math.abs(frame.halfDepth - 10) < 1e-9);

  measureActionFrame(pointsOf([]), PORTRAIT_AZIMUTH, frame);
  assert.equal(frame.count, 0);
});

test('computeFitDistance grows with the spread of the action and respects its limits', () => {
  const options: FitDistanceOptions = {
    fovDegrees: 45,
    aspect: 16 / 9,
    elevationSine: 0.8,
    margin: 1.3,
    minDistance: 48,
    maxDistance: 70,
  };
  assert.equal(computeFitDistance(0, 0, options), 48);
  const wide = computeFitDistance(30, 5, options);
  assert.ok(wide > 48 && wide < 70, `expected a fitted distance, got ${wide}`);
  assert.equal(computeFitDistance(200, 200, options), 70);
});

test('auto mode follows the fighting and returns to the base when it ends', () => {
  const { camera, controls, rig } = createRig(852, 393);
  try {
    let fighting: Array<readonly [number, number]> = [];
    rig.setAutoZoomSource((visit) => {
      for (const [x, z] of fighting) visit(x, z);
    });
    rig.reset();
    const home = controls.target.clone();

    // A fight breaks out on the right flank of the center line.
    fighting = [[25, -5], [30, 5], [20, 0]];
    for (let i = 0; i < 900; i++) rig.update(1 / 60);
    const atFight = controls.target.clone();
    assert.ok(atFight.distanceTo(new THREE.Vector3(25, 0, 0)) < atFight.distanceTo(home),
      `focus ${atFight.toArray()} should have moved toward the fight`);
    assertViewInsideMap(camera, allowedBoundsOf(camera, controls.target));

    // The fight moves to the other flank and the camera follows it.
    fighting = [[-25, -5], [-30, 5], [-20, 0]];
    for (let i = 0; i < 900; i++) rig.update(1 / 60);
    assert.ok(controls.target.x < atFight.x - 10, `focus x ${controls.target.x} should follow the fight`);

    // No more fighting: after a short delay the camera returns home.
    fighting = [];
    for (let i = 0; i < 1800; i++) rig.update(1 / 60);
    assert.ok(controls.target.distanceTo(home) < 3, `focus ${controls.target.toArray()} should be back home`);
    assert.equal(rig.autoZoomEnabled, true);
  } finally {
    rig.dispose();
  }
});

test('manual zoom, pan and double tap turn auto mode off; reset and the toggle turn it back on', () => {
  const { surface, rig } = createRig();
  const changes: boolean[] = [];
  rig.onAutoZoomChange = (enabled) => changes.push(enabled);
  const pointer = (type: string, id: number, x: number, y: number) => {
    const event = new Event(type);
    Object.defineProperties(event, {
      pointerId: { value: id },
      pointerType: { value: 'touch' },
      clientX: { value: x },
      clientY: { value: y },
      buttons: { value: 1 },
    });
    surface.dispatchEvent(event);
  };
  try {
    rig.reset();
    assert.equal(rig.autoZoomEnabled, true);

    const wheel = new Event('wheel', { cancelable: true });
    Object.defineProperties(wheel, { deltaY: { value: 100 }, clientX: { value: 400 }, clientY: { value: 200 } });
    surface.dispatchEvent(wheel);
    assert.equal(rig.autoZoomEnabled, false);

    rig.setAutoZoomEnabled(true);
    // Two fingers dragged together (a pan) also take over from auto mode.
    pointer('pointerdown', 1, 300, 200);
    pointer('pointerdown', 2, 400, 200);
    pointer('pointermove', 1, 330, 200);
    pointer('pointermove', 2, 430, 200);
    assert.equal(rig.autoZoomEnabled, false);
    pointer('pointerup', 1, 330, 200);
    pointer('pointerup', 2, 430, 200);

    rig.setAutoZoomEnabled(true);
    rig.focusOn(new THREE.Vector3(0, 0, 0));
    assert.equal(rig.autoZoomEnabled, false);

    rig.reset();
    assert.equal(rig.autoZoomEnabled, true);
    assert.deepEqual(changes, [true, false, true, false, true, false, true]);
  } finally {
    rig.dispose();
  }
});
