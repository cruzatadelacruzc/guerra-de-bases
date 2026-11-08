import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CountUpAnimator,
  countValueAt,
  formatClockDuration,
  parseClockDuration,
  type CountUpTarget,
  type FrameScheduler,
} from './countUp.ts';

class FakeScheduler implements FrameScheduler {
  time = 0;
  #next = 1;
  readonly #callbacks = new Map<number, (now: number) => void>();

  request(callback: (now: number) => void): number {
    const handle = this.#next++;
    this.#callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.#callbacks.delete(handle);
  }

  now(): number {
    return this.time;
  }

  /** Advances time frame by frame (16 ms steps), running due callbacks. */
  advance(ms: number): void {
    const end = this.time + ms;
    while (this.time < end) {
      this.time = Math.min(end, this.time + 16);
      const due = [...this.#callbacks.entries()];
      this.#callbacks.clear();
      for (const [, callback] of due) callback(this.time);
    }
  }
}

function target(to: number, format: (value: number) => string = String): CountUpTarget & { element: { textContent: string | null } } {
  return { element: { textContent: null }, to, format };
}

test('clock durations round-trip, including long matches', () => {
  assert.equal(parseClockDuration('04:37'), 277);
  assert.equal(parseClockDuration('123:05'), 7385);
  assert.equal(formatClockDuration(277), '04:37');
  assert.equal(formatClockDuration(7385), '123:05');
});

test('unparseable durations are rejected', () => {
  assert.equal(parseClockDuration(''), null);
  assert.equal(parseClockDuration('4:7'), null);
  assert.equal(parseClockDuration('aa:bb'), null);
  assert.equal(parseClockDuration('04:60'), null);
});

test('count values start at zero, end exact and handle zero targets', () => {
  assert.equal(countValueAt(64, 0), 0);
  assert.equal(countValueAt(64, 1), 64);
  assert.equal(countValueAt(64, 2), 64);
  assert.equal(countValueAt(64, -1), 0);
  assert.equal(countValueAt(0, 0.5), 0);
});

test('animator writes exact final values when the duration elapses', () => {
  const scheduler = new FakeScheduler();
  const percent = target(64, (value) => `${value}%`);
  const clock = target(277, formatClockDuration);
  new CountUpAnimator(scheduler).start([percent, clock], { durationMs: 1100, reducedMotion: false });

  scheduler.advance(400);
  const midway = Number.parseInt(percent.element.textContent ?? '', 10);
  assert.ok(midway > 0 && midway < 64, `expected an intermediate value, got ${percent.element.textContent}`);

  scheduler.advance(800);
  assert.equal(percent.element.textContent, '64%');
  assert.equal(clock.element.textContent, '04:37');
});

test('reduced motion writes final values immediately', () => {
  const scheduler = new FakeScheduler();
  const soldiers = target(23);
  new CountUpAnimator(scheduler).start([soldiers], { durationMs: 1100, reducedMotion: true });
  assert.equal(soldiers.element.textContent, '23');
});

test('a second start cancels the first animation', () => {
  const scheduler = new FakeScheduler();
  const animator = new CountUpAnimator(scheduler);
  const first = target(100);
  animator.start([first], { durationMs: 1100, reducedMotion: false });
  scheduler.advance(300);
  const frozen = first.element.textContent;

  const second = target(7);
  animator.start([second], { durationMs: 1100, reducedMotion: false });
  scheduler.advance(1200);

  assert.equal(first.element.textContent, frozen);
  assert.equal(second.element.textContent, '7');
});

test('cancel stops further updates', () => {
  const scheduler = new FakeScheduler();
  const animator = new CountUpAnimator(scheduler);
  const losses = target(11);
  animator.start([losses], { durationMs: 1100, reducedMotion: false });
  scheduler.advance(200);
  const frozen = losses.element.textContent;
  animator.cancel();
  scheduler.advance(1200);
  assert.equal(losses.element.textContent, frozen);
});
