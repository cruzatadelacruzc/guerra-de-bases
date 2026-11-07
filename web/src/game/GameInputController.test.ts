import assert from 'node:assert/strict';
import test from 'node:test';
import { exceedsTapTolerance, GameInputController, isDoubleTap } from './GameInputController.ts';

test('input listeners attach once, detach cleanly, and can be reattached', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  const canvasTarget = new EventTarget();
  Object.defineProperty(documentTarget, 'visibilityState', {
    configurable: true,
    value: 'visible',
    writable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: windowTarget as unknown as Window,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: documentTarget as unknown as Document,
  });

  let clickCount = 0;
  const controller = new GameInputController(canvasTarget as unknown as HTMLCanvasElement, {
    onPointerMove: () => {},
    onPointerDown: () => { clickCount++; },
    onPointerUp: () => {},
    onPointerCancel: () => {},
    onEscape: () => {},
    onCancelPlacement: () => false,
    onNativeBack: () => false,
    onApplicationInactive: () => {},
    onApplicationActive: () => {},
  });

  try {
    controller.attach();
    controller.attach();
    canvasTarget.dispatchEvent(new Event('pointerdown'));
    assert.equal(clickCount, 1);

    controller.detach();
    canvasTarget.dispatchEvent(new Event('pointerdown'));
    assert.equal(clickCount, 1);

    controller.attach();
    canvasTarget.dispatchEvent(new Event('pointerdown'));
    assert.equal(clickCount, 2);
  } finally {
    controller.detach();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('construction input comes from a canvas pointerdown+pointerup tap, not a compatibility click', () => {
  // Finding G: placement/demolish used to commit on raw `pointerdown`, which
  // fires before a one-finger camera-orbit drag has moved at all. The commit
  // now happens on `pointerup` (see GameApplication.ts's onPointerUp), gated
  // by a movement tolerance from the matching `pointerdown` - this test
  // covers the event-plumbing half of that: the commit action still comes
  // from exactly one canvas-scoped mechanism, immune to a global
  // compatibility `click` event firing afterward. The movement-tolerance
  // math itself is covered by the `exceedsTapTolerance` tests below, since
  // GameInputController forwards pointer events verbatim and has no
  // movement logic of its own to exercise here.
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  const canvasTarget = new EventTarget();
  Object.defineProperty(documentTarget, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: windowTarget as unknown as Window,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: documentTarget as unknown as Document,
  });

  let placementCount = 0;
  const controller = new GameInputController(
    canvasTarget as unknown as HTMLCanvasElement,
    {
      onPointerMove: () => {},
      onPointerDown: () => {},
      onPointerUp: () => { placementCount++; },
      onPointerCancel: () => {},
      onEscape: () => {},
      onCancelPlacement: () => false,
      onNativeBack: () => false,
      onApplicationInactive: () => {},
      onApplicationActive: () => {},
    }
  );

  try {
    controller.attach();
    canvasTarget.dispatchEvent(new Event('pointerdown'));
    canvasTarget.dispatchEvent(new Event('pointerup'));
    windowTarget.dispatchEvent(new Event('click'));
    assert.equal(placementCount, 1);
  } finally {
    controller.detach();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('exceedsTapTolerance distinguishes a stationary tap from a drag-like gesture', () => {
  // A pointerup at (nearly) the same coordinates as the pointerdown is a tap.
  assert.equal(exceedsTapTolerance(100, 100, 100, 100, 10), false);
  assert.equal(exceedsTapTolerance(100, 100, 104, 103, 10), false);

  // A pointerup offset by several tens of pixels (a one-finger orbit/pan
  // drag starting on the canvas) must exceed the tolerance.
  assert.equal(exceedsTapTolerance(100, 100, 140, 100, 10), true);
  assert.equal(exceedsTapTolerance(100, 100, 100, 160, 10), true);

  // Exactly at the tolerance boundary is not considered a drag.
  assert.equal(exceedsTapTolerance(0, 0, 10, 0, 10), false);
});

test('isDoubleTap requires a previous tap close in time and space', () => {
  const first = { timeMs: 1000, x: 100, y: 100 };
  assert.equal(isDoubleTap(null, first, 300, 30), false);
  assert.equal(isDoubleTap(first, { timeMs: 1250, x: 110, y: 115 }, 300, 30), true);
  assert.equal(isDoubleTap(first, { timeMs: 1300, x: 100, y: 100 }, 300, 30), true);
  assert.equal(isDoubleTap(first, { timeMs: 1301, x: 100, y: 100 }, 300, 30), false);
  assert.equal(isDoubleTap(first, { timeMs: 1100, x: 140, y: 100 }, 300, 30), false);
  assert.equal(isDoubleTap(first, { timeMs: 900, x: 100, y: 100 }, 300, 30), false);
});

test('a second finger cancels the pending tap instead of starting a new one', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const canvasTarget = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() as unknown as Window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: new EventTarget() as unknown as Document });

  let downs = 0;
  let cancels = 0;
  const controller = new GameInputController(canvasTarget as unknown as HTMLCanvasElement, {
    onPointerMove: () => {},
    onPointerDown: () => { downs++; },
    onPointerUp: () => {},
    onPointerCancel: () => { cancels++; },
    onEscape: () => {},
    onCancelPlacement: () => false,
    onNativeBack: () => false,
    onApplicationInactive: () => {},
    onApplicationActive: () => {},
  });

  try {
    controller.attach();
    const pointerDown = (isPrimary: boolean) => {
      const event = new Event('pointerdown');
      Object.defineProperties(event, { isPrimary: { value: isPrimary }, pointerType: { value: 'touch' } });
      canvasTarget.dispatchEvent(event);
    };
    pointerDown(true);
    pointerDown(false);
    assert.equal(downs, 1);
    assert.equal(cancels, 1);
  } finally {
    controller.detach();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
