import assert from 'node:assert/strict';
import test from 'node:test';
import { NO_BACKDROP_BLUR_CSS } from './backdropBlur.ts';

test('the no-blur stylesheet clears both backdrop filter properties everywhere', () => {
  assert.match(NO_BACKDROP_BLUR_CSS, /^\*, \*::before, \*::after \{/);
  assert.match(NO_BACKDROP_BLUR_CSS, /(^|[^-])backdrop-filter: none !important;/);
  assert.match(NO_BACKDROP_BLUR_CSS, /-webkit-backdrop-filter: none !important;/);
});
