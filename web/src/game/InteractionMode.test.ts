import assert from 'node:assert/strict';
import test from 'node:test';
import { NO_INTERACTION, nextInteractionMode } from './InteractionMode.ts';
import type { InteractionEvent, InteractionMode } from './InteractionMode.ts';

const placingGenerator: InteractionMode = { kind: 'placing', structure: 'generator' };
const selling: InteractionMode = { kind: 'selling' };
const confirming: InteractionMode = { kind: 'confirmingSale', entity: 7, structure: 'barracks', refund: 105 };
const pick: InteractionEvent = { type: 'pickStructure', entity: 9, structure: 'turret', refund: 70 };

test('NO_INTERACTION is a frozen none mode', () => {
  assert.deepEqual(NO_INTERACTION, { kind: 'none' });
  assert.ok(Object.isFrozen(NO_INTERACTION));
});

test('none + selectStructure enters placing', () => {
  assert.deepEqual(
    nextInteractionMode(NO_INTERACTION, { type: 'selectStructure', structure: 'generator' }),
    placingGenerator
  );
});

test('placing + selectStructure of the same structure goes back to none', () => {
  assert.deepEqual(
    nextInteractionMode(placingGenerator, { type: 'selectStructure', structure: 'generator' }),
    NO_INTERACTION
  );
});

test('placing + selectStructure of another structure switches', () => {
  assert.deepEqual(
    nextInteractionMode(placingGenerator, { type: 'selectStructure', structure: 'turret' }),
    { kind: 'placing', structure: 'turret' }
  );
});

test('selling and confirmingSale + selectStructure leave for placing', () => {
  const expected = { kind: 'placing', structure: 'turret' };
  assert.deepEqual(nextInteractionMode(selling, { type: 'selectStructure', structure: 'turret' }), expected);
  assert.deepEqual(nextInteractionMode(confirming, { type: 'selectStructure', structure: 'turret' }), expected);
});

test('none and placing + toggleSell enter selling', () => {
  assert.deepEqual(nextInteractionMode(NO_INTERACTION, { type: 'toggleSell' }), selling);
  assert.deepEqual(nextInteractionMode(placingGenerator, { type: 'toggleSell' }), selling);
});

test('selling and confirmingSale + toggleSell go to none', () => {
  assert.deepEqual(nextInteractionMode(selling, { type: 'toggleSell' }), NO_INTERACTION);
  assert.deepEqual(nextInteractionMode(confirming, { type: 'toggleSell' }), NO_INTERACTION);
});

test('selling and confirmingSale + pickStructure go to confirmingSale of the pick', () => {
  const expected = { kind: 'confirmingSale', entity: 9, structure: 'turret', refund: 70 };
  assert.deepEqual(nextInteractionMode(selling, pick), expected);
  assert.deepEqual(nextInteractionMode(confirming, pick), expected);
});

test('none and placing ignore pickStructure', () => {
  assert.equal(nextInteractionMode(NO_INTERACTION, pick), NO_INTERACTION);
  assert.equal(nextInteractionMode(placingGenerator, pick), placingGenerator);
});

test('placing + built goes to none', () => {
  assert.deepEqual(nextInteractionMode(placingGenerator, { type: 'built' }), NO_INTERACTION);
});

test('confirmingSale + saleConfirmed or targetGone returns to selling', () => {
  assert.deepEqual(nextInteractionMode(confirming, { type: 'saleConfirmed' }), selling);
  assert.deepEqual(nextInteractionMode(confirming, { type: 'targetGone' }), selling);
});

test('cancel and reset go to none from every mode', () => {
  for (const mode of [NO_INTERACTION, placingGenerator, selling, confirming]) {
    assert.deepEqual(nextInteractionMode(mode, { type: 'cancel' }), NO_INTERACTION);
    assert.deepEqual(nextInteractionMode(mode, { type: 'reset' }), NO_INTERACTION);
  }
});

test('back leaves confirmingSale for selling and placing or selling for none', () => {
  assert.deepEqual(nextInteractionMode(confirming, { type: 'back' }), selling);
  assert.deepEqual(nextInteractionMode(placingGenerator, { type: 'back' }), NO_INTERACTION);
  assert.deepEqual(nextInteractionMode(selling, { type: 'back' }), NO_INTERACTION);
});

test('events without a row return the very same object', () => {
  const noRow: ReadonlyArray<readonly [InteractionMode, InteractionEvent]> = [
    [NO_INTERACTION, { type: 'built' }],
    [NO_INTERACTION, { type: 'saleConfirmed' }],
    [NO_INTERACTION, { type: 'targetGone' }],
    [NO_INTERACTION, { type: 'back' }],
    [placingGenerator, { type: 'saleConfirmed' }],
    [placingGenerator, { type: 'targetGone' }],
    [selling, { type: 'built' }],
    [selling, { type: 'saleConfirmed' }],
    [selling, { type: 'targetGone' }],
    [confirming, { type: 'built' }]
  ];
  for (const [mode, event] of noRow) {
    assert.equal(nextInteractionMode(mode, event), mode, `${mode.kind} + ${event.type}`);
  }
});
