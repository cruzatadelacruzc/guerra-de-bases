import assert from 'node:assert/strict';
import test from 'node:test';
import { GameInputController } from './GameInputController.ts';

test('input listeners attach once, detach cleanly, and can be reattached', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
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
  const controller = new GameInputController({
    onPointerMove: () => {},
    onPointerClick: () => { clickCount++; },
    onEscape: () => {},
    onCancelPlacement: () => false,
    onNativeBack: () => false,
    onApplicationInactive: () => {},
  });

  try {
    controller.attach();
    controller.attach();
    windowTarget.dispatchEvent(new Event('click'));
    assert.equal(clickCount, 1);

    controller.detach();
    windowTarget.dispatchEvent(new Event('click'));
    assert.equal(clickCount, 1);

    controller.attach();
    windowTarget.dispatchEvent(new Event('click'));
    assert.equal(clickCount, 2);
  } finally {
    controller.detach();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
