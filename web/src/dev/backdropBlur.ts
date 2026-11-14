/** Overrides every backdrop blur in the UI, including Tailwind's `backdrop-blur-*` utilities. */
export const NO_BACKDROP_BLUR_CSS = `*, *::before, *::after {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}`;

/**
 * Development-only switch (`blur=0`): injects a stylesheet instead of changing
 * the game's CSS, so production styles stay untouched.
 */
export function disableBackdropBlur(document: Document): HTMLStyleElement {
  const style = document.createElement('style');
  style.dataset.diagnostics = 'no-backdrop-blur';
  style.textContent = NO_BACKDROP_BLUR_CSS;
  document.head.appendChild(style);
  return style;
}
