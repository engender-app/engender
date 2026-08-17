/* Ticket 09 (MO-003): Svelte's JS-driven transitions (Sheet, Toasts) sit
   outside CSS's reach, so neither reduced-motion selector in theme/base.css
   can clamp their durations the way it clamps every CSS animation and
   transition. These mirror the same --dur-* and --motion-distance- tokens
   and the same html[data-a11y-motion] signal +layout.svelte already stamps, so
   a Svelte transition and its CSS neighbours never drift apart. */

interface MotionDocument {
  documentElement: { dataset: Record<string, string | undefined> };
}

function currentDocument(): MotionDocument | undefined {
  return typeof document === 'undefined' ? undefined : document;
}

export function isReducedMotion(doc: MotionDocument | undefined = currentDocument()): boolean {
  return doc?.documentElement.dataset.a11yMotion === 'reduce';
}

function readCssNumber(token: string, fallback: number): number {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function motionDuration(token: '--dur-fast' | '--dur-med' | '--dur-slow', fallback: number): number {
  return isReducedMotion() ? 0 : readCssNumber(token, fallback);
}

export function motionDistance(token: '--motion-distance-sm' | '--motion-distance-md', fallback: number): number {
  return readCssNumber(token, fallback);
}
