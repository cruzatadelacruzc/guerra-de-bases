import { getRewardDefinitionForDifficulty, getStrikePattern } from '../game/rewardSystem.ts';
import type { Difficulty, RewardId } from './contracts.ts';
import type { UiIconId } from './uiIcons.ts';

const ICON_PATHS: Readonly<Record<RewardId, readonly string[]>> = {
  // A field cannon: angled barrel on a wheel, with a muzzle flash.
  artillery_strike: [
    'M5.5 15.5 16 7l2 2.5-10.5 8.5',
    'M11 18.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z',
    'M9.5 21H18',
    'M19 4l1.5-1.5M21 7h1.5M17.5 2.5V1'
  ],
  air_strike: [
    'm2 12 20-8-7 18-3-7-10-3Z',
    'm12 15 4-4'
  ],
  defensive_shield: [
    'M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z',
    'm8.5 12 2.2 2.2 4.8-5'
  ]
};

export function createRewardIcon(id: RewardId): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('reward-icon');
  for (const pathData of ICON_PATHS[id]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    icon.append(path);
  }
  return icon;
}

export function getRewardCategory(id: RewardId): string {
  if (id === 'artillery_strike') return 'ATAQUE DE ÁREA';
  if (id === 'air_strike') return 'APOYO AÉREO';
  return 'DEFENSA DEL NEXO';
}

export interface RewardFact {
  icon: UiIconId;
  value: string;
  label: string;
}

/** Short, icon-led facts for a reward card, read from the gameplay definitions. */
export function getRewardFacts(id: RewardId, difficulty: Difficulty): readonly RewardFact[] {
  if (id === 'defensive_shield') {
    const shield = getRewardDefinitionForDifficulty(id, difficulty);
    return [
      { icon: 'shield', value: `−${Math.round((shield.reduction ?? 0) * 100)}%`, label: 'daño' },
      { icon: 'clock', value: `${shield.durationSeconds} s`, label: '' },
    ];
  }
  const pattern = getStrikePattern(id, difficulty);
  return [
    id === 'artillery_strike'
      ? { icon: 'target', value: String(pattern.impacts.length), label: 'impactos' }
      : { icon: 'bomb', value: String(pattern.impacts.length), label: 'bombas' },
    {
      icon: 'burst',
      value: String(pattern.damagePerImpact),
      label: id === 'artillery_strike' ? 'daño por impacto' : 'daño por bomba',
    },
  ];
}

