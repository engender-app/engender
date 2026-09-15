/* What an overlay owes the screen it covers: nothing behind it reachable,
   nothing behind it scrolling, and focus back where it came from.

   Lifted out of Sheet.svelte by redesign ticket 45, which added the second
   surface that covers the whole app - a letter's arrival, which is not a
   sheet: it does not rise from the bottom edge and it must not be
   dismissible by a drag, because the two ways out of it mean different
   things. What it does share is all of this, and SF-001's reasoning applies
   to it unchanged.

   SF-001: every confirmation in the app is a sheet, and without this the
   background stayed reachable behind an open dialog - Tab walked straight
   out of it, and closing dropped focus to the document. `inert` on the app
   shell's other children keeps assistive tech and Tab out of the background
   regardless of how deep in that subtree the overlay itself lives (the
   `.contains` check below skips whichever child holds it); the scroll lock
   stops the scroll region moving underneath an overlay that does not cover
   it edge to edge; focus returns to whatever opened it on close.

   `inert` is also what settles the stacking: `.app-main` carries
   `view-transition-name: screen` and is therefore a stacking context, so an
   overlay's own z-index is spent inside it and can never beat the floating
   bar's 30 out in `.app`. `[data-app-root] > [inert]` (components.css) drops
   the bar behind `.app-main` for exactly as long as the overlay is up, which
   is the only thing that puts an overlay in front of it.

   Queries `data-app-root`/`data-app-scroll-region` rather than
   `.app`/`.app-main` so this stays wired to the shell even if those
   presentational class names ever change. */

/** Makes everything outside `node` inert and unscrollable. Returns the undo,
    which also restores focus to whatever was focused when it was called. */
export function lockBackground(node: HTMLElement): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const root = document.querySelector('[data-app-root]');
  const restoreInert: HTMLElement[] = [];
  if (root) {
    for (const child of Array.from(root.children) as HTMLElement[]) {
      if (child.contains(node) || child.hasAttribute('inert')) continue;
      child.setAttribute('inert', '');
      restoreInert.push(child);
    }
  }
  const mainEl = document.querySelector<HTMLElement>('[data-app-scroll-region]');
  const previousOverflow = mainEl?.style.overflow ?? '';
  if (mainEl) mainEl.style.overflow = 'hidden';

  return () => {
    restoreInert.forEach((el) => el.removeAttribute('inert'));
    if (mainEl) mainEl.style.overflow = previousOverflow;
    previouslyFocused?.focus();
  };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside `container`. Call from a `keydown` handler
    that has already established the key is Tab. */
export function trapFocus(container: HTMLElement | null, e: KeyboardEvent): void {
  if (!container) return;
  const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  let target: HTMLElement | null = null;
  if (!container.contains(document.activeElement)) {
    target = e.shiftKey ? last : first;
  } else if (e.shiftKey && document.activeElement === first) {
    target = last;
  } else if (!e.shiftKey && document.activeElement === last) {
    target = first;
  }
  if (target) {
    e.preventDefault();
    target.focus({ preventScroll: true });
  }
}
