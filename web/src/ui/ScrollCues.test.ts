import assert from 'node:assert/strict';
import test from 'node:test';
import { getScrollCueState } from './ScrollCues.ts';

test('only the down cue shows at the top of a long list', () => {
  assert.deepEqual(
    getScrollCueState({ scrollTop: 0, clientHeight: 300, scrollHeight: 600 }),
    { canScrollUp: false, canScrollDown: true }
  );
});

test('both cues show in the middle', () => {
  assert.deepEqual(
    getScrollCueState({ scrollTop: 150, clientHeight: 300, scrollHeight: 600 }),
    { canScrollUp: true, canScrollDown: true }
  );
});

test('only the up cue shows at the bottom, including sub-pixel ends', () => {
  assert.deepEqual(
    getScrollCueState({ scrollTop: 296.5, clientHeight: 300, scrollHeight: 600 }),
    { canScrollUp: true, canScrollDown: false }
  );
});

test('no cue when everything fits or within the threshold', () => {
  assert.deepEqual(
    getScrollCueState({ scrollTop: 0, clientHeight: 300, scrollHeight: 300 }),
    { canScrollUp: false, canScrollDown: false }
  );
  assert.deepEqual(
    getScrollCueState({ scrollTop: 3, clientHeight: 300, scrollHeight: 302 }),
    { canScrollUp: false, canScrollDown: false }
  );
});
