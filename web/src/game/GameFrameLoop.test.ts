import assert from 'node:assert/strict';
import test from 'node:test';
import { GameFrameLoop } from './GameFrameLoop.ts';
import type { FrameScheduler } from './GameFrameLoop.ts';

class TestScheduler implements FrameScheduler {
  #nextHandle = 1;
  readonly callbacks = new Map<number, (timestamp: number) => void>();

  request(callback: (timestamp: number) => void): number {
    const handle = this.#nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  frame(timestamp: number): void {
    const [handle, callback] = this.callbacks.entries().next().value ?? [];
    if (handle === undefined || !callback) throw new Error('No scheduled frame');
    this.callbacks.delete(handle);
    callback(timestamp);
  }
}

test('frame loop schedules one callback chain and caps long frame deltas', () => {
  const scheduler = new TestScheduler();
  const frames: number[] = [];
  const loop = new GameFrameLoop(({ deltaSeconds }) => frames.push(deltaSeconds), scheduler);

  loop.start();
  loop.start();
  assert.equal(scheduler.callbacks.size, 1);
  scheduler.frame(100);
  scheduler.frame(150);
  scheduler.frame(10_150);

  assert.deepEqual(frames, [0, 0.05, 0.1]);
  assert.equal(scheduler.callbacks.size, 1);
  loop.stop();
  loop.stop();
  assert.equal(scheduler.callbacks.size, 0);
  assert.equal(loop.running, false);
});

test('resetting delta prevents a background interval from advancing simulation', () => {
  const scheduler = new TestScheduler();
  const frames: number[] = [];
  const loop = new GameFrameLoop(({ deltaSeconds }) => frames.push(deltaSeconds), scheduler);
  loop.start();
  scheduler.frame(100);
  scheduler.frame(116);
  loop.resetDelta();
  scheduler.frame(60_000);

  assert.deepEqual(frames, [0, 0.016, 0]);
  loop.stop();
});
