/** Viewer preferences that change how the page behaves. */

const SHORTCUTS_KEY = 'csgo-tarot.shortcuts';

/** The OS-level "reduce motion" setting. Camera moves become fades; head bob and parallax are off. */
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let shortcuts = (() => {
  try {
    return localStorage.getItem(SHORTCUTS_KEY) !== '0';
  } catch {
    return true;
  }
})();

/**
 * Single-character shortcuts (Q, E, F, 1–3). They can clash with screen-reader commands,
 * so they can be switched off (WCAG 2.1.4). Enter, Space, Esc and arrows always work.
 */
export const shortcutsOn = () => shortcuts;

export function setShortcuts(on: boolean) {
  shortcuts = on;
  try {
    localStorage.setItem(SHORTCUTS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  document.body.classList.toggle('no-shortcuts', !on);
}

/** True for a plain character key press that should trigger a shortcut right now. */
export function isShortcut(e: KeyboardEvent, key: string) {
  if (!shortcuts || e.ctrlKey || e.metaKey || e.altKey) return false;
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return false;
  return e.key.toLowerCase() === key;
}
