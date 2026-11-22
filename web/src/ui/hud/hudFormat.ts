/** Whole gold; from 10000 it is abbreviated with one decimal and a comma ("10,2k"). */
export function formatGold(gold: number): string {
  const whole = Math.floor(gold);
  if (whole < 10000) return String(whole);
  return `${(Math.floor(whole / 100) / 10).toFixed(1).replace('.', ',')}k`;
}

export function formatPercent(percent: number): string {
  return `${percent} %`;
}

export function formatSeconds(seconds: number): string {
  return `${Math.ceil(seconds)} s`;
}
