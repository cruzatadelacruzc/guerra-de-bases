export type UiIconId =
  | 'bolt'
  | 'coin'
  | 'target'
  | 'burst'
  | 'bomb'
  | 'clock'
  | 'shield'
  | 'soldier'
  | 'building'
  | 'cross'
  | 'chevron-down'
  | 'chevron-up'
  | 'double-down'
  | 'double-up'
  | 'replay'
  | 'home'
  | 'smile'
  | 'swords'
  | 'skull';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Stroke paths on a 24x24 grid, drawn with `stroke: currentColor` by the `.ui-icon` class. */
const ICON_PATHS: Readonly<Record<UiIconId, readonly string[]>> = {
  bolt: ['M13 2 4 14h7l-1 8 9-12h-7l1-8Z'],
  coin: [
    'm12 2.5 8 4.4v10.2l-8 4.4-8-4.4V6.9l8-4.4Z',
    'M12 7v10m-2.5-6.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4',
  ],
  target: [
    'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
    'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    'M12 1v4M12 19v4M1 12h4M19 12h4',
  ],
  burst: ['m12 2 2.2 6.2L20 6l-2.6 5.6L23 14l-6.2 1L18 21l-6-3.5L6 21l1.2-6L1 14l5.6-2.4L4 6l5.8 2.2Z'],
  bomb: ['M18 14a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z', 'm16 9 3-3M18 4l1 1M21 3l-1 1'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M12 7v5l3 2'],
  shield: ['M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z', 'm8.5 12 2.2 2.2 4.8-5'],
  soldier: ['M5 11a7 7 0 0 1 14 0Z', 'M3.5 11h17', 'M8 11v2a4 4 0 0 0 8 0v-2', 'M6 21a6 6 0 0 1 12 0'],
  building: ['M3 21h18', 'M5 21V10l5-3v14', 'M10 21V5l9 4v12', 'M13 12h3M13 16h3'],
  cross: ['m6 6 12 12M18 6 6 18'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-up': ['m6 15 6-6 6 6'],
  'double-down': ['m5 5 7 6 7-6', 'm5 12 7 6 7-6'],
  'double-up': ['m5 19 7-6 7 6', 'm5 12 7-6 7 6'],
  replay: ['M4 4v5h5M4.6 9A8 8 0 1 1 4 14'],
  home: ['m3 11 9-8 9 8M5 10v10h5v-6h4v6h5V10'],
  smile: [
    'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    'M8 14s1.5 2 4 2 4-2 4-2',
    'M9.8 9.5a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0ZM15.8 9.5a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0Z',
  ],
  swords: [
    'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
    'M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2',
  ],
  skull: [
    'M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.6 3 5.8V20h10v-3.2c1.7-1.2 3-3.2 3-5.8a8 8 0 0 0-8-8Z',
    'M10.5 11.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16.5 11.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
    'M10 20v-2M14 20v-2',
  ],
};

function iconClass(className: string | undefined): string {
  return className ? `ui-icon ${className}` : 'ui-icon';
}

/** SVG markup for the string templates in `templates.ts`. */
export function uiIconMarkup(id: UiIconId, className?: string): string {
  const paths = ICON_PATHS[id].map((pathData) => `<path d="${pathData}"/>`).join('');
  return `<svg viewBox="0 0 24 24" aria-hidden="true" class="${iconClass(className)}">${paths}</svg>`;
}

export function createUiIcon(id: UiIconId, className?: string): SVGSVGElement {
  const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('class', iconClass(className));
  for (const pathData of ICON_PATHS[id]) {
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', pathData);
    icon.append(path);
  }
  return icon;
}
