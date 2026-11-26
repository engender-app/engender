/* Where focus goes when a screen arrives (audit A11Y-08).

   SvelteKit resets focus to the body after a navigation and its announcer
   reads the tab title, which is "engender" on every route on purpose
   (ADR-0035: the tab must not say what is open). So a screen reader heard
   the app's name on each screen change, and the next Tab went back to the
   bar. The skip link is not the answer either: Alicja had it taken out of
   the whole app on 22 September.

   The screen's own h1 takes focus instead. A screen reader speaks a focused
   heading, so the screen says its name without the tab title saying it,
   and the next Tab starts in the screen. A heading is not a control, so
   it gets `tabindex="-1"` (reachable by script, never a Tab stop) and no
   focus ring (`data-arrival-focus`, components.css). A screen with no h1
   yet hands focus to the scroll region itself, which already carries
   `tabindex="-1"`.

   It leaves focus alone when something else already has a claim on it: a
   control inside the new screen (an autofocused field, a filter that
   navigated in place) or an overlay that owns the keyboard. */
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
