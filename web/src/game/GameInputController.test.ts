import assert from 'node:assert/strict';
import test from 'node:test';
import { GameInputController } from './GameInputController.ts';

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

test('construction input comes from one primary canvas pointerdown, not a compatibility click', () => {
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
      onPointerDown: () => { placementCount++; },
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
