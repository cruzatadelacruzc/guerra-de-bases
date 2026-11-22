import { createUiIcon } from '../uiIcons.ts';
import { formatGold, formatPercent } from './hudFormat.ts';
import type { FactionSummaryView } from './hudView.ts';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SIDE_NAME = { player: 'aliado', enemy: 'enemigo' } as const;

/** One side's compact Nexus summary: health ring, gold and combat points. */
export class FactionStrip {
  private readonly ringProgress: SVGCircleElement;
  private readonly percentText: HTMLElement;
  private readonly goldText: HTMLElement;
  private readonly pointsText: HTMLElement;
  private readonly root: HTMLElement;
  private readonly sideName: string;
  private lastPercent = -1;
  private lastCritical = false;
  private lastGold = -1;
  private lastPoints = -1;

  /** Builds the DOM once inside `root`; `render` then only writes what changed. */
  constructor(root: HTMLElement, side: 'player' | 'enemy') {
    this.root = root;
    this.sideName = SIDE_NAME[side];
    root.classList.add('hud-faction', `is-${side}`);
    root.setAttribute('role', 'group');

    const ring = document.createElementNS(SVG_NAMESPACE, 'svg');
    ring.setAttribute('viewBox', '0 0 40 40');
    ring.setAttribute('class', 'hud-ring');
    ring.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(SVG_NAMESPACE, 'circle');
    this.ringProgress = document.createElementNS(SVG_NAMESPACE, 'circle');
    for (const [circle, className] of [[track, 'hud-ring-track'], [this.ringProgress, 'hud-ring-progress']] as const) {
      circle.setAttribute('class', className);
      circle.setAttribute('cx', '20');
      circle.setAttribute('cy', '20');
      circle.setAttribute('r', '16');
      circle.setAttribute('pathLength', '100');
    }
    ring.append(track, this.ringProgress);

    this.percentText = document.createElement('span');
    this.percentText.className = 'hud-percent';
    const ringWrap = document.createElement('span');
    ringWrap.className = 'hud-ring-wrap';
    ringWrap.setAttribute('aria-hidden', 'true');
    ringWrap.append(ring, this.percentText);

    const gold = document.createElement('span');
    gold.className = 'hud-gold';
    this.goldText = document.createElement('b');
    gold.append(createUiIcon('coin'), this.goldText);

    const points = document.createElement('span');
    points.className = 'hud-cp';
    this.pointsText = document.createElement('b');
    const pointsLabel = document.createElement('span');
    pointsLabel.textContent = 'CP';
    points.append(createUiIcon('bolt'), this.pointsText, pointsLabel);

    const resources = document.createElement('span');
    resources.className = 'hud-resources';
    resources.setAttribute('aria-hidden', 'true');
    resources.append(gold, points);

    root.replaceChildren(ringWrap, resources);
  }

  render(summary: Readonly<FactionSummaryView>): void {
    const percentChanged = summary.healthPercent !== this.lastPercent;
    if (percentChanged) {
      this.lastPercent = summary.healthPercent;
      this.ringProgress.setAttribute('stroke-dasharray', `${summary.healthPercent} 100`);
      this.percentText.textContent = formatPercent(summary.healthPercent);
    }
    if (summary.critical !== this.lastCritical) {
      this.lastCritical = summary.critical;
      this.root.classList.toggle('is-critical', summary.critical);
    }
    const goldChanged = summary.gold !== this.lastGold;
    if (goldChanged) {
      this.lastGold = summary.gold;
      this.goldText.textContent = formatGold(summary.gold);
    }
    const pointsChanged = summary.combatPoints !== this.lastPoints;
    if (pointsChanged) {
      this.lastPoints = summary.combatPoints;
      this.pointsText.textContent = String(summary.combatPoints);
    }
    if (percentChanged || goldChanged || pointsChanged) {
      this.root.setAttribute(
        'aria-label',
        `Nexo ${this.sideName}: ${formatPercent(summary.healthPercent)}, ${formatGold(summary.gold)} de oro, ${summary.combatPoints} CP`
      );
    }
  }
}
