export type DiagnosticsScenario = 'combat' | 'match';

export interface DiagnosticsOptions {
  /** `overlay=0` keeps the live panel off (recommended while measuring from the console). */
  overlay: boolean;
  /** `dpr=<0.25-3>` overrides the renderer's pixel ratio cap. */
  maxPixelRatio: number | undefined;
  /** `shockwaves=0` skips explosion shockwaves. */
  shockwaves: boolean;
  /** `smoke=0` keeps fires burning without their smoke. */
  smoke: boolean;
  /** `blur=0` removes the UI's backdrop blur over the 3D canvas. */
  blur: boolean;
  /** `scenario=combat|match` runs that scenario on load and shows its result in the panel. */
  scenario: DiagnosticsScenario | undefined;
}

const MIN_PIXEL_RATIO = 0.25;
const MAX_PIXEL_RATIO = 3;

function readPixelRatio(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio >= MIN_PIXEL_RATIO && ratio <= MAX_PIXEL_RATIO ? ratio : undefined;
}

function readScenario(value: string | null): DiagnosticsScenario | undefined {
  return value === 'combat' || value === 'match' ? value : undefined;
}

/** Reads the `?diagnostics=1` measurement switches; anything invalid keeps the default. */
export function parseDiagnosticsOptions(search: string): DiagnosticsOptions {
  const params = new URLSearchParams(search);
  return {
    overlay: params.get('overlay') !== '0',
    maxPixelRatio: readPixelRatio(params.get('dpr')),
    shockwaves: params.get('shockwaves') !== '0',
    smoke: params.get('smoke') !== '0',
    blur: params.get('blur') !== '0',
    scenario: readScenario(params.get('scenario'))
  };
}
