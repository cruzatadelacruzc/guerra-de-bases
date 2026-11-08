import assert from 'node:assert/strict';
import test from 'node:test';
import { getRewardCategory, getRewardFacts } from './rewardPresentation.ts';
import { uiIconMarkup } from './uiIcons.ts';

test('artillery facts come from the strike pattern and damage', () => {
  assert.deepEqual(getRewardFacts('artillery_strike', 'normal'), [
    { icon: 'target', value: '3', label: 'impactos' },
    { icon: 'burst', value: '120', label: 'daño por impacto' },
  ]);
});

test('air strike facts list bombs and damage', () => {
  assert.deepEqual(getRewardFacts('air_strike', 'hard'), [
    { icon: 'bomb', value: '4', label: 'bombas' },
    { icon: 'burst', value: '220', label: 'daño por bomba' },
  ]);
});

test('shield facts show reduction and duration', () => {
  assert.deepEqual(getRewardFacts('defensive_shield', 'easy'), [
    { icon: 'shield', value: '−50%', label: 'daño' },
    { icon: 'clock', value: '10 s', label: '' },
  ]);
});

test('ui icon markup is an accessible-hidden svg', () => {
  const svg = uiIconMarkup('clock', 'extra');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 24 24"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /class="ui-icon extra"/);
});

test('reward categories never repeat the reward name', () => {
  assert.equal(getRewardCategory('artillery_strike'), 'ATAQUE DE ÁREA');
  assert.equal(getRewardCategory('air_strike'), 'APOYO AÉREO');
  assert.equal(getRewardCategory('defensive_shield'), 'DEFENSA DEL NEXO');
});
