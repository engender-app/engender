/* Focus the new screen's h1 so assistive tech announces it while
   the tab title stays private. A heading uses tabindex="-1"
   and data-arrival-focus. Fall back to the scroll region until the h1
   exists. Preserve focus already held by a new-screen control or an
   overlay. */
import { ACTIVE_DOOR_CONTENT, isDoorActive } from './doorActivity';
import { overlayIsOpen } from '$lib/components/overlayLock';

const ARRIVAL_FOCUS_ATTR = 'data-arrival-focus';

export function focusArrivedScreen(region: HTMLElement | null): void {
  if (!region || overlayIsOpen()) return;
  const active = document.activeElement;
  if (active && active !== document.body && region.contains(active) && isDoorActive(active)) return;
  const heading = region.querySelector<HTMLElement>(`h1${ACTIVE_DOOR_CONTENT}`);
  const target = heading ?? region;
  focusNamedTarget(target);
}

/** Focus a named destination without moving the scroll position or entering a hidden door. */
export function focusNamedTarget(target: HTMLElement | null | undefined): void {
  if (!target?.isConnected || !isDoorActive(target) || target.closest('[inert], [hidden]')) return;
  if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  if (target.matches('h1, h2, h3, [data-app-scroll-region]')) target.setAttribute(ARRIVAL_FOCUS_ATTR, '');
  target.focus({ preventScroll: true });
}

/** Capture the next row before a successful write removes its control. */
export function focusAfterRemoval(control: HTMLElement, rowSelector: string): () => void {
  const scope = control.closest<HTMLElement>('.screen, .gate, [data-app-scroll-region]');
  const row = control.closest<HTMLElement>(rowSelector);
  const rows = [...(scope?.querySelectorAll<HTMLElement>(rowSelector) ?? [])];
  const next = row ? rows[rows.indexOf(row) + 1] : undefined;
  const headings = [...(scope?.querySelectorAll<HTMLElement>('h1, h2') ?? [])];
  const heading = headings.filter((node) => node.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
  const active = document.activeElement;
  return () => {
    // A slow write must not take focus back from another control.
    if (active !== control || (document.activeElement !== active && document.activeElement !== document.body)) return;
    focusNamedTarget(next ?? heading);
  };
}
