/**
 * Screen-reader announcements through one polite live region.
 * Used instead of marking animated elements live, which would be read letter by letter.
 */
let region: HTMLElement | null = null;

export function announce(text: string) {
  region ??= document.getElementById('sr-announcer');
  if (!region) return;
  // Clear first so repeating the same sentence is still announced.
  region.textContent = '';
  window.setTimeout(() => {
    if (region) region.textContent = text;
  }, 60);
}
