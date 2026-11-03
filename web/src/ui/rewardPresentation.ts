import type { RewardId } from './contracts.ts';

const ICON_PATHS: Readonly<Record<RewardId, readonly string[]>> = {
  artillery_strike: [
    'M3 19 10 12',
    'M8 20 15 13',
    'm14 7 3-3 3 3-3 3',
    'M17 7 9 15',
    'M5 5h4M7 3v4'
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
  if (id === 'air_strike') return 'ATAQUE AÉREO';
  return 'DEFENSA DEL NEXO';
}

export function getRewardEffect(id: RewardId): string {
  if (id === 'artillery_strike') return '3 impactos de artillería · 120 de daño por impacto.';
  if (id === 'air_strike') return '4 bombas en ruta · 220 de daño por impacto.';
  return 'Reduce 50% del daño al Nexo durante 10 s.';
}
