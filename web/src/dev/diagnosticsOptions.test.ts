import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDiagnosticsOptions } from './diagnosticsOptions.ts';

test('without extra parameters every effect is on and nothing runs by itself', () => {
  assert.deepEqual(parseDiagnosticsOptions('?diagnostics=1'), {
    overlay: true,
    maxPixelRatio: undefined,
    shockwaves: true,
    smoke: true,
    blur: true,
    bars: true,
    scenario: undefined
  });
});

test('the measurement switches are read from the query string', () => {
  assert.deepEqual(parseDiagnosticsOptions('?diagnostics=1&dpr=0.75&shockwaves=0&smoke=0&blur=0&bars=0&scenario=combat&overlay=0'), {
    overlay: false,
    maxPixelRatio: 0.75,
    shockwaves: false,
    smoke: false,
    blur: false,
    bars: false,
    scenario: 'combat'
  });
  assert.equal(parseDiagnosticsOptions('?scenario=match').scenario, 'match');
});

test('invalid values fall back to the defaults', () => {
  for (const dpr of ['0', '-1', '9', 'abc', '']) {
    assert.equal(parseDiagnosticsOptions(`?dpr=${dpr}`).maxPixelRatio, undefined, dpr);
  }
  assert.equal(parseDiagnosticsOptions('?scenario=stress-all').scenario, undefined);
  assert.equal(parseDiagnosticsOptions('?smoke=no').smoke, true);
});
