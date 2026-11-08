import assert from 'node:assert/strict';
import test from 'node:test';
import { createNexusDamageAlert } from './nexusDamageAlert.ts';

test('alerts when the Nexus loses health', () => {
  const alert = createNexusDamageAlert(6000);
  assert.equal(alert.report(1000, 990, 0), true);
});

test('does not alert when health stays the same or recovers', () => {
  const alert = createNexusDamageAlert(6000);
  assert.equal(alert.report(1000, 1000, 0), false);
  assert.equal(alert.report(900, 950, 0), false);
});

test('stays quiet during the cooldown and alerts again after it', () => {
  const alert = createNexusDamageAlert(6000);
  assert.equal(alert.report(1000, 990, 0), true);
  assert.equal(alert.report(990, 980, 5999), false);
  assert.equal(alert.report(980, 970, 6000), true);
});

test('reset clears the cooldown for a new match', () => {
  const alert = createNexusDamageAlert(6000);
  alert.report(1000, 990, 0);
  alert.reset();
  assert.equal(alert.report(990, 980, 10), true);
});
